# Blender refresh v1 — delivery

Created in Blender 5.2.3 LTS through the official Blender Lab MCP connection.
Original, prompt-led models; no generated concept image, borrowed mesh or external texture.
Visual direction: [BRIEF.md](BRIEF.md).

## Files

- Editable scene: `STW_Models_V1.blend`, scene `STW_Models_V1`, collection `STW_Asset_Kit_V1`.
- Initial full-resolution variant: `STW_Models_V1-initial.blend`.
- Reproducible construction: `build_models.py`, followed by `optimize_models.py` through MCP. The builder refuses to overwrite an existing owned scene. The mobile pass uses adjustable Decimate/Bevel modifiers, not destructive source edits.
- Genuine renders: `preview.png`, `preview-open.png`, `preview-back.png`.
- Inspected browser captures: `browser-review/{desktop,android-landscape,android-portrait}/` (wardrobe, open chest, prize and in-game rabbit).
- Game exports: `../../public/models/blender-v1/{player,rabbit,case}.glb` (project-relative path is `public/models/blender-v1/`).
- Export manifest: `public/models/blender-v1/manifest.json`; isolated Blender reimport evidence: `reimport-check.json`.
- User-scene checkpoint: `checkpoints/user-scene-before-20261116-152241.blend`. User `Scene`, `Cube`, `Camera`, `Light`, active object and selection were preserved.

## Measured outputs

| Asset | Triangles | GLB bytes | Runtime material batches | Blender dimensions (m) |
| --- | ---: | ---: | ---: | --- |
| Player | 6,362 | 198,756 | 9, before cosmetics | 1.052 × 0.653 × 1.783 |
| Rabbit | 6,446 | 183,340 | 5 | 0.780 × 0.719 × 1.648 |
| Case | 3,420 | 167,192 | 7 | 1.220 × 0.830 × 0.809 |

Total binary download: **549,288 bytes**. Runtime batches are measured after static material merging in `src/asset-library.js`; exports retain named editable parts.

GLBs are self-contained PBR, Y-up, face +Z, grounded origin. Blender uses Z-up. Reimport checks found no accidentally exported studio, camera or lights; minimum contact height is 0 for all three assets. Back and open-interior renders were inspected, not only the hero view.

## Integration and limitations

- `asset-library.js` preloads once before gameplay factories run. Failed/aborted loads retain the original procedural factories and CSS chest. The fetch timeout is 8 seconds.
- Static geometry is batched by material without crossing `Head`, `Arm_L`, `Arm_R` or `Lid_Hinge`. Instances own cloned geometry/materials, so disposing a preview cannot invalidate another avatar or the template.
- All existing skin colours and metallic/emissive variants work through `STW_Skin`; hats/antennas stay modular, including “Без антенны”. Rabbit decoys share their lifetime-owned rabbit prototype, as before.
- Rabbit instances receive a 0.35 linear albedo compensation for the game's strong close-range flashlight. The GLB/source materials and cached template remain unchanged. This was checked in the actual game: pink ear insets and plush stitches remain readable instead of clipping to white.
- This is a rigid-part kit, not a skinned character rig. Existing gameplay shoulder animation is retained. The original forest Tinky model, other plush toys and map geometry were not replaced.
- Case opening reuses one canvas/context for the 3D chest and the prize. `Lid_Hinge.rotation.x` moves from 0 to −1.88 radians. Reduced motion reveals directly. Outcome/debit are committed once before any animation; price 100, legendary chance 1%, duplicate refund 50 remain unchanged.
- Node tests cover actual GLB parsing, budgets, grounding, batching, all cosmetics, disposal isolation and monster head/arm behavior. Browser checks cover rendering, animated hinge, repeated opens, fallback and the existing economy rules.
- Validation: **61 Node tests passed**; full Chrome regression **94 passed, 5 intentionally skipped** across desktop/mobile portrait/mobile landscape. After the final rabbit lighting adjustment, the rabbit-mode browser checks passed again on all three devices. `npm run build:staging` succeeded; staged GLBs match the exports and development hooks are absent.
- Mobile verification is Chrome device emulation, not a measurement on the user's physical phone. Public deployment and physical-phone connectivity are not claimed.
