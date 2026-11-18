# Version 0.2 validation — 2026-11-12

## Automated checks

- `npm test`: **24 passed**. Includes original asset/state tests plus room
  capacity, host permissions, shared/atomic collection, auto-pickup during sprint,
  victory/restart, elimination/team loss, stale inputs, reconnect/host handoff,
  credential privacy, independent rooms, real WebSocket clients, HTTP scope,
  malformed/oversized messages and cross-origin rejection. Spoofed DNS names
  beginning with a private-IP-looking prefix are also rejected.
- Baseline browser suite: 4 Android landscape cases passed; 3 desktop and 4
  Android portrait cases passed. One desktop touch-only case intentionally skipped.
- Update suite: 4 Android landscape cases and 4 Android portrait cases validated
  across the initial run and targeted re-runs. Coverage includes two-finger
  automatic collection while running, third-finger manual collection without
  releasing movement/sprint, room creation/join/shared counter, reload/resume,
  leaving only one's own slot, and independent solo games in separate browsers.
- Extended cooperative reload scenario re-run in both Android orientations:
  **2 passed**. An earlier portrait test incorrectly assumed the idle team was
  still alive after slow software-rendered reload/screenshots. The actual shared
  enemy had caught both players. The test now uses the appropriate pause,
  spectator or result exit action; enemy simulation was not disabled or weakened.
- `npm run build:staging`: successful. Only `dist-next/` was written during work;
  the live 0.1 `dist/` was left untouched.
- `npm audit --omit=dev`: zero known vulnerabilities.
- Node syntax checks: server/app.js, server/room.js, src/network.js and src/main.js.
- HTML check: 64 unique element IDs, no duplicates.

## Live release validation

Public hostname preserved:
https://indicator-chip-anymore-fingers.trycloudflare.com/

- `/api/health` returned version `0.2.0`; root HTML contained the 0.2 marker.
- Two **real public WSS** clients created/joined one room, started it, both saw
  exactly one shared pickup and received synchronized running movement.
- Two fresh Android Chromium browser contexts (landscape and portrait) loaded
  the **production HTTPS URL**, not the Vite dev server. Both started solo; the
  first collected automatically while two touch pointers held joystick/run,
  while the second kept its independent zero score.
- No JavaScript errors or failed requests during that production browser check.
  Development hooks were absent from the production build.
- Screenshot: `/tmp/opencode/slendytubbies-public-v0.2.png`.
- Only the old preview origin was replaced. The cloudflared process was not
  restarted. Old compiled JS/CSS hashes were retained for existing visitors.

## Limitations

Browser tests use Android emulation and Mesa llvmpipe/ANGLE on ARM PRoot; they
are not a claim that two physical phones, a particular Wi-Fi router, or hardware
frame rates were verified. Native headless desktop pointer lock is replaced by
the supported drag-look fallback in this test environment. The game remains an
unofficial single-map adaptation, not the original Photon multiplayer protocol.
The public URL still depends on this phone/server/tunnel remaining online.
