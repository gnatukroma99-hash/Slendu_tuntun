"""An export view layer keeps the user's live sculpt selection/mode intact."""
import bpy
from pathlib import Path
here=Path(__file__).resolve().parent
s=bpy.data.scenes['STW_Sahur_Champion']; root=s.objects['STW_Sahur_Buff']
if s.get('stw_owned')!='sahur-challenge' or abs(s.objects['Champ_Tilt'].location.z-.773)>.0001 or not len(s.objects['Champ_Sculpt_Torso'].modifiers): raise RuntimeError('Reviewed geometry is required.')
layer=s.view_layers.new('Champ_Export_Only')
dest=here.parents[2]/'public'/'models'/'blender-v1'/'sahur-buff.glb'
try:
    for o in layer.objects:
        o.select_set(o==root or o in root.children_recursive,view_layer=layer)
    layer.objects.active=root
    with bpy.context.temp_override(scene=s,view_layer=layer,active_object=root,object=root):
        bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_texcoords=False,export_vertex_color='ACTIVE',export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_anim_slide_to_zero=True)
finally:
    s.view_layers.remove(layer)
s['reviewed']=True
bpy.data.libraries.write(str(here/'STW_Sahur_Champion.blend'),{s},fake_user=True)
output={'file':dest.name,'bytes':dest.stat().st_size,'active_scene':bpy.context.scene.name,'mode':bpy.context.mode}
