import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Units: 1 unit ~= 5 cm. A bun has radius 1.

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...opts });

const M = {
  bun: mat(0xd38a3c, { roughness: 0.55, side: THREE.DoubleSide }),
  crumb: mat(0xf3d9a4, { roughness: 0.95 }),
  seed: mat(0xfff3d6, { roughness: 0.5 }),
  patty: mat(0x5b3421, { roughness: 0.95 }),
  grill: mat(0x24130a, { roughness: 1 }),
  cheese: mat(0xffb627, { roughness: 0.4, side: THREE.DoubleSide }),
  lettuce: mat(0x74b843, { roughness: 0.6, side: THREE.DoubleSide }),
  tomatoSkin: mat(0xc8102e, { roughness: 0.3 }),
  tomatoFlesh: mat(0xf0544f, { roughness: 0.5 }),
  tomatoSeed: mat(0xf7d488, { roughness: 0.5 }),
  onion: mat(0xf1e4f2, { roughness: 0.3, transparent: true, opacity: 0.92 }),
  pickleSkin: mat(0x3f6b21),
  pickleFlesh: mat(0xa3c45c),
  breading: mat(0xc9852c, { roughness: 1 }),
  crumbs: mat(0xe3a845, { roughness: 1 }),
  eggWhite: mat(0xfdfbf3, { roughness: 0.35 }),
  yolk: mat(0xffad0a, { roughness: 0.2 }),
  avoFlesh: mat(0xcde07a, { roughness: 0.5 }),
  avoSkin: mat(0x2f5418, { roughness: 0.6 }),
  mushFlesh: mat(0xd8c3a2, { roughness: 0.8 }),
  mushSkin: mat(0x6e4a2c, { roughness: 0.8 }),
  jalSkin: mat(0x2f7d1f, { roughness: 0.35 }),
  jalFlesh: mat(0xa8cf62, { roughness: 0.5 }),
  pineapple: mat(0xf6c445, { roughness: 0.45 }),
  char: mat(0x8a5418, { roughness: 1 }),
  batter: mat(0xd9952e, { roughness: 0.95 }),
  ketchup: new THREE.MeshStandardMaterial({ color: 0xb3120f, roughness: 0.12 }),
  bacon: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
};

// Deterministic pseudo-random so duplicate seam vertices get the same offset.
function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const lathe = (points, segments = 18) =>
  new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);

const cyl = (r, h) => new CANNON.Cylinder(r, r, h, 12);

// ---------- builders ----------

function bottomBun() {
  const g = new THREE.Group();
  const h = 0.175;
  g.add(
    new THREE.Mesh(
      lathe([[0, -h], [0.9, -h], [0.99, -h + 0.05], [1.02, 0.02], [0.97, h - 0.03], [0.9, h], [0, h]]),
      M.bun,
    ),
  );
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18).rotateX(-Math.PI / 2), M.crumb);
  cap.position.y = h + 0.003;
  g.add(cap);
  return g;
}

const DOME = [[0, 0.3], [0.52, 0.27], [0.82, 0.19], [0.98, 0.06]];
function domeY(r) {
  for (let i = 0; i < DOME.length - 1; i++) {
    const [x0, y0] = DOME[i];
    const [x1, y1] = DOME[i + 1];
    if (r <= x1) return y0 + ((r - x0) / (x1 - x0)) * (y1 - y0);
  }
  return DOME[DOME.length - 1][1];
}

function topBun() {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      lathe([[0, -0.3], [0.9, -0.3], [1.0, -0.24], [1.04, -0.1], ...DOME.slice().reverse()]),
      M.bun,
    ),
  );
  const under = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18).rotateX(Math.PI / 2), M.crumb);
  under.position.y = -0.303;
  g.add(under);

  const count = 30;
  const seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), M.seed, count);
  const rand = seeded(42);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const r = 0.8 * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    d.position.set(Math.cos(a) * r, domeY(r) + 0.01, Math.sin(a) * r);
    d.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
    d.scale.set(0.055, 0.022, 0.03);
    d.updateMatrix();
    seeds.setMatrixAt(i, d.matrix);
  }
  g.add(seeds);
  return g;
}

function noisyCylinder(r, h, segments, amp, seed = 0) {
  const geo = new THREE.CylinderGeometry(r, r, h, segments, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (Math.hypot(x, z) < 1e-3) continue;
    const key = Math.round(Math.atan2(z, x) * 100) / 100;
    const ky = Math.round(y * 100);
    const s = 1 + (hash(key * 10 + seed, ky) - 0.5) * amp;
    const dy = Math.abs(y) < h * 0.4 ? (hash(key * 7 + seed, ky + 3) - 0.5) * amp * 0.5 : 0;
    p.setXYZ(i, x * s, y + dy, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

// Flat blob lying in XZ, centred on y=0. Shape is drawn in XY then rotated flat.
function wobblyShape(r, amp, seed, points = 40) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 + amp * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 2) * 0.3 + Math.sin(a * 8) * 0.2);
    const x = Math.cos(a) * r * k;
    const y = Math.sin(a) * r * k;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

function flatExtrude(shape, depth, opts = {}) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10, ...opts });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  return geo;
}

function patty() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(noisyCylinder(1.05, 0.25, 16, 0.1), M.patty));

  const marks = new THREE.Group();
  for (const z of [-0.45, 0, 0.45]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.012, 0.08), M.grill);
    m.position.set(0, 0.128, z);
    marks.add(m);
  }
  marks.rotation.y = 0.6;
  g.add(marks);
  return g;
}

function cheese() {
  const geo = new THREE.PlaneGeometry(1.9, 1.9, 12, 12).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.8) p.setY(i, -((r - 0.8) ** 2) * 0.55);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, M.cheese);
  m.position.y = -0.01;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function lettuce() {
  const R = 1.2;
  const geo = new THREE.RingGeometry(0.02, R, 40, 4).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const f = (r / R) ** 2;
    const s = 1 + Math.sin(a * 5 + 2) * 0.07 * f;
    p.setXYZ(i, x * s, Math.sin(a * 9) * 0.08 * f + Math.sin(a * 4 + 1) * 0.03 * f, z * s);
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M.lettuce));
  return g;
}

function tomato() {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 16), [
      M.tomatoSkin,
      M.tomatoFlesh,
      M.tomatoFlesh,
    ]),
  );
  const seedGeo = new THREE.CircleGeometry(0.16, 8).rotateX(-Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const s = new THREE.Mesh(seedGeo, M.tomatoSeed);
    s.position.set(Math.cos(a) * 0.45, 0.062, Math.sin(a) * 0.45);
    s.rotation.y = -a;
    s.scale.set(1, 1, 0.6);
    g.add(s);
  }
  return g;
}

function onion() {
  const g = new THREE.Group();
  for (const r of [0.75, 0.55, 0.35]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 22).rotateX(Math.PI / 2), M.onion);
    t.scale.y = 0.8;
    g.add(t);
  }
  return g;
}

function pickle() {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12), [
      M.pickleSkin,
      M.pickleFlesh,
      M.pickleFlesh,
    ]),
  );
  return g;
}

function bacon() {
  const geo = new THREE.PlaneGeometry(2.1, 0.45, 28, 6).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const colors = [];
  const fat = new THREE.Color(0xf4c9a0);
  const meat = new THREE.Color(0xa33a26);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const edge = Math.abs(z) / 0.225;
    p.setY(i, Math.sin(x * 4.5) * 0.06 + Math.sin(x * 9) * 0.015 * edge);
    const band = Math.sin(z * 28 + Math.sin(x * 2) * 1.5);
    const c = band > 0.35 ? fat : meat;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M.bacon));
  return g;
}

function middleBun() {
  const g = new THREE.Group();
  const h = 0.13;
  g.add(
    new THREE.Mesh(
      lathe([[0, -h], [0.92, -h], [1.0, -h + 0.04], [1.02, 0], [1.0, h - 0.04], [0.92, h], [0, h]]),
      M.bun,
    ),
  );
  for (const s of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.92, 18).rotateX(-s * Math.PI / 2), M.crumb);
    cap.position.y = s * (h + 0.003);
    g.add(cap);
  }
  return g;
}

function chickenPatty() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(noisyCylinder(1.1, 0.28, 20, 0.16, 5), M.breading));
  // Crunchy crumbs on top
  const count = 45;
  const crumbs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M.crumbs, count);
  const rand = seeded(7);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const r = 0.95 * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    d.position.set(Math.cos(a) * r, 0.13, Math.sin(a) * r);
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.setScalar(0.04 + rand() * 0.05);
    d.scale.y *= 0.6;
    d.updateMatrix();
    crumbs.setMatrixAt(i, d.matrix);
  }
  g.add(crumbs);
  return g;
}

function friedEgg() {
  const g = new THREE.Group();
  const white = new THREE.Mesh(flatExtrude(wobblyShape(0.95, 0.14, 1.3), 0.07), M.eggWhite);
  white.position.y = -0.045;
  g.add(white);
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.yolk);
  yolk.scale.y = 0.4;
  yolk.position.set(0.15, -0.01, -0.1);
  g.add(yolk);
  return g;
}

function avocado() {
  const s = new THREE.Shape();
  s.moveTo(-0.8, 0);
  s.quadraticCurveTo(0, 0.72, 0.8, 0);
  s.quadraticCurveTo(0, 0.12, -0.8, 0);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(flatExtrude(s, 0.08), [M.avoFlesh, M.avoSkin]));
  return g;
}

function mushroom() {
  const s = new THREE.Shape();
  s.moveTo(-0.38, 0);
  s.quadraticCurveTo(-0.38, 0.32, 0, 0.32);
  s.quadraticCurveTo(0.38, 0.32, 0.38, 0);
  s.quadraticCurveTo(0.25, 0.02, 0.12, 0.02);
  s.lineTo(0.1, -0.26);
  s.quadraticCurveTo(0, -0.3, -0.1, -0.26);
  s.lineTo(-0.12, 0.02);
  s.quadraticCurveTo(-0.25, 0.02, -0.38, 0);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(flatExtrude(s, 0.07), [M.mushFlesh, M.mushSkin]));
  return g;
}

function jalapeno() {
  const g = new THREE.Group();
  const ring = (r0, r1, h) => lathe([[r0, -h], [r1, -h], [r1, h], [r0, h], [r0, -h]], 14);
  g.add(new THREE.Mesh(ring(0.18, 0.22, 0.035), M.jalSkin));
  g.add(new THREE.Mesh(ring(0.1, 0.18, 0.03), M.jalFlesh));
  const seedGeo = new THREE.SphereGeometry(0.03, 5, 3);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const sd = new THREE.Mesh(seedGeo, M.seed);
    sd.position.set(Math.cos(a) * 0.08, 0.01, Math.sin(a) * 0.08);
    sd.scale.y = 0.5;
    g.add(sd);
  }
  return g;
}

function pineapple() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lathe([[0.25, -0.07], [0.85, -0.07], [0.85, 0.07], [0.25, 0.07], [0.25, -0.07]], 24), M.pineapple));
  const marks = new THREE.Group();
  const add = (w, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, 0.08), M.char);
    m.position.set(x, 0.072, z);
    marks.add(m);
  };
  add(1.3, 0, 0.45);
  add(1.3, 0, -0.45);
  add(0.52, 0.56, 0);
  add(0.52, -0.56, 0);
  marks.rotation.y = 0.5;
  g.add(marks);
  return g;
}

function onionRing() {
  const geo = new THREE.TorusGeometry(0.4, 0.13, 8, 20).rotateX(Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = (hash(Math.round(x * 50), Math.round(z * 50) + Math.round(y * 50) * 7) - 0.5) * 0.06;
    p.setXYZ(i, x * (1 + n), y * 0.85 + n * 0.3, z * (1 + n));
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M.batter));
  return g;
}

function ketchup() {
  const geo = flatExtrude(wobblyShape(0.55, 0.3, 2.1, 48), 0.03, {
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M.ketchup));
  return g;
}

const circle = (n, r) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

// ---------- registry ----------

export const INGREDIENTS = [
  {
    id: 'bottomBun', name: 'Bottom bun', color: '#d38a3c', mass: 1, halfHeight: 0.175,
    shape: () => cyl(1, 0.35), build: bottomBun, pitch: 180,
  },
  {
    id: 'patty', name: 'Patty', color: '#5b3421', mass: 1.2, halfHeight: 0.125,
    shape: () => cyl(1.05, 0.25), build: patty, pitch: 120, sizzle: true,
  },
  {
    id: 'cheese', name: 'Cheese', color: '#ffb627', mass: 0.2, halfHeight: 0.05,
    shape: () => new CANNON.Box(new CANNON.Vec3(0.95, 0.05, 0.95)), build: cheese, pitch: 420,
  },
  {
    id: 'lettuce', name: 'Lettuce', color: '#74b843', mass: 0.15, halfHeight: 0.05,
    shape: () => cyl(1.1, 0.1), build: lettuce, pitch: 520,
  },
  {
    id: 'tomato', name: 'Tomato', color: '#c8102e', mass: 0.3, halfHeight: 0.06,
    shape: () => cyl(0.85, 0.12), build: tomato, pitch: 300,
  },
  {
    id: 'onion', name: 'Onion', color: '#d9c3db', mass: 0.2, halfHeight: 0.05,
    shape: () => cyl(0.8, 0.1), build: onion, pitch: 460,
  },
  {
    id: 'pickles', name: 'Pickles', color: '#3f6b21', mass: 0.1, halfHeight: 0.05,
    shape: () => cyl(0.3, 0.1), build: pickle, pitch: 640,
    offsets: [[0.42, 0], [-0.21, 0.36], [-0.21, -0.36]],
  },
  {
    id: 'bacon', name: 'Bacon', color: '#a33a26', mass: 0.2, halfHeight: 0.06,
    shape: () => new CANNON.Box(new CANNON.Vec3(1.05, 0.06, 0.22)), build: bacon, pitch: 360,
  },
  {
    id: 'topBun', name: 'Top bun', color: '#e09a4a', mass: 1, halfHeight: 0.3,
    shape: () => cyl(1, 0.6), build: topBun, pitch: 160,
  },
  // ---- Row 2: extras (Shift + 1-9) ----
  {
    id: 'middleBun', name: 'Middle bun', color: '#c98238', mass: 0.8, halfHeight: 0.13,
    shape: () => cyl(1, 0.26), build: middleBun, pitch: 200,
  },
  {
    id: 'chicken', name: 'Chicken', color: '#c9852c', mass: 1.1, halfHeight: 0.14,
    shape: () => cyl(1.1, 0.28), build: chickenPatty, pitch: 140, sizzle: true,
  },
  {
    id: 'egg', name: 'Fried egg', color: '#ffad0a', mass: 0.3, halfHeight: 0.045,
    shape: () => cyl(0.9, 0.09), build: friedEgg, pitch: 380,
  },
  {
    id: 'avocado', name: 'Avocado', color: '#9cc04a', mass: 0.1, halfHeight: 0.04,
    shape: () => new CANNON.Box(new CANNON.Vec3(0.8, 0.045, 0.18)), build: avocado, pitch: 480,
    offsets: [[0, -0.4], [0, 0], [0, 0.4]],
  },
  {
    id: 'mushrooms', name: 'Mushrooms', color: '#8a6440', mass: 0.05, halfHeight: 0.035,
    shape: () => new CANNON.Box(new CANNON.Vec3(0.38, 0.045, 0.3)), build: mushroom, pitch: 560,
    offsets: [[0.42, 0.38], [-0.42, 0.38], [0.42, -0.38], [-0.42, -0.38]],
  },
  {
    id: 'jalapenos', name: 'Jalapeños', color: '#2f7d1f', mass: 0.03, halfHeight: 0.04,
    shape: () => cyl(0.22, 0.08), build: jalapeno, pitch: 760,
    offsets: [[0, 0], ...circle(5, 0.5)],
  },
  {
    id: 'pineapple', name: 'Pineapple', color: '#f6c445', mass: 0.3, halfHeight: 0.07,
    shape: () => cyl(0.85, 0.14), build: pineapple, pitch: 340,
  },
  {
    id: 'onionRings', name: 'Onion rings', color: '#d9952e', mass: 0.12, halfHeight: 0.11,
    shape: () => cyl(0.53, 0.22), build: onionRing, pitch: 280,
    offsets: [[0.5, 0], [-0.5, 0]],
  },
  {
    id: 'ketchup', name: 'Ketchup', color: '#b3120f', mass: 0.05, halfHeight: 0.04,
    shape: () => cyl(0.55, 0.08), build: ketchup, pitch: 240, squelch: true,
  },
];

// Only crumbly things shed bits; wet/soft ingredients don't.
const CRUMBS = {
  bottomBun: '#ecc07a', topBun: '#ecc07a', middleBun: '#ecc07a', patty: '#4a2a18',
  chicken: '#d99a3e', bacon: '#8f3322', onionRings: '#e0a24a', hashBrown: '#d9a24a',
};
for (const def of INGREDIENTS) def.crumb = CRUMBS[def.id];

export const ROW_SIZE = 9;
export const keyLabel = (i) => (i < ROW_SIZE ? `${i + 1}` : `⇧${i - ROW_SIZE + 1}`);

const templates = new Map();

// Multi-piece layers (pickles, avocado...) are one mesh group + one compound body,
// so each layer behaves like a single flat slab in the stack.
function buildLayer(def) {
  if (!def.offsets) return def.build();
  const g = new THREE.Group();
  for (const [x, z] of def.offsets) {
    const piece = def.build();
    piece.position.set(x, 0, z);
    piece.rotation.y = hash(x * 13, z * 7) * 0.4 - 0.2;
    g.add(piece);
  }
  return g;
}

export function createMesh(def) {
  if (!templates.has(def.id)) {
    const t = buildLayer(def);
    t.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    templates.set(def.id, t);
  }
  return templates.get(def.id).clone();
}

export function createBody(def) {
  const offsets = def.offsets || [[0, 0]];
  const body = new CANNON.Body({
    mass: def.mass * offsets.length,
    linearDamping: 0.05,
    angularDamping: 0.3,
  });
  for (const [x, z] of offsets) {
    const q = new CANNON.Quaternion().setFromEuler(0, hash(x * 13, z * 7) * 0.4 - 0.2, 0);
    body.addShape(def.shape(), new CANNON.Vec3(x, 0, z), q);
  }
  body.sleepSpeedLimit = 0.15;
  body.sleepTimeLimit = 0.6;
  return body;
}
