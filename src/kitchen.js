import * as THREE from 'three';
import { addStaticBox } from './physics.js';
import { INGREDIENTS, ROW_SIZE, createMesh, keyLabel } from './ingredients.js';

export const BOARD = { halfX: 2.2, halfZ: 1.8, top: 0.2 };
const FRONT_Z = -2.75;
const BACK_Z = -4.2;
const SHELF_H = 0.55;
const LABEL_W = 1.3;
const LABEL_H = 0.4;
export const COUNTER = { minX: -8, maxX: 8, minZ: -5, maxZ: 2.5 };

function canvasTexture(size, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

const woodTexture = () =>
  canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#c8935a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      const y = Math.random() * s;
      ctx.strokeStyle = `rgba(${90 + Math.random() * 40},${50 + Math.random() * 20},20,${0.08 + Math.random() * 0.18})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
      ctx.stroke();
    }
  });

const stoneTexture = () =>
  canvasTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = '#ebe6dd';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2500; i++) {
        const g = 150 + Math.random() * 80;
        ctx.fillStyle = `rgba(${g},${g - 8},${g - 16},${Math.random() * 0.35})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
    },
    [3, 1.5],
  );

const tileTexture = () =>
  canvasTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = '#cfc6b6';
      ctx.fillRect(0, 0, s, s);
      const n = 4;
      const t = s / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const l = 240 + Math.random() * 12;
          ctx.fillStyle = `rgb(${l},${l - 4},${l - 12})`;
          ctx.fillRect(x * t + 4, y * t + 4, t - 8, t - 8);
        }
      }
    },
    [8, 4],
  );

const floorTexture = () =>
  canvasTexture(
    256,
    (ctx, s) => {
      const h = s / 2;
      ctx.fillStyle = '#3d3a44';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#e8e2d6';
      ctx.fillRect(0, 0, h, h);
      ctx.fillRect(h, h, h, h);
    },
    [12, 12],
  );

function labelSprite(text, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(40,24,14,0.85)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 144, 40);
  ctx.fill();
  ctx.fillStyle = '#ffcf70';
  ctx.font = 'bold 60px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sub, 82, 82);
  ctx.fillStyle = '#fff';
  let size = 54;
  do {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > 330 && size > 30);
  ctx.fillText(text, 318, 82);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(LABEL_W, LABEL_H, 1);
  return sprite;
}

export function createKitchen(scene, world) {
  // Counter top
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(16, 1, 7.5),
    new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.35 }),
  );
  counter.position.set(0, -0.5, -1.25);
  counter.receiveShadow = true;
  scene.add(counter);
  addStaticBox(world, [8, 0.5, 3.75], [0, -0.5, -1.25]);

  // Cabinet
  const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x2f6f73, roughness: 0.6 });
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(15.6, 5, 7), cabinetMat);
  cabinet.position.set(0, -3.5, -1.5);
  cabinet.receiveShadow = true;
  scene.add(cabinet);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a8287, roughness: 0.5 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xd9b56b, metalness: 0.8, roughness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.2, 0.08), doorMat);
    door.position.set(-5.85 + i * 3.9, -3.5, 2.04);
    scene.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), knobMat);
    knob.position.set(door.position.x + (i % 2 ? -1.4 : 1.4), -2.2, 2.14);
    scene.add(knob);
  }

  // Floor + wall
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.8 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -6;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.4 }),
  );
  wall.position.set(0, 4, -5);
  wall.receiveShadow = true;
  scene.add(wall);
  addStaticBox(world, [8, 6, 0.2], [0, 6, -5.2]);

  // Cutting board
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD.halfX * 2, BOARD.top, BOARD.halfZ * 2),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75 }),
  );
  board.position.set(0, BOARD.top / 2, 0);
  board.castShadow = true;
  board.receiveShadow = true;
  scene.add(board);
  addStaticBox(world, [BOARD.halfX, BOARD.top / 2, BOARD.halfZ], [0, BOARD.top / 2, 0]);

  // Ingredient bins
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.6, roughness: 0.35 });
  const binGroup = new THREE.Group();
  scene.add(binGroup);
  // Raised shelf for the back row of bins
  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(15, SHELF_H, 1.5),
    new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0xb08060, roughness: 0.7 }),
  );
  shelf.position.set(0, SHELF_H / 2, BACK_Z);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  scene.add(shelf);
  addStaticBox(world, [7.5, SHELF_H / 2, 0.75], [0, SHELF_H / 2, BACK_Z]);

  const bins = INGREDIENTS.map((def, i) => {
    const g = new THREE.Group();
    const back = i >= ROW_SIZE;
    g.position.set(((i % ROW_SIZE) - 4) * 1.6, back ? SHELF_H : 0, back ? BACK_Z : FRONT_Z);
    g.userData.binIndex = i;

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, 1.35), steel);
    base.position.y = 0.03;
    g.add(base);
    for (const [w, d, x, z] of [
      [1.35, 0.06, 0, 0.645],
      [1.35, 0.06, 0, -0.645],
      [0.06, 1.35, 0.645, 0],
      [0.06, 1.35, -0.645, 0],
    ]) {
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), steel);
      wallMesh.position.set(x, 0.125, z);
      g.add(wallMesh);
    }
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const preview = createMesh(def);
    preview.scale.setScalar(0.5);
    const baseY = 0.08 + def.halfHeight * 0.5;
    preview.position.y = baseY;
    g.add(preview);

    const label = labelSprite(def.name, keyLabel(i));
    label.position.set(0, back ? 0.9 : 0.75, 0);
    g.add(label);

    binGroup.add(g);
    addStaticBox(world, [0.675, 0.125, 0.675], [g.position.x, g.position.y + 0.125, g.position.z]);

    return { def, group: g, preview, label, baseY, hover: 0, pulse: 0 };
  });

  let hovered = -1;

  return {
    bins,
    binGroup,
    setHover(index) {
      hovered = index;
    },
    pulse(index) {
      if (bins[index]) bins[index].pulse = 1;
    },
    update(dt) {
      for (let i = 0; i < bins.length; i++) {
        const b = bins[i];
        const target = i === hovered ? 1 : 0;
        b.hover += (target - b.hover) * Math.min(1, dt * 12);
        b.pulse = Math.max(0, b.pulse - dt * 3);
        b.preview.position.y = b.baseY + b.hover * 0.25 + b.pulse * 0.3;
        b.preview.rotation.y += dt * (0.3 + b.hover * 2.5);
        const s = 1 + b.hover * 0.12;
        b.label.scale.set(LABEL_W * s, LABEL_H * s, 1);
      }
    },
  };
}
