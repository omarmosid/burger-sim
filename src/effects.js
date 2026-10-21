import * as THREE from 'three';
import { BOARD } from './kitchen.js';

// ---------- Chunk particles: small 3D bits (crumbs, splatter, confetti) ----------

const MAX_CHUNKS = 700;

function createChunks(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }),
    MAX_CHUNKS,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  const parts = [];
  const d = new THREE.Object3D();
  const col = new THREE.Color();

  return {
    emit(o) {
      if (parts.length >= MAX_CHUNKS) parts.shift();
      parts.push({
        p: o.position.clone(),
        v: o.velocity.clone(),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3().randomDirection().multiplyScalar(o.spin ?? 8),
        size: o.size,
        scale: o.scale || [1, 1, 1],
        color: new THREE.Color(o.color),
        life: o.life,
        age: 0,
        gravity: o.gravity ?? 20,
        drag: o.drag ?? 0.5,
        bounce: o.bounce ?? 0.3,
        settled: false,
      });
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.age += dt;
        if (q.age >= q.life) {
          parts.splice(i, 1);
          continue;
        }
        if (!q.settled) {
          q.v.y -= q.gravity * dt;
          q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
          q.p.addScaledVector(q.v, dt);
          q.r.x += q.spin.x * dt;
          q.r.y += q.spin.y * dt;
          q.r.z += q.spin.z * dt;
          const onBoard = Math.abs(q.p.x) < BOARD.halfX && Math.abs(q.p.z) < BOARD.halfZ;
          const floor = (onBoard ? BOARD.top : 0) + q.size * 0.5;
          if (q.p.y < floor && q.v.y < 0) {
            q.p.y = floor;
            if (Math.abs(q.v.y) < 1.5) {
              q.settled = true;
            } else {
              q.v.y *= -q.bounce;
              q.v.x *= 0.6;
              q.v.z *= 0.6;
              q.spin.multiplyScalar(0.5);
            }
          }
        }
      }

      for (let i = 0; i < parts.length; i++) {
        const q = parts[i];
        const fade = Math.min(1, (q.life - q.age) / 0.4);
        const s = q.size * fade;
        d.position.copy(q.p);
        d.rotation.copy(q.r);
        d.scale.set(s * q.scale[0], s * q.scale[1], s * q.scale[2]);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        mesh.setColorAt(i, col.copy(q.color));
      }
      mesh.count = parts.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    clear() {
      parts.length = 0;
    },
    get count() {
      return parts.length;
    },
  };
}

// ---------- Puff particles: soft transparent sprites (steam, smoke, dust) ----------

const MAX_PUFFS = 400;

function createPuffs(scene, camera, renderer) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_PUFFS * 3);
  const col = new Float32Array(MAX_PUFFS * 3);
  const alpha = new Float32Array(MAX_PUFFS);
  const size = new Float32Array(MAX_PUFFS);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);

  const uniforms = { uScale: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute float alpha;
      attribute float size;
      varying float vAlpha;
      varying vec3 vColor;
      uniform float uScale;
      void main() {
        vAlpha = alpha;
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);

  const resize = () => {
    const h = renderer.domElement.height;
    uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };
  resize();
  window.addEventListener('resize', resize);

  const parts = [];
  const c = new THREE.Color();

  return {
    emit(o) {
      if (parts.length >= MAX_PUFFS) parts.shift();
      parts.push({
        p: o.position.clone(),
        v: o.velocity.clone(),
        color: new THREE.Color(o.color ?? 0xffffff),
        size0: o.size,
        grow: o.grow ?? 2,
        alpha: o.alpha ?? 0.5,
        life: o.life,
        age: 0,
        lift: o.lift ?? 0.5,
      });
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.age += dt;
        if (q.age >= q.life) {
          parts.splice(i, 1);
          continue;
        }
        q.v.y += q.lift * dt;
        q.v.multiplyScalar(1 - 0.8 * dt);
        q.p.addScaledVector(q.v, dt);
      }
      for (let i = 0; i < parts.length; i++) {
        const q = parts[i];
        const t = q.age / q.life;
        pos[i * 3] = q.p.x;
        pos[i * 3 + 1] = q.p.y;
        pos[i * 3 + 2] = q.p.z;
        c.copy(q.color);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        // Fade in fast, fade out slow.
        alpha[i] = q.alpha * Math.min(1, t * 6) * (1 - t);
        size[i] = q.size0 * (1 + q.grow * t);
      }
      geo.setDrawRange(0, parts.length);
      for (const k of ['position', 'color', 'alpha', 'size']) geo.attributes[k].needsUpdate = true;
    },
    clear() {
      parts.length = 0;
    },
    get count() {
      return parts.length;
    },
  };
}

// ---------- Public effects API ----------

export function createEffects({ scene, camera, renderer, controls, audio }) {
  const chunks = createChunks(scene);
  const puffs = createPuffs(scene, camera, renderer);
  const tmp = new THREE.Vector3();
  const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

  // Shake
  let trauma = 0;
  let shakeT = 0;
  const saved = new THREE.Vector3();

  // Slow motion
  let timeScale = 1;
  let slowTimer = 0;
  let slowCooldown = 0;
  const focus = new THREE.Vector3();
  const homeTarget = new THREE.Vector3();
  let focusing = false;

  const fx = {
    chunks,
    puffs,

    get timeScale() {
      return timeScale;
    },
    get slowMo() {
      return slowTimer > 0;
    },

    crumbs(point, color, count, speed = 3) {
      const base = new THREE.Color(color);
      for (let i = 0; i < count; i++) {
        const shade = base.clone().offsetHSL(rnd(0.02), rnd(0.1), rnd(0.12));
        chunks.emit({
          position: tmp.set(point.x + rnd(0.3), point.y + Math.random() * 0.1, point.z + rnd(0.3)),
          velocity: new THREE.Vector3(rnd(speed), speed * (0.6 + Math.random()), rnd(speed)),
          size: 0.02 + Math.random() * 0.025,
          color: shade,
          life: 1.5 + Math.random() * 1.5,
        });
      }
    },

    splat(point, color, count = 18) {
      for (let i = 0; i < count; i++) {
        chunks.emit({
          position: tmp.copy(point),
          velocity: new THREE.Vector3(rnd(4), 1 + Math.random() * 3, rnd(4)),
          size: 0.03 + Math.random() * 0.05,
          scale: [1, 0.5, 1],
          color,
          life: 1.2 + Math.random(),
          bounce: 0,
          spin: 2,
        });
      }
    },

    dust(point, count = 6, color = 0xf3e6cf) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random();
        puffs.emit({
          position: tmp.set(point.x + Math.cos(a) * 0.9, point.y, point.z + Math.sin(a) * 0.9),
          velocity: new THREE.Vector3(Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5),
          size: 0.35,
          grow: 1.5,
          alpha: 0.35,
          color,
          life: 0.7,
          lift: 0.2,
        });
      }
    },

    steam(point, radius = 1) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      puffs.emit({
        position: tmp.set(point.x + Math.cos(a) * r, point.y, point.z + Math.sin(a) * r),
        velocity: new THREE.Vector3(rnd(0.15), 0.5 + Math.random() * 0.4, rnd(0.15)),
        size: 0.25 + Math.random() * 0.15,
        grow: 2.5,
        alpha: 0.5,
        color: 0xffffff,
        life: 1.6 + Math.random() * 0.8,
        lift: 0.6,
      });
    },

    confetti(point, count = 120) {
      const colors = [0xe8572a, 0xffb627, 0x74b843, 0x3a8ee6, 0xd94fbf, 0xffffff];
      for (let i = 0; i < count; i++) {
        chunks.emit({
          position: tmp.set(point.x + rnd(0.3), point.y, point.z + rnd(0.3)),
          velocity: new THREE.Vector3(rnd(5), 6 + Math.random() * 6, rnd(5)),
          size: 0.08,
          scale: [1, 0.08, 0.6],
          color: colors[i % colors.length],
          life: 3 + Math.random() * 2,
          gravity: 9,
          drag: 2.2,
          bounce: 0,
          spin: 14,
        });
      }
    },

    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },

    slowMotion(center, duration = 1.6) {
      if (slowCooldown > 0) return false;
      slowTimer = duration;
      slowCooldown = duration + 3;
      focus.copy(center);
      if (!focusing) homeTarget.copy(controls.target);
      focusing = true;
      document.body.classList.add('slowmo');
      audio.whoosh?.();
      return true;
    },

    update(dt, realDt) {
      chunks.update(dt);
      puffs.update(dt);

      slowCooldown = Math.max(0, slowCooldown - realDt);
      if (slowTimer > 0) {
        slowTimer -= realDt;
        timeScale += (0.25 - timeScale) * Math.min(1, realDt * 10);
        controls.target.lerp(focus, Math.min(1, realDt * 3));
        if (slowTimer <= 0) document.body.classList.remove('slowmo');
      } else {
        timeScale += (1 - timeScale) * Math.min(1, realDt * 4);
        if (focusing) {
          controls.target.lerp(homeTarget, Math.min(1, realDt * 2));
          if (controls.target.distanceTo(homeTarget) < 0.01) focusing = false;
        }
      }
      trauma = Math.max(0, trauma - realDt * 1.4);
      shakeT += realDt;
    },

    // Call around render so the shake never accumulates into OrbitControls state.
    beginShake() {
      saved.copy(camera.position);
      if (trauma <= 0) return;
      const s = trauma * trauma * 0.35;
      camera.position.x += Math.sin(shakeT * 47.3) * s;
      camera.position.y += Math.sin(shakeT * 59.1 + 1.3) * s;
      camera.position.z += Math.sin(shakeT * 41.7 + 2.1) * s * 0.5;
    },
    endShake() {
      camera.position.copy(saved);
    },

    clear() {
      chunks.clear();
      puffs.clear();
    },
  };
  return fx;
}
