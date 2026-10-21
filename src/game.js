import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createBody, createMesh } from './ingredients.js';
import { BOARD } from './kitchen.js';
import { makeMeltable, updateMelt } from './cheese.js';

const CM_PER_UNIT = 5;
const SPAWN_GAP = 0.45;

const HEAT_DECAY = 1 / 45; // fresh patties stay hot for ~45 s
const TOPPLE_MIN = 3;
const WALL_Z = -5; // front face of the back wall
const WALL_SPLAT_SPEED = 4;
const STICK_TIME = 3.2; // seconds an ingredient clings to the wall
const FADE_TIME = 0.6;
const MAX_STAINS = 40;

function stainGeometry(r, seed) {
  const s = new THREE.Shape();
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.18 * Math.sin(a * 3 + seed) + 0.12 * Math.sin(a * 7 + seed * 2) + 0.08 * Math.sin(a * 11);
    const x = Math.cos(a) * r * k;
    const y = Math.sin(a) * r * k * 0.85;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(s);
}

export function createGame({ scene, world, audio, fx, wallBody }) {
  const items = [];
  const history = [];
  const listeners = {};
  let dragging = null;
  let clock = 0;
  let lastDef = null;

  const emit = (evt, data) => (listeners[evt] || []).forEach((fn) => fn(data));
  const contactPoint = new THREE.Vector3();
  const wallHits = [];
  const stains = [];
  const stuckQ = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  const onBoard = (item) => {
    const p = item.body.position;
    return (
      item !== dragging &&
      Math.abs(p.x) < BOARD.halfX + 0.4 &&
      Math.abs(p.z) < BOARD.halfZ + 0.4 &&
      p.y > BOARD.top - 0.05
    );
  };

  function stackTop() {
    let best = null;
    for (const item of items) {
      if (!onBoard(item)) continue;
      const top = item.body.position.y + item.def.halfHeight;
      if (!best || top > best.y) best = { x: item.body.position.x, z: item.body.position.z, y: top };
    }
    return best || { x: 0, z: 0, y: BOARD.top };
  }

  function addItem(def, x, y, z, yaw) {
    const mesh = createMesh(def);
    const body = createBody(def);
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(0, yaw, 0);
    const item = {
      def, mesh, body, squashAmp: 0, squashT: 0, lastHit: -1, born: clock, steamAcc: 0, flat: 1, fade: 1,
    };
    if (def.sizzle) item.heat = 1;
    mesh.userData.item = item;
    if (def.id === 'cheese') makeMeltable(item);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);

    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (item.stuck) return;
      if (e.body === wallBody && v > WALL_SPLAT_SPEED && !item.wasted) {
        // Can't change body type mid-step; handle it in update().
        item.wasted = true;
        wallHits.push({ item, v });
        return;
      }
      body.thrown = false;
      if (v < 1.0 || clock - item.lastHit < 0.12) return;
      item.lastHit = clock;
      item.squashAmp = Math.min(1, v / 6);
      item.squashT = 0;
      audio.plop(def.pitch, Math.min(1, v / 7));

      const c = e.contact;
      const mine = c.bi === body;
      const ref = mine ? c.bi : c.bj;
      const r = mine ? c.ri : c.rj;
      contactPoint.set(ref.position.x + r.x, ref.position.y + r.y, ref.position.z + r.z);
      if (v > 2.5 && def.crumb) fx.crumbs(contactPoint, def.crumb, Math.min(14, Math.round(v * 1.2)), v * 0.35);
      if (v > 5) {
        fx.shake(Math.min(0.6, (v - 5) * 0.08 * Math.sqrt(def.mass)));
        fx.dust(contactPoint, 6);
      }
      emit('impact', { item, v, point: contactPoint.clone() });
    });

    scene.add(mesh);
    world.addBody(body);
    items.push(item);
    return item;
  }

  function removeItem(item) {
    const i = items.indexOf(item);
    if (i === -1) return;
    items.splice(i, 1);
    scene.remove(item.mesh);
    world.removeBody(item.body);
    for (const other of items) other.body.wakeUp();
    emit('remove', item);
  }

  function addStain(def, x, y) {
    const r = 0.45 + Math.random() * 0.3;
    const mat = new THREE.MeshStandardMaterial({
      color: def.stain || def.color,
      roughness: 0.25,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(stainGeometry(r, Math.random() * 10), mat));
    const drips = [];
    const nd = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nd; i++) {
      const w = 0.04 + Math.random() * 0.05;
      const geo = new THREE.PlaneGeometry(w, 1).translate(0, -0.5, 0);
      const d = new THREE.Mesh(geo, mat);
      d.position.set((Math.random() - 0.5) * r * 1.4, -r * 0.5, 0);
      d.scale.y = 0.001;
      d.userData.len = 0.3 + Math.random() * 0.9;
      d.userData.speed = 0.15 + Math.random() * 0.25;
      g.add(d);
      drips.push(d);
    }
    g.position.set(x, y, WALL_Z + 0.005 + stains.length * 0.0002);
    g.rotation.z = Math.random() * Math.PI * 2 * 0.05;
    scene.add(g);
    stains.push({ group: g, drips, mat });
    if (stains.length > MAX_STAINS) {
      const old = stains.shift();
      scene.remove(old.group);
    }
  }

  function clearStains() {
    for (const s of stains) scene.remove(s.group);
    stains.length = 0;
  }

  function splatOnWall({ item, v }) {
    if (!items.includes(item)) return;
    const { body, def } = item;
    body.type = CANNON.Body.KINEMATIC;
    body.collisionResponse = false;
    body.allowSleep = false;
    body.thrown = false;
    body.wakeUp();
    const x = THREE.MathUtils.clamp(body.position.x, -7.5, 7.5);
    const y = Math.max(body.position.y, 1);
    body.position.set(x, y, WALL_Z + def.halfHeight * 0.5 + 0.02);
    body.velocity.set(0, -0.12, 0);
    body.angularVelocity.set(0, 0, 0);
    // Flat face against the wall, random twist.
    twist.setFromAxisAngle(Y_AXIS, Math.random() * Math.PI * 2);
    stuckQ.setFromAxisAngle(X_AXIS, Math.PI / 2).multiply(twist);
    body.quaternion.set(stuckQ.x, stuckQ.y, stuckQ.z, stuckQ.w);
    item.stuck = { t: 0 };
    item.flat = 0.55;
    item.squashAmp = 1;
    item.squashT = 0;

    contactPoint.set(x, y, WALL_Z + 0.1);
    addStain(def, x, y);
    fx.splat(contactPoint, def.stain || def.color, 26);
    if (def.crumb) fx.crumbs(contactPoint, def.crumb, 10, 2);
    fx.shake(Math.min(0.45, 0.15 + v * 0.02));
    audio.splat?.();
    emit('waste', { def, where: 'wall', item });
  }

  function detectTopple() {
    let n = 0;
    const center = new THREE.Vector3();
    for (const item of items) {
      if (item === dragging || clock - item.born < 1 || item.stuck || item.body.thrown) continue;
      const b = item.body;
      if (b.position.y < BOARD.top + 0.4) continue;
      const hSpeed = Math.hypot(b.velocity.x, b.velocity.z);
      if (hSpeed > 1.2 || b.angularVelocity.length() > 4) {
        n++;
        center.add(b.position);
      }
    }
    if (n >= TOPPLE_MIN && fx.slowMotion(center.divideScalar(n))) emit('topple', n);
  }

  return {
    items,
    on(evt, fn) {
      (listeners[evt] ||= []).push(fn);
    },
    get dragging() {
      return dragging;
    },
    set dragging(v) {
      dragging = v;
    },

    spawn(def) {
      const top = stackTop();
      const item = addItem(
        def,
        top.x + (Math.random() - 0.5) * 0.06,
        top.y + def.halfHeight + SPAWN_GAP,
        top.z + (Math.random() - 0.5) * 0.06,
        Math.random() * Math.PI * 2,
      );
      history.push([item]);
      emit('spawn', item);
      lastDef = def;
      if (def.sizzle) audio.sizzle();
      if (def.squelch) audio.squelch();
      return item;
    },

    get lastDef() {
      return lastDef;
    },

    // Launch an ingredient with a given velocity. Thrown bodies skip the speed clamp until they hit something.
    throwItem(def, position, velocity) {
      const item = addItem(def, position.x, position.y, position.z, Math.random() * Math.PI * 2);
      item.body.velocity.set(velocity.x, velocity.y, velocity.z);
      item.body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 12);
      item.body.thrown = true;
      history.push([item]);
      audio.whoosh();
      return item;
    },

    undo() {
      while (history.length) {
        const alive = history.pop().filter((i) => items.includes(i));
        if (alive.length) {
          alive.forEach(removeItem);
          audio.whoosh();
          return true;
        }
      }
      return false;
    },

    clear() {
      clearStains();
      if (!items.length) return;
      [...items].forEach(removeItem);
      history.length = 0;
      audio.whoosh();
    },

    update(dt) {
      clock += dt;
      while (wallHits.length) splatOnWall(wallHits.shift());

      for (const s of stains) {
        for (const d of s.drips) {
          if (d.scale.y < d.userData.len) d.scale.y = Math.min(d.userData.len, d.scale.y + dt * d.userData.speed);
        }
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const { mesh, body } = item;
        if (body.position.y < -5) {
          if (!item.wasted && item !== dragging) {
            item.wasted = true;
            emit('waste', { def: item.def, where: 'floor', item });
          }
          removeItem(item);
          continue;
        }
        // Airborne throws ignore each other (group 2); restore normal collisions once they land.
        if (body.thrown && body.collisionFilterGroup !== 2) {
          body.collisionFilterGroup = 2;
          body.collisionFilterMask = ~2;
        } else if (!body.thrown && body.collisionFilterGroup === 2) {
          body.collisionFilterGroup = 1;
          body.collisionFilterMask = -1;
        }
        if (item.stuck) {
          item.stuck.t += dt;
          const t = item.stuck.t - STICK_TIME;
          if (t > 0) item.fade = Math.max(0, 1 - t / FADE_TIME);
          if (t > FADE_TIME) {
            removeItem(item);
            continue;
          }
        }
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);

        if (item.heat > 0) {
          item.heat = Math.max(0, item.heat - dt * HEAT_DECAY);
          item.steamAcc += dt * item.heat * 6;
          while (item.steamAcc > 1) {
            item.steamAcc--;
            fx.steam({ x: body.position.x, y: body.position.y + 0.15, z: body.position.z }, 0.9);
          }
        }
        if (item.melt !== undefined) updateMelt(item, items, dt);

        if (item.squashAmp > 0.01) {
          item.squashT += dt;
          const w = item.squashAmp * Math.exp(-item.squashT * 10) * Math.cos(item.squashT * 32);
          const f = item.fade;
          mesh.scale.set((1 + w * 0.12) * f, (1 - w * 0.3) * item.flat * f, (1 + w * 0.12) * f);
          if (item.squashT > 0.6) item.squashAmp = 0;
        } else {
          mesh.scale.set(item.fade, item.flat * item.fade, item.fade);
        }
      }
      detectTopple();
    },

    liveStats() {
      const stack = items.filter(onBoard);
      const top = stack.length ? stackTop().y : BOARD.top;
      return { count: stack.length, heightCm: (top - BOARD.top) * CM_PER_UNIT };
    },

    serveStats() {
      const stack = items.filter(onBoard).sort((a, b) => a.body.position.y - b.body.position.y);
      if (!stack.length) return null;

      const counts = {};
      for (const i of stack) counts[i.def.id] = (counts[i.def.id] || 0) + 1;
      const top = Math.max(...stack.map((i) => i.body.position.y + i.def.halfHeight));
      const heightCm = (top - BOARD.top) * CM_PER_UNIT;

      const first = stack[0];
      const last = stack[stack.length - 1];
      const proper = first.def.id === 'bottomBun' && last.def.id === 'topBun';
      const lean = Math.hypot(
        last.body.position.x - first.body.position.x,
        last.body.position.z - first.body.position.z,
      );

      const up = new THREE.Vector3();
      const tilted = stack.filter((i) => {
        up.set(0, 1, 0).applyQuaternion(i.mesh.quaternion);
        return up.y < 0.85;
      }).length;

      const fillings = [
        'cheese', 'lettuce', 'tomato', 'onion', 'pickles', 'bacon',
        'egg', 'avocado', 'mushrooms', 'jalapenos', 'pineapple', 'onionRings', 'ketchup',
      ].filter((k) => counts[k]);

      const beef = counts.patty || 0;
      const chicken = counts.chicken || 0;
      const patties = beef + chicken;

      let stars = 1;
      if (proper) stars++;
      if (patties) stars++;
      if (fillings.length >= 3) stars++;
      if (lean < 0.4 && tilted === 0) stars++;

      // Name: size + up to two flavour words + base noun
      const size = ['', 'Single', 'Double', 'Triple', 'Quad'][patties] || (patties ? 'Mega' : '');
      const flavours = [
        counts.jalapenos && 'Spicy',
        counts.pineapple && 'Hawaiian',
        counts.egg && 'Sunrise',
        counts.avocado && 'California',
        counts.mushrooms && 'Mushroom',
        counts.onionRings && 'Rodeo',
        counts.bacon && 'Bacon',
      ].filter(Boolean);
      const parts = [];
      if (counts.middleBun && proper) parts.push('Club');
      else if (size) parts.push(size);
      parts.push(...flavours.slice(0, 2));
      const meat = chicken && !beef ? 'Chicken ' : '';
      if (!counts.bottomBun && !counts.topBun) parts.push(counts.cheese ? 'Cheese Bowl' : 'Bun-less Bowl');
      else parts.push(meat + (counts.cheese ? 'Cheeseburger' : 'Burger'));
      let name = `The ${parts.join(' ')}`;
      if (!patties && (counts.bottomBun || counts.topBun)) name = 'The Veggie Stack';
      if (stack.length >= 16) name += ' Tower';

      let verdict;
      if (proper && lean < 0.4 && tilted === 0) verdict = 'Textbook burger. The customer is weeping with joy.';
      else if (proper && lean >= 0.4) verdict = 'Structurally questionable, but it is a burger.';
      else if (proper) verdict = 'Right order, a few layers went rogue.';
      else if (last.def.id === 'bottomBun' || first.def.id === 'topBun') verdict = 'Upside-down burger. Bold choice.';
      else if (!counts.bottomBun || !counts.topBun) verdict = 'Missing a bun. Hard to eat with your hands.';
      else verdict = 'Abstract art. Please do not hand this to a customer.';

      return {
        name,
        stars,
        count: stack.length,
        heightCm,
        lean: lean * CM_PER_UNIT,
        verdict,
        layers: stack.map((i) => i.def),
      };
    },
  };
}
