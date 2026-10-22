# Burger Sandbox

A physics burger-building toy in the browser. Drop ingredients onto a cutting board, stack them as high as you dare, and serve the result for a rating. Throw food at the wall if you must, but the game will judge you.

Built with [three.js](https://threejs.org) and [cannon-es](https://github.com/pmndrs/cannon-es). Every model, texture and sound is generated in code, so there are no asset files.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

| Command           | What it does                      |
| ----------------- | --------------------------------- |
| `npm run dev`     | Dev server with hot reload        |
| `npm run build`   | Production build into `dist/`     |
| `npm run preview` | Serve the production build        |

## Controls

| Input                               | Action                                    |
| ----------------------------------- | ----------------------------------------- |
| Click a bin, or `1`–`9`             | Drop a front-row ingredient on the stack  |
| `Shift` + `1`–`9`                   | Drop a back-shelf ingredient              |
| Drag an ingredient                  | Move it                                   |
| Scroll while dragging               | Lift or lower it                          |
| `Q` / `E` while dragging            | Rotate it                                 |
| Flick and release while dragging    | Throw it                                  |
| Right-click a bin                   | Hurl that ingredient at the wall          |
| Right-click elsewhere               | Hurl the last ingredient at that spot     |
| Drag empty space / scroll           | Orbit / zoom the camera                   |
| `Z`                                 | Undo the last ingredient                  |
| `C`                                 | Clear the board and wall stains           |
| `Enter`                             | Serve                                     |
| `M`                                 | Mute                                      |

## Ingredients

**Front row (`1`–`9`):** bottom bun, patty, cheese, lettuce, tomato, onion, pickles, bacon, top bun.

**Back shelf (`Shift` + `1`–`9`):** middle bun, chicken, fried egg, avocado, mushrooms, jalapeños, pineapple, onion rings, ketchup.

## Features

- **Stacking physics.** Layers wobble, squash on landing, and topple if you build badly.
- **Serving.** The camera circles the burger and you get a generated name ("The Club Spicy Hawaiian Cheeseburger"), a 1–5 star rating, height, lean and a verdict.
- **Melting cheese.** Cheese resting on a hot patty or chicken droops over the edge within a few seconds.
- **Effects.** Crumbs on hard landings, steam from hot patties, camera shake on heavy impacts, and slow motion with letterbox bars when a stack collapses.
- **Food waste shaming.** Food that hits the wall sticks, slides down and leaves a stain. Every wasted item (wall or floor) triggers a shame banner with escalating ranks, ingredient-specific insults, and a running cost and calorie tally. The lifetime total is saved in `localStorage`.

## Project layout

```
src/
├── main.js         # Bootstrap, render/physics loop, keyboard shortcuts
├── scene.js        # Renderer, camera, lights
├── physics.js      # cannon-es world and contact tuning
├── kitchen.js      # Counter, wall, board, shelf, ingredient bins
├── ingredients.js  # Ingredient registry, procedural meshes, physics shapes
├── game.js         # Spawning, undo, throwing, wall splats, serve scoring
├── interaction.js  # Picking, dragging, flick and right-click throws
├── cheese.js       # Cheese melt deformation
├── effects.js      # Particles, camera shake, slow motion
├── shame.js        # Food-waste tracking and shame banner
├── audio.js        # Procedural WebAudio sound effects
├── ui.js           # Toolbar, serve panel, toasts
└── style.css
```

## Debugging

The game exposes its internals on `window.burger` (`game`, `world`, `camera`, `fx`, `shame`, `spawn`, `serve`). For example, `burger.game.items` lists every live ingredient with its mesh and physics body.
