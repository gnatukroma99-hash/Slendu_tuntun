import * as THREE from 'three';
import { disposeModel } from './avatars.js';
import { TV_NAMES } from './round-extras.js';

function television(station, spawn) {
  const root = new THREE.Group(); root.name = `TV_${station.id}`;
  root.position.set(station.x, station.y, station.z); root.rotation.y = Math.atan2(spawn.x-station.x, spawn.z-station.z);
  const shell = new THREE.MeshLambertMaterial({ color: '#644d36' }), rubber = new THREE.MeshLambertMaterial({ color: '#292e29' });
  const trim = new THREE.MeshLambertMaterial({ color: '#9c956d' });
  const part = (geo, mat, x, y, z) => { const obj = new THREE.Mesh(geo, mat); obj.position.set(x, y, z); root.add(obj); return obj; };
  part(new THREE.BoxGeometry(.94, .63, .59),shell,0,.46,0);
  part(new THREE.BoxGeometry(.91,.59,.045),rubber,0,.46,.31);
  for (const side of [-1,1]) {
    part(new THREE.BoxGeometry(.15,.17,.34),rubber,side*.32,.085,-.012);
    const ant = part(new THREE.CylinderGeometry(.009,.015,.39,6),trim,side*.10,.93,-.08); ant.rotation.z = -side*.52;
  }
  for (const y of [.36,.57]) { const knob=part(new THREE.CylinderGeometry(.056,.055,.04,10),trim,.35,y,.35); knob.rotation.x=Math.PI/2; }
  const canvas=document.createElement('canvas'); canvas.width=224; canvas.height=154;
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  part(new THREE.PlaneGeometry(.68,.49),new THREE.MeshBasicMaterial({map:texture}),-.065,.46,.336);
  return { root, canvas, texture, version: null };
}

export class RescueTelevisions {
  constructor(scene, studio) { this.scene=scene; this.studio=studio; this.items=new Map(); }
  clear() {
    for (const {root,texture} of this.items.values()) { root.removeFromParent(); disposeModel(root); texture.dispose(); }
    this.items.clear();
  }
  sync(state, spawn) {
    const { tv }=state;
    if (state.state !== 'playing' || !tv?.trapped) { if (this.items.size) this.clear(); return; }
    const victim=state.players.find((p)=>p.id===tv.trapped);
    for (const station of tv.stations) {
      let set=this.items.get(station.id);
      if (!set) { set=television(station,spawn); this.scene.add(set.root); this.items.set(station.id,set); }
      const show = state.tvSignal === station.id && !!victim;
      const version = show ? JSON.stringify([victim.id,victim.appearance,victim.connected]) : 'static';
      if (set.version === version) continue;
      set.version=version;
      const c=set.canvas.getContext('2d'), {width:w,height:h}=set.canvas;
      c.fillStyle=show?'#2b4b45':'#394947'; c.fillRect(0,0,w,h);
      if (show) {
        try { c.drawImage(this.studio.portrait(victim.appearance,state.mode==='pig'),18,0,w-36,h-18); } catch { /* The name is enough to identify the signal. */ }
      } else {
        c.fillStyle='#70817a'; for (let i=0;i<95;i++) c.fillRect((i*79)%w,(i*53)%h,6+(i*11)%33,2);
      }
      c.fillStyle='#1c303846'; for(let y=1;y<h;y+=5)c.fillRect(0,y,w,1);
      c.fillStyle='#182820';c.fillRect(0,h-33,w,33);c.fillStyle='#d9f6c8';c.font='bold 20px sans-serif';c.textAlign='center';
      c.fillText(show?victim.name:`ТВ ${station.id+1} · ${TV_NAMES[station.id]}`,w/2,h-10,w-10);
      set.texture.needsUpdate=true;
    }
  }
}
