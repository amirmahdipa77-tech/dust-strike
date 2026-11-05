# DUST STRIKE — v1

A tiny, fast, CS-style mobile FPS built with **TypeScript + Three.js** and shipped as an Android APK through **Capacitor** and **GitHub Actions**.

- **Engine:** Three.js (WebGL) — no game engine runtime, ~575 KB of JS, no external assets
- **Language:** TypeScript (strict), Vite build
- **Shell:** Capacitor 7 → Android (landscape, immersive fullscreen)
- **APK:** built automatically by `.github/workflows/android.yml`

## What is in v1

- Dust-inspired map: **Mid** with doors, **Long A** with the car and blue container, **B tunnels**, two bomb sites, catwalk/short connector, T and CT spawn bands.
- Bot deathmatch: 4 bots with A* navigation, line-of-sight checks, strafing and hitscan fire. First to **15 kills** wins.
- Hitscan AK with recoil, spread, 30-round mag, reload, headshots (120 dmg) vs body (34 dmg).
- Mobile controls: floating joystick (left), look-drag (right), fire / jump / reload / crouch buttons.
- Desktop controls: WASD, mouse look (pointer lock), click to shoot, Space, R, C.
- Performance work: one merged draw call for the whole map, vertex colours, no shadows, procedural sand texture, capped pixel ratio, adaptive resolution drop when FPS sags, 120-particle pool for impacts.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production bundle into dist/
npx cap sync android # copy dist/ into the Android project
```

## Build the APK

Push to `main` (or run the workflow manually). The APK lands in the run's **Artifacts**:

```
Actions → Build Android APK → dust-strike-debug-apk
```

Locally (needs JDK 21 + Android SDK 35):

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

## Project layout

```
src/
  main.ts        renderer, game loop, combat, state machine
  map.ts         dust-style map builder (boxes -> one merged mesh + colliders)
  collision.ts   AABB capsule resolution, ground height, ray casts, LOS
  nav.ts         coarse A* grid used by the bots
  bots.ts        bot meshes, AI, shooting
  player.ts      movement, camera, health
  weapon.ts      viewmodel, recoil, ammo, reload
  input.ts       touch + keyboard/mouse
  hud.ts         DOM HUD
  audio.ts       synthesised SFX (no audio files)
  style.css      HUD / overlays
android/         Capacitor Android project (landscape, immersive)
.github/         CI: builds and uploads the debug APK
```

## نقشه (فارسی)

نقشه از سه مسیر ساخته شده: **Mid** با درهای وسط، **Long A** با ماشین و کانتینر آبی، و **B Tunnels**؛ بههمراه دو سایت بمب، مسیر کوتاه (Short A) که Mid را به Long وصل میکند، و دو ناحیهی اسپاون T و CT.

بازی در نسخهی اول حالت مرگمسابقه با ۴ بات است: هر کس اول به ۱۵ کیل برسد برنده است. کنترلها هم لمسی است (جویاستیک شناور سمت چپ، کشیدن برای نگاه در سمت راست، دکمههای شلیک/پرش/خشاب/نشستن) و هم با کیبورد و ماوس.

## Licence

MIT
