# Backrooms portfolio imagery

## October 31, 2026

`backrooms-levels.jpg` and `backrooms-level-0.jpg` replace `backrooms-corridor.jpg`. The home page thumbnail (`thumbs/backrooms.webp`) is `backrooms-level-0.jpg` scaled down.

Both were captured from the local `threejs-maze` dev server with Playwright and headless Chrome on the GPU, through the `?debug` hook (`window.__backrooms`). Settings: Explore mode, flashlight off, 100% resolution, field of view 70, pitch 0, dynamic lights and ambient occlusion on, no head bob or power cuts, and hidden HUD. VHS effects are on except static, scanlines, and the bad TV wobble, with film noise at 0.05. Each capture was rendered at 3200 x 1800 and scaled to 1600 x 900. No simulator source files were changed.

The `level` URL parameter is the level's ID in `src/world/levels.js`, not its number: Level 0 is 0, Level 1 is 1, Level 37 is 2, Level 2 is 3, Level 5 is 4, and Level 4 is 5.

- `backrooms-level-0.jpg`: seed 777, camera (19.55, 38), yaw -1.7208. Contrast stretched with Pillow's `ImageOps.autocontrast`, clipping 0.3% at each end.
- `backrooms-levels.jpg`: six captures cut into six equal vertical strips. Each camera stands at a cell center facing a wall 2.5 cells ahead, with open floor in front of it across that strip, so the wall's top and bottom line up across the strips.

| Strip | Level | Seed | Camera | Yaw |
| --- | --- | --- | --- | --- |
| 1 | 0 | 1234 | (-32, -50) | 0 |
| 2 | 1 | 1234 | (-17, -86) | 0 |
| 3 | 2 | 2024 | (99, -6) | 0 |
| 4 | 4 | 1234 | (-75, -33) | 1.5708 |
| 5 | 5 | 1234 | (-61, 82) | 1.5708 |
| 6 | 37 | 1234 | (87, 36) | 1.5708 |

The 4:3 strip thumbnail of `backrooms-levels.jpg` keeps the middle three quarters of each level's strip instead of the middle of the image, so all six levels stay in it.

## September 25, 2026

Updated from the current local `threejs-maze` source on September 25, 2026. The gallery contains real Chromium screenshots, including the in-progress Level Fun. All captures use the flashlight, seed 42, Explore mode, 100% resolution, dynamic lights, default VHS effects, no head bob or power cuts, and hidden HUD. No simulator source files were changed.

Files in `assets/img/portfolio/`:

- `backrooms-cover.jpg`: 1200 × 675 cover, using the corridor capture and the existing main title. Subtitle removed.
- `backrooms-corridor.jpg` (removed October 31, 2026): camera (10, 10), yaw 3.6.
- `backrooms-open-rooms.jpg`: camera (4, 0), yaw 0.
- `backrooms-level-fun-room.jpg`: camera (0.7, 0.7), yaw 0.25.
- `backrooms-level-fun-cake.jpg`: camera (-0.8, -0.3), yaw 1.0.
- `backrooms-level-fun-corridor.jpg`: camera (6, 6), yaw 2.5.

Gallery screenshots are 1600 × 900. Camera coordinates are (x, z); pitch is 0 and yaw is in radians. Level Fun uses `?seed=42&mode=explore&level=fun&debug`. The standard level omits `level=fun`.

The cover was composited with the built-in imagegen tool, then exported as JPEG. The gallery files are direct browser captures. The cover is an edited derivative rather than a pixel-identical screenshot.

Initial cover prompt (inputs: corridor screenshot and previous cover as typography reference):

> Use case: compositing. Asset type: 16:9 portfolio cover. Image 1 is the edit target and new real gameplay screenshot with the flashlight ON. Image 2 is ONLY the reference for the existing title typography. Keep Image 1 as the background: same exact corridor geometry, perspective, wallpaper, carpet, ceiling, illumination including flashlight pool, grain and VHS look. Do not invent, redraw, move or add scene elements. Add the same two centered white text lines from Image 2, matching its pixel monospace lettering, size relative to canvas, spacing and placement. Text (verbatim): "BACKROOMS SIMULATOR" on the first line, "Infinitely Procedural" on the second line. Main title spans about 66% of width, centered at 47% of height; subtitle beneath at 55% of height. Keep all spelling and casing exactly as supplied. Only subtle dark text shadow for readability. No other words, no border, no logo, no new artwork. Output 16:9, 1600x900 or 1536x864. This is only replacement of the old background with the supplied new screenshot while preserving the title treatment.

Final edit prompt (input: first cover result):

> Use case: precise-object-edit. Edit this Backrooms Simulator portfolio cover. Remove the entire subtitle "Infinitely Procedural" below the main title, restoring the corridor wallpaper and distant light behind it. Keep the main title "BACKROOMS SIMULATOR" exactly unchanged: same letters, white pixel monospace font, size and current position. Keep the rest of the screenshot background exactly unchanged, including corridor geometry, flashlight illumination, wallpaper, carpet, ceiling and overall color. No other text. Do not move the main title. Output same 16:9 composition.

