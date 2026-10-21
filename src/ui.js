import { INGREDIENTS, keyLabel } from './ingredients.js';

const $ = (id) => document.getElementById(id);

export function createUI(handlers) {
  const list = $('ingredients');
  INGREDIENTS.forEach((def, i) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.title = `${def.name} (${keyLabel(i).replace('⇧', 'Shift+')})`;
    btn.innerHTML = `<span class="dot" style="background:${def.color}"></span><kbd>${keyLabel(i)}</kbd><span class="name">${def.name}</span>`;
    btn.addEventListener('click', () => handlers.onSpawn(i));
    list.appendChild(btn);
  });

  $('undo').addEventListener('click', handlers.onUndo);
  $('clear').addEventListener('click', handlers.onClear);
  $('serve').addEventListener('click', handlers.onServe);
  $('mute').addEventListener('click', handlers.onMute);
  $('keep').addEventListener('click', handlers.onCloseServe);
  $('new').addEventListener('click', handlers.onNew);
  $('help-toggle').addEventListener('click', () => $('hud').classList.toggle('collapsed'));

  // Keep focus off buttons so Enter/Space don't double-fire alongside shortcuts.
  document.querySelectorAll('button').forEach((b) =>
    b.addEventListener('pointerdown', (e) => e.preventDefault()),
  );

  const live = $('live');
  const panel = $('serve-panel');
  let toastTimer = 0;

  return {
    setLive({ count, heightCm }) {
      live.textContent = `${count} ${count === 1 ? 'layer' : 'layers'} · ${heightCm.toFixed(1)} cm tall`;
    },
    setMuted(muted) {
      $('mute').textContent = muted ? 'Sound: off' : 'Sound: on';
    },
    toast(text) {
      const t = $('toast');
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
    },
    get serveOpen() {
      return !panel.hidden;
    },
    showServe(s) {
      $('serve-name').textContent = s.name;
      $('serve-stars').textContent = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);
      $('serve-verdict').textContent = s.verdict;
      $('serve-stats').innerHTML = `
        <div><b>${s.count}</b><span>layers</span></div>
        <div><b>${s.heightCm.toFixed(1)} cm</b><span>height</span></div>
        <div><b>${s.lean.toFixed(1)} cm</b><span>lean</span></div>`;
      const layers = $('serve-layers');
      layers.innerHTML = '';
      const rows = [];
      for (const def of [...s.layers].reverse()) {
        const prev = rows[rows.length - 1];
        if (prev && prev.def === def) prev.n++;
        else rows.push({ def, n: 1 });
      }
      for (const { def, n } of rows) {
        const row = document.createElement('div');
        row.className = 'layer';
        row.style.background = def.color;
        row.textContent = n > 1 ? `${def.name} ×${n}` : def.name;
        layers.appendChild(row);
      }
      panel.hidden = false;
    },
    hideServe() {
      panel.hidden = true;
    },
  };
}
