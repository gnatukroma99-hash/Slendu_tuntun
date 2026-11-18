# Slendytubbies II · Web / Android

An **unofficial browser adaptation of the Classic map**, with independent solo
games and a new **2–4 player cooperative mode over Wi-Fi/WebSocket**, using
original scene geometry, terrain, props, character meshes and textures from the
free Slendytubbies II V2.2 Windows build linked by ZeoWorks. The gameplay and web
renderer are newly implemented. This is **not the full original game** and not
an official ZeoWorks release.

## Run

Requires Node.js 22.12+ and a local copy of `public/assets/`. The GitHub repository contains the source and our Blender models, not the assets extracted from the original game.

On another device, clone this repository and copy `public/assets/` from your existing project into the same relative path. Check that `public/assets/scene.json`, `public/assets/scene.bin` and the accompanying WebP textures are present before building. To regenerate that directory from your own copy of the original game, see [Reproduce the asset export](#reproduce-the-asset-export).

```sh
git clone https://github.com/gnatukroma99-hash/Slendu_tuntun.git
cd Slendu_tuntun
# Restore public/assets/ here before building.
npm ci
npm run build
npm start
```

If you already cloned the repository, use `git pull` instead of `git clone`. In-game progress is stored in the browser and does not sync through Git.

Open <http://localhost:4175> on this device. On another Android phone on the same
Wi-Fi, open `http://<computer-LAN-IP>:4175`. The server binds to `0.0.0.0`.
Allow access through the host firewall if needed. `localhost` on a different
phone does not refer to the computer running the server.

`npm start` serves the built game and its room server on port 4175. Set `PORT`
and `GAME_DIST` to override the port and release directory. `PUBLIC_ORIGIN`
explicitly authorizes a public HTTPS origin for WebSocket connections.

For solo-only static hosting:

```sh
npm run build
npm run preview -- --port 4175
```

Serve the contents of `dist/` using a static HTTP(S) host. Do not open `index.html`
via `file://`: browsers block the game's asset requests. **Solo needs no game
backend, account or shared room**, so a friend in another city can play through
the public HTTPS link independently. Co-op needs the included Node/WebSocket
server. Neither mode needs a model API key, paid AI or CDN. HTTPS enables
the best fullscreen/home-screen behavior; basic play also works over LAN HTTP.
The manifest provides an installable-style shortcut, **not offline caching**.

## Play

- Find ten randomly selected custards at original spawn locations.
- Android: left joystick to move; swipe on the right to look; hold `»` to run;
  `☼` toggles the flashlight; the hand button collects nearby custard.
- **Automatic pickup while moving is on by default**, including while sprinting.
  It needs no third finger. Disable it in the menu if preferred. Manual pickup
  supports a third non-primary touch while the joystick and sprint stay held;
  holding the hand button or E also keeps attempting to collect nearby items.
- Desktop: WASD/arrows, mouse (or mouse drag if pointer lock is unavailable),
  Shift to run, E to collect, F for flashlight, Escape for pause.
- Sprint drains stamina; it recovers when walking or resting.
- The pursuer wakes after the first pickup or 15 seconds, and speeds up as
  custards are collected. Steering is reimplemented, not the original NavMesh AI.
- Pause, win/loss screens and restart are supported. Backgrounding the browser
  pauses solo gameplay and audio. In co-op it stops your input, not the shared
  world; the pursuer can still catch you. Touch cancellation clears held inputs.
- A weak directional signal helps locate remaining pickups on a small screen.
- **G / ☺** plays your skin's signature emote. At the end of a round, save the team photo with its match-stat captions as a PNG.

## Cooperative Wi-Fi play

1. Keep the server running on one device. Connect all phones to the same Wi-Fi.
2. Open `http://<server-LAN-IP>:4175` on each phone (the menu shows LAN addresses).
3. Press **ИГРА ПО WI-FI**, enter a nickname, and create a room on one phone.
4. Other players enter its six-character code. The host starts once two players
   are connected. Maximum room size is four.

Positions, stamina, common custards, score, enemy movement and eliminations are
server-authoritative. Clients predict movement and interpolate teammates. All
clients/server use the same collision data regardless of graphics quality. A
custard can be collected only once, even when two players reach it together.
Everyone wins when the common counter reaches ten, and the team loses only when all remaining players are caught. In cooperative collection modes, the team gets one TV rescue per round: the caught player shares the channel in chat, and a teammate can locate the matching TV (**V**) and tune it (**E**). The host can restart a completed round. Host authority transfers when the host leaves.

Temporary disconnections can resume the same player for 30 seconds using a
private per-tab resume token, which is not included in room links or snapshots.
Input stops after 300 ms without fresh packets. Mid-round new joins are not
supported; existing players may reconnect. Use a trusted LAN: HTTP/WS is not
encrypted; the public HTTPS/WSS tunnel is encrypted. Room codes are a convenient
invitation mechanism, not authentication for sensitive data.

Fresh solo visitors never join a room automatically and never share their score,
pickups or enemy with other solo visitors, including through the public link.
An already participating tab can automatically resume its previous room after
a refresh; pressing the solo start button explicitly leaves that room.

## Android requirements / performance

- A modern Android browser with **WebGL 2** (current Chrome recommended).
- Multi-touch, responsive portrait/landscape layouts, safe-area insets, optional
  fullscreen/orientation lock, and user-gesture-activated audio.
- Start with **economy graphics**: pixel ratio 1, 30 FPS target, instanced trees,
  no dynamic shadows. Higher quality increases tree density and resolution.
- Roughly 3.5 MiB of local map assets, rather than the 287 MiB original archive.
- Playwright tests emulate Android Chromium in portrait and landscape; this is
  not a claim that physical phones or their performance have been tested.

## What has / has not been ported

Included: original Classic terrain, static scene objects, tree prototypes,
Tinky Winky mesh, custard mesh, textures and spawn coordinates. Textures are
resized to at most 768 pixels and encoded as WebP. Original game executables
and assemblies are never loaded or executed in the browser.

Reimplemented: first-person controller, approximate collision, enemy steering,
collection, stamina, flashlight, UI, procedural audio, game states and a new
cooperative WebSocket protocol. Original animation clips, shaders, sound
recordings, the original multiplayer/Photon protocol, other maps,
character selection and all original scripts are **not** implemented. Static
character meshes are used; this is not a recovered Unity source project.

Original files are not a Unity project that can simply be exported as WebGL.
Some collision and visual differences are expected. This first version is a
playable vertical slice, not a completed faithful port of every game mode.

## Tests

```sh
npm run build
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

On ARM Linux where bundled SwiftShader fails, install Mesa EGL/Vulkan software
drivers and run `HEADLESS_MESA=1 npm run test:e2e` to use llvmpipe through ANGLE.
This flag affects the test browser only, not the game or an Android user's browser.
On that ARM setup, desktop tests exercise the mouse-drag fallback because native
pointer lock can stall CDP keyboard input. Android multi-touch tests use actual
browser touch input, not a mocked controller.

Development-only test hooks exist only with `?test=1` on the Vite dev server.
They are excluded from production builds.

## Development and safe update workflow

Keep the currently published release and cloudflared process running while
editing source. `npm run build:staging` writes to **`dist-next/`**, not `dist/`.
The prior 0.1 build is backed up at `/tmp/opencode/slendytubbies-release-0.1`.

For development, use two terminals:

```sh
npm run build:staging
PORT=4180 GAME_DIST=dist-next npm start
```

```sh
npm run dev -- --port 4173
```

Vite proxies `/api` and `/ws` to the development backend at 4180. Browser tests
start those services if they are not already running. Promote the tested
release to the existing origin port **without restarting cloudflared** to keep
the same temporary public hostname. Existing open solo games can continue;
refresh the page to load the update.

## Reproduce the asset export

Install the dependencies in a Python environment and run the exporter over your own copy of the game:

```sh
python -m pip install -r tools/requirements.txt
python tools/export_unity.py /path/to/Slendytubbies_II_Data
```

The exporter reads serialized data without running the Windows game, converts
handedness, packs geometry and heights into one binary file, and exports a
scene manifest and WebP textures. It currently targets the Classic scene
(`level7`) in this specific build, not arbitrary Unity games.

## Asset provenance / rights

- Developer page: <https://zeoworks.com/games/Slendytubbies2.html>
- Archive linked by that page: <https://www.mediafire.com/file/6b5ac8xiy1d9uy4/>
- Windows 32-bit V2.2 ZIP SHA-256:
  `5a99007dc6f8bedb4cc19afc18c9ea5df93bb5e09d0df8f34e6a639149e9bfaa`
- Original Unity player version: `5.6.0b9`.

Original game materials remain the property of ZeoWorks and their respective
authors; no license to those materials is granted here. Download availability
does not establish redistribution rights. Obtain appropriate permission before
publishing or redistributing a derivative version containing original assets.
