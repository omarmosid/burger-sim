import * as THREE from 'three';
import { createBody, createMesh } from './ingredients.js';
import { BOARD } from './kitchen.js';

const CM_PER_UNIT = 5;
const SPAWN_GAP = 0.45;

export function createGame({ scene, world, audio }) {
  const items = [];
  const history = [];
  let dragging = null;
  let clock = 0;

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
    const item = { def, mesh, body, squashAmp: 0, squashT: 0, lastHit: -1 };
    mesh.userData.item = item;
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);

    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v < 1.0 || clock - item.lastHit < 0.12) return;
      item.lastHit = clock;
      item.squashAmp = Math.min(1, v / 6);
      item.squashT = 0;
      audio.plop(def.pitch, Math.min(1, v / 7));
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
  }

  return {
    items,
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
      if (def.sizzle) audio.sizzle();
      if (def.squelch) audio.squelch();
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
      if (!items.length) return;
      [...items].forEach(removeItem);
      history.length = 0;
      audio.whoosh();
    },

    update(dt) {
      clock += dt;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const { mesh, body } = item;
        if (body.position.y < -5) {
          removeItem(item);
          continue;
        }
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);

        if (item.squashAmp > 0.01) {
          item.squashT += dt;
          const w = item.squashAmp * Math.exp(-item.squashT * 10) * Math.cos(item.squashT * 32);
          mesh.scale.set(1 + w * 0.12, 1 - w * 0.3, 1 + w * 0.12);
          if (item.squashT > 0.6) item.squashAmp = 0;
        } else {
          mesh.scale.set(1, 1, 1);
        }
      }
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
