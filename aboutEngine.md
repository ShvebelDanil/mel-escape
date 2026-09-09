# MelonJS Engine Overview

This is a simple 3D endless runner game built with **Three.js**. The code is split into modules for clarity.

## File Structure (source/)

- **assets.js** – Holds base64‑encoded textures (bottle, etc.) used by the game.
- **entities.js** – Defines functions to build in‑game entities (player “Mel”, granny, obstacles) using Three.js primitives.
- **graphics.js** – Core rendering setup: renderer, scene, camera, texture/material/geometry caches, helper utilities for creating meshes, limbs, shadows, and baking static geometry.
- **level.js** – Procedural level generation logic. Builds routes, obstacles, rewards, and difficulty scaling.
- **main.js** – Game loop, input handling (move/jump/roll), collision detection, state machine (loading, menu, run, over), and integration of all modules.
- **utils.js** – Common helpers: math utilities, DOM shortcuts, UI management, constants (lanes, speeds, gravity, etc.), and save/load functions.

## How It Works

1. **Initialization** (`main.js`): Sets up Three.js renderer, loads textures, starts the loading screen.
2. **Rendering Loop**: `graphics.js` provides the renderer and scene; `main.js` updates game state each frame and calls render.
3. **Entity Creation**: `entities.js` returns Three.js `Group` objects for characters and items.
4. **Level Generation**: `level.js` creates a sequence of segments with obstacles, platforms, and collectibles as the player progresses.
5. **Physics & Collision**: Simple AABB checks in `main.js` using constants from `utils.js` (hit widths, gravity, jump velocity).
6. **UI & Input**: `utils.js` handles DOM elements, button toggles, and mobile detection. Input functions (`move`, `jump`, `roll`) are bound to keys/touch.

## Dependencies

- Three.js (r152 or similar) – included via HTML script tag.
- No build system; raw ES modules are used (requires server with CORS or local dev server).

## Running the Game

1. Serve the folder (e.g., `python -m http.server` or `npx serve`).
2. Open `index.html` in a browser.
3. The game will load assets and start at the menu.

## Extending

- Add new entities in `entities.js` and export builder functions.
- Modify level generation in `level.js` (adjust `BLOCKERS`, `HOPPERS`, `FILLERS`, or builder methods).
- Adjust gameplay constants in `utils.js` (speed, gravity, lane positions).

---
*Generated automatically for quick onboarding of other AIs or developers.*