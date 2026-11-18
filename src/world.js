import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { preparePickupSpawns } from './spawn-placement.js';

const ASSETS = `${import.meta.env.BASE_URL}assets/`;

async function fetchChecked(url, kind = 'json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось загрузить ${url}: HTTP ${response.status}`);
  return kind === 'json' ? response.json() : response.arrayBuffer();
}

export async function loadWorld(scene, report) {
  report(0.05, 'Чтение оригинальной карты…');
  const [data, binary] = await Promise.all([fetchChecked(`${ASSETS}scene.json`), fetchChecked(`${ASSETS}scene.bin`, 'binary')]);
  if (data.format !== 1) throw new Error('Неизвестный формат карты');
  const textureLoader = new THREE.TextureLoader();
  const textures = new Map();
  const entries = Object.entries(data.textures);
  let loaded = 0;
  await Promise.all(entries.map(async ([key, spec]) => {
    const texture = await textureLoader.loadAsync(`${ASSETS}${spec.url}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 2;
    textures.set(key, texture);
    report(0.15 + (++loaded / entries.length) * 0.7, `Текстуры леса · ${loaded}/${entries.length}`);
  }));

  const typed = (spec) => new ({ f: Float32Array, I: Uint32Array, H: Uint16Array }[spec.type])(binary, spec.offset, spec.count);
  const materials = new Map();
  const fallback = new THREE.MeshLambertMaterial({ color: '#6b7463', side: THREE.DoubleSide });
  for (const [key, spec] of Object.entries(data.materials)) {
    let texture = textures.get(spec.texture);
    if (texture) {
      texture = texture.clone();
      texture.repeat.fromArray(spec.repeat || [1, 1]);
      texture.offset.fromArray(spec.offset || [0, 0]);
    }
    const color = new THREE.Color().setRGB(...spec.color, THREE.SRGBColorSpace);
    // Legacy materials sometimes have a black tint intended for old Unity shaders.
    if (texture && color.getHex() === 0) color.set('#ffffff');
    materials.set(key, new THREE.MeshLambertMaterial({
      color, map: texture || null,
      alphaTest: spec.alphaTest,
      side: spec.cutout ? THREE.DoubleSide : THREE.FrontSide,
    }));
  }
  const geometries = new Map();
  for (const [key, spec] of Object.entries(data.meshes)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(typed(spec.position), 3));
    if (spec.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(typed(spec.normal), 3));
    if (spec.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(typed(spec.uv), 2));
    geometry.setIndex(new THREE.BufferAttribute(typed(spec.indices), 1));
    spec.groups.forEach((group, i) => geometry.addGroup(group.start, group.count, i));
    if (!spec.normal) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometries.set(key, geometry);
  }

  function makeNode(spec, colliders = false) {
    const group = new THREE.Group();
    group.name = spec.name;
    group.position.fromArray(spec.position);
    group.quaternion.fromArray(spec.rotation);
    group.scale.fromArray(spec.scale);
    if (spec.mesh) {
      const selected = spec.materials.map((key) => materials.get(key) || fallback);
      const geometry = geometries.get(spec.mesh);
      const groupCount = geometry.groups.length;
      while (selected.length < groupCount) selected.push(selected.at(-1) || fallback);
      const mesh = new THREE.Mesh(geometry, selected.length === 1 ? selected[0] : selected);
      mesh.name = spec.name;
      group.add(mesh);
    }
    for (const child of spec.children) group.add(makeNode(child, colliders));
    return group;
  }

  const root = new THREE.Group();
  root.scale.setScalar(data.worldScale);
  data.nodes.forEach((spec) => root.add(makeNode(spec, true)));
  scene.add(root);
  const terrain = data.terrain;
  const scale = data.worldScale;
  const physics = createPhysics(data, binary);
  const { groundAt, canMove } = physics;

  const segments = 192;
  const groundGeometry = new THREE.PlaneGeometry(terrain.width * scale, terrain.depth * scale, segments, segments);
  groundGeometry.rotateX(-Math.PI / 2);
  const positions = groundGeometry.attributes.position;
  const cx = (terrain.position[0] - terrain.width / 2) * scale;
  const cz = (terrain.position[2] + terrain.depth / 2) * scale;
  for (let i = 0; i < positions.count; i++) positions.setY(i, groundAt(positions.getX(i) + cx, positions.getZ(i) + cz));
  groundGeometry.computeVertexNormals();
  const groundTexture = textures.get(terrain.texture).clone();
  groundTexture.repeat.set(200, 200);
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshLambertMaterial({ map: groundTexture, color: '#bdc4aa' }));
  ground.position.set(cx, 0, cz);
  scene.add(ground);

  const forest = new THREE.Group();
  scene.add(forest);
  let forestQuality = null;
  function setQuality(quality) {
    if (forestQuality === quality) return;
    forestQuality = quality;
    for (const child of [...forest.children]) {
      forest.remove(child);
      child.dispose?.(); // Instancing buffers only; prototype geometry is shared.
    }
    const stride = { low: 4, medium: 2, high: 1 }[quality] || 4;
    data.trees.prototypes.forEach((spec, prototypeIndex) => {
      const prototype = makeNode(spec);
      prototype.updateMatrixWorld(true);
      const instances = data.trees.instances.filter((instance, index) => instance.prototype === prototypeIndex && index % stride === 0);
      const dummy = new THREE.Object3D();
      const matrix = new THREE.Matrix4();
      prototype.traverse((part) => {
        if (!part.isMesh || !instances.length) return;
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, instances.length);
        instances.forEach((instance, index) => {
          dummy.position.fromArray(instance.position).multiplyScalar(scale);
          dummy.scale.fromArray(instance.scale).multiplyScalar(scale);
          dummy.rotation.set(0, -instance.rotation, 0);
          dummy.updateMatrix();
          matrix.multiplyMatrices(dummy.matrix, part.matrixWorld);
          mesh.setMatrixAt(index, matrix);
        });
        mesh.computeBoundingSphere();
        forest.add(mesh);
      });
    });
  }

  function placeOnGround(template, targetSize, fitLargestAxis = false) {
    const model = makeNode(template);
    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const dimension = fitLargestAxis ? Math.max(size.x, size.y, size.z) : size.y;
    const factor = targetSize / Math.max(dimension, 0.001);
    const wrapper = new THREE.Group();
    wrapper.add(model);
    model.scale.multiplyScalar(factor);
    model.position.set(-(box.min.x + size.x / 2) * factor, -box.min.y * factor, -(box.min.z + size.z / 2) * factor);
    return wrapper;
  }

  const collectibleTemplate = placeOnGround(data.custard, 0.8, true);
  const enemy = placeOnGround(data.enemy, 2.6);
  scene.add(enemy);
  enemy.visible = false;
  setQuality('low');
  report(1, 'Лес готов. Надень наушники.');
  return {
    data, groundAt, canMove, isPickupPositionFree: physics.isPickupPositionFree, traceProjectile: physics.traceProjectile, setQuality, enemy,
    collectibleTemplate,
    spawn: new THREE.Vector3(...data.spawn).multiplyScalar(scale),
    spawns: preparePickupSpawns(data.collectibleSpawns.map((p) => p.map((value) => value * scale)), physics),
    bounds: { minX: (terrain.position[0] - terrain.width) * scale, maxX: terrain.position[0] * scale, minZ: terrain.position[2] * scale, maxZ: (terrain.position[2] + terrain.depth) * scale },
    scareUrl: data.scareTexture ? `${ASSETS}${data.textures[data.scareTexture].url}` : null,
    assetBytes: binary.byteLength,
    source: data.source,
  };
}
