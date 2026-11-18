import * as THREE from 'three';
import { CATALOG, normalizeAppearance } from './catalog.js';
import { addPigFace } from './fun.js';
import { cloneModel } from './asset-library.js';
import { makeSahur } from './sahur-model.js';

export function disposeModel(group) {
  const geometries = new Set(), materials = new Set();
  group.traverse((part) => { if (part.geometry) geometries.add(part.geometry); if (part.material) for (const material of [part.material].flat()) materials.add(material); });
  geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose());
}

export function makeAvatar(appearance, pig = false) {
  const look = normalizeAppearance(appearance);
  const sahur = ['sahur', 'sahur-buff'].includes(look.skin) ? makeSahur(look.skin) : null;
  const imported = !sahur && cloneModel('player');
  const group = sahur || imported || new THREE.Group();
  const color = pig ? '#e6a1b6' : CATALOG.skin.find((item) => item.id === look.skin).color;
  const body = look.skin === 'gold' && !pig ? new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.35 })
    : new THREE.MeshLambertMaterial({ color, emissive: ['cosmic', 'aurora'].includes(look.skin) ? color : '#000000', emissiveIntensity: 0.18 });
  const face = new THREE.MeshLambertMaterial({ color: '#e0d9be' });
  const dark = new THREE.MeshLambertMaterial({ color: '#202723' });
  const add = (geometry, material, x, y, z, scale) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    if (scale) mesh.scale.set(...scale);
    if (sahur) {
      group.updateWorldMatrix(true, true);
      sahur.userData.head.worldToLocal(mesh.position); sahur.userData.head.add(mesh);
    } else group.add(mesh);
    return mesh;
  };
  let head, arms;
  if (sahur) ({ head, arms } = sahur.userData);
  else if (imported) {
    head = group.getObjectByName('Head'); arms = ['Arm_L', 'Arm_R'].map((name) => group.getObjectByName(name));
    group.traverse((mesh) => {
      if (!mesh.isMesh || mesh.material.name !== 'STW_Skin') return;
      mesh.material.color.set(color);
      mesh.material.metalness = look.skin === 'gold' && !pig ? 0.65 : 0;
      mesh.material.roughness = look.skin === 'gold' && !pig ? 0.35 : 0.8;
      mesh.material.emissive.set(['cosmic', 'aurora'].includes(look.skin) && !pig ? color : '#000000');
      mesh.material.emissiveIntensity = 0.18;
    });
  } else {
    add(new THREE.SphereGeometry(0.35, 12, 10), body, 0, 0.79, 0, [1, 1.5, 0.8]);
    head = add(new THREE.SphereGeometry(0.32, 12, 10), body, 0, 1.45, 0);
    add(new THREE.SphereGeometry(0.25, 12, 8), face, 0, 1.45, 0.285, [1, 0.88, 0.42]);
    for (const x of [-0.085, 0.085]) add(new THREE.SphereGeometry(0.027, 6, 6), dark, x, 1.49, 0.39);
    const smile = add(new THREE.TorusGeometry(0.052, 0.009, 4, 10, Math.PI), dark, 0, 1.39, 0.393); smile.rotation.z = Math.PI;
    add(new THREE.BoxGeometry(0.34, 0.28, 0.035), dark, 0, 0.86, 0.27);
    arms = [-1, 1].map((side) => {
      const arm = add(new THREE.CapsuleGeometry(0.095, 0.4, 3, 6), body, side * 0.39, 0.9, 0);
      arm.rotation.z = side * 0.22; return arm;
    });
    for (const x of [-0.16, 0.16]) add(new THREE.CapsuleGeometry(0.12, 0.28, 3, 6), body, x, 0.29, 0);
    for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.1, 8, 6), body, side * 0.32, 1.47, 0, [0.5, 1, 1]);
  }
  if (look.antenna !== 'none') add(new THREE.CylinderGeometry(0.025, 0.025, 0.15, 6), body, 0, 1.81, 0);
  if (look.antenna === 'straight') add(new THREE.CapsuleGeometry(0.035, 0.3, 3, 6), body, 0, 1.99, 0);
  else if (look.antenna === 'ring') add(new THREE.TorusGeometry(0.1, 0.025, 5, 16), body, 0, 1.96, 0);
  else if (look.antenna === 'triangle') {
    const antenna = add(new THREE.TorusGeometry(0.13, 0.025, 5, 3), body, 0, 1.98, 0); antenna.rotation.z = Math.PI / 2;
  } else if (['star', 'pulsar'].includes(look.antenna)) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) { const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.065 : 0.15; const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
    add(new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false }), look.antenna === 'pulsar' ? new THREE.MeshBasicMaterial({ color: '#a6f5ed' }) : body, 0, 1.99, 0);
  } else if (['double', 'orbit'].includes(look.antenna)) {
    add(new THREE.TorusGeometry(0.12, 0.022, 5, 20), body, -0.07, 1.98, 0);
    const second = add(new THREE.TorusGeometry(0.12, 0.022, 5, 20), body, 0.07, 1.98, 0); second.rotation.y = look.antenna === 'orbit' ? Math.PI / 2 : 0;
  } else if (look.antenna !== 'none') {
    const points = look.antenna === 'heart'
      ? [[0, 0], [-0.14, 0.12], [-0.1, 0.24], [0, 0.18], [0.1, 0.24], [0.14, 0.12], [0, 0]]
      : [[0, 0], [0.1, 0.08], [-0.08, 0.2], [0.02, 0.32], [0.13, 0.25], [0.06, 0.2]];
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0))), 20, 0.023, 5, false), body, 0, 1.82, 0);
  }
  const hat = new THREE.MeshLambertMaterial({ color: look.hat === 'crown' ? '#f2c956' : look.hat === 'pan' ? '#9faeb3' : '#43536e' });
  if (look.hat === 'cap' || look.hat === 'top') {
    add(new THREE.CylinderGeometry(0.25, 0.29, look.hat === 'top' ? 0.35 : 0.12, 12), hat, 0, look.hat === 'top' ? 1.94 : 1.8, 0);
    add(new THREE.CylinderGeometry(0.36, 0.36, 0.035, 16), hat, 0, 1.75, look.hat === 'cap' ? 0.07 : 0);
  } else if (look.hat === 'pan' || look.hat === 'bucket') {
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), hat, 0, 1.85, 0);
    if (look.hat === 'pan') add(new THREE.BoxGeometry(0.3, 0.045, 0.08), hat, 0.38, 1.85, 0);
    else { const handle = add(new THREE.TorusGeometry(0.31, 0.02, 4, 16, Math.PI), hat, 0, 1.9, 0); handle.rotation.y = Math.PI / 2; }
  } else if (look.hat === 'crown' || look.hat === 'royal') {
    add(new THREE.CylinderGeometry(0.31, 0.3, 0.13, 10), hat, 0, 1.8, 0);
    for (let i = 0; i < 6; i++) add(new THREE.ConeGeometry(0.075, 0.22, 4), hat, Math.sin(i * Math.PI / 3) * 0.27, 1.96, Math.cos(i * Math.PI / 3) * 0.27);
    if (look.hat === 'royal') for (const x of [-0.17, 0, 0.17]) add(new THREE.OctahedronGeometry(0.055), new THREE.MeshBasicMaterial({ color: '#df6ecb' }), x, 1.82, 0.3);
  } else if (look.hat === 'wizard') {
    add(new THREE.ConeGeometry(0.3, 0.65, 12), hat, 0, 2.02, 0);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 16), hat, 0, 1.73, 0);
  } else if (look.hat === 'viking') {
    add(new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 1.65, 0);
    for (const side of [-1, 1]) { const horn = add(new THREE.ConeGeometry(0.09, 0.4, 8), face, side * 0.38, 1.9, 0); horn.rotation.z = side * -0.6; }
  } else if (look.hat === 'bunny') {
    for (const side of [-1, 1]) {
      add(new THREE.SphereGeometry(1, 10, 8), face, side * 0.16, 2, 0, [0.085, 0.32, 0.065]);
      add(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: '#e6a3b2' }), side * 0.16, 2, 0.06, [0.04, 0.23, 0.015]);
    }
  }
  if (pig && !sahur) addPigFace(group, 1.43, 0.42);
  if (look.skin === 'hare') group.userData.ears = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * .17, 1.70, -.06); group.add(pivot);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), face); ear.scale.set(.073, .32, .055); ear.position.y = .25; pivot.add(ear); return pivot;
  });
  group.userData = { ...group.userData, arms, head, appearance: look };
  return group;
}
