import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BOARD, COUNTER } from './kitchen.js';
import { INGREDIENTS } from './ingredients.js';

const CLICK_SLOP = 6;
const FLICK_MIN_SPEED = 5; // world units/s of cursor motion to count as a throw
const FLICK_WINDOW = 150; // ms of cursor history used to measure a flick
const FLICK_STALE = 140; // ms you can pause before releasing and still throw
const THROW_MAX_SPEED = 24;
const GRAVITY = 20;
const WALL_Z = -5;
const PICKUP_HEIGHT = 1.5; // hold height for items pulled out of a bin
const HOLD_MIN_Z = WALL_Z + 1.3; // keep held food off the wall so a throw registers a fresh impact
const BOARD_DROP_MARGIN = 0.4;
const BOARD_FLICK_SPEED = 14; // over the board, only a fast swipe throws; slower releases just place

export function createInteraction({ camera, canvas, controls, world, game, kitchen, audio, onSpawn }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const q3 = new THREE.Quaternion();
  const targetQ = new CANNON.Quaternion();

  const jointBody = new CANNON.Body({ mass: 0 });
  jointBody.collisionFilterGroup = 0;
  jointBody.collisionFilterMask = 0;
  world.addBody(jointBody);

  let drag = null;
  const samples = []; // recent unclamped cursor positions while dragging, for flick throws
  const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 5);
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let pendingBin = null;
  let pendingChip = null;
  let downAt = { x: 0, y: 0 };
  const spin = { q: false, e: false };

  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function findAncestor(obj, key) {
    while (obj && obj.userData[key] === undefined) obj = obj.parent;
    return obj;
  }

  function pick() {
    const itemHit = raycaster.intersectObjects(
      game.items.map((i) => i.mesh),
      true,
    )[0];
    const binHit = raycaster.intersectObject(kitchen.binGroup, true)[0];
    if (itemHit && (!binHit || itemHit.distance <= binHit.distance)) {
      return { item: findAncestor(itemHit.object, 'item').userData.item };
    }
    if (binHit) return { bin: findAncestor(binHit.object, 'binIndex').userData.binIndex };
    return {};
  }

  // `stamp` is the pointer event's own timestamp, so flick speed stays accurate even when frames lag.
  function updateTarget(stamp = performance.now()) {
    if (!drag) return;
    plane.constant = -drag.height;
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const now = stamp;
    samples.push({ t: now, x: hit.x, z: hit.z });
    while (samples.length && now - samples[0].t > FLICK_WINDOW) samples.shift();
    jointBody.position.set(
      THREE.MathUtils.clamp(hit.x, COUNTER.minX + 0.5, COUNTER.maxX - 0.5),
      drag.height,
      THREE.MathUtils.clamp(hit.z, HOLD_MIN_Z, COUNTER.maxZ - 0.3),
    );
  }

  function startDrag(item, height) {
    const b = item.body;
    q3.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    euler.setFromQuaternion(q3);
    drag = {
      item,
      height: height ?? Math.max(b.position.y + 0.8, 0.9),
      yaw: euler.y,
      damping: [b.linearDamping, b.angularDamping],
    };
    b.wakeUp();
    b.allowSleep = false;
    b.linearDamping = 0.4;
    b.angularDamping = 0.9;
    jointBody.position.copy(b.position);
    samples.length = 0;
    drag.constraint = new CANNON.PointToPointConstraint(b, new CANNON.Vec3(), jointBody, new CANNON.Vec3(), 400);
    world.addConstraint(drag.constraint);
    game.dragging = item;
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    updateTarget();
    audio.plop(item.def.pitch * 1.5, 0.2);
  }

  // Pull a new ingredient out of a bin/chip straight into the player's hand.
  function grabNew(index) {
    const height = Math.max(PICKUP_HEIGHT, game.stackTopY() + 0.7);
    plane.constant = -height;
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    hit.x = THREE.MathUtils.clamp(hit.x, COUNTER.minX + 0.5, COUNTER.maxX - 0.5);
    hit.z = THREE.MathUtils.clamp(hit.z, HOLD_MIN_Z, COUNTER.maxZ - 0.3);
    const item = game.spawnAt(INGREDIENTS[index], hit);
    kitchen.pulse(index);
    startDrag(item, height);
  }

  // Ballistic velocity from `from` that lands on `target` after `t` seconds.
  function lob(from, target, t) {
    const v = target.clone().sub(from).divideScalar(t);
    v.y += 0.5 * GRAVITY * t;
    return v;
  }

  function flickVelocity(releaseAt = performance.now()) {
    if (samples.length < 2) return null;
    const a = samples[0];
    const z = samples[samples.length - 1];
    const dt = (z.t - a.t) / 1000;
    if (dt < 0.016 || releaseAt - z.t > FLICK_STALE) return null;
    const overBoard =
      Math.abs(z.x) < BOARD.halfX + BOARD_DROP_MARGIN && Math.abs(z.z) < BOARD.halfZ + BOARD_DROP_MARGIN;
    const vx = (z.x - a.x) / dt;
    const vz = (z.z - a.z) / dt;
    const speed = Math.hypot(vx, vz);
    if (speed < FLICK_MIN_SPEED) return null;
    if (overBoard && speed < BOARD_FLICK_SPEED) return null;

    const from = drag.item.body.position;
    const dx = vx / speed;
    const dz = vz / speed;
    // Aim assist: any flick roughly toward the back arcs into the wall.
    if (dz < -0.45) {
      const dist = (from.z - WALL_Z) / -dz;
      const target = new THREE.Vector3(
        THREE.MathUtils.clamp(from.x + dx * dist, -7.5, 7.5),
        THREE.MathUtils.clamp(1.8 + speed * 0.06, 1.8, 4.5),
        WALL_Z,
      );
      const t = THREE.MathUtils.clamp(dist / (8 + speed * 0.8), 0.12, 0.7);
      return lob(new THREE.Vector3(from.x, from.y, from.z), target, t);
    }
    const s = Math.min(THROW_MAX_SPEED, speed * 1.4);
    return new THREE.Vector3(dx * s, 3 + Math.min(speed, 30) * 0.2, dz * s);
  }

  // Aimed throw of the held item at whatever is under the cursor (wall first, then floor/counter).
  function aimedVelocity() {
    const from = drag.item.body.position;
    const target = new THREE.Vector3();
    const onWall = raycaster.ray.intersectPlane(wallPlane, target);
    if (!onWall || target.y < 0.3 || Math.abs(target.x) > 8) {
      if (!raycaster.ray.intersectPlane(groundPlane, target)) return null;
    }
    target.y = Math.min(target.y, 6);
    const start = new THREE.Vector3(from.x, from.y, from.z);
    // Short throws go fast and flat; long ones get a bit more arc.
    const t = THREE.MathUtils.clamp(start.distanceTo(target) / 14, 0.12, 0.8);
    return lob(start, target, t);
  }

  function throwHeld() {
    if (!drag) return;
    const v = aimedVelocity();
    endDrag(v);
  }

  function endDrag(forced, releaseAt) {
    if (!drag) return;
    const b = drag.item.body;
    world.removeConstraint(drag.constraint);
    b.allowSleep = true;
    [b.linearDamping, b.angularDamping] = drag.damping;
    const fling = forced instanceof THREE.Vector3 ? forced : flickVelocity(releaseAt);
    if (fling) {
      b.velocity.set(fling.x, fling.y, fling.z);
      b.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10);
      b.thrown = true;
      audio.whoosh();
    }
    samples.length = 0;
    game.dragging = null;
    drag = null;
    controls.enabled = true;
    canvas.style.cursor = '';
  }

  // Right-click: hurl food. On a bin -> that ingredient at the wall. Elsewhere -> last used, toward the cursor.
  function hurl(e) {
    setRay(e);
    const p = pick();
    let def;
    const target = new THREE.Vector3();
    if (p.bin !== undefined) {
      def = INGREDIENTS[p.bin];
      const bx = kitchen.bins[p.bin].group.position.x;
      target.set(bx + (Math.random() - 0.5) * 1.5, 2.2 + Math.random() * 2, -5);
    } else {
      def = game.lastDef || INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
      const onWall = raycaster.ray.intersectPlane(wallPlane, target);
      if (!onWall || target.y < 0.3 || Math.abs(target.x) > 8) {
        if (!raycaster.ray.intersectPlane(groundPlane, target)) return;
      }
    }
    const start = camera.position.clone().addScaledVector(raycaster.ray.direction, 5);
    const t = THREE.MathUtils.clamp(start.distanceTo(target) / 17, 0.45, 1.1);
    const v = target.clone().sub(start).divideScalar(t);
    v.y += 0.5 * GRAVITY * t;
    game.throwItem(def, start, v);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Right-click uses mousedown: when the left button is already held (dragging),
  // browsers send no pointerdown for the second button, only mousedown.
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2 || e.target !== canvas) return;
    audio.unlock();
    setRay(e);
    if (drag) throwHeld();
    else hurl(e);
  });

  // Capture phase on window so we run before OrbitControls' canvas listener.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target === canvas && e.button === 2) {
        // Keep OrbitControls out of it; the throw itself happens on mousedown below.
        e.stopPropagation();
        return;
      }
      if (e.button !== 0) return;
      const chip = e.target.closest?.('.chip[data-index]');
      if (chip) {
        audio.unlock();
        pendingChip = Number(chip.dataset.index);
        downAt = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.target !== canvas) return;
      audio.unlock();
      setRay(e);
      const p = pick();
      if (p.item) startDrag(p.item);
      else if (p.bin !== undefined) {
        // Claim the press so OrbitControls doesn't rotate while pulling from a bin.
        e.stopPropagation();
        pendingBin = p.bin;
        downAt = { x: e.clientX, y: e.clientY };
      }
    },
    { capture: true },
  );

  window.addEventListener('pointermove', (e) => {
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (pendingBin !== null && moved >= CLICK_SLOP) {
      setRay(e);
      grabNew(pendingBin);
      pendingBin = null;
    }
    // Chips: start holding once the cursor reaches the 3D view.
    if (pendingChip !== null && moved >= CLICK_SLOP && e.target === canvas) {
      setRay(e);
      grabNew(pendingChip);
      pendingChip = null;
    }
    if (pendingChip !== null) canvas.style.cursor = 'grabbing';
    if (drag) {
      setRay(e);
      updateTarget(e.timeStamp);
      return;
    }
    if (e.target !== canvas || e.buttons) {
      kitchen.setHover(-1);
      return;
    }
    setRay(e);
    const p = pick();
    kitchen.setHover(p.bin ?? -1);
    canvas.style.cursor = p.item ? 'grab' : p.bin !== undefined ? 'pointer' : '';
  });

  window.addEventListener('pointerup', (e) => {
    pendingChip = null;
    if (drag) {
      endDrag(null, e.timeStamp);
      return;
    }
    if (pendingBin !== null) {
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      if (moved < CLICK_SLOP && e.target === canvas) {
        setRay(e);
        if (pick().bin === pendingBin) onSpawn(pendingBin);
      }
      pendingBin = null;
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!drag) return;
      e.preventDefault();
      drag.height = THREE.MathUtils.clamp(drag.height - e.deltaY * 0.004, 0.35, 7);
      updateTarget();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in spin) spin[k] = true;
    if (e.code === 'Space' && drag) {
      e.preventDefault();
      throwHeld();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k in spin) spin[k] = false;
  });
  window.addEventListener('blur', endDrag);

  return {
    get dragging() {
      return !!drag;
    },
    cancel: endDrag,
    update(dt) {
      if (!drag) return;
      if (!game.items.includes(drag.item)) {
        endDrag();
        return;
      }
      drag.yaw += ((spin.e ? 1 : 0) - (spin.q ? 1 : 0)) * dt * 3;
      const b = drag.item.body;
      targetQ.setFromEuler(0, drag.yaw, 0);
      b.quaternion.slerp(targetQ, Math.min(1, dt * 10), b.quaternion);
      b.angularVelocity.set(0, 0, 0);
    },
  };
}
