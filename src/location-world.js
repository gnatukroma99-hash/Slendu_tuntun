import * as THREE from 'three';
import { createLocationPhysics, getLocation } from './locations.js';
import { preparePickupSpawns } from './spawn-placement.js';
import { seededRandom } from './core.js';

function groundDetail(id) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d'), random = seededRandom(id === 'lake' ? 791 : id === 'outskirts' ? 1237 : 912);
  context.fillStyle = id === 'lake' ? '#65715a' : id === 'outskirts' ? '#ad936e' : '#62717c'; context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const value = Math.floor(30 + random() * 180);
    context.fillStyle = `rgba(${value},${value},${value},0.16)`;
    context.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 3);
  }
  if (id === 'station') {
    context.strokeStyle = '#33434c'; context.lineWidth = 3; context.strokeRect(1, 1, 254, 254);
    context.fillStyle = '#9babad'; for (const x of [9, 247]) for (const y of [9, 247]) context.fillRect(x - 1, y - 1, 3, 3);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(id === 'station' ? 20 : 16, id === 'station' ? 20 : 16); texture.anisotropy = 2;
  return texture;
}

export function createLocationWorld(scene, id, baseWorld) {
  const spec = getLocation(id), physics = createLocationPhysics(id), layout = physics.layout;
  const group = new THREE.Group(); group.name = `location-${id}`; group.visible = false; scene.add(group);
  const colors = { wall: '#54616c', water: '#284e60', tree: '#514b44', bridge: '#76684e', ruin: '#8e7961', rock: '#73695e', server: '#263442', antenna: '#b3b9b8', dish: '#878c8c', beacon: '#48677f' };
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshLambertMaterial({ color })]));
  const add = (geometry, material, x, y, z) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const ground = new THREE.MeshLambertMaterial({ map: groundDetail(id), color: id === 'lake' ? '#a6b098' : id === 'outskirts' ? '#e0cfb1' : '#9aaeb9' });
  const floor = add(new THREE.PlaneGeometry(80, 80), ground, 0, -0.015, 0); floor.rotation.x = -Math.PI / 2;
  for (const solid of [...layout.solids, ...layout.decorations]) {
    const { x, z, w, d, height, kind } = solid;
    if (kind === 'tree') {
      add(new THREE.CylinderGeometry(0.1, 0.33, height, 6), materials.tree, x, height / 2, z);
      for (const side of [-1, 1]) { const branch = add(new THREE.CylinderGeometry(0.05, 0.11, 2, 5), materials.tree, x + side * 0.5, height * 0.67, z); branch.rotation.z = side * 0.7; }
    } else if (kind === 'rock' || kind === 'dish' || kind === 'boundary') {
      const mesh = add(new THREE.IcosahedronGeometry(1, 0), materials.rock, x, kind === 'boundary' ? 2 : height * 0.4, z);
      if (kind === 'boundary') mesh.scale.set(w / 2, height / 2, d / 2);
      else mesh.scale.set(w * 0.8, height * 0.8, d * 0.8);
      if (kind === 'dish') { const dish = add(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), materials.dish, x, height + 1, z); dish.rotation.x = 2.2; }
    } else {
      add(new THREE.BoxGeometry(w, height, d), materials[kind] || materials.wall, x, height / 2, z);
      if (kind === 'bridge') {
        for (let px = x - w / 2; px < x + w / 2; px += 1.2) add(new THREE.BoxGeometry(0.08, 0.03, d), materials.tree, px, height + 0.02, z);
        for (const dz of [-1, 1]) add(new THREE.BoxGeometry(w, 0.12, 0.1), materials.bridge, x, 0.9, z + dz * (d / 2 - 0.1));
      }
      if (kind === 'server') {
        const led = new THREE.MeshBasicMaterial({ color: '#66c9d9' });
        for (let y = 0.7; y < height; y += 0.65) add(new THREE.BoxGeometry(w * 0.7, 0.08, 0.04), led, x, y, z + d / 2 + 0.025);
      }
      if (id === 'station' && kind === 'wall') {
        const accent = new THREE.MeshBasicMaterial({ color: '#406984' });
        add(new THREE.BoxGeometry(w > d ? w * 0.85 : w + 0.025, 0.07, d > w ? d * 0.85 : d + 0.025), accent, x, 2.8, z);
      }
      if (kind === 'antenna') {
        const ring = add(new THREE.TorusGeometry(1.5, 0.08, 5, 16), materials.antenna, x, height - 1, z); ring.rotation.y = Math.PI / 3;
      }
    }
  }
  if (id === 'station') {
    // Ceiling services stay above traversal height and do not create hidden
    // ground-level obstacles or introduce new unsafe pickup positions.
    for (const x of [-14, 14]) {
      const pipe = add(new THREE.CylinderGeometry(0.15, 0.15, 72, 8), materials.server, x, 4.8, 0); pipe.rotation.x = Math.PI / 2;
      for (let z = -30; z <= 30; z += 10) { const joint = add(new THREE.TorusGeometry(0.19, 0.035, 5, 10), materials.antenna, x, 4.8, z); joint.rotation.x = 0; }
    }
    for (const [x, z, w, d] of [[-40, 0, 1, 80], [40, 0, 1, 80], [0, -40, 80, 1], [0, 40, 80, 1]]) add(new THREE.BoxGeometry(w, 6, d), materials.wall, x, 3, z);
    add(new THREE.BoxGeometry(80, 0.2, 80), materials.wall, 0, 6.2, 0);
    const strip = new THREE.MeshBasicMaterial({ color: '#5eafdb' });
    for (const x of [-10, 10, -30, 30]) for (const z of [-25, 0, 25]) add(new THREE.BoxGeometry(0.35, 0.08, 5), strip, x, 5.8, z);
    for (const z of [-22, 22]) { const light = new THREE.PointLight('#70c7ef', 18, 22, 1.5); light.position.set(0, 3, z); group.add(light); }
    const grid = new THREE.GridHelper(80, 20, '#5c707a', '#485a66'); grid.position.y = 0.01; group.add(grid);
  }
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
  const context = canvas.getContext('2d'); context.fillStyle = '#15232b'; context.fillRect(0, 0, 768, 128);
  context.font = 'bold 33px sans-serif'; context.textAlign = 'center'; context.fillStyle = '#bfe0c2'; context.fillText(spec.title, 384, 55, 740);
  context.font = '21px sans-serif'; context.fillText('10 порций · выход после сбора', 384, 98);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.BoxGeometry(5.3, 1.1, 0.15), materials.wall, 0, 2.2, -36);
  const sign = add(new THREE.PlaneGeometry(5.2, 0.87), new THREE.MeshBasicMaterial({ map: texture }), 0, 2.2, -35.91);
  sign.name = 'location-sign';
  return { ...baseWorld, ...physics, group, spawn: new THREE.Vector3(layout.spawn.x, 0, layout.spawn.z), spawns: preparePickupSpawns(layout.spawns, physics), setQuality() {}, location: spec.id };
}
