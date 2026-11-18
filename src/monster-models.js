import * as THREE from 'three';
import { makeAvatar } from './avatars.js';

export class MonsterModels {
  constructor(scene, original) {
    this.scareCache = new Map();
    this.models = new Map([['tinky', original]]);
    for (const id of ['dipsy', 'laalaa', 'po', 'newborn', 'chainsaw']) {
      const group = makeAvatar({ skin: { dipsy: 'green', laalaa: 'yellow', po: 'red', newborn: 'white', chainsaw: 'green' }[id], antenna: { dipsy: 'straight', laalaa: 'curl', po: 'ring', newborn: 'none', chainsaw: 'none' }[id], hat: 'none' });
      group.scale.set(id === 'dipsy' ? 1 : 1.05, id === 'dipsy' ? 2 : 1.65, 0.95);
      group.userData.arms.forEach((arm) => { arm.scale.y = 1.6; arm.position.y = 0.8; });
      const dark = new THREE.MeshLambertMaterial({ color: '#282a24' });
      const add = (geometry, material, position) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); group.add(mesh); return mesh; };
      if (id === 'newborn') {
        group.scale.set(0.9, 0.85, 0.9); group.userData.arms.forEach((arm) => { arm.visible = false; });
        for (const x of [-0.085, 0.085]) add(new THREE.SphereGeometry(0.055, 8, 6), dark, [x, 1.49, 0.405]);
      }
      if (id === 'chainsaw') {
        group.children.forEach((part) => { if (part.position.y > 1.2) part.visible = false; });
        const steel = new THREE.MeshLambertMaterial({ color: '#a8b0a6' });
        add(new THREE.BoxGeometry(0.3, 0.25, 0.38), new THREE.MeshLambertMaterial({ color: '#c9773c' }), [0.46, 0.9, 0.28]);
        add(new THREE.BoxGeometry(0.12, 0.2, 0.75), steel, [0.46, 0.9, 0.8]);
        for (let z = 0.5; z < 1.2; z += 0.12) add(new THREE.ConeGeometry(0.055, 0.12, 3), dark, [0.46, 1.03, z]);
      }
      if (id === 'dipsy') {
        const tail = add(new THREE.ConeGeometry(0.15, 1.25, 7), new THREE.MeshLambertMaterial({ color: '#598541' }), [0, 0.65, -0.6]); tail.rotation.x = -Math.PI / 2;
        const neck = add(new THREE.CylinderGeometry(0.12, 0.16, 0.45, 7), dark, [0, 1.33, 0]); neck.scale.y = 1.3;
      }
      if (id === 'laalaa') {
        add(new THREE.BoxGeometry(0.45, 0.075, 0.07), dark, [0, 1.49, 0.405]);
        add(new THREE.BoxGeometry(0.12, 0.08, 0.06), dark, [0, 1.32, 0.405]);
      }
      if (id === 'po') {
        for (const x of [-0.085, 0.085]) add(new THREE.SphereGeometry(0.029, 6, 6), new THREE.MeshBasicMaterial({ color: '#ec6862' }), [x, 1.49, 0.415]);
        const blade = new THREE.MeshLambertMaterial({ color: '#adb7b5' });
        for (const side of [-1, 1]) for (const y of [0.85, 1.25]) {
          const points = [[0, y, -0.15], [side * 0.48, y + 0.25, -0.5], [side * 0.85, y + 0.1, -0.25]].map((p) => new THREE.Vector3(...p));
          add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, 0.055, 5, false), dark, [0, 0, 0]);
          const tip = add(new THREE.ConeGeometry(0.075, 0.55, 3), blade, [side * 0.85, y - 0.12, -0.25]); tip.rotation.z = side * 0.35;
        }
      }
      group.visible = false; scene.add(group); this.models.set(id, group);
    }
    this.baseScales = new Map([...this.models].map(([id, model]) => [id, model.scale.clone()]));
  }
  setScale(id, factor) { this.get(id).scale.copy(this.baseScales.get(id) || this.baseScales.get('tinky')).multiplyScalar(factor); }
  hide() { for (const group of this.models.values()) group.visible = false; }
  get(id) { return this.models.get(id) || this.models.get('tinky'); }
  scare(id, rabbit = null) {
    const key = rabbit ? 'rabbit' : id;
    if (this.scareCache.has(key)) return this.scareCache.get(key);
    let renderer;
    try {
      const source = rabbit || this.get(id), model = new THREE.Group();
      model.scale.copy(source.scale);
      // Clone meshes but not runtime animation references stored in userData.
      source.children.forEach((child) => model.add(child.clone(true)));
      model.position.y = -source.scale.y * (rabbit ? 0.85 : id === 'chainsaw' ? 0.9 : 1.45);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#080708'); scene.add(model);
      scene.add(new THREE.HemisphereLight('#f7dce0', '#491b29', 2.4));
      const light = new THREE.DirectionalLight('#fff1cd', 2); light.position.set(-1, 1, 3); scene.add(light);
      const camera = new THREE.PerspectiveCamera(64, 1, 0.03, 12); camera.position.set(0, 0, rabbit ? 1.15 : 0.95); camera.lookAt(0, 0, 0);
      renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(384, 384); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png'); this.scareCache.set(key, url); return url;
    } catch { return null; }
    finally { renderer?.dispose(); renderer?.forceContextLoss(); }
  }
}
