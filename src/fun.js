import * as THREE from 'three';
import { distance2D } from './core.js';
import { RABBIT_LINES } from './modes.js';
import { preparePickupSpawns } from './spawn-placement.js';
import { cloneModel } from './asset-library.js';

function part(group, geometry, color, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(...position); mesh.scale.set(...scale); group.add(mesh);
  return mesh;
}

export function makeRabbit() {
  const imported = cloneModel('rabbit');
  if (imported) {
    // The game's close-range flashlight is much stronger than the studio
    // lights. Keep the plush muzzle and pink ear insets from washing out.
    const materials = new Set();
    imported.traverse((mesh) => {
      if (!mesh.isMesh || materials.has(mesh.material)) return;
      materials.add(mesh.material); mesh.material.color.multiplyScalar(0.35);
    });
    return imported;
  }
  const group = new THREE.Group();
  const ball = () => new THREE.SphereGeometry(1, 10, 8);
  part(group, ball(), '#e6dfd4', [0, 0.42, 0], [0.31, 0.4, 0.26]);
  part(group, ball(), '#f5eee5', [0, 0.85, 0.07], [0.28, 0.26, 0.25]);
  for (const side of [-1, 1]) {
    const ear = part(group, ball(), '#e6dfd4', [side * 0.15, 1.25, 0.03], [0.085, 0.35, 0.075]);
    ear.rotation.z = side * -0.16;
    part(group, ball(), '#ee9faa', [side * 0.15, 1.27, 0.09], [0.04, 0.25, 0.015]);
    part(group, ball(), '#171e1b', [side * 0.11, 0.9, 0.285], [0.035, 0.045, 0.025]);
    part(group, ball(), '#ece4db', [side * 0.2, 0.09, 0.13], [0.14, 0.09, 0.23]);
  }
  part(group, ball(), '#ed99ad', [0, 0.79, 0.32], [0.055, 0.04, 0.035]);
  part(group, ball(), '#ffffff', [0, 0.34, -0.28], [0.13, 0.13, 0.13]);
  return group;
}

export function makeCarrot() {
  const group = new THREE.Group();
  const carrot = part(group, new THREE.ConeGeometry(0.16, 0.65, 8), '#ff982f', [0, 0.4, 0]);
  carrot.rotation.z = Math.PI;
  for (const side of [-1, 0, 1]) {
    const leaf = part(group, new THREE.ConeGeometry(0.065, 0.35, 4), '#7cbf45', [side * 0.07, 0.82, 0]);
    leaf.rotation.z = side * -0.4;
  }
  return group;
}

function makePlush(index) {
  const group = new THREE.Group(), color = ['#b99779', '#e1a0b8', '#d5d9c2', '#d67c7b', '#8bba7b'][index % 5];
  const ball = () => new THREE.SphereGeometry(1, 10, 8);
  part(group, ball(), color, [0, 0.3, 0], [0.29, 0.31, 0.22]);
  part(group, ball(), color, [0, 0.71, 0.02], [0.28, 0.26, 0.23]);
  for (const side of [-1, 1]) {
    part(group, ball(), color, [side * 0.22, 0.94, 0], [0.11, 0.12, 0.08]);
    part(group, ball(), color, [side * 0.31, 0.34, 0], [0.12, 0.22, 0.11]);
    part(group, ball(), color, [side * 0.16, 0.07, 0.1], [0.14, 0.08, 0.15]);
    part(group, ball(), '#1c2824', [side * 0.09, 0.75, 0.235], [0.023, 0.028, 0.012]);
  }
  part(group, ball(), '#ead6b2', [0, 0.64, 0.23], [0.12, 0.08, 0.04]);
  part(group, new THREE.BoxGeometry(0.035, 0.14, 0.02), '#5d4b44', [0, 0.34, 0.225]);
  return group;
}

export function addPigFace(group, y = 1.45, z = 0.3, size = 1, ears = true) {
  part(group, new THREE.SphereGeometry(1, 12, 8), '#f295b0', [0, y, z], [0.15 * size, 0.1 * size, 0.075 * size]);
  for (const side of [-1, 1]) {
    part(group, new THREE.SphereGeometry(1, 6, 6), '#752e47', [side * 0.055 * size, y, z + 0.067 * size], [0.025 * size, 0.035 * size, 0.01 * size]);
    if (ears) {
      const ear = part(group, new THREE.ConeGeometry(0.14 * size, 0.25 * size, 3), '#f5aec0', [side * 0.24 * size, y + 0.3 * size, z - 0.12 * size]);
      ear.rotation.z = side * -0.3;
    }
  }
}

export class FunExtras {
  constructor(scene, camera) {
    this.scene = scene;
    this.carrot = makeCarrot();
    this.rabbit = makeRabbit();
    this.enemy = this.rabbit.clone(true);
    this.enemy.scale.setScalar(2.2);
    this.enemy.visible = false;
    scene.add(this.enemy);
    this.bunnies = Array.from({ length: RABBIT_LINES.length }, (_, index) => {
      const group = index < 3 || index % 4 === 2 ? this.rabbit.clone(true) : makePlush(index);
      group.scale.setScalar(index === 2 ? 0.85 : 0.65);
      group.visible = false; scene.add(group);
      return { group, found: false, baseY: 0 };
    });
    this.pig = new THREE.Group();
    // A little pink snout and hooves at the bottom of the first-person view.
    addPigFace(this.pig, -0.38, -0.72, 0.6, false);
    for (const side of [-1, 1]) part(this.pig, new THREE.SphereGeometry(1, 8, 6), '#d9819e', [side * 0.4, -0.43, -0.75], [0.065, 0.075, 0.1]);
    this.pig.visible = false; camera.add(this.pig);
    this.rabbitPaws = new THREE.Group();
    for (const side of [-1, 1]) part(this.rabbitPaws, new THREE.SphereGeometry(1, 8, 6), '#f0e8dd', [side * 0.28, -0.32, -0.6], [0.06, 0.07, 0.11]);
    this.rabbitPaws.visible = false; camera.add(this.rabbitPaws);
    this.decoyModels = new Map();
    this.lastOink = 0;
    this.nextSecretAt = 0;
  }

  reset(mode, points, player, world) {
    this.mode = mode;
    this.lastOink = 0;
    this.pig.visible = mode.id === 'pig';
    const far = world.spawns.filter(([x, , z]) => Math.hypot(x - player.x, z - player.z) > 10);
    const desired = this.bunnies.map((_, index) => {
      if (index === 0) {
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, x = player.x + Math.cos(a) * 6, z = player.z + Math.sin(a) * 6; if (world.isPickupPositionFree(x, z) && world.canMove(player, x, z)) return [x, 0, z]; }
      }
      const source = far[(index * 7) % far.length] || world.spawns[index % world.spawns.length];
      return [source[0] + Math.sin(index * 2.4) * 2.2, 0, source[2] + Math.cos(index * 2.4) * 2.2];
    });
    const placementPhysics = { ...world, isPickupPositionFree: (x, z, radius) => world.isPickupPositionFree(x, z, radius) && Math.hypot(x - player.x, z - player.z) >= 4.5 && points.every((point) => Math.hypot(x - point.x, z - point.z) >= 1.4) };
    const placed = preparePickupSpawns(desired, placementPhysics);
    const fallback = world.spawns.filter(([x, , z]) => placementPhysics.isPickupPositionFree(x, z));
    this.nextSecretAt = 0;
    this.bunnies.forEach((bunny, index) => {
      const location = placed[index] || fallback[index % fallback.length];
      if (!location) { bunny.group.visible = false; bunny.found = false; return; }
      const [x, , z] = location;
      bunny.baseY = world.groundAt(x, z);
      bunny.group.position.set(x, bunny.baseY, z);
      bunny.group.visible = true; bunny.found = false;
    });
  }

  update(dt, elapsed, player, moving, audio, toast) {
    this.bunnies.forEach((bunny, index) => {
      bunny.group.position.y = bunny.baseY + Math.max(0, Math.sin(elapsed * 2.6 + index * 2)) * 0.14;
      bunny.group.rotation.y = Math.atan2(player.x - bunny.group.position.x, player.z - bunny.group.position.z);
      if (bunny.group.visible && !bunny.found && elapsed >= this.nextSecretAt && distance2D(player, bunny.group.position) < 4) {
        bunny.found = true; this.nextSecretAt = elapsed + 2; audio.rabbit(); toast(RABBIT_LINES[index], 6);
      }
    });
    if (this.mode.id === 'pig' && moving && elapsed - this.lastOink > 4) {
      audio.oink(); this.lastOink = elapsed;
    }
    this.pig.rotation.z = moving ? Math.sin(elapsed * 9) * 0.035 : 0;
    return this.bunnies.filter((bunny) => bunny.found).length;
  }

  syncDecoys(decoys, elapsed) {
    const ids = new Set(decoys.map((decoy) => decoy.id));
    for (const [id, group] of this.decoyModels) if (!ids.has(id)) { this.scene.remove(group); this.decoyModels.delete(id); }
    for (const decoy of decoys) {
      let group = this.decoyModels.get(decoy.id);
      if (!group) { group = this.rabbit.clone(true); group.scale.setScalar(0.7); this.scene.add(group); this.decoyModels.set(decoy.id, group); }
      group.position.set(decoy.x, decoy.y + Math.max(0, Math.sin(elapsed * 9 + decoy.x)) * 0.25, decoy.z);
      group.rotation.y = elapsed * 0.8;
    }
  }

  hide() { this.pig.visible = this.rabbitPaws.visible = false; this.syncDecoys([], 0); this.bunnies.forEach((bunny) => { bunny.group.visible = false; }); }
}
