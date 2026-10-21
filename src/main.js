import './style.css';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createScene } from './scene.js';
import { createWorld, FIXED_STEP } from './physics.js';
import { createKitchen } from './kitchen.js';
import { INGREDIENTS, ROW_SIZE } from './ingredients.js';
import { createGame } from './game.js';
import { createInteraction } from './interaction.js';
import { createUI } from './ui.js';
import { audio } from './audio.js';

const { renderer, scene, camera } = createScene(document.getElementById('app'));
const world = createWorld();
const kitchen = createKitchen(scene, world);
const game = createGame({ scene, world, audio });

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 20;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = Math.PI * 0.47;
controls.autoRotateSpeed = 5;
controls.update();

let serveTimer = 0;

function spawn(index) {
  const def = INGREDIENTS[index];
  if (!def) return;
  audio.unlock();
  game.spawn(def);
  kitchen.pulse(index);
}

function serve() {
  audio.unlock();
  const stats = game.serveStats();
  if (!stats) {
    ui.toast('Nothing on the board to serve');
    return;
  }
  audio.ding();
  ui.showServe(stats);
  controls.autoRotate = true;
  serveTimer = 5;
}

function closeServe() {
  ui.hideServe();
  controls.autoRotate = false;
  serveTimer = 0;
}

const ui = createUI({
  onSpawn: spawn,
  onUndo: () => game.undo() || ui.toast('Nothing to undo'),
  onClear: () => game.clear(),
  onServe: serve,
  onMute: () => ui.setMuted(audio.toggleMute()),
  onCloseServe: closeServe,
  onNew: () => {
    game.clear();
    closeServe();
  },
});

const interaction = createInteraction({
  camera,
  canvas: renderer.domElement,
  controls,
  world,
  game,
  kitchen,
  audio,
  onSpawn: spawn,
});

window.addEventListener('keydown', (e) => {
  if (e.repeat && e.key !== 'z') return;
  audio.unlock();
  const k = e.key.toLowerCase();
  if (ui.serveOpen) {
    if (k === 'escape') closeServe();
    if (k === 'enter') {
      game.clear();
      closeServe();
    }
    return;
  }
  if (/^Digit[1-9]$/.test(e.code)) spawn(Number(e.code[5]) - 1 + (e.shiftKey ? ROW_SIZE : 0));
  else if (k === 'z') game.undo();
  else if (k === 'c') game.clear();
  else if (k === 'enter') serve();
  else if (k === 'm') ui.setMuted(audio.toggleMute());
});

let frame = 0;
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  interaction.update(dt);
  world.step(FIXED_STEP, dt, 8);
  game.update(dt);
  kitchen.update(dt);

  if (serveTimer > 0) {
    serveTimer -= dt;
    if (serveTimer <= 0) controls.autoRotate = false;
  }
  controls.update(dt);
  renderer.render(scene, camera);

  if (frame++ % 10 === 0) ui.setLive(game.liveStats());
});

// Handy for debugging in the console.
window.burger = { game, world, camera, spawn, serve };
