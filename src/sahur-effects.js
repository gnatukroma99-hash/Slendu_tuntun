import * as THREE from 'three';
import { disposeModel } from './avatars.js';
import { BAT_RANGE, BAT_RELEASE, BAT_SPEED, BAT_STUN_DURATION } from './sahur-ability.js';
import { makeSahurBat, makeStunMarker } from './sahur-model.js';

export function stunTilt(remaining, reduced) {
  if (reduced || remaining <= 0) return [0, 0];
  const age = Math.max(0, BAT_STUN_DURATION - remaining);
  const end = Math.min(1, remaining / 0.42);
  const recoil = Math.sin(Math.PI * Math.min(age / 0.24, 1));
  const sway = Math.min(age / 0.36, 1) * end;
  return [-0.19 * recoil + Math.sin(age * 8) * 0.045 * sway, 0.20 * recoil + Math.sin(age * 5.1) * 0.105 * sway];
}

export class SahurEffects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.shots = new Map();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
  }

  updateShots(shots, lead = 0) {
    const live = new Set();
    for (const shot of shots) {
      live.add(shot.id);
      let model = this.shots.get(shot.id);
      if (!model) {
        model = new THREE.Group();
        const bat = makeSahurBat(), streak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 1.0, 6), new THREE.MeshBasicMaterial({ color: '#efb461', transparent: true, opacity: 0.48, depthWrite: false }));
        streak.rotation.x = -Math.PI / 2; streak.position.z = -0.48;
        model.add(bat, streak); this.scene.add(model); this.shots.set(shot.id, model);
      }
      const travel = Math.min(BAT_RANGE - shot.distance, Math.max(0, lead) * BAT_SPEED);
      const distance = shot.distance + travel;
      model.position.set(shot.x + shot.dx * travel, shot.y + shot.dy * travel, shot.z + shot.dz * travel);
      model.visible = distance > 0.35;
      model.lookAt(model.position.x + shot.dx, model.position.y + shot.dy, model.position.z + shot.dz);
      model.children[0].rotation.x = this.reduced.matches ? 0.5 : 0.5 + distance * 1.8;
      model.children[1].visible = !this.reduced.matches && distance > 1.1;
    }
    for (const [id, model] of this.shots) {
      if (live.has(id)) continue;
      model.removeFromParent(); disposeModel(model); this.shots.delete(id);
    }
  }

  updateHeld(visible, elapsed, age = -1) {
    if (visible && !this.held) {
      this.held = makeSahurBat(); this.held.rotation.set(-0.9, -0.15, -0.42); this.camera.add(this.held);
    }
    if (!this.held) return;
    this.held.visible = visible;
    if (!visible) return;
    const winding = !this.reduced.matches && age >= 0 && age < BAT_RELEASE;
    const progress = age / BAT_RELEASE;
    const pull = winding ? Math.sin(progress * Math.PI) ** 1.25 : 0;
    const flick = winding ? Math.max(0, (progress - 0.66) / 0.34) ** 2 : 0;
    this.held.scale.setScalar(this.camera.aspect < 0.85 ? 0.38 : 0.52);
    this.held.rotation.set(-0.9 - pull * 1.55 + flick * 1.3, -0.15 + pull * 0.43, -0.42 - pull * 0.46 + flick * 0.57);
    this.held.position.set(Math.min(0.44, this.camera.aspect * 0.34) + pull * 0.08 - flick * 0.10, -0.27 + pull * 0.14 + flick * 0.06 + (this.reduced.matches ? 0 : 0.007 * Math.sin(elapsed * 3)), -0.65 + pull * 0.11 - flick * 0.35);
  }

  updateMonster(enemy, height, remaining, elapsed) {
    const stunned = remaining > 0;
    const [x, z] = stunTilt(remaining, this.reduced.matches);
    enemy.rotation.x = x;
    if (stunned) enemy.rotation.z = z;
    if (stunned && !this.marker) { this.marker = makeStunMarker(); this.scene.add(this.marker); }
    if (!this.marker) return;
    this.marker.visible = stunned;
    if (!stunned) return;
    this.marker.position.copy(enemy.position); this.marker.position.y += height + 0.20 + (this.reduced.matches ? 0 : Math.sin(elapsed * 6) * 0.055);
    this.marker.rotation.y = this.reduced.matches ? 0 : elapsed * 3.8;
  }

  clear() { this.updateShots([]); this.updateHeld(false, 0); if (this.marker) this.marker.visible = false; }
}
