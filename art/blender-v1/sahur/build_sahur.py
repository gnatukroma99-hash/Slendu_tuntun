"""Run through official Blender Lab MCP. Isolated asset scene; refuses overwrites."""
import json
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector

SOURCE = Path(__file__).resolve().parent
PROJECT = SOURCE.parents[2]
EXPORT = PROJECT / 'public' / 'models' / 'blender-v1'
MOTION = json.loads((PROJECT / 'src' / 'sahur-throw.json').read_text(encoding='utf-8'))
NAME = 'STW_Sahur_Studio_V1'
GLBS = ('sahur.glb', 'sahur-bat.glb')
window = bpy.context.window
original = window.scene
active = bpy.context.view_layer.objects.active
selected = tuple(bpy.context.selected_objects)


def xyz(p):  # Game +Z is the front; Blender -Y exports to +Z.
    x, y, z = p
    return (x, -z, y)


def srgb(hexcode):
    v = [int(hexcode[k:k + 2], 16) / 255 for k in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in v)


def pbr(name, color, rough=.83, metal=0, grain=False):
    m = bpy.data.materials.new('Sahur_' + name)
    rgb = (*srgb(color), 1)
    m.diffuse_color = rgb
    m.use_nodes = True
    node = m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = rgb
    node.inputs['Roughness'].default_value = rough
    node.inputs['Metallic'].default_value = metal
    if grain:
        v = m.node_tree.nodes.new('ShaderNodeVertexColor')
        v.layer_name = 'STW_Wood_Grain'
        m.node_tree.links.new(v.outputs['Color'], node.inputs['Base Color'])
    return m


def obj(name, coll, data=None, parent=None, pos=(0, 0, 0)):
    o = bpy.data.objects.new(name, data)
    coll.objects.link(o)
    o.parent, o.location = parent, xyz(pos)
    return o


def mesh(name, coll, parent, verts, faces, mat, colors=None):
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    o = obj(name, coll, d, parent)
    o.data.materials.append(mat)
    if colors:
        attr = d.color_attributes.new(name='STW_Wood_Grain', type='FLOAT_COLOR', domain='POINT')
        for item, color in zip(attr.data, colors):
            item.color = color
    for p in d.polygons:
        p.use_smooth = True
    return o


def ball(name, coll, parent, pos, radii, mat, segments=14, rings=8):
    bm = bmesh.new()
    x, y, z = radii
    m = Matrix.Diagonal((x, z, y, 1))
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1, matrix=m)
    d = bpy.data.meshes.new(name)
    bm.to_mesh(d)
    bm.free()
    o = obj(name, coll, d, parent, pos)
    d.materials.append(mat)
    for p in d.polygons:
        p.use_smooth = True
    return o


TAU = 2 * math.pi


def tube(name, coll, parent, points, mat, sides=7, steps=3, loop=False):
    """Editable mesh built from a Catmull-Rom centerline with per-knot radii."""
    knots = [Vector((*xyz(p[:3]), p[3])) for p in points]
    n = len(knots)
    records = []
    for i in range(n if loop else n - 1):
        a, b, c, d = [knots[j % n if loop else min(n - 1, max(0, j))] for j in (i - 1, i, i + 1, i + 2)]
        for j in range(steps):
            t = j / steps
            records.append(.5 * (2 * b + (c - a) * t + (2*a - 5*b + 4*c - d) * t*t + (3*b - a - 3*c + d) * t*t*t))
    if not loop:
        records.append(knots[-1])
    verts, faces = [], []
    for i, v in enumerate(records):
        before = records[i - 1] if loop or i else v
        after = records[(i + 1) % len(records)] if loop or i + 1 < len(records) else v
        tangent = (after.xyz - before.xyz).normalized()
        axis = Vector((0, 0, 1)) if abs(tangent.z) < .85 else Vector((0, 1, 0))
        u = tangent.cross(axis).normalized()
        w = tangent.cross(u).normalized()
        for j in range(sides):
            a = TAU * j / sides
            verts.append(v.xyz + (u * math.cos(a) + w * math.sin(a)) * v.w)
            if loop or i + 1 < len(records):
                nxt, k = (i + 1) % len(records), (j + 1) % sides
                faces.append((i*sides+j, i*sides+k, nxt*sides+k, nxt*sides+j))
    if not loop:
        faces.extend([tuple(range(sides - 1, -1, -1)), tuple(range(len(verts) - sides, len(verts)))])
    return mesh(name, coll, parent, verts, faces, mat)


LOG = [(0,.486),(.153,.485),(.222,.49),(.263,.541),(.284,.649),(.289,.814),(.306,1.041),(.315,1.24),(.31,1.414),(.292,1.57),(.271,1.678),(.242,1.729),(.221,1.747),(.202,1.752),(.165,1.754),(.121,1.757),(.071,1.759),(.035,1.761),(0,1.762)]
BAT = [(0,-.457),(.069,-.457),(.083,-.435),(.076,-.405),(.043,-.387),(.041,-.172),(.051,-.07),(.069,.08),(.101,.282),(.109,.431),(.097,.503),(.071,.534),(.049,.537),(0,.539)]


def log_point(r, y, a, bat=False):
    wave = 1 + (.013 if bat else .042) * math.sin(5*a+3*y) + (.012 if bat else .03) * math.sin(3*a-5*y)
    shift = 0 if bat else .027 * math.sin((y - .61) * 3.2)
    return (shift + r * math.sin(a) * wave, y, r * math.cos(a) * wave * (.98 if bat else .93))


def turn(name, coll, parent, profile, mat, color, ends, slices=40, bat=False):
    verts, colors, faces, rows = [], [], [], []
    body, edge = srgb(color), srgb(ends)
    for r, y in profile:
        row = []
        cut = (y > (.503 if bat else 1.736) or y < (-.435 if bat else .49))
        for j in range(slices if r else 1):
            a = TAU * j / slices
            if cut:
                t = .87 + .11 * math.sin(r * (162 if bat else 104) + .30 * math.cos(4*a)) + .035 * math.sin(r * 310 + a)
            else:
                phase = a + .036 * math.sin(y*7.5 + 3*a) + .027 * math.sin(y*16 - 2*a)
                t = .84 + .10 * math.sin(8*phase) + .10 * math.sin(17*phase + y*.63) + .067 * math.sin(27*phase) + .04 * math.cos(y*7 + a)
            row.append(len(verts))
            verts.append(xyz(log_point(r, y, a, bat)))
            colors.append((*[c * max(.48, t) for c in (edge if cut else body)], 1))
        rows.append(row)
    for lo, hi in zip(rows, rows[1:]):
        for j in range(slices):
            k = (j + 1) % slices
            face = (lo[0], hi[k], hi[j]) if len(lo) == 1 else (lo[j], lo[k], hi[0]) if len(hi) == 1 else (lo[j], lo[k], hi[k], hi[j])
            faces.append(face)
    return mesh(name, coll, parent, verts, faces, mat, colors)


def stick(name, coll, parent, mats):
    wood, leather, bronze = mats
    turn(name + '_Turned_Maple', coll, parent, BAT, wood, '#ad703e', '#c29861', 24, True)
    turn(name + '_Grip', coll, parent, [(0,-.385),(.045,-.385),(.049,-.371),(.047,-.192),(.046,-.174),(0,-.174)], leather, '#463730', '#5e4838', 16, True)
    for i, y in enumerate((-.365, -.327, -.289, -.251, -.213, -.177)):
        tube(name + '_Lashing_' + str(i), coll, parent, [(.047 * math.sin(a), y + .006*math.sin(a), .047 * math.cos(a), .004 if i not in (0,5) else .006) for a in [TAU*j/16 for j in range(16)]], bronze, 5, 1, True)


def make_character(kit, mats):
    wood, leather, bronze, bark, cut, cavity, eye, dark, glint = mats
    root = obj('STW_Sahur', kit)
    tilt = obj('Sahur_Tilt', kit, parent=root)
    head = obj('Sahur_Head', kit, parent=tilt)
    turn('Sahur_Heartwood', kit, head, LOG, wood, '#9c562e', '#be824d', 68)
    for side in (-1, 1):
        x, y = side * .120 + .018, 1.329 + (.021 if side < 0 else 0)
        socket = ball('Sahur_Eye_Socket', kit, head, (x,y,.251), (.118,.154,.068), cavity)
        lens = ball('Sahur_Eye', kit, head, (x,y,.283), (.101,.132,.075), eye, 18, 10)
        socket.rotation_euler.z = lens.rotation_euler.z = side * .14
        ball('Sahur_Pupil', kit, head, (x-.011,y-.010,.344), (.055,.069,.020), dark)
        ball('Sahur_Glint', kit, head, (x-.027,y+.019,.361), (.015,.018,.007), glint, 10, 6)
        tube('Sahur_Brow', kit, head, [(x-.089,y+.14,.240,.009),(x-.023,y+.177,.257,.023),(x+.049,y+.161,.247,.017),(x+.075,y+.136,.226,.008)], bark)
    ball('Sahur_Nose', kit, head, (.018,1.196,.293), (.058,.068,.086), cut)
    tube('Sahur_Grin', kit, head, [(-.158,1.124,.232,.009),(-.110,1.077,.270,.02),(-.015,1.057,.293,.024),(.090,1.075,.277,.020),(.173,1.129,.234,.011)], cavity, 8, 5)
    tube('Sahur_Smile_Lip', kit, head, [(-.086,1.055,.265,.009),(-.015,1.030,.286,.012),(.060,1.044,.277,.008)], cut)

    def surface(y, a, offset):
        for (r0,y0),(r1,y1) in zip(LOG,LOG[1:]):
            if y0 <= y <= y1 and y1 > y0:
                r = r0 + (r1-r0) * (y-y0)/(y1-y0)
                return log_point(r+offset,y,a)
        raise ValueError(y)

    for center, y, w, h in [(-.43,.850,.108,.073), (2.78,1.025,.168,.134), (1.32,1.42,.085,.077)]:
        for factor in (.42, .76, 1.1):
            pts = [(*surface(y + factor*h*math.sin(a), center + factor*w*(math.cos(a)+.28*math.sin(a)), .0005), .0048) for a in [TAU*j/18 for j in range(18)]]
            tube('Sahur_Knot_Inlay', kit, head, pts, bark if factor != .76 else cut, 5, 1, True)
    for center, y in [(-1.02,.75), (1.43,1.12), (2.35,.94), (-2.56,1.39), (.27,.69), (3.0,1.45)]:
        pts = [(*surface(y + d, center + .042*math.sin(i*1.31), .0004), r) for i, (d,r) in enumerate([(-.15,.001),(-.05,.007),(.03,.005),(.14,.001)])]
        tube('Sahur_Carved_Furrow', kit, head, pts, bark, 5)

    arms = []
    for side in (-1,1):
        hand = (-.185,-.408,.079) if side < 0 else (.212,-.166,.232)
        arm = obj('Sahur_Arm_L' if side < 0 else 'Sahur_Arm_R', kit, parent=tilt, pos=(side*.276,1.103,.024))
        arms.append(arm)
        ball('Sahur_Shoulder', kit, arm, (.016*side,-.017,0), (.087,.091,.085), bark)
        tube('Sahur_Arm_Lathe', kit, arm, [(0,0,0,.064),(.119*side,-.166,.018,.063),(.143*side,-.245,.039,.052),(*hand,.063)], cut, 10, 5)
        ball('Sahur_Palm', kit, arm, hand, (.074,.085,.074), bark)
        ball('Sahur_Thumb', kit, arm, (hand[0]-.045*side,hand[1]+.031,hand[2]+.040), (.034,.046,.032), cut, 10, 6)
        tube('Sahur_Leg', kit, root, [(.117*side,.551,-.012,.092),(.140*side,.338,-.020,.069),(.151*side,.132,.013,.077)], bark, 10, 5)
        foot = ball('Sahur_Foot', kit, root, (.159*side,.097,.081), (.114,.097,.182), cut)
        foot.rotation_euler.z = -.091 * side
        tube('Sahur_Toe_Carving', kit, root, [(.16*side-.05,.142,.221,.004),(.16*side,.162,.211,.006),(.16*side+.061,.141,.213,.004)], bark, 5, 2)
        if side > 0:
            grip = obj('Sahur_Bat', kit, parent=arm, pos=hand)
            grip.rotation_euler = (.08,-.29,.06)
            prop = obj('Sahur_Held_Bat_Prop', kit, parent=grip, pos=(0,.286,0))
            stick('Sahur_Held', kit, prop, mats[:3])
    return root, tilt, arms, grip


CONVERT = Matrix(((1,0,0),(0,0,-1),(0,1,0)))


def bank_track(node, name, interpolation='LINEAR'):
    data = node.animation_data
    action, slot = data.action, data.action_slot
    for curve in action.layers[0].strips[0].channelbag(slot).fcurves:
        for key in curve.keyframe_points:
            key.interpolation = interpolation
    action.name = node.name + '_' + name
    track = data.nla_tracks.new()
    strip = track.strips.new(name, 1, action)
    strip.action_slot = slot
    track.name = name
    data.action = None


def key_throw(nodes, grip):
    for i, node in enumerate(nodes):
        node.rotation_mode = 'QUATERNION'
        for frame, *pose in MOTION['poses']:
            x, y, z = pose[i]
            m = Matrix.Rotation(x,3,'X') @ Matrix.Rotation(y,3,'Y') @ Matrix.Rotation(z,3,'Z')
            node.rotation_quaternion = (CONVERT @ m @ CONVERT.transposed()).to_quaternion()
            node.keyframe_insert('rotation_quaternion', frame=1+frame)
        bank_track(node, 'Sahur_Throw')
    for f, s in [(0,1),(MOTION['release'],.0001),(MOTION['poses'][-1][0]-1,.0001),(MOTION['poses'][-1][0],1)]:
        grip.scale = (s,s,s)
        grip.keyframe_insert('scale', frame=1+f)
    bank_track(grip, 'Sahur_Throw', 'CONSTANT')


def export(scene, root, filepath, animated):
    bpy.ops.object.select_all(action='DESELECT')
    for part in [root, *root.children_recursive]:
        part.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(filepath), export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True,
                             export_texcoords=False, export_vertex_color='ACTIVE', export_animations=animated, export_animation_mode='NLA_TRACKS',
                             export_merge_animation='NLA_TRACK', export_anim_slide_to_zero=True)
    # Let the next export / editor select only its own asset.
    bpy.ops.object.select_all(action='DESELECT')
    return sum(len(p.vertices)-2 for o in root.children_recursive if o.type == 'MESH' for p in o.data.polygons)


def studio(scene, review):
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 620, 660
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Sahur_Studio_Fog')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.098,.144,.128,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .33
    scene.view_settings.view_transform = 'AgX'
    floor = pbr('Studio_Slate', '#364c41', .93)
    mesh('Sahur_Studio_Floor', review, None, [(-200,-200,-.004),(200,-200,-.004),(200,200,-.004),(-200,200,-.004)], [(0,1,2,3)], floor)
    camera = obj('Sahur_Review_Camera', review, bpy.data.cameras.new('Sahur_Review_Lens'), pos=(2.54,1.99,5.8))
    camera.rotation_euler = (Vector((.06,-.02,.92))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.40
    scene.camera = camera
    for name, pos, energy, size, color in [('Warm_Key',(-3,4.5,4.2),560,4.1,(1,.82,.65)), ('Sage_Fill',(3.7,2.7,1.6),250,3.2,(.67,.83,1)), ('Woodland_Rim',(.2,3,-3.7),460,2.6,(.70,.90,.76))]:
        data = bpy.data.lights.new('Sahur_' + name,'AREA')
        light = obj('Sahur_' + name, review, data, pos=pos)
        light.rotation_euler = (Vector((0,0,.95))-light.location).to_track_quat('-Z','Y').to_euler()
        data.energy, data.size, data.color = energy, size, color


def build_in_scene(scene):
    window.scene = scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.fps = MOTION['fps']
    scene.frame_start, scene.frame_end = 1, 1 + MOTION['poses'][-1][0]
    scene['stw_owned'] = 'sahur-v1'
    for label, f in [('IDLE', 0), ('WINDUP', 7), ('BAT RELEASE', MOTION['release']), ('FOLLOW THROUGH', 12)]:
        scene.timeline_markers.new(label, frame=1+f)
    kit, props, review = [bpy.data.collections.new('STW_Sahur_' + name) for name in ('Skin_V1','Prop_V1','Review_V1')]
    for coll in (kit, props, review):
        scene.collection.children.link(coll)
    mats = [pbr('Wood_Grain','#9c562e',grain=True), pbr('Wrapped_Grip','#504039',grain=True), pbr('Binding','#aa7641',.65,.22), pbr('Carved_Bark','#713b24'), pbr('Exposed_Maple','#ad6f41'), pbr('Carved_Shadow','#30201a'), pbr('Eyes_Ivory','#e0ccb1',.49), pbr('Pupil_Obsidian','#191716',.36), pbr('Eye_Glint','#faf3dc',.45)]
    root, tilt, arms, grip = make_character(kit, mats)
    key_throw((tilt, arms[1], arms[0]), grip)
    standalone = obj('STW_Sahur_Bat', props)
    stick('Sahur_Projectile', props, standalone, mats[:3])
    studio(scene, review)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    counts = [export(scene, asset, EXPORT / name, animated) for asset, name, animated in zip((root,standalone), GLBS, (True,False))]
    # Preview the bat leave the grip on the authored release frame; gameplay
    # uses the separate prop export and its own authoritative flight simulation.
    scene.frame_set(1+MOTION['release'])
    bpy.context.view_layer.update()
    where = grip.matrix_world.translation.copy()
    standalone.rotation_mode = 'XYZ'
    for f, location, angle, scale in [(0,where,0,.0001),(MOTION['release']-1,where,0,.0001),(MOTION['release'],where,-1.4,1),(15,where+Vector((-.12,-4.8,.07)),-5.1,1),(21,where+Vector((-.2,-9.6,.15)),-9.4,1)]:
        standalone.location, standalone.rotation_euler.x, standalone.scale = location, angle, (scale,)*3
        for channel in ('location','rotation_euler','scale'):
            standalone.keyframe_insert(channel, frame=1+f)
    bank_track(standalone, 'Sahur_Demo_Projectile')
    scene.frame_set(1)
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.data.libraries.write(str(SOURCE / 'STW_Sahur_V1.blend'), {scene}, fake_user=True)
    return {'scene': scene.name, 'version': bpy.app.version_string, 'triangles': counts, 'bytes': [(EXPORT / f).stat().st_size for f in GLBS]}


if __name__ in ('__main__', '<run_path>'):
    if bpy.data.scenes.get(NAME) or any(p.exists() for p in [SOURCE / 'STW_Sahur_V1.blend', *(EXPORT / f for f in GLBS)]):
        raise RuntimeError('Sahur source/output already exists; use a new revision.')
    try:
        OUTPUT = build_in_scene(bpy.data.scenes.new(NAME))
    finally:
        window.scene = original
        for o in bpy.context.selected_objects:
            if o not in selected:
                o.select_set(False)
        for o in selected:
            o.select_set(True)
        bpy.context.view_layer.objects.active = active
