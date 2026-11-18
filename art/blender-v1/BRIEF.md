# Frozen direction — Blender model refresh v1

Prompt-only target: keep the existing game's recognisable rounded silhouette and dark forest / muted green-and-brass palette, but replace intersecting basic shapes with clean, deliberately joined forms. No separate concept image was generated. Genuine Blender previews, not concept art, are the review evidence.

- Player: 1.8 m body, feet at ground, shoulder pivots, rounded belly, framed inset-like screen, softly shaped face, readable eyes and smile. Antennas and hats remain modular and removable. Existing colour selection must work.
- Rabbit: approximately 1.6 m unscaled template, rounded plush silhouette, deliberate foot contact, pink inset ears, muzzle, dark eyes with tiny highlights, paws and tail. Existing game scaling is retained.
- Case: approximately 1.2 m wide, real floor and four walls, bevelled planks, complete arched lid, visible brass corners and rabbit seal. Lid pivot at back edge, opens about its X axis. No missing back/end panels.
- Soft matte body materials; metal only for case hardware / glass frame. PBR materials without external textures or procedural shaders so GLB remains self-contained.
- Three.js/glTF: +Y up after Blender glTF export, character faces +Z, origin at feet/base. No armature required: retain named rigid shoulder and lid pivots.
- Aim for under 10k triangles per character and under 5k for the case; verify actual export, not estimated counts.
- Work only in named owned scenes/collections. Preserve the original Cube/Camera/Light scene and selection. Save a checkpoint before mutations and editable source separately.
