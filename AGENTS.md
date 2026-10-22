# AGENTS.md

Guidance for AI coding agents working on Burger Sandbox. See `README.md` for what the game does and how to play it.

## Stack

- Vite + vanilla JavaScript (ES modules, no framework, no TypeScript)
- `three` for rendering, `cannon-es` for physics
- No asset files. Meshes, textures (canvas), and sounds (WebAudio) are all generated in code. Keep it that way unless the user asks otherwise.

## Commands

```bash
npm install
npm run dev      # dev server (hot reload)
npm run build    # must pass before committing
```

There is no test suite, linter or formatter. `npm run build` is the minimum check.

## Architecture

`main.js` wires everything together and owns the frame loop:

1. `interaction.update(realDt)`
2. `world.step(FIXED_STEP * timeScale, dt, 8)`
3. `game.update(dt)` syncs meshes to bodies, runs melt/heat/wall logic
4. `kitchen.update(realDt)`, `fx.update(dt, realDt)`
5. `fx.beginShake()` → render → `fx.endShake()`

`dt` is scaled by `fx.timeScale` (slow motion); `realDt` is not. Use `realDt` for UI, camera and anything that should not slow down.

Modules are factory functions (`createX(deps)`) that return a small API object. Dependencies are passed in explicitly; avoid globals other than the `window.burger` debug handle.

### Key modules

| File             | Responsibility                                                                 |
| ---------------- | ------------------------------------------------------------------------------ |
| `ingredients.js` | `INGREDIENTS` registry: `id`, `name`, `color`, `mass`, `halfHeight`, `shape()`, `build()`, `pitch`, optional `offsets`, `sizzle`, `squelch`, `crumb`, `stain` |
| `game.js`        | Item lifecycle (`addItem`/`removeItem`), spawn, undo, clear, throw, wall splats, stains, topple detection, serve scoring. Emits events via `game.on()` |
| `interaction.js` | Raycast picking, drag via `PointToPointConstraint`, flick and right-click throws |
| `effects.js`     | Instanced chunk particles, point-sprite puffs, camera shake, slow motion       |
| `cheese.js`      | Per-instance cheese geometry deformation when near a hot item                   |
| `shame.js`       | Waste tally (session + `localStorage` lifetime), banner, sounds                 |
| `kitchen.js`     | Static scene and colliders; exports `BOARD`, `COUNTER`, `wallBody`              |

### Game events

`game.on(event, fn)`: `spawn` (item), `remove` (item), `impact` ({ item, v, point }), `topple` (count), `waste` ({ def, where: 'wall' | 'floor', item }).

## Conventions and gotchas

- **Units:** 1 unit ≈ 5 cm. A bun has radius 1. The board top is at `y = BOARD.top` (0.2).
- **Adding an ingredient:** add a builder function and a registry entry in `ingredients.js`. The bins, toolbar, shortcuts and bin labels are generated from `INGREDIENTS`. The layout assumes two rows of `ROW_SIZE` (9); adding a 19th ingredient needs a layout change in `kitchen.js` and `style.css`. Also update the name/flavour logic in `game.js` `serveStats()` and the `COST` / `INGREDIENT_LINES` tables in `shame.js`.
- **Multi-piece layers** (pickles, avocado, mushrooms, jalapeños, onion rings) use `offsets`. They become one mesh group and one compound body. Do not spawn them as separate bodies; small separate pieces made stacks collapse.
- **Thin bodies tunnel.** `physics.js` clamps speed to `MAX_SPEED` after each step. Thrown bodies set `body.thrown = true` to skip the clamp until their first collision, and use collision group 2 so throws in flight ignore each other.
- **Never change a body's type inside a `collide` handler.** Queue the change and apply it in `game.update()` (see `wallHits`).
- **Mesh templates are cached and cloned** in `createMesh()`. Clones share geometry and materials. If you deform or recolour a single instance, clone its geometry/material first (see `makeMeltable`).
- **Camera shake** is applied around the render call only, so it never accumulates into `OrbitControls` state.
- **Pointer handling:** the `pointerdown` listener runs on `window` in the capture phase so it can claim a click before `OrbitControls` does.
- **Buttons** call `preventDefault()` on `pointerdown` so they never take focus; otherwise `Enter` would trigger both the button and the serve shortcut.

## Verifying changes

For anything visual or physics-related, a passing build isn't enough. Run the dev server and check in a browser. Headless Playwright with `--use-angle=swiftshader --enable-unsafe-swiftshader` works; drive the game through `window.burger` (for example, `burger.spawn(i)`, inspect `burger.game.items[n].body.position`) and take screenshots. Software rendering is slow, so frame rates from headless runs are not meaningful.

## Git

Commit in small, focused steps with a short imperative message, matching the existing history. Run `npm run build` first.
