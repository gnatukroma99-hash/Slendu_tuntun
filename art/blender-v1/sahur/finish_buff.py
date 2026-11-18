"""Reviewed mobile and shoulder/hip pass. Run once on our new Champion scene."""
import bpy, shutil, importlib.util
from mathutils import Vector, Quaternion
from pathlib import Path

here=Path(__file__).resolve().parent
s=bpy.data.scenes['STW_Sahur_Champion']; w=bpy.context.window
if s.get('stw_owned')!='sahur-challenge' or s.get('reviewed'): raise RuntimeError('Not the initial owned Champion.')
source=here/'STW_Sahur_Champion.blend'
baseline=here/'STW_Sahur_Champion-initial.blend'
if baseline.exists(): raise RuntimeError('Champion revision exists already.')
shutil.copy2(source,baseline)
spec=importlib.util.spec_from_file_location('sahur_toolkit',here/'build_sahur.py'); k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k)
skin=bpy.data.collections['STW_Champion_Skin']; root=s.objects['STW_Sahur_Buff']; tilt=s.objects['Champ_Tilt']
old=w.scene
try:
    w.scene=s; s.frame_set(1)
    # Move only the rotation centre to the waist; preserve the rest silhouette.
    tilt.location.z=.773
    for child in tilt.children: child.location.z-=.773
    for arm,point in [('Champ_Arm_L',(.179,-.421,.077)),('Champ_Arm_R',(-.198,-.318,.202))]:
        k.ball('Champ_Wrist_Joint',skin,s.objects[arm],point,(.051,.054,.055),s.objects['Champ_Chin'].data.materials[0],12,7)
    for part in root.children_recursive:
        if part.name.startswith('Champ_Cheekbone'): part.scale=(.82,.83,.70)
        if part.type!='MESH': continue
        n=len(part.data.polygons)
        if n<110: continue
        m=part.modifiers.new('Mobile contour LOD · adjustable','DECIMATE')
        m.ratio=.67 if 'Sculpt_Torso' in part.name else .52 if part.name.startswith(('Champ_Toe','Champ_Upper_Arm','Champ_Calf','Champ_Quadriceps','Champ_Trapezius','Champ_Forearm','Champ_Deltoid')) else .77
        m.use_collapse_triangulate=True
    cam=s.camera; cam.data.ortho_scale=2.48
    cam.rotation_euler=(Vector((-.16,-.02,.93))-cam.location).to_track_quat('-Z','Y').to_euler()
    demo=s.objects['Champ_Demo_Projectile']; demo.animation_data_clear()
    s.frame_set(10); bpy.context.view_layer.update(); m=s.objects['Champ_Maple'].matrix_world.copy(); center=m.translation.copy(); q=m.to_quaternion()
    for f,d,scale in [(1,0,.00001),(9,0,.00001),(10,0,1),(14,3.2,1),(22,9.6,1)]:
        demo.location=center+Vector((-.05*d,-d,.035*d)); demo.scale=(scale,)*3; demo.rotation_quaternion=Quaternion((1,0,0),-1.25*d) @ q
        for channel in ('location','rotation_quaternion','scale'): demo.keyframe_insert(channel,frame=f)
    k.bank_track(demo,'Champion_Preview_Flight'); s.frame_set(1)
    import runpy
    result_data=runpy.run_path(str(here/'export_champion.py'))['output']
finally: w.scene=old
