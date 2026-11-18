import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ASSETS = { player: 'STW_Player', rabbit: 'STW_Rabbit', case: 'STW_Case', sahur: 'STW_Sahur', 'sahur-bat': 'STW_Sahur_Bat', 'sahur-buff': 'STW_Sahur_Buff' };
const PIVOTS = {
  player: ['Head', 'Arm_L', 'Arm_R'], case: ['Lid_Hinge'],
  sahur: ['Sahur_Tilt', 'Sahur_Head', 'Sahur_Arm_L', 'Sahur_Arm_R', 'Sahur_Bat'],
  'sahur-buff': ['Champ_Tilt', 'Champ_Head', 'Champ_Arm_L', 'Champ_Arm_R', 'Champ_Hand_R', 'Champ_Fingers', 'Champ_ThumbHinge', 'Champ_Bat'],
};
const templates = new Map(), status = {};
let loading;

function prepareTemplate(scene, key, clips) {
  const source = scene.getObjectByName(ASSETS[key]);
  if (!source) throw new Error(`Missing model root: ${key}`);
  source.updateWorldMatrix(true, true);
  const root = new THREE.Group(); root.name = source.name;
  root.userData = { assetSource: 'blender-v1', assetId: key };
  root.animations = clips;
  const nodes = new Map(), batches = new Map(), originalGeometry = new Set();
  const body = new THREE.Group(); body.name = 'Body'; root.add(body);
  for (const name of PIVOTS[key] || []) {
    const sourceNode = source.getObjectByName(name);
    if (!sourceNode) throw new Error(`Missing pivot: ${name}`);
    const node = new THREE.Group(); node.name = name;
    let parent = sourceNode.parent;
    while (parent && parent !== source && !nodes.has(parent)) parent = parent.parent;
    const reference = nodes.has(parent) ? parent : source;
    new THREE.Matrix4().copy(reference.matrixWorld).invert().multiply(sourceNode.matrixWorld).decompose(node.position, node.quaternion, node.scale);
    nodes.set(sourceNode, node); (nodes.get(parent) || root).add(node);
  }
  // Batch static parts by material, but retain rigid head/shoulder/lid pivots.
  // No UVs/textures are used by this owned PBR kit.
  source.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error('Expected a single-material GLB primitive');
    let ancestor = mesh.parent;
    while (ancestor && ancestor !== source && !nodes.has(ancestor)) ancestor = ancestor.parent;
    const node = nodes.get(ancestor) || body;
    const reference = nodes.has(ancestor) ? ancestor.matrixWorld : source.matrixWorld;
    const transform = new THREE.Matrix4().copy(reference).invert().multiply(mesh.matrixWorld);
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(transform);
    for (const attribute of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(attribute)) geometry.deleteAttribute(attribute);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const id = `${node.uuid}:${mesh.material.uuid}`;
    if (!batches.has(id)) batches.set(id, { node, material: mesh.material, geometries: [] });
    batches.get(id).geometries.push(geometry); originalGeometry.add(mesh.geometry);
  });
  for (const { node, material, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Cannot batch model: ${key}`);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name;
    node.add(mesh); geometries.forEach((part) => part.dispose());
  }
  originalGeometry.forEach((geometry) => geometry.dispose());
  return root;
}

export function preloadModels({ fetcher = globalThis.fetch, baseUrl = import.meta.env?.BASE_URL || '/' } = {}) {
  if (loading) return loading;
  loading = Promise.all(Object.keys(ASSETS).map(async (key) => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(`${baseUrl}models/blender-v1/${key}.glb`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
      templates.set(key, prepareTemplate(gltf.scene, key, gltf.animations)); status[key] = 'ready';
    } catch { status[key] = 'fallback'; }
    finally { clearTimeout(timeout); }
  }));
  return loading;
}

export function cloneModel(key) {
  const template = templates.get(key);
  if (!template) return null;
  const model = template.clone(true), geometries = new Map(), materials = new Map();
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    // Instances own their GPU resources. Disposing a shop preview must never
    // invalidate the cached template or another player/monster.
    if (!geometries.has(mesh.geometry)) geometries.set(mesh.geometry, mesh.geometry.clone());
    if (!materials.has(mesh.material)) materials.set(mesh.material, mesh.material.clone());
    mesh.geometry = geometries.get(mesh.geometry); mesh.material = materials.get(mesh.material);
  });
  return model;
}

export function modelStatus() { return { ...status }; }
