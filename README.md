# DUST STRIKE — v6

A light, fast CS-style mobile FPS in **TypeScript + Three.js**, packaged for Android with **Capacitor** and built by **GitHub Actions**.

- **Engine:** Three.js (WebGL), no game-engine runtime — ~600 KB of JS, zero external assets
- **Shell:** Capacitor 7 → Android (landscape, immersive fullscreen)
- **APK:** built automatically on every push to `main` (and attached to releases on tags)

## Competitive mode (v6)

The real CS loop, playable solo against bots:

- **Rounds**: 6 s freeze time → 1:55 round. First to **8 rounds** wins the match.
- **Bomb**: you carry C4 as T. Hold **E** (or the USE button) inside A or B for 3.2 s to plant. The fuse runs 40 s and beeps faster as it burns down. CT bots path to the bomb and defuse it in 7.5 s — you have to hold the site.
- **Win conditions**: bomb explodes or all CTs dead → T round; bomb defused, you die before planting, or time out → CT round.
- **Economy**: start with $800, +$600 per kill, +$2200 round win / +$1400 loss. Buy between rounds with **B**.
- **Buy menu**: AK-47 $2700 · M4A1 $3100 · AWP $4750 · USP-S $200 · full ammo $300.
- **Progression**: XP for kills (+25), plants (+60) and match wins (+150). Levels unlock weapons — M4A1 at level 2, AWP at level 3 — and everything is saved on the device.

Deathmatch (endless, 15 kills) and multiplayer are still there from the menu.

## Map (v5)

Rebuilt on dust2 proportions with the classic callouts:

```
      B site ──── CT spawn ──── A site
         │            │            │
   B tunnels ──── mid ──── short A / catwalk
         │            │            │
      T spawn ──── T ramp ──── long doors ── long A (pit, car, blue)
```

- **Long A**: outside long → long doors choke → long A with the car, blue container and the **pit** (−1.2 m, stepped entry) → A ramp.
- **A site**: default box, double stack, goose platform (+0.6 m) and the CT arch.
- **Mid**: double doors, xbox, catwalk to short A with steps, lower tunnel to B.
- **B**: upper tunnels with a **ceiling and warm lights**, B doors, back platform (+0.9 m), big box.
- **Radar**: live minimap in the corner drawn straight from the map grid — walls, elevation tints, teammates and enemies.

## Weapons (v4)

| Slot | Weapon | Damage (chest) | Notes |
| --- | --- | --- | --- |
| 1 | **AK-47** | 36 | 600 rpm, heavy recoil, wood furniture |
| 2 | **M4A1** | 33 | 666 rpm, flatter recoil |
| 3 | **AWP** | 115 | bolt action, clean circular scope, 22° zoom |
| 4 | **USP-S** | 26 | 12-round sidearm, fast to raise |

Damage scales with the body part hit: **head ×4**, stomach ×1.25, chest ×1, legs ×0.72 — an AK headshot (144) or an AWP chest shot (115) ends the round. The HUD tells you what you hit.

Switch with **1–4**, **Q**, the mouse wheel, or the SWAP button; scope with right-click or the SCOPE button (sensitivity drops to 42% while scoped).

## Map (v4)

The grid now carries a **height field**, so the layout has real elevation: the **pit** at long (−1.2 m with stepped entry), the **A-site platform** (+0.6 m), the **B back platform** (+0.9 m), a tunnel step and short-A steps. Walls are extruded below the floor so nothing leaks, and the player/bot physics read terrain height directly.

## Multiplayer (v3)

Real online play with **Create Server / Join Server**:

- **Create Server** — spin up a room with a name, max players and kill target. It gets a 4-letter code.
- **Join Server** — browse live servers (players, map, kill target) and tap to join, or type the code in *Direct Join*.
- Teams (T / CT) are auto-balanced, everyone spawns at their side, and the scoreboard (TAB or the SCORE button) shows K/D per player.
- 20 Hz state sync with client-side interpolation, server-side hit registration, respawns and match win.

The client talks to any server you point it at: paste the `wss://` address into the lobby and it becomes your server list.

### Run the server locally

```bash
cd server
npm install
npm start          # ws://localhost:8080/ws   (health: /health, rooms: /rooms)
```

Then in the game: **MULTIPLAYER → server address `ws://localhost:8080/ws` → CONNECT**.
On a phone use your computer's LAN IP, e.g. `ws://192.168.1.20:8080/ws` — same Wi-Fi, no deploy needed.

### Troubleshooting (read this first)

| Symptom | Cause | Fix |
| --- | --- | --- |
| "connection failed" on the phone | `ws://localhost` points at the phone itself | use `ws://<your-pc-LAN-IP>:8080/ws` on the same Wi-Fi, or a deployed `wss://` URL |
| "connection timed out" | server not running / firewall | check `http://<host>:8080/health` in a browser |
| Works on PC, not on phone | mixed content (https page → ws socket) | fixed in v5: the app now loads over `http://localhost` with cleartext allowed |
| "server is full" | room hit its max players | raise max players when creating, or join another room |
| Random disconnects | dead socket | v5 adds a 20 s heartbeat and auto cleanup |

### Deploy it (so friends anywhere can join)

| Host | How |
| --- | --- |
| **Render** | New → Blueprint → pick this repo. `render.yaml` is included. |
| **Fly.io** | `cd server && fly launch --copy-config && fly deploy` |
| **Railway** | New project → Deploy from repo → `railway.json` handles the Dockerfile. |
| **Any VPS** | `docker build -t dust ./server && docker run -p 8080:8080 dust` |

Once deployed, open `https://your-app.onrender.com/health` — if it answers, put `wss://your-app.onrender.com/ws` into the lobby.

> The server is a relay with light validation (rate-limited fire, clamped positions, server-applied damage). It is **not** cheat-proof — a real competitive build needs server-authoritative movement and lag compensation.

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
