"""Run only through the connected official Blender MCP, never Blender CLI."""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art' / 'blender-v1'
EXPORT = ROOT / 'public' / 'models' / 'blender-v1'
EXPORT.mkdir(parents=True, exist_ok=True)
SCENE_NAME = 'STW_Models_V1'
if bpy.data.scenes.get(SCENE_NAME):
    raise RuntimeError('Owned scene already exists; inspect before rebuilding.')
original_scene = bpy.context.window.scene
original_active = bpy.context.view_layer.objects.active
original_selection = list(bpy.context.selected_objects)
scene = bpy.data.scenes.new(SCENE_NAME)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
scene['stw_owned'] = 'blender-model-refresh-v1'
bpy.context.window.scene = scene
collection = bpy.data.collections.new('STW_Asset_Kit_V1')
scene.collection.children.link(collection)

def srgb(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

def material(name, color, roughness=0.8, metal=0.0):
    rgb = tuple(srgb(int(color[i:i+2], 16) / 255) for i in (1, 3, 5))
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    return mat

skin = material('STW_Skin', '#9474b9')
face = material('STW_Face', '#e8dcc3')
dark = material('STW_Dark', '#25352e', 0.6)
white = material('STW_Eye_Glint', '#ffffff', 0.3)
rim = material('STW_Screen_Frame', '#60736b', 0.45, 0.3)
glass = material('STW_Screen_Glass', '#132a26', 0.24, 0.15)
fur = material('STW_Rabbit_Fur', '#dfd5c7', 0.9)
fur_light = material('STW_Rabbit_Patch', '#f0e6da', 0.95)
pink = material('STW_Rabbit_Pink', '#d9a1a2', 0.85)
wood = material('STW_Case_Wood', '#3b5942', 0.85)
wood_light = material('STW_Case_Planks', '#55704d', 0.85)
lining = material('STW_Case_Interior', '#293d30', 0.9)
brass = material('STW_Case_Brass', '#b8a064', 0.35, 0.7)

def link(obj):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    collection.objects.link(obj)
    return obj

def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None); collection.objects.link(obj)
    obj.parent = parent; obj.location = location
    return obj

def finish(obj, name, parent, location, mat):
    link(obj); obj.name = name; obj.parent = parent; obj.location = location
    obj.data.materials.append(mat)
    return obj

def activate(obj):
    for selected in list(bpy.context.selected_objects): selected.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj

def sphere(name, loc, scale, parent, mat, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1)
    obj = finish(bpy.context.object, name, parent, loc, mat)
    obj.scale = scale
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons: polygon.use_smooth = True
    return obj

def bevel_box(name, loc, dimensions, parent, mat, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = finish(bpy.context.object, name, parent, loc, mat)
    obj.scale = dimensions
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL'); mod.width = bevel; mod.segments = 3
    mod.harden_normals = True
    normals = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL'); normals.keep_sharp = True
    return obj

def tube(name, points, radius, parent, mat):
    data = bpy.data.curves.new(name, 'CURVE'); data.dimensions = '3D'; data.resolution_u = 8
    data.bevel_depth = radius; data.bevel_resolution = 2
    spline = data.splines.new('POLY'); spline.points.add(len(points)-1)
    for point, value in zip(spline.points, points): point.co = (*value, 1)
    obj = bpy.data.objects.new(name, data); collection.objects.link(obj); obj.parent = parent; data.materials.append(mat)
    return obj

try:
    hero = empty('STW_Player')
    sphere('Skin_Body', (0, 0, 0.77), (0.355, 0.285, 0.49), hero, skin)
    sphere('Skin_Neck', (0, 0, 1.20), (0.19, 0.18, 0.17), hero, skin)
    head = empty('Head', hero, (0, 0, 1.47))
    sphere('Skin_Head', (0, 0, 0), (0.322, 0.291, 0.313), head, skin)
    sphere('Face_Patch', (0, -0.232, -0.015), (0.263, 0.100, 0.232), head, face)
    sphere('Nose', (0, -0.337, -0.035), (0.042, 0.025, 0.032), head, face, 16, 10)
    for side in (-1, 1):
        sphere('Skin_Ear_'+str(side), (side*0.312, 0, 0.01), (0.063, 0.080, 0.106), head, skin, 16, 10)
        sphere('Ear_Patch_'+str(side), (side*0.329, -0.047, 0.015), (0.026, 0.030, 0.065), head, face, 12, 8)
        sphere('Eye_'+str(side), (side*0.091, -0.322, 0.045), (0.036, 0.020, 0.046), head, dark, 16, 10)
        sphere('Eye_Glint_'+str(side), (side*0.091-0.008, -0.342, 0.058), (0.009, 0.006, 0.011), head, white, 10, 6)
        arm = empty('Arm_L' if side < 0 else 'Arm_R', hero, (side*0.36, 0, 1.08))
        sphere('Skin_Arm_'+str(side), (side*0.045, 0, -0.20), (0.112, 0.117, 0.30), arm, skin)
        sphere('Skin_Hand_'+str(side), (side*0.05, -0.015, -0.43), (0.116, 0.122, 0.13), arm, skin, 20, 12)
        sphere('Skin_Leg_'+str(side), (side*0.165, 0, 0.255), (0.128, 0.145, 0.248), hero, skin)
        sphere('Skin_Foot_'+str(side), (side*0.17, -0.065, 0.095), (0.139, 0.20, 0.095), hero, skin)
    smile_points = [(0.065*math.cos(a), -0.330, -0.061+0.045*math.sin(a)) for a in [math.pi+i*math.pi/16 for i in range(17)]]
    tube('Smile', smile_points, 0.008, head, dark)
    bevel_box('Screen_Frame', (0, -0.266, 0.83), (0.33, 0.075, 0.265), hero, rim, 0.045)
    bevel_box('Screen_Glass', (0, -0.308, 0.83), (0.278, 0.026, 0.212), hero, glass, 0.025)
    tube('Screen_Reflection', [(-0.095,-0.324,0.895),(-0.045,-0.324,0.91),(0.015,-0.324,0.91)], 0.004, hero, rim)
    hero.location.x = -2.1

    rabbit = empty('STW_Rabbit')
    sphere('Rabbit_Body', (0, 0, 0.415), (0.31, 0.24, 0.355), rabbit, fur)
    sphere('Rabbit_Belly', (0,-0.214,0.43), (0.20,0.033,0.25), rabbit, fur_light)
    sphere('Rabbit_Head', (0,-0.015,0.89), (0.30,0.26,0.275), rabbit, fur)
    for side in (-1, 1):
        ear=empty('Rabbit_Ear_'+str(side),rabbit,(side*0.15,0,1.11)); ear.rotation_euler.y=side*0.14
        sphere('Ear_Outer_'+str(side),(0,0,0.19),(0.092,0.071,0.34),ear,fur)
        sphere('Ear_Inner_'+str(side),(0,-0.063,0.20),(0.050,0.014,0.254),ear,pink)
        sphere('Rabbit_Eye_'+str(side),(side*0.108,-0.253,0.956),(0.042,0.024,0.055),rabbit,dark,16,10)
        sphere('Rabbit_Glint_'+str(side),(side*0.108-0.009,-0.276,0.974),(0.012,0.006,0.014),rabbit,white,12,8)
        sphere('Rabbit_Cheek_'+str(side),(side*0.076,-0.259,0.835),(0.092,0.046,0.065),rabbit,fur_light,20,12)
        sphere('Rabbit_Arm_'+str(side),(side*0.285,-0.015,0.39),(0.105,0.11,0.20),rabbit,fur)
        sphere('Rabbit_Foot_'+str(side),(side*0.175,-0.09,0.09),(0.15,0.205,0.09),rabbit,fur)
        sphere('Paw_Patch_'+str(side),(side*0.175,-0.22,0.105),(0.083,0.018,0.035),rabbit,pink,16,10)
    sphere('Rabbit_Nose',(0,-0.313,0.863),(0.039,0.021,0.027),rabbit,pink,16,10)
    tube('Rabbit_Mouth',[(0,-0.307,0.85),(0,-0.308,0.815),(-0.026,-0.305,0.80)],0.006,rabbit,dark)
    sphere('Rabbit_Tail',(0,0.255,0.39),(0.14,0.13,0.14),rabbit,fur_light)
    for z in (0.28,0.34,0.40,0.46,0.52): tube('Plush_Stitch', [(-0.015,-0.25,z),(0.015,-0.25,z+0.016)], 0.0025, rabbit, pink)

    case = empty('STW_Case')
    bevel_box('Case_Base',(0,0,0.065),(1.15,0.72,0.13),case,wood,0.025)
    bevel_box('Case_Interior_Floor',(0,0,0.145),(0.99,0.54,0.035),case,lining,0.012)
    for side in (-1,1):
        bevel_box('Case_End_'+str(side),(side*0.535,0,0.335),(0.08,0.70,0.43),case,wood,0.02)
        bevel_box('Case_Wall_'+str(side),(0,side*0.315,0.335),(1.04,0.08,0.43),case,wood,0.018)
        for z in (0.205,0.335,0.465): bevel_box('Case_Plank_'+str(side),(0,side*0.361,z),(0.99,0.018,0.118),case,wood_light,0.008)
        for x in (-0.54,0.54):
            bevel_box('Brass_Corner',(x,side*0.327,0.33),(0.09,0.095,0.46),case,brass,0.018)
            for z in (0.17,0.49): sphere('Brass_Rivet',(x,side*0.379,z),(0.017,0.012,0.017),case,brass,10,6)
        bevel_box('Case_Rim_Long',(0,side*0.345,0.565),(1.20,0.075,0.055),case,brass,0.012)
        bevel_box('Case_Rim_End',(side*0.565,0,0.565),(0.075,0.70,0.055),case,brass,0.012)
    lid=empty('Lid_Hinge',case,(0,0.355,0.58))
    width, depth, segments=1.22,0.78,16
    profile=[(-depth/2+depth*i/segments,0.025+0.18*math.sqrt(max(0,1-((-depth/2+depth*i/segments)/(depth/2))**2))) for i in range(segments+1)]
    vertices=[(x,y-depth/2,z) for x in (-width/2,width/2) for y,z in profile]
    # Local lid centre lies forward of the rear hinge. All end/bottom faces exist.
    n=segments+1; faces=[(i,i+1,n+i+1,n+i) for i in range(segments)]
    vertices += [(-width/2,-depth,0),(-width/2,0,0),(width/2,-depth,0),(width/2,0,0)]
    a,b,c,d=2*n,2*n+1,2*n+2,2*n+3
    faces += [(a,b,*range(n-1,-1,-1)),(c,*range(n,2*n),d),(a,c,d,b),(a,0,n,c),(b,d,2*n-1,n-1)]
    mesh=bpy.data.meshes.new('Complete_Arched_Lid'); mesh.from_pydata(vertices,[],faces); mesh.update()
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free(); mesh.update()
    roof=bpy.data.objects.new('Case_Lid',mesh); collection.objects.link(roof); roof.parent=lid; roof.data.materials.append(wood)
    bevel=roof.modifiers.new('Lid edge rounding','BEVEL'); bevel.width=0.01; bevel.segments=2
    for x in (-0.42,0.42): tube('Lid_Brass_Band',[(x,y-depth/2,z+0.008) for y,z in profile],0.019,lid,brass)
    bevel_box('Lock',(0,-0.405,0.49),(0.14,0.035,0.18),case,brass,0.025)
    sphere('Keyhole',(0,-0.427,0.51),(0.013,0.005,0.016),case,dark,12,8)
    bevel_box('Keyhole_Stem',(0,-0.427,0.49),(0.009,0.008,0.028),case,dark,0.002)
    sphere('Rabbit_Seal',(0,-0.385,0.28),(0.098,0.018,0.098),case,brass,20,12)
    for side in (-1,1): sphere('Seal_Ear',(side*0.026,-0.405,0.307),(0.012,0.007,0.038),case,lining,12,8)
    sphere('Seal_Head',(0,-0.405,0.26),(0.038,0.007,0.026),case,lining,12,8)
    case.location.x=2.1

    assets={'player':hero,'rabbit':rabbit,'case':case}
    report=[]
    for key, root in assets.items():
        bpy.ops.object.select_all(action='DESELECT')
        selected=[root,*root.children_recursive]
        for obj in selected: obj.select_set(True)
        bpy.context.view_layer.objects.active=root
        display=root.location.copy(); root.location=(0,0,0); bpy.context.view_layer.update()
        filepath=EXPORT/(key+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False)
        root.location=display; bpy.context.view_layer.update()
        triangles=0
        graph=bpy.context.evaluated_depsgraph_get()
        for obj in selected:
            if obj.type not in {'MESH','CURVE'}: continue
            evaluated=obj.evaluated_get(graph); evaluated_mesh=evaluated.to_mesh(); evaluated_mesh.calc_loop_triangles(); triangles+=len(evaluated_mesh.loop_triangles); evaluated.to_mesh_clear()
        report.append({'asset':key,'path':str(filepath),'bytes':filepath.stat().st_size,'triangles':triangles,'root':root.name})

    # An owned preview scene and studio do not alter the user's original world.
    floor_mat=material('STW_Studio_Floor','#26392f',0.95)
    bevel_box('Studio_Floor',(0,0,-0.04),(10,7,0.08),None,floor_mat,0.02)
    world=bpy.data.worlds.new('STW_Studio_World'); world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(0.12,0.15,0.13,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=0.35; scene.world=world
    def area(name,location,energy,size):
        data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
        obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=location; obj.rotation_euler=(Vector((0,0,0.9))-obj.location).to_track_quat('-Z','Y').to_euler()
    area('STW_Key',(-3,-4,6),700,5); area('STW_Fill',(4,-2,4),450,4); area('STW_Rim',(0,3,5),900,3)
    camera_data=bpy.data.cameras.new('STW_Preview_Camera'); camera=bpy.data.objects.new('STW_Preview_Camera',camera_data); scene.collection.objects.link(camera)
    camera.location=(5,-10,4); camera.rotation_euler=(Vector((0,0,0.85))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type='ORTHO'; camera_data.ortho_scale=7.1; scene.camera=camera
    scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=1100; scene.render.resolution_y=680; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(SOURCE/'preview.png')
    scene.view_settings.view_transform='AgX'
    bpy.ops.render.render(write_still=True)
    bpy.data.libraries.write(str(SOURCE/'STW_Models_V1.blend'),{scene},fake_user=True)
    (EXPORT/'manifest.json').write_text(json.dumps({'generator':'Blender '+bpy.app.version_string,'source':'art/blender-v1/STW_Models_V1.blend','orientation':'glTF Y-up, front +Z','assets':report},indent=2),encoding='utf-8')
    result={'scene':scene.name,'source':str(SOURCE/'STW_Models_V1.blend'),'preview':str(SOURCE/'preview.png'),'exports':report,'originalScenePreserved':original_scene.name}
finally:
    bpy.context.window.scene=original_scene
    bpy.context.view_layer.objects.active=original_active
    # Scene-local selection survived the switch; restore explicitly if necessary.
    for obj in original_scene.objects: obj.select_set(obj in original_selection)
