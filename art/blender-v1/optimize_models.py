"""Non-destructive mobile pass; execute via official Blender Lab MCP only."""
import bpy
import json
import math
import shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/blender-v1'
EXPORT = ROOT / 'public/models/blender-v1'
scene = bpy.data.scenes['STW_Models_V1']
assert scene.get('stw_owned') == 'blender-model-refresh-v1'
assert bpy.context.mode == 'OBJECT'
original = bpy.context.window.scene
source_path = SOURCE / 'STW_Models_V1.blend'
archive = SOURCE / 'STW_Models_V1-initial.blend'
if not archive.exists(): shutil.copy2(source_path, archive)

try:
    bpy.context.window.scene = scene
    assets = {key: scene.objects[name] for key, name in [('player', 'STW_Player'), ('rabbit', 'STW_Rabbit'), ('case', 'STW_Case')]}
    report = []
    for key, root in assets.items():
        parts = list(root.children_recursive)
        for obj in parts:
            if key != 'case' and obj.type == 'MESH' and len(obj.data.polygons) > 100:
                modifier = obj.modifiers.get('STW Mobile silhouette budget') or obj.modifiers.new('STW Mobile silhouette budget', 'DECIMATE')
                modifier.ratio = 0.55
                modifier.use_collapse_triangulate = True
            if key == 'case':
                for modifier in obj.modifiers:
                    if modifier.type == 'BEVEL': modifier.segments = 1
            if obj.type == 'CURVE': obj.data.bevel_resolution = 1
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        for obj in [root, *parts]: obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        display = root.location.copy()
        root.location = (0, 0, 0)
        bpy.context.view_layer.update()
        path = EXPORT / (key + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True, export_apply=True, export_animations=False)
        graph = bpy.context.evaluated_depsgraph_get()
        triangles = 0
        for obj in parts:
            if obj.type not in {'MESH', 'CURVE'}: continue
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh(); mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            evaluated.to_mesh_clear()
        root.location = display
        bpy.context.view_layer.update()
        report.append({'asset': key, 'file': key + '.glb', 'bytes': path.stat().st_size, 'triangles': triangles, 'root': root.name})
    manifest = {'generator': 'Blender ' + bpy.app.version_string, 'source': 'art/blender-v1/STW_Models_V1.blend', 'orientation': 'glTF Y-up, front +Z; grounded origin', 'assets': report}
    (EXPORT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    scene.render.filepath = str(SOURCE / 'preview.png')
    bpy.ops.render.render(write_still=True)
    # Reverse view catches backs, tails, case end panels and open interior.
    camera = scene.camera
    position = camera.location.copy(); rotation = camera.rotation_euler.copy()
    hinge = scene.objects['Lid_Hinge']; hinge.rotation_euler.x = -math.radians(108)
    camera.location = (-4, -8, 5.3)
    camera.rotation_euler = (Vector((0, 0, 0.8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(SOURCE / 'preview-open.png'); bpy.ops.render.render(write_still=True)
    hinge.rotation_euler.x = 0
    camera.location = (-4, 8, 4.3)
    camera.rotation_euler = (Vector((0, 0, 0.8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(SOURCE / 'preview-back.png'); bpy.ops.render.render(write_still=True)
    camera.location = position; camera.rotation_euler = rotation
    scene.render.filepath = str(SOURCE / 'preview.png')
    bpy.data.libraries.write(str(source_path), {scene}, fake_user=True)
    result = {'exports': report, 'original_scene': original.name, 'source': str(source_path)}
finally:
    bpy.context.window.scene = original
