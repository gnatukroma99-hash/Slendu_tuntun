"""Independent challenge form. Run in the official MCP; preserves the regular model."""
import importlib.util
import math
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('sahur_toolkit', HERE / 'build_sahur.py')
k = importlib.util.module_from_spec(spec)
spec.loader.exec_module(k)
N = 'STW_Sahur_Champion'
OUT = k.EXPORT / 'sahur-buff.glb'
BLEND = HERE / 'STW_Sahur_Champion.blend'
if bpy.data.scenes.get(N) or OUT.exists() or BLEND.exists():
    raise RuntimeError('Champion already exists. Inspect before creating a revision.')
w = bpy.context.window
previous = w.scene
sc = bpy.data.scenes.new(N)
w.scene = sc
sc.unit_settings.system = 'METRIC'
sc['stw_owned'] = 'sahur-challenge'
sc.render.fps = 30
sc.frame_start, sc.frame_end = 1, 22
skin, review = [bpy.data.collections.new('STW_Champion_' + label) for label in ('Skin','Studio')]
for coll in (skin, review): sc.collection.children.link(coll)
wood = k.pbr('Champ_Lacquered_Walnut','#a96440',.48,grain=True)
honey = k.pbr('Champ_Light_Cut','#af714b',.54)
shadow = k.pbr('Champ_Deep_Cut','#542e22',.68)
eyemat = k.pbr('Champ_Eye','#f0dec0',.37)
pupil = k.pbr('Champ_Iris','#221d1a',.30)
spark = k.pbr('Champ_Glint','#fff5df',.36)
woodcol = k.srgb('#a46541')


def node(name, parent, p=(0,0,0)):
    return k.obj('Champ_' + name, skin, parent=parent, pos=p)


def blob(name, parent, p, s, material=honey, n=14):
    return k.ball('Champ_'+name,skin,parent,p,s,material,n,8)


def stroke(name, parent, pts, material=honey, sides=7, steps=3):
    return k.tube('Champ_'+name,skin,parent,pts,material,sides,steps)


def rings(name, parent, rows, reverse=False, tint=1, phase=0):
    n = len(rows[0]); verts, faces, colors = [], [], []
    for i,row in enumerate(rows):
        for j,p in enumerate(row):
            a = j/n * math.tau; x,y,z = p
            verts.append(k.xyz(p))
            q = a + phase + .025*math.sin(9*y+4*a) + .022*math.sin(5*y-3*a)
            value = tint*(.97 + .049*math.sin(7*q + y) + .057*math.sin(11*q - 2*y) + .028*math.cos(21*q))
            colors.append((*[v*value for v in woodcol],1))
            if i:
                h = (j+1)%n
                faces.append(((i-1)*n+j,(i-1)*n+h,i*n+h,i*n+j))
    faces.extend([tuple(range(n-1,-1,-1)), tuple(range(len(verts)-n,len(verts)))])
    if reverse: faces = [tuple(reversed(f)) for f in faces]
    return k.mesh('Champ_'+name, skin, parent, verts, faces, wood, colors)


def interp(keys, t):
    if t <= keys[0][0]: return tuple(keys[0][1:])
    for a,b in zip(keys,keys[1:]):
        if t <= b[0]:
            u = (t-a[0])/(b[0]-a[0]); return tuple(x + (y-x)*u for x,y in zip(a[1:],b[1:]))
    return tuple(keys[-1][1:])


def dome(x,y,w,h,p=2.6):
    return max(0, 1-abs(x/w)**p-abs(y/h)**p)**.78


def torso(parent):
    silhouette=[(.735,.135,.115),(.77,.174,.130),(.825,.182,.135),(.91,.189,.139),(1.00,.198,.141),(1.08,.224,.160),(1.17,.273,.176),(1.24,.320,.193),(1.31,.335,.179),(1.357,.296,.149),(1.394,.181,.119),(1.419,.110,.098)]
    rows=[]
    for i in range(59):
        y=.735+(.684*i/58); rx,rz=interp(silhouette,y); row=[]
        for j in range(72):
            a=math.tau*j/72; x=rx*math.sin(a); ax=abs(x); front=math.cos(a); z=rz*front
            if front>0:
                pec=.089*dome(ax-.150,y-1.255-.068*(ax-.14),.15,.110,2.7)
                # Sculpt the six abdominal bellies into one watertight surface.
                absz=0
                for cy,width,high,peak in [(1.101,.080,.052,.06),(1.013,.077,.053,.059),(.925,.068,.052,.054)]:
                    absz+=peak*dome(ax-width*.98, y-cy-.09*(ax-.07)-(.006 if x>0 else -.004),width,high)
                ob=0
                for cy in (.952,1.028,1.100,1.157):
                    ob+=.032*dome(ax-.181,y-cy-.64*(ax-.15),.070,.032,2.2)
                z+=(pec+absz+ob)*min(1,front*2.7)
                z-=.016*math.exp(-(x/.018)**2)*math.exp(-((y-1.10)/.25)**2)
                z+=.013*math.exp(-((y-1.348-.10*ax)/.017)**2)*math.exp(-((ax-.15)/.11)**2)
            else:
                z-=.045*dome(ax-.114,y-1.21+.31*ax,.143,.172)*min(1,-front*2)
                z-=.018*dome(ax-.046,y-.995,.049,.172)
            row.append((x,y,z))
        rows.append(row)
    return rings('Sculpt_Torso',parent,rows)


def limb(name,parent,start,end,sections,lobes=(),n=20,tint=1):
    a,b=Vector(start),Vector(end); axis=(b-a).normalized()
    # Keep the section front aligned to the front of the figure; no frame flips.
    u = Vector((1,0,0)); u=(u-axis*axis.dot(u)).normalized()
    v = axis.cross(u).normalized()
    if v.z < 0: v=-v
    rows=[]
    for i in range(17):
        t=i/16; rx,rz,off=interp(sections,t); c=a.lerp(b,t)+v*off; row=[]
        for j in range(n):
            ang=math.tau*j/n; q=1
            for center,spread,az,arc,gain in lobes:
                da=math.atan2(math.sin(ang-az),math.cos(ang-az)); q+=gain*dome(t-center,da,spread,arc,2)
            row.append(c + u*(math.sin(ang)*rx*q) + v*(math.cos(ang)*rz*q))
        rows.append(row)
    return rings(name,parent,rows,reverse=axis.y < 0,tint=tint,phase=.28)


def face(parent):
    profile=[(1.372,.090,.102),(1.39,.123,.134),(1.43,.139,.147),(1.49,.153,.150),(1.56,.158,.151),(1.65,.158,.144),(1.72,.159,.142),(1.752,.151,.136),(1.77,.132,.119),(1.773,.100,.090),(1.775,.052,.046),(1.774,.010,.008)]
    rows=[]
    for i,(y,rx,rz) in enumerate(profile):
        row=[]
        for j in range(40):
            a=math.tau*j/40; s,c=math.sin(a),math.cos(a)
            row.append((-.011+(1.77-y)*.038 + rx*math.copysign(abs(s)**.83,s), y-.039*rx*s, rz*math.copysign(abs(c)**.86,c)))
        rows.append(row)
    rings('Log_Face',parent,rows,tint=1.08)
    for r in (.045,.082,.119):
        pts=[(-.011+r*math.sin(a),1.775-.005*r/.119-.038*r*math.sin(a),.89*r*math.cos(a),.0018) for a in [math.tau*j/23 for j in range(23)]]
        k.tube('Champ_Crown_Grain',skin,parent,pts,honey,4,1,True)
    for side in (-1,1):
        x=side*.069-.006; y=1.595+(0.008 if side<0 else -.005)
        blob('Eye_Seat',parent,(x,y,.136),(.061,.068,.031),shadow)
        lens=blob('Ivory_Eye',parent,(x,y,.154),(.054,.060,.042),eyemat,18); lens.rotation_euler.z=side*.15
        blob('Pupil',parent,(x-.002*side,y+.001,.192),(.0275,.033,.011),pupil)
        blob('Catchlight',parent,(x-.011,y+.013,.202),(.008,.010,.004),spark,8)
        stroke('Overconfident_Brow',parent,[(x-.057,y+.053,.132,.009),(x-.025,y+.074+(side*.004),.142,.020),(x+.021,y+.075,.141,.020),(x+.057,y+.044,.131,.009)],honey)
        cheek=blob('Cheekbone',parent,(side*.102,1.51,.115),(.055,.027,.041),honey); cheek.rotation_euler.y=side*.24
    blob('Nose_Bridge',parent,(-.001,1.545,.157),(.022,.059,.032),honey)
    blob('Nose_Tip',parent,(.003,1.512,.181),(.041,.029,.038),honey)
    for side in (-1,1): blob('Nostril',parent,(side*.022,1.503,.206),(.010,.005,.005),shadow,8)
    smile=[(-.112,1.498,.113,.008),(-.075,1.468,.153,.012),(-.002,1.458,.169,.014),(.067,1.474,.151,.013),(.118,1.510,.111,.008)]
    stroke('Grin_Cut',parent,smile,shadow,8,5)
    stroke('Grin_Lower_Lip',parent,[(x,y-.014,z-.002,r*1.10) for x,y,z,r in smile],honey,7,5)
    blob('Chin',parent,(.006,1.411,.128),(.063,.028,.032),honey)


def foot(root,side,zoff):
    base=node('Foot_'+str(side),root,(side*.162,0,zoff)); base.rotation_euler.z=side*.115
    rows=[]
    for depth,width,bottom,top in [(-.111,.042,.010,.098),(-.087,.076,.002,.137),(-.020,.087,0,.158),(.048,.098,.003,.137),(.108,.106,.001,.097),(.160,.100,.0005,.072),(.185,.073,.009,.055)]:
        row=[]
        for j in range(18):
            a=math.tau*j/18; x=math.cos(a); up=(math.sin(a)+1)/2
            row.append((width*math.copysign(abs(x)**.83,x),bottom+(top-bottom)*(max(0,up-.035)/.965)**.82,depth))
        rows.append(row)
    rings('Carved_Instep',base,rows,tint=.99)
    for i in range(4):
        cx=side*(-.077+i*.049); rad=.032-i*.0019; tip=.224-i*.011
        s=limb('Toe_'+str(i+1),base,(cx*.92,.054,.119),(cx,.033,tip),[(0,.022,.016,0),(.22,rad,.036,0),(.64,rad*.99,.032,0),(.90,rad*.77,.024,0),(1,.014,.014,0)],n=10,tint=1.03-i*.018)
    return base


def leg(root,side):
    s=side; off=.032 if s>0 else -.014
    hip=(s*.117,.786,-.012+off); knee=(s*.164,.405,.036+off); ankle=(s*.164,.123,-.019+off)
    limb('Quadriceps',root,hip,knee,[(0,.065,.072,0),(.13,.102,.111,0),(.32,.111,.116,-.008),(.53,.102,.098,.001),(.76,.082,.080,.005),(.90,.060,.062,0),(1,.061,.052,.003)],[(.50,.41,s*.64,1.03,.24),(.38,.34,-s*.57,.69,.17),(.74,.22,-s*.86,.73,.29),(.48,.35,2.78,.9,.17)],n=24)
    blob('Kneecap',root,(knee[0],knee[1],knee[2]+.030),(.061,.060,.048),honey)
    limb('Calf',root,(knee[0],.401,knee[2]),ankle,[(0,.056,.061,0),(.15,.069,.073,-.002),(.36,.074,.081,-.018),(.59,.064,.065,-.018),(.82,.042,.047,-.004),(1,.047,.050,0)],[(.34,.32,s*2.5,1.16,.26),(.42,.26,-s*2.33,.96,.21),(.57,.39,.11,.51,.17)],n=20,tint=.96)
    foot(root,s,off)


def hands(arm,side,held):
    # Wrists are independent of the flying bat so the hand survives release.
    loc=(-.202,-.315,.235) if held else (.181,-.478,.094)
    hand=node('Hand_R' if held else 'Hand_L',arm,loc)
    if not held:
        blob('Palm',hand,(.006,-.035,0),(.073,.095,.052),honey)
        for i in range(4):
            x=-.051+i*.035; l=(.071,.082,.072,.055)[i]
            stroke('Relaxed_Finger',hand,[(x,-.079,.006,.022),(x+.005,-.096-l*.4,.005,.021),(x+.009,-.092-l,.022,.017),(x+.002,-.083-l,.047,.012)],honey,8,3)
        stroke('Relaxed_Thumb',hand,[(-.047,-.017,.003,.032),(-.079,-.046,.024,.026),(-.081,-.079,.046,.022),(-.062,-.10,.056,.016)],honey)
        return hand,None,None
    blob('Grip_Palm',hand,(.004,0,-.053),(.063,.084,.039),honey)
    fingers=node('Fingers',hand,(-.044,0,-.041))
    for i in range(4):
        y=.053-i*.034; r=.019-i*.00065
        stroke('Gripping_Finger',fingers,[(.012,y,-.010,r*1.25),(-.013,y+.003,.016,r*1.12),(-.017,y,.052,r),(.001,y-.003,.081,r),(.030,y-.006,.093,r*.9),(.049,y-.009,.089,r*.69)],honey,7,2)
    thumb=node('ThumbHinge',hand,(.037,.060,-.043))
    stroke('Grip_Thumb',thumb,[(0,0,0,.030),(.026,.002,.026,.025),(.022,-.012,.061,.022),(-.002,-.029,.084,.020),(-.027,-.035,.088,.014)],honey,8,3)
    return hand,fingers,thumb


def arm_body(tilt,side):
    held=side<0; s=side
    arm=node('Arm_R' if held else 'Arm_L',tilt,(s*.352,1.310,.004))
    elbow=(s*.143,-.248,.048 if held else -.006)
    wrist=(s*.192,-.318,.184) if held else (s*.177,-.411,.066)
    limb('Deltoid',arm,(s*.011,.075,-.012),(s*.087,-.110,.013),[(0,.053,.071,0),(.13,.102,.115,0),(.46,.124,.129,0),(.73,.110,.113,0),(1,.071,.081,0)],[(.53,.40,s*1.20,.74,.22),(.52,.40,-s*.26,.72,.16)],n=20,tint=1.06)
    limb('Upper_Arm',arm,(s*.066,-.05,-.014),elbow,[(0,.081,.082,0),(.18,.094,.088,0),(.43,.090,.092,0),(.64,.083,.088,0),(.86,.062,.061,0),(1,.056,.058,0)],[(.5,.39,-s*.22,.81,.44),(.38,.38,s*2.53,.90,.40),(.65,.24,s*1.10,.62,.18)],n=22)
    limb('Forearm',arm,elbow,wrist,[(0,.061,.061,0),(.16,.079,.078,0),(.36,.082,.083,0),(.64,.067,.067,0),(.87,.048,.049,0),(1,.047,.047,0)],[(.35,.34,s*1.10,.73,.27),(.50,.40,-s*.62,.80,.23)],n=20,tint=1.03)
    hand, fingers, thumb = hands(arm,side,held)
    return arm,hand,fingers,thumb


def pose_hand(arm, hand, fingers, thumb):
    from mathutils import Quaternion
    # In the overhead pose the barrel travels *across* the silhouette (reference 1).
    for frame,direction,opening in [(0,(-.58,.73,.38),0),(3,(-.36,.90,.20),0),(7,(.97,.075,-.04),0),(9,(.82,.18,.57),.58),(12,(.07,.40,.91),1),(15,(-.35,.69,.61),.7),(21,(-.58,.73,.38),0)]:
        sc.frame_set(frame+1); bpy.context.view_layer.update()
        hand.rotation_mode='QUATERNION'
        desired=Vector((0,0,1)).rotation_difference(Vector(k.xyz(direction)).normalized())
        hand.rotation_quaternion=arm.matrix_world.to_quaternion().inverted() @ desired
        hand.keyframe_insert('rotation_quaternion',frame=frame+1)
        for finger, angle in [(fingers, -1.19),(thumb, .57)]:
            finger.rotation_mode='QUATERNION'; finger.rotation_quaternion=Quaternion((0,0,1),angle*opening)
            finger.keyframe_insert('rotation_quaternion',frame=frame+1)
    for part in (hand,fingers,thumb): k.bank_track(part,'Sahur_Throw')


try:
    root=k.obj('STW_Sahur_Buff',skin); tilt=node('Tilt',root)
    torso(tilt)
    blob('Pelvis',root,(0,.775,-.006),(.181,.116,.144),honey,20)
    limb('Neck',tilt,(0,1.352,0),(0,1.447,.005),[(0,.133,.109,0),(.62,.092,.093,0),(1,.099,.101,0)],n=18)
    for side in (-1,1):
        limb('Trapezius',tilt,(side*.073,1.399,-.015),(side*.355,1.30,-.018),[(0,.058,.081,0),(.27,.072,.086,0),(.80,.067,.076,0),(1,.051,.069,0)],n=14,tint=.97)
        leg(root,side)
    head=node('Head',tilt); face(head)
    cast,hand,fingers,thumb=arm_body(tilt,-1)
    free=arm_body(tilt,1)[0]
    grip=node('Bat',hand)
    prop=node('Maple',grip,(0,.286,0))
    leather=k.pbr('Buff_Grip','#4d3730',.74,grain=True); brass=k.pbr('Buff_Binding','#ac8050',.62,.15)
    k.stick('Champion_Bat',skin,prop,(wood,leather,brass))
    k.key_throw((tilt,cast,free),grip); pose_hand(cast,hand,fingers,thumb)
    for label,frame in [('СТОЙКА',1),('ЗАМАХ',8),('ВЫПУСК',10),('ЗАВЕРШЕНИЕ',13)]: sc.timeline_markers.new(label,frame=frame)
    k.studio(sc,review)
    cam=sc.camera; cam.location=k.xyz((1.18,1.80,6.5)); cam.rotation_euler=(Vector((-.045,-.02,.91))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.ortho_scale=2.27
    sc.frame_set(1); bpy.context.view_layer.update()
    tris=k.export(sc,root,OUT,True)
    # Companion projectile for Studio playback only. Independent of the skin export.
    demo=k.obj('Champ_Demo_Projectile',review); k.stick('Champ_Demo',review,demo,(wood,leather,brass))
    sc.frame_set(10); bpy.context.view_layer.update()
    matrix=prop.matrix_world.copy(); center=matrix.translation.copy(); q=matrix.to_quaternion()
    demo.rotation_mode='QUATERNION'
    for f,d,s in [(1,0,.00001),(9,0,.00001),(10,0,1),(14,3.2,1),(22,9.6,1)]:
        demo.location=center+Vector((-.05*d,-d,.035*d)); demo.scale=(s,)*3; demo.rotation_quaternion=Quaternion((1,0,0),-1.25*d) @ q
        for channel in ('location','rotation_quaternion','scale'): demo.keyframe_insert(channel,frame=f)
    k.bank_track(demo,'Champion_Preview_Flight')
    sc.frame_set(1); root.select_set(True); bpy.context.view_layer.objects.active=root
    bpy.data.libraries.write(str(BLEND),{sc},fake_user=True)
    OUTPUT={'asset':OUT.name,'bytes':OUT.stat().st_size,'triangles':tris,'scene':sc.name,'source':BLEND.name}
finally:
    w.scene=previous
