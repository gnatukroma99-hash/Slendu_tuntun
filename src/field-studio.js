import * as THREE from 'three';
import { makeAvatar, disposeModel } from './avatars.js';
import { emoteRig } from './emote-pose.js';
import { EMOTES, signature } from './round-extras.js';

// One lazy studio for the live emote inset, TV portraits and the souvenir PNG.
// All portraits use in-game avatars; nothing is captured from a device or uploaded.
export class FieldStudio {
  constructor() { this.inset = document.querySelector('#emote-inset'); this.lastDraw = -Infinity; this.generation = 0; }
  init() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0, 0); this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight('#fff0dc', '#78918b', 2.7));
    const lamp = new THREE.DirectionalLight('#ffdcac', 2.1); lamp.position.set(2.6, 4, 3); this.scene.add(lamp);
    const rim = new THREE.DirectionalLight('#9ce0d2', 1.4); rim.position.set(-2, 2, -2); this.scene.add(rim);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .05, 20);
  }
  frame(actors, width, height, halfHeight, center = 1.07) {
    this.init();
    const camera = this.camera, r = this.renderer;
    if (r.domElement.width !== width || r.domElement.height !== height) r.setSize(width, height, false);
    camera.left = -halfHeight * width / height; camera.right = -camera.left;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.position.set(0, center, 5); camera.lookAt(0, center, 0); camera.updateProjectionMatrix();
    this.scene.add(...actors);
    try { r.render(this.scene, camera); return r.domElement; } finally { this.scene.remove(...actors); }
  }
  endEmote() {
    this.inset.hidden = true;
    if (this.actor) disposeModel(this.actor);
    this.actor = this.rig = this.key = null; this.lastDraw = -Infinity;
  }
  selfEmote(e, time, appearance, pig, reduced) {
    if (!e) { if (this.key) this.endEmote(); return; }
    const key = `${e.kind}:${e.at}:${JSON.stringify(appearance)}`;
    if (key !== this.key) {
      this.endEmote(); this.key = key;
      this.inset.querySelector('strong').textContent = EMOTES[e.kind]; this.inset.hidden = false;
      this.actor = makeAvatar(appearance, pig); this.rig = emoteRig(this.actor);
    }
    if (performance.now() - this.lastDraw < (reduced ? 1000 : 55)) return;
    this.lastDraw = performance.now();
    const canvas = this.inset.querySelector('canvas'), ctx = canvas.getContext('2d');
    this.actor.rotation.y = -.13; this.rig.pose(e.kind, time - e.at, reduced);
    try {
      const view = this.frame([this.actor], canvas.width, canvas.height, 1.32);
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(view, 0, 0);
    } catch { /* Keep the text caption if the auxiliary canvas is unavailable. */ }
  }
  portrait(appearance, pig) {
    const actor = makeAvatar(appearance, pig);
    try {
      const canvas = document.createElement('canvas'); canvas.width = 126; canvas.height = 92;
      canvas.getContext('2d').drawImage(this.frame([actor], 126, 92, .55, 1.43), 0, 0); return canvas;
    } finally { disposeModel(actor); }
  }
  clearPhoto() {
    this.generation++;
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = null; const a = document.querySelector('#save-photo'); a.removeAttribute('href'); a.hidden = true;
    document.querySelector('#round-photo').hidden = true;
  }
  takePhoto(cast, { map, mode, round, clock, outcome, pig }) {
    this.clearPhoto(); if (!cast?.length) return;
    const gen = this.generation, canvas = document.querySelector('#team-photo'), ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, L = 20, top = 70, iw = W-2*L, ih = 345, halfHeight = 1.37;
    ctx.fillStyle = '#d1d5c2'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#15241f'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('ГРУППОВОЙ СНИМОК', L, 42);
    ctx.textAlign = 'right'; ctx.font = '15px monospace'; ctx.fillText(`${map}  /  ${clock}`, W-L, 41, W*.45);
    const sky = ctx.createLinearGradient(0, top, 0, top+ih); sky.addColorStop(0,'#16292c'); sky.addColorStop(.62,'#678077'); sky.addColorStop(1,'#283e34');
    ctx.fillStyle = sky; ctx.fillRect(L, top, iw, ih);
    ctx.save(); ctx.beginPath(); ctx.rect(L,top,iw,ih); ctx.clip();
    ctx.fillStyle = '#adba9f'; ctx.beginPath(); ctx.arc(82,top+56,20,0,Math.PI*2); ctx.fill();
    for (let j = 0; j < 51; j++) {
      const x=L+j*20, h=30+Math.abs(Math.sin(j*7.2))*52;
      ctx.fillStyle = j%2 ? '#405a50' : '#466256'; ctx.beginPath(); ctx.moveTo(x-18,top+220); ctx.lineTo(x,top+218-h); ctx.lineTo(x+18,top+220); ctx.fill();
    }
    const slots = cast.map((_, i) => L + (i + .5) * iw / cast.length);
    const span = 2 * halfHeight * iw/ih;
    const models = [];
    try {
      for (const [i, person] of cast.entries()) {
        const actor = makeAvatar(person.appearance, pig); models.push(actor);
        actor.position.x = (slots[i]-W/2) * span/iw;
        actor.rotation.y = (i-(cast.length-1)/2)*-.09;
        emoteRig(actor).pose(signature(person.appearance.skin), .91, true);
        ctx.fillStyle = '#13292175'; ctx.beginPath(); ctx.ellipse(slots[i], top+ih*.89, 47, 7, 0,0,Math.PI*2); ctx.fill();
      }
      ctx.drawImage(this.frame(models, iw, ih, halfHeight), L, top);
    } catch {
      // An optional WebGL context may be denied on older phones. Keep a usable signed card.
      ctx.font='bold 42px sans-serif'; ctx.fillStyle='#eff4df'; ctx.textAlign='center';
      cast.forEach((p,i)=>ctx.fillText(p.name.slice(0,1),slots[i],top+ih*.55));
    } finally { models.forEach(disposeModel); ctx.restore(); }
    ctx.textAlign='center'; const col=iw/cast.length-12;
    cast.forEach((p,i)=>{
      ctx.fillStyle='#22332c'; ctx.font='bold 22px sans-serif'; ctx.fillText(p.name,slots[i],top+ih+30,col);
      ctx.fillStyle='#67451f'; ctx.font='bold 18px sans-serif'; ctx.fillText(p.title,slots[i],top+ih+57,col);
      ctx.fillStyle='#46574f'; ctx.font='14px monospace'; ctx.fillText(p.detail,slots[i],top+ih+81,col);
    });
    ctx.fillStyle='#56675d'; ctx.fillRect(L,H-42,iw,1); ctx.textAlign='left'; ctx.font='bold 15px monospace'; ctx.fillText(`${mode} · ${outcome}`,L,H-17,W*.72);
    ctx.textAlign='right'; ctx.fillText(`КАДР / ${String(round || 1).padStart(3,'0')}`,W-L,H-17);
    canvas.setAttribute('aria-label', `${map}. ${cast.map((p)=>`${p.name} — ${p.title}: ${p.detail}`).join('; ')}`);
    document.querySelector('#round-photo').hidden=false;
    canvas.toBlob((blob)=>{
      if (!blob || gen !== this.generation) return;
      this.photoUrl=URL.createObjectURL(blob); const a=document.querySelector('#save-photo'); a.href=this.photoUrl;
      a.download=`slendytubbies-round-${round || 1}.png`; a.hidden=false;
    }, 'image/png');
  }
}
