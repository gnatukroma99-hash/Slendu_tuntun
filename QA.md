# Validation — 2026-11-12

## Passed

- `npm test`: 9 unit/asset tests, including Unity heightmap axis ordering,
  packed binary references, collection state, pause, stamina and reset.
- `HEADLESS_MESA=1 npx playwright test --project=android-landscape --workers=1 --timeout=45000`:
  4 browser tests passed.
- `HEADLESS_MESA=1 npx playwright test --project=android-portrait --project=desktop --workers=1 --timeout=60000`:
  7 browser tests passed; 1 desktop touch-only test intentionally skipped.
- Browser coverage: asset loading, actual WebGL rendering, movement, flashlight,
  pause/resume/menu, collecting all ten pickups, victory, loss, restart,
  simultaneous Android joystick/look input, and touch cancellation.
- Production build: Pixel 7 landscape emulation loaded the real `dist/` output,
  started the game and collected a custard through the touch button. No
  JavaScript errors or failed requests. The landscape start button is visible
  without scrolling; development teleport/debug hooks are absent.
- `npm run build`: successful.
- `npm audit --omit=dev`: 0 known vulnerabilities.
- `python3 -m py_compile tools/export_unity.py`: successful.

## Test-environment constraints

The test host is ARM Linux in PRoot. Bundled Chromium SwiftShader loses its
WebGL context even on a standalone empty-canvas clear test. Actual graphics
tests therefore use Mesa llvmpipe through ANGLE/Vulkan. Native headless pointer
lock also stalls CDP keyboard events in this environment; desktop integration
tests exercise the documented mouse-drag fallback instead. Android tests use
real Chromium multi-touch events, not mocked input handlers.

Android validation uses Chromium mobile emulation. **A physical Android Chrome
session and hardware GPU frame rate have not been verified.** No performance
guarantee is inferred from software-rendered tests.

## Scope

This is a first playable single-player adaptation of the Classic map, not a
completed port of every map and mode. Original mesh animations, original audio,
multiplayer, Unity scripts and original NavMesh behavior have not been ported.
See `README.md` for limitations and asset provenance.
