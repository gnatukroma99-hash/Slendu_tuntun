import * as THREE from 'three';
import { makeAvatar, disposeModel } from './avatars.js';
import { makeRabbit } from './fun.js';
import { createSahurThrow, makeStunMarker } from './sahur-model.js';
import { stunTilt } from './sahur-effects.js';
import { skinAbility } from './catalog.js';
import { emoteRig, TAP_TIMES } from './emote-pose.js';

export class Peers {
  constructor(scene) { this.scene = scene; this.players = new Map(); this.reduced = matchMedia('(prefers-reduced-motion: reduce)'); }

  create(player) {
    const appearance = player.role === 'killer' && skinAbility(player.appearance?.skin) !== 'bat' ? { ...player.appearance, skin: 'red' } : player.appearance;
    const group = player.rabbit ? makeRabbit() : makeAvatar(appearance, this.mode === 'pig');
    group.userData.appearance = player.appearance;
    group.scale.setScalar((this.mode === 'tiny' ? 0.45 : 1) * (player.rabbit ? 0.75 : 1));
    const arms = group.userData.arms || [];
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: '#e5f2ce' }));
    light.position.set(-0.43, 0.73, 0.15); group.add(light);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(6,12,7,0.7)'; context.fillRect(0, 0, 512, 96);
    context.font = 'bold 38px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = '#dfedce'; context.fillText(player.name, 256, 49, 490);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
    tag.position.y = player.rabbit ? 1.65 : 2.24; tag.scale.set(1.9, 0.36, 1); group.add(tag);
    tag.visible = this.mode !== 'hide';
    this.scene.add(group);
    const item = { group, arms, light, texture, target: new THREE.Vector3(...player.position), yaw: player.yaw, walking: 0, appearanceKey: JSON.stringify([this.mode, player.appearance, player.rabbit, player.role]), throwAnimation: group.userData.bat ? createSahurThrow(group) : null, stunHeight: tag.position.y + 0.24 };
    item.gesture = emoteRig(group); item.beat = '';
    group.position.copy(item.target);
    this.players.set(player.id, item);
    return item;
  }

  sync(players, yourId) {
    const ids = new Set();
    for (const player of players) {
      if (player.id === yourId) continue;
      ids.add(player.id);
      if (this.players.get(player.id)?.appearanceKey !== JSON.stringify([this.mode, player.appearance, player.rabbit, player.role])) this.remove(player.id);
      const item = this.players.get(player.id) || this.create(player);
      const next = new THREE.Vector3(...player.position);
      item.walking = next.distanceTo(item.target) > 0.02 ? 1 : 0;
      item.target.copy(next); item.yaw = player.yaw;
      item.stunnedUntil = player.stunnedUntil || 0;
      item.abilityNext = player.abilityNext || 0;
      item.throwAt = player.throwAt;
      item.emote = player.connected && player.alive ? player.emote : null;
      item.group.visible = player.alive;
      item.light.visible = player.flashlight && player.connected;
    }
    for (const [id, item] of this.players) if (!ids.has(id)) this.remove(id, item);
  }

  update(dt, elapsed, onTap) {
    for (const item of this.players.values()) {
      item.group.position.lerp(item.target, 1 - Math.exp(-dt * 14));
      const target = item.yaw + Math.PI;
      const delta = Math.atan2(Math.sin(target - item.group.rotation.y), Math.cos(target - item.group.rotation.y));
      item.group.rotation.y += delta * (1 - Math.exp(-dt * 14));
      const remaining = item.group.visible ? item.stunnedUntil - elapsed : 0;
      const stunned = remaining > 0;
      const age = item.throwAt == null || stunned ? -1 : elapsed - item.throwAt;
      item.gesture.restore();
      const throwing = item.throwAnimation?.set(age, elapsed >= item.abilityNext);
      if (!throwing) item.arms.forEach((arm, i) => { arm.rotation.x = stunned ? 0 : Math.sin(elapsed * 9 + i * Math.PI) * 0.35 * item.walking; });
      if (!throwing && !stunned && item.emote) {
        const t=elapsed-item.emote.at; item.gesture.pose(item.emote.kind,t,this.reduced.matches);
        if (item.emote.kind==='taps') {
          const i=TAP_TIMES.findIndex((at)=>t>=at && t-at<.16), key=`${item.emote.at}:${i}`;
          if(i>=0 && item.beat!==key) { item.beat=key; onTap?.(item.group.position); }
        }
      }
      const [x, z] = stunTilt(remaining, this.reduced.matches);
      item.group.rotation.x = x; item.group.rotation.z = z;
      if (stunned && !item.marker) { item.marker = makeStunMarker(); item.marker.position.y = item.stunHeight; item.group.add(item.marker); }
      if (item.marker) { item.marker.visible = stunned; item.marker.rotation.y = this.reduced.matches ? 0 : elapsed * 3.8; }
    }
  }

  remove(id, item = this.players.get(id)) {
    if (!item) return;
    this.scene.remove(item.group);
    item.throwAnimation?.dispose(); disposeModel(item.group); item.texture.dispose();
    this.players.delete(id);
  }
  clear() { for (const id of [...this.players.keys()]) this.remove(id); }
}
