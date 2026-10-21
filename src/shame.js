// Food waste tracking + public shaming.

const STORE_KEY = 'burger-sim.waste';

// [price in £, kcal] per layer
const COST = {
  bottomBun: [0.35, 120], topBun: [0.35, 130], middleBun: [0.3, 90], patty: [1.8, 250],
  cheese: [0.4, 70], lettuce: [0.15, 5], tomato: [0.25, 5], onion: [0.15, 6], pickles: [0.2, 4],
  bacon: [0.9, 90], chicken: [1.6, 280], egg: [0.3, 90], avocado: [0.8, 80], mushrooms: [0.4, 10],
  jalapenos: [0.2, 4], pineapple: [0.35, 25], onionRings: [0.6, 160], ketchup: [0.1, 20], hashBrown: [0.5, 150],
};

const RANKS = [
  [1, 'Hey!'],
  [3, 'Again?'],
  [5, 'Seriously.'],
  [10, 'Food Criminal'],
  [20, 'Wall Chef'],
  [35, 'Public Menace'],
  [50, 'Legend of Waste'],
  [100, 'The Wall Is Now A Burger'],
];

const MILESTONES = new Set([5, 10, 20, 35, 50, 100]);

const WALL_LINES = [
  'That was perfectly good food.',
  'Somewhere, a grandmother just felt a disturbance.',
  'The wall was not hungry.',
  'Food goes in mouths. Not on walls.',
  'Do you throw food at home too?',
  'This is why we can\'t have nice things.',
  'The cleaning crew has been notified. They are not happy.',
  'People queue for this. You threw it at a wall.',
  'Your ancestors farmed for this.',
  'That wall now has a better diet than you.',
];

const FLOOR_LINES = [
  'The five-second rule does not apply to this floor.',
  'The floor is not on the menu.',
  'Gravity: 1. Food: 0. You: shamed.',
  'Somebody has to mop that.',
];

const INGREDIENT_LINES = {
  patty: ['That cow did not give its life for a wall.', 'A whole patty. Gone. Like your dignity.'],
  chicken: ['That chicken crossed the road for THIS?'],
  cheese: ['Cheese is for melting, not modern art.'],
  lettuce: ['The one healthy thing, and you threw it.'],
  tomato: ['Tomatoes are for burgers, not for booing actors.'],
  onion: ['Now the wall is crying too.'],
  pickles: ['Even pickles deserve better.'],
  bacon: ['Throwing bacon should be a crime. It might be.'],
  egg: ['Someone had to lay that egg.'],
  avocado: ['And you wonder why you can\'t afford a house.'],
  mushrooms: ['Those mushrooms were fun guys. Were.'],
  jalapenos: ['Now the wall is spicy. Happy?'],
  pineapple: ['Pineapple on a wall is somehow worse than on pizza.'],
  onionRings: ['Those onion rings had dreams.'],
  ketchup: ['Ketchup belongs in a bottle, not on the tiles.'],
  bottomBun: ['A baker woke up at 4am for this.'],
  topBun: ['A baker woke up at 4am for this.', 'Those sesame seeds were hand-placed. Probably.'],
  middleBun: ['A baker woke up at 4am for this.'],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function load() {
  try {
    return { items: 0, cost: 0, kcal: 0, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return { items: 0, cost: 0, kcal: 0 };
  }
}

export function createShame({ audio }) {
  const session = { items: 0, cost: 0, kcal: 0 };
  const lifetime = load();
  let lastLine = '';
  let hideTimer = 0;
  let lastSound = 0;

  const banner = document.createElement('div');
  banner.id = 'shame';
  banner.innerHTML = `
    <div class="stamp">SHAME</div>
    <div class="rank"></div>
    <div class="line"></div>
    <div class="stats"></div>`;
  document.body.appendChild(banner);

  const hudLine = document.createElement('p');
  hudLine.id = 'waste';
  hudLine.hidden = true;
  document.getElementById('live').after(hudLine);

  const fmt = (n) => `£${n.toFixed(2)}`;

  function renderHud() {
    hudLine.hidden = session.items === 0 && lifetime.items === 0;
    hudLine.textContent =
      `Food wasted: ${session.items} (${fmt(session.cost)})` +
      (lifetime.items > session.items ? ` · lifetime ${lifetime.items} (${fmt(lifetime.cost)})` : '');
  }
  renderHud();

  function chooseLine(def, where) {
    const own = INGREDIENT_LINES[def.id];
    const pool = where === 'floor' ? FLOOR_LINES : own && Math.random() < 0.6 ? own : WALL_LINES;
    let line = pick(pool);
    for (let i = 0; i < 4 && line === lastLine; i++) line = pick(pool);
    lastLine = line;
    return line;
  }

  return {
    get session() {
      return session;
    },
    show({ def, where }) {
      const [price, kcal] = COST[def.id] || [0.3, 50];
      // Multi-piece layers (pickles etc.) cost the same as one layer.
      for (const t of [session, lifetime]) {
        t.items++;
        t.cost += price;
        t.kcal += kcal;
      }
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(lifetime));
      } catch {
        /* private mode */
      }

      const n = session.items;
      const rank = RANKS.filter(([min]) => n >= min).pop()[1];
      const big = MILESTONES.has(n) || (n > 100 && n % 25 === 0);

      banner.querySelector('.rank').textContent = rank;
      banner.querySelector('.line').textContent = chooseLine(def, where);
      banner.querySelector('.stats').textContent =
        `${n} wasted this session · ${fmt(session.cost)} · ${Math.round(session.kcal).toLocaleString()} kcal in the bin`;
      banner.classList.toggle('big', big);
      // Restart the stamp animation.
      banner.classList.remove('show');
      void banner.offsetWidth;
      banner.classList.add('show');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => banner.classList.remove('show'), big ? 4500 : 3200);

      const now = performance.now();
      if (big) audio.sadTrombone();
      else if (now - lastSound > 500) audio.shameBell();
      lastSound = now;
      renderHud();
    },
  };
}
