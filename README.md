# DUST STRIKE — v2

A light, fast CS-style mobile FPS in **TypeScript + Three.js**, packaged for Android with **Capacitor** and built by **GitHub Actions**.

- **Engine:** Three.js (WebGL), no game-engine runtime — ~600 KB of JS, zero external assets
- **Shell:** Capacitor 7 → Android (landscape, immersive fullscreen)
- **APK:** built automatically on every push to `main` (and attached to releases on tags)

## What's new in v2

- **Map rebuilt from scratch.** A 1 m occupancy grid paints the dust2 floor plan (T spawn, mid with doors, long A with doors/car/blue container, short A catwalk, upper + lower tunnels, A site, B site with back plat, CT spawn). Walls are greedy-meshed from that grid, so geometry follows the layout exactly; the floor carries a baked ambient-occlusion tint.
- **Weapon animation.** Recoil pattern, muzzle flash, shell ejection, reload choreography (mag drops, new mag seats, bolt pull), idle breathing, walk bob, look sway with inertia, landing dip, camera shake.
- **Bot animation.** Swinging legs, aim smoothing, muzzle flash, death fall.
- **Full settings menu.** Sensitivity, joystick size, FOV, invert Y, left-handed layout, bot count, kills to win, crosshair style/colour/size/gap/opacity/dot, HUD scale + accent colour, hitmarker / damage flash / damage direction toggles, render scale, master volume. Everything persists in `localStorage`.
- **HUD.** Glass panels, kill progress bar, directional damage arcs, animated crosshair spread.

## Controls

Touch: floating stick on the left, look-drag on the right, fire / jump / reload / crouch buttons (mirrored when left-handed).
Desktop: WASD, mouse look (pointer lock), click to fire, Space, R, C.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production bundle
npx cap sync android # copy dist/ into the Android project
```

## Build the APK

Push to `main`, or run **Actions → Build Android APK** manually. The APK lands in the run's artifacts:

```
dust-strike-debug-apk → app-debug.apk
```

Locally (JDK 21 + Android SDK 35):

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

## Layout of the map

```
            B site        CT spawn        A site
              |              |              |
   upper tunnels -- B doors --+-- short A --+
              |              |              |
          T spawn ------- mid ---- long A
```

Mid is a long lane split by double doors; long A has its own door wall, the car and the blue container; the lower tunnel links mid to B; short A (catwalk) links mid to A.

## Project layout

```
src/
  main.ts        renderer, loop, combat, state machine
  map.ts         grid-painted dust layout, greedy-meshed walls, props
  nav.ts         A* grid used by the bots (built from the map grid)
  collision.ts   AABB capsule resolution, ground height, ray casts, LOS
  bots.ts        bot models, AI, animation
  player.ts      movement, camera, health, landing/roll
  weapon.ts      viewmodel, recoil, reload animation, shells
  input.ts       touch + keyboard/mouse
  hud.ts         DOM HUD, crosshair, damage arcs
  ui.ts          settings panel
  settings.ts    persisted settings
  audio.ts       synthesised SFX
android/         Capacitor Android project (landscape, immersive)
.github/         CI that builds and uploads the APK
```

## Licence

MIT
