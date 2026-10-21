import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COUNTER } from './kitchen.js';
import { INGREDIENTS } from './ingredients.js';

const CLICK_SLOP = 6;
const FLICK_MIN_SPEED = 7; // world units/s of cursor motion to count as a throw
const THROW_MAX_SPEED = 24;
const GRAVITY = 20;

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

  function updateTarget() {
    if (!drag) return;
    plane.constant = -drag.height;
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const now = performance.now();
    samples.push({ t: now, x: hit.x, z: hit.z });
    while (samples.length && now - samples[0].t > 120) samples.shift();
    jointBody.position.set(
      THREE.MathUtils.clamp(hit.x, COUNTER.minX + 0.5, COUNTER.maxX - 0.5),
      drag.height,
      THREE.MathUtils.clamp(hit.z, COUNTER.minZ + 0.7, COUNTER.maxZ - 0.3),
    );
  }

  function startDrag(item) {
    const b = item.body;
    q3.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    euler.setFromQuaternion(q3);
    drag = {
      item,
      height: Math.max(b.position.y + 0.8, 0.9),
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

  function flickVelocity() {
    if (samples.length < 2) return null;
    const a = samples[0];
    const z = samples[samples.length - 1];
    const dt = (z.t - a.t) / 1000;
    if (dt < 0.016 || performance.now() - z.t > 80) return null;
    const v = new THREE.Vector3((z.x - a.x) / dt, 0, (z.z - a.z) / dt);
    const speed = v.length();
    if (speed < FLICK_MIN_SPEED) return null;
    v.multiplyScalar(Math.min(THROW_MAX_SPEED, speed * 1.2) / speed);
    v.y = 3 + Math.min(speed, 30) * 0.2; // a bit of arc
    return v;
  }

  function endDrag() {
    if (!drag) return;
    const b = drag.item.body;
    world.removeConstraint(drag.constraint);
    b.allowSleep = true;
    [b.linearDamping, b.angularDamping] = drag.damping;
    const fling = flickVelocity();
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

  // Capture phase on window so we run before OrbitControls' canvas listener.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target === canvas && e.button === 2) {
        e.stopPropagation();
        audio.unlock();
        if (!drag) hurl(e);
        return;
      }
      if (e.target !== canvas || e.button !== 0) return;
      audio.unlock();
      setRay(e);
      const p = pick();
      if (p.item) startDrag(p.item);
      else if (p.bin !== undefined) {
        pendingBin = p.bin;
        downAt = { x: e.clientX, y: e.clientY };
      }
    },
    { capture: true },
  );

  window.addEventListener('pointermove', (e) => {
    if (drag) {
      setRay(e);
      updateTarget();
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
    if (drag) {
      endDrag();
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
