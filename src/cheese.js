import * as THREE from 'three';

// Cheese slices melt when resting against something hot (patty, chicken).
// Each slice gets its own geometry copy so it can droop independently.

const BEND_R = 0.94; // where the slice starts bending over the patty edge
const HANG_R = 1.12; // radius the melted overhang hangs at (just outside the patty)
const MAX_DROP = 0.22; // how far it can hang (patty is 0.25 tall)
const MELT_TIME = 3; // seconds at full heat to fully melt
const melted = new THREE.Color(0xffa412);

export function makeMeltable(item) {
  item.melt = 0;
  item.meltDrawn = 0;
  item.mesh.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry = o.geometry.clone();
    o.material = o.material.clone();
    item.cheeseMesh = o;
    item.cheeseBase = Float32Array.from(o.geometry.attributes.position.array);
    item.cheeseColor = o.material.color.clone();
  });
}

function draw(item) {
  const m = item.melt;
  const geo = item.cheeseMesh.geometry;
  const p = geo.attributes.position;
  const base = item.cheeseBase;
  for (let i = 0; i < p.count; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const z = base[i * 3 + 2];
    const r = Math.hypot(x, z);
    if (r <= BEND_R) {
      // Centre sags slightly as it softens.
      p.setXYZ(i, x, y - m * 0.01 * (1 - r / BEND_R), z);
      continue;
    }
    // Melted target: the overhang folds down and hangs against the patty side,
    // keeping roughly the same length of cheese.
    const over = r - BEND_R;
    const ux = x / r;
    const uz = z / r;
    const bend = Math.min(over, HANG_R - BEND_R);
    const hang = Math.min(MAX_DROP, Math.max(0, over - bend));
    const ripple = Math.sin(Math.atan2(z, x) * 7) * 0.025 * hang;
    const tr = BEND_R + bend;
    const ty = -bend * 0.35 - hang - ripple;
    // Blend from the original slice shape to the melted drape.
    const nr = r + (tr - r) * m;
    p.setXYZ(i, ux * nr, y + (ty - y) * m, uz * nr);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = item.cheeseMesh.material;
  mat.color.copy(item.cheeseColor).lerp(melted, m * 0.6);
  mat.roughness = 0.4 - m * 0.25;
  item.meltDrawn = m;
}

export function updateMelt(item, items, dt) {
  if (item.melt >= 1) return;
  const b = item.body;
  if (b.velocity.lengthSquared() > 0.25) return;

  let heat = 0;
  for (const other of items) {
    if (other === item || !other.heat) continue;
    const o = other.body.position;
    const dy = Math.abs(o.y - b.position.y);
    const dxz = Math.hypot(o.x - b.position.x, o.z - b.position.z);
    if (dy < 0.4 && dxz < 0.7) heat = Math.max(heat, other.heat);
  }
  if (heat <= 0.05) return;

  item.melt = Math.min(1, item.melt + (dt / MELT_TIME) * heat);
  if (item.melt - item.meltDrawn > 0.01 || item.melt === 1) draw(item);
}
