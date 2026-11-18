import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cloneModel } from './asset-library.js';
import motion from './sahur-throw.json' with { type: 'json' };

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
function put(parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
  return mesh;
}

// Baked vertex colour keeps the carved grain visible without textures or a shader.
function turnedWood(profile, color, slices) {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), slices);
  const positions = geometry.attributes.position, colors = new Float32Array(positions.count * 3);
  const wood = new THREE.Color(color);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const a = Math.atan2(x, z), r = Math.hypot(x, z);
    const grain = r < 0.04 ? 0.78 : 0.87 + 0.15 * Math.sin(11 * a + 0.8 * Math.sin(9 * y + 3 * a)) + 0.08 * Math.sin(5 * a - 4 * y);
    colors.set([wood.r * grain, wood.g * grain, wood.b * grain], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }));
}

export function makeSahurBat() {
  const imported = cloneModel('sahur-bat');
  if (imported) return imported;
  const bat = new THREE.Group(); bat.name = 'Sahur_Bat';
  bat.add(turnedWood([[0, -0.43], [0.074, -0.43], [0.075, -0.397], [0.038, -0.369], [0.038, -0.15], [0.055, 0.04], [0.096, 0.31], [0.097, 0.43], [0.077, 0.49], [0, 0.50]], '#ba7d43', 16));
  const grip = mat('#45332f'), cord = mat('#cb9a58');
  put(bat, new THREE.CylinderGeometry(0.042, 0.046, 0.19, 12), grip, [0, -0.255, 0]);
  const bands = [-0.325, -0.285, -0.245, -0.205].map((y) => new THREE.TorusGeometry(0.042, 0.004, 4, 12).rotateX(Math.PI / 2).translate(0, y, 0));
  put(bat, mergeGeometries(bands), cord);
  bands.forEach((band) => band.dispose());
  return bat;
}

export function makeSahur(id = 'sahur') {
  const buff = id === 'sahur-buff';
  const imported = cloneModel(id);
  if (imported) {
    const prefix = buff ? 'Champ_' : 'Sahur_';
    const [tilt, head, left, right, bat] = ['Tilt', 'Head', 'Arm_L', 'Arm_R', 'Bat'].map((name) => imported.getObjectByName(prefix + name));
    Object.assign(imported.userData, { tilt, head, arms: [left, right], bat });
    return imported;
  }
  const group = new THREE.Group(); group.name = 'STW_Sahur';
  const tilt = new THREE.Group(); group.add(tilt);
  const head = new THREE.Group(); head.name = 'Sahur_Head'; tilt.add(head);
  head.add(turnedWood([[0, 0.47], [0.18, 0.47], [0.24, 0.51], [0.278, 0.62], [0.288, 0.81], [0.305, 1.03], [0.313, 1.25], [0.301, 1.44], [0.278, 1.60], [0.251, 1.70], [0.205, 1.738], [0.128, 1.746], [0.066, 1.737], [0, 1.74]], '#9c592f', 40));
  const bark = mat('#764124'), endgrain = mat('#b87743'), dark = mat('#2e1917'), cream = mat('#e3d2ad'), iris = mat('#161412');
  const glint = new THREE.MeshBasicMaterial({ color: '#eadfc9' });
  const ellipsoid = (parent, material, p, s, segments = 10) => put(parent, new THREE.SphereGeometry(1, segments, 8), material, p, s);
  const stroke = (parent, material, points, radius) => {
    const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return put(parent, new THREE.TubeGeometry(path, 12, radius, 5, false), material);
  };
  for (const side of [-1, 1]) {
    const x = side * 0.119, y = side === -1 ? 1.367 : 1.349;
    ellipsoid(head, dark, [x, y, 0.266], [0.116, 0.150, 0.074]);
    ellipsoid(head, cream, [x, y, 0.305], [0.102, 0.132, 0.077], 16);
    ellipsoid(head, iris, [x - 0.010, y - 0.013, 0.368], [0.054, 0.066, 0.018]);
    ellipsoid(head, glint, [x - 0.027, y + 0.01, 0.386], [0.015, 0.019, 0.007], 8);
    stroke(head, bark, [[x - 0.087, y + 0.145, 0.237], [x - 0.013, y + 0.174, 0.274], [x + 0.071, y + 0.145, 0.252]], 0.018);
  }
  ellipsoid(head, endgrain, [0.005, 1.207, 0.320], [0.053, 0.076, 0.073]);
  stroke(head, dark, [[-0.151, 1.130, 0.280], [-0.103, 1.083, 0.304], [-0.015, 1.06, 0.310], [0.072, 1.078, 0.306], [0.149, 1.137, 0.277]], 0.018);
  for (const y of [0.70, 0.78]) {
    const knot = put(head, new THREE.TorusGeometry(0.037, 0.006, 5, 14), bark, [-0.062, y + 0.067, y + 0.067 > 0.81 ? 0.284 : 0.281], [1, y === 0.70 ? 1.22 : 1.48, 1]);
    knot.rotation.set(-0.05, -0.16, 0.25);
  }
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group(); arm.name = side === -1 ? 'Arm_L' : 'Arm_R';
    arm.position.set(side * 0.267, 1.08, 0.027); tilt.add(arm);
    const points = side < 0 ? [[0, 0, 0], [-0.133, -0.23, 0.02], [-0.18, -0.41, 0.082]] : [[0, 0, 0], [0.135, -0.22, 0.04], [0.225, -0.16, 0.24]];
    stroke(arm, endgrain, points, 0.064);
    ellipsoid(arm, bark, points[2], [0.076, 0.094, 0.074]);
    const [x, y, z] = points[2];
    const leg = put(group, new THREE.CylinderGeometry(0.082, 0.063, 0.42, 10), bark, [side * 0.137, 0.275, 0]); leg.rotation.z = side * 0.13;
    ellipsoid(group, endgrain, [side * 0.15, 0.094, 0.081], [0.113, 0.094, 0.205]);
    if (side > 0) {
      const grip = new THREE.Group(); grip.name = 'Sahur_Bat'; grip.rotation.set(0.12, 0, -0.26); grip.position.set(x, y, z);
      const bat = makeSahurBat(); bat.position.y = 0.255; grip.add(bat); arm.add(grip);
    }
    return arm;
  });
  if (buff) {
    for (const side of [-1, 1]) {
      ellipsoid(tilt, endgrain, [side * .173, 1.10, .15], [.21, .13, .15]);
      for (const y of [.91, .81, .71]) ellipsoid(tilt, bark, [side * .095, y, .206], [.105, .065, .105]);
      const arm = arms[side < 0 ? 0 : 1]; arm.position.x *= 1.4;
      ellipsoid(arm, endgrain, [0, 0, 0], [.136, .145, .131]);
      ellipsoid(arm, bark, [side * .09, -.137, .024], [.093, .144, .10]);
    }
  }
  group.userData = { head, arms, tilt, bat: group.getObjectByName('Sahur_Bat'), assetId: id, assetSource: 'procedural' };
  return group;
}

const poses = motion.poses.map(([frame, ...angles]) => [frame / motion.fps, ...angles.map((rotation) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)))]);
export function createSahurThrow(model) {
  const { tilt, arms, bat } = model.userData;
  const clip = model.animations.find((item) => item.name === 'Sahur_Throw');
  const mixer = clip && new THREE.AnimationMixer(model);
  const action = mixer?.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  if (action) action.clampWhenFinished = true;
  let playing = false;
  return {
    set(time, armed) {
      const last = poses.at(-1)[0];
      if (time >= 0 && time < last) {
        if (action) {
          if (!playing) action.reset().play();
          action.time = time; mixer.update(0);
        } else {
          const end = poses.findIndex(([at]) => time < at), lo = poses[end - 1], hi = poses[end];
          const t = (time - lo[0]) / (hi[0] - lo[0]);
          [tilt, arms[1], arms[0]].forEach((node, i) => node.quaternion.slerpQuaternions(lo[i + 1], hi[i + 1], t));
        }
        playing = true;
        bat.visible = time < motion.release / motion.fps;
      } else {
        if (playing) { action?.stop(); tilt.rotation.set(0, 0, 0); arms.forEach((arm) => arm.rotation.set(0, 0, 0)); }
        playing = false;
        bat.visible = armed;
      }
      return playing;
    },
    dispose() { action?.stop(); mixer?.uncacheRoot(model); },
  };
}

export function makeStunMarker() {
  const ring = new THREE.TorusGeometry(0.34, 0.013, 5, 24).rotateX(Math.PI / 2);
  const sparks = [0, 1, 2].map((i) => new THREE.OctahedronGeometry(0.082).scale(0.8, 1.25, 0.8).translate(Math.cos(i * Math.PI * 2 / 3) * 0.34, 0.055, Math.sin(i * Math.PI * 2 / 3) * 0.34));
  // Torus is indexed, octahedra aren't. Give the merge matching attributes and indexing.
  const hoop = ring.toNonIndexed();
  const geometry = mergeGeometries([hoop, ...sparks]);
  [ring, hoop, ...sparks].forEach((part) => part.dispose());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffdb86' }));
  mesh.visible = false;
  return mesh;
}
