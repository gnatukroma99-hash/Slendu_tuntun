"""Read compiled Unity data without executing it; export a web-friendly scene.

Usage: python tools/export_unity.py /path/to/Slendytubbies_II_Data
Requires UnityPy 1.25.4 and Pillow. Original assets remain owned by their authors.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import struct
import sys

import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler


SOURCE = Path(sys.argv[1])
DEST = Path(__file__).resolve().parents[1] / "public" / "assets"
DEST.mkdir(parents=True, exist_ok=True)
ENV = UnityPy.load(str(SOURCE / "level7"))
RESOURCES = UnityPy.load(str(SOURCE / "resources.assets"))
BINARY = bytearray()
MESHES = {}
MATERIALS = {}
TEXTURES = {}
WARNINGS = []


def key(obj):
    return f"{Path(obj.assets_file.name).name}-{obj.path_id}"


def resolve(ptr):
    return ptr.deref() if ptr and ptr.m_PathID else None


def array(values, fmt, components):
    while len(BINARY) % 4:
        BINARY.append(0)
    offset = len(BINARY)
    flat = [x for row in values for x in row] if components > 1 else values
    flat = [x if not isinstance(x, float) or math.isfinite(x) else 0 for x in flat]
    BINARY.extend(struct.pack(f"<{len(flat)}{fmt}", *flat))
    return {"offset": offset, "count": len(flat), "type": fmt, "components": components}


def export_mesh(reader):
    ident = key(reader)
    if ident in MESHES:
        return ident
    mesh = reader.parse_as_object()
    handler = MeshHandler(mesh)
    handler.process()
    # Convert Unity left-handed coordinates to Three's right-handed coordinates.
    vertices = [(-v[0], v[1], v[2]) for v in handler.m_Vertices]
    normals = [(-v[0], v[1], v[2]) for v in handler.m_Normals] if handler.m_Normals else []
    triangles = handler.get_triangles()
    groups = []
    indices = []
    for group in triangles:
        start = len(indices)
        for a, b, c in group:
            indices.extend((c, b, a))
        groups.append({"start": start, "count": len(indices) - start})
    MESHES[ident] = {
        "name": mesh.m_Name,
        "position": array(vertices, "f", 3),
        "normal": array(normals, "f", 3) if normals else None,
        "uv": array([v[:2] for v in handler.m_UV0], "f", 2) if handler.m_UV0 else None,
        "indices": array(indices, "I", 1),
        "groups": groups,
    }
    return ident


def export_texture(reader):
    ident = key(reader)
    if ident not in TEXTURES:
        data = reader.parse_as_object()
        image = data.image
        image.thumbnail((768, 768))
        filename = f"{ident}.webp"
        image.save(DEST / filename, "WEBP", quality=82, method=4)
        TEXTURES[ident] = {"name": data.m_Name, "url": filename}
    return ident


def pairs(value):
    return dict(value) if isinstance(value, list) else value


def export_material(reader):
    if reader is None:
        return None
    ident = key(reader)
    if ident in MATERIALS:
        return ident
    data = reader.parse_as_object()
    tree = reader.read_typetree()
    props = tree["m_SavedProperties"]
    colors = pairs(props.get("m_Colors", []))
    floats = pairs(props.get("m_Floats", []))
    color = colors.get("_Color", {"r": 1, "g": 1, "b": 1, "a": 1})
    result = {"name": data.m_Name, "color": [color[k] for k in ("r", "g", "b")], "alpha": color.get("a", 1), "texture": None}
    shader = resolve(data.m_Shader)
    shader_name = getattr(shader.parse_as_object(), "m_Name", "") if shader else ""
    name = (data.m_Name + " " + shader_name).lower()
    result["cutout"] = any(word in name for word in ("leaves", "branches", "transparent", "cutout", "tree"))
    result["alphaTest"] = max(0.25, floats.get("_Cutoff", 0.4)) if result["cutout"] else 0
    for tex_name, settings in data.m_SavedProperties.m_TexEnvs:
        if tex_name == "_MainTex" and settings.m_Texture.m_PathID:
            try:
                result["texture"] = export_texture(resolve(settings.m_Texture))
                result["repeat"] = [settings.m_Scale.x, settings.m_Scale.y]
                result["offset"] = [settings.m_Offset.x, settings.m_Offset.y]
            except Exception as exc:
                WARNINGS.append(f"Texture for {data.m_Name}: {exc}")
    MATERIALS[ident] = result
    return ident


def vector(v):
    return [v.x, v.y, v.z]


def export_tree(transform, *, include_inactive=False, force_root=False):
    data = transform.parse_as_object()
    go = resolve(data.m_GameObject).parse_as_object()
    if not go.m_IsActive and not include_inactive:
        return None
    q = data.m_LocalRotation
    p = data.m_LocalPosition
    result = {"name": go.m_Name, "position": [-p.x, p.y, p.z], "rotation": [q.x, -q.y, -q.z, q.w], "scale": vector(data.m_LocalScale), "children": []}
    if force_root:
        result["position"] = [0, 0, 0]
    mesh_filter = None
    renderer = None
    for component in go.m_Component:
        obj = resolve(component.component)
        kind = obj.type.name
        if kind == "MeshFilter":
            mesh_filter = obj.parse_as_object()
        if kind in ("MeshRenderer", "SkinnedMeshRenderer"):
            renderer = obj.parse_as_object()
        if kind in ("MeshCollider", "BoxCollider", "CapsuleCollider"):
            col = obj.parse_as_object()
            if not col.m_IsTrigger:
                result["collision"] = True
    if renderer and renderer.m_Enabled:
        mesh_ref = getattr(renderer, "m_Mesh", None) or (mesh_filter.m_Mesh if mesh_filter else None)
        if mesh_ref and mesh_ref.m_PathID:
            try:
                result["mesh"] = export_mesh(resolve(mesh_ref))
                result["materials"] = [export_material(resolve(m)) for m in renderer.m_Materials]
            except Exception as exc:
                WARNINGS.append(f"Mesh {go.m_Name}: {exc}")
    for child in data.m_Children:
        exported = export_tree(resolve(child), include_inactive=include_inactive)
        if exported:
            result["children"].append(exported)
    return result


objects = list(ENV.objects)
roots = []
markers = []
spawn = None
terrain_position = None
terrain_reader = next(o for o in objects if o.type.name == "TerrainData")

for reader in objects:
    if reader.type.name != "Transform":
        continue
    transform = reader.parse_as_object()
    go = resolve(transform.m_GameObject).parse_as_object()
    if go.m_Name == "custardPOS":
        p = transform.m_LocalPosition
        markers.append([-p.x, p.y, p.z])
    if go.m_Name == "spawnpoint":
        p = transform.m_LocalPosition
        spawn = [-p.x, p.y, p.z]
    if go.m_Name == "OldTerrain":
        p = transform.m_LocalPosition
        terrain_position = [-p.x, p.y, p.z]
    if transform.m_Father.m_PathID:
        continue
    if any(word in go.m_Name.lower() for word in ("custard", "tinky", "newsc", "way", "camera", "gui", "win", "spawn", "water")):
        continue
    root = export_tree(reader)
    if root:
        roots.append(root)

terrain = terrain_reader.read_typetree()
heightmap = terrain["m_Heightmap"]
details = terrain["m_DetailDatabase"]
splats = terrain["m_SplatDatabase"]["m_Splats"]
terrain_asset = terrain_reader.assets_file
ground_texture = None
if splats:
    ptr = splats[0]["texture"]
    from UnityPy.classes.PPtr import PPtr
    ground_texture = export_texture(PPtr(**ptr, assetsfile=terrain_asset).deref())

trees = []
for proto in details["m_TreePrototypes"]:
    from UnityPy.classes.PPtr import PPtr
    prefab = PPtr(**proto["prefab"], assetsfile=terrain_asset).deref().parse_as_object()
    trees.append(export_tree(resolve(prefab.m_Transform), force_root=True))

tree_instances = []
scale = heightmap["m_Scale"]
width = (heightmap["m_Width"] - 1) * scale["x"]
depth = (heightmap["m_Height"] - 1) * scale["z"]
for tree in details["m_TreeInstances"]:
    p = tree["position"]
    tree_instances.append({"position": [terrain_position[0] - p["x"] * width, p["y"] * scale["y"], terrain_position[2] + p["z"] * depth], "scale": [tree["widthScale"], tree["heightScale"], tree["widthScale"]], "prototype": tree["index"], "rotation": tree["rotation"]})

# Resource prefab contains the original collectible and the classic enemy.
resource_objects = {o.path_id: o for o in RESOURCES.objects}
custard_go = resource_objects[391].parse_as_object()
custard = export_tree(resolve(custard_go.m_Transform), force_root=True)
enemy_go = resource_objects[388].parse_as_object()
enemy = export_tree(resolve(enemy_go.m_Transform), force_root=True)

scare = next((o for o in UnityPy.load(str(SOURCE / "sharedassets1.assets")).objects if o.type.name == "Texture2D" and o.parse_as_object().m_Name == "scare4"), None)
scare_texture = export_texture(scare) if scare else None

manifest = {
    "format": 1,
    "source": "Slendytubbies II V2.2 / ZeoWorks",
    "map": "Slendytubbies (Classic)",
    "worldScale": 0.2,
    "spawn": spawn,
    "collectibleSpawns": markers,
    "nodes": roots,
    "enemy": enemy,
    "custard": custard,
    "trees": {"prototypes": trees, "instances": tree_instances},
    "terrain": {"position": terrain_position, "width": width, "depth": depth, "height": scale["y"], "resolution": heightmap["m_Width"], "samples": array(heightmap["m_Heights"], "H", 1), "texture": ground_texture},
    "scareTexture": scare_texture,
    "meshes": MESHES,
    "materials": MATERIALS,
    "textures": TEXTURES,
    "warnings": WARNINGS,
}
(DEST / "scene.bin").write_bytes(BINARY)
(DEST / "scene.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
print(json.dumps({"meshes": len(MESHES), "materials": len(MATERIALS), "textures": len(TEXTURES), "trees": len(tree_instances), "binary_mib": round(len(BINARY)/1024**2, 2), "spawn": spawn, "collectible_spawns": len(markers), "warnings": WARNINGS}, indent=2))
