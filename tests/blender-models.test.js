import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { preloadModels, cloneModel, modelStatus } from '../src/asset-library.js';
import { makeAvatar, disposeModel } from '../src/avatars.js';
import { makeRabbit } from '../src/fun.js';
import { MonsterModels } from '../src/monster-models.js';
import { CATALOG } from '../src/catalog.js';
import { createSahurThrow } from '../src/sahur-model.js';

const root = new URL('../public/models/blender-v1/', import.meta.url);
await preloadModels({ fetcher: async (url) => new Response(await readFile(new URL(url.split('/').at(-1), root))) });
const meshes = (model) => { const result = []; model.traverse((part) => { if (part.isMesh) result.push(part); }); return result; };

test('self-contained Blender GLBs load, meet mobile budgets and have grounded Y-up origins', async () => {
  assert.deepEqual(modelStatus(), { player: 'ready', rabbit: 'ready', case: 'ready', sahur: 'ready', 'sahur-bat': 'ready', 'sahur-buff': 'ready' });
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  for (const [key, budget, drawCalls] of [['player', 10000, 14], ['rabbit', 10000, 5], ['case', 5000, 7], ['sahur', 12000, 16], ['sahur-bat', 2000, 3], ['sahur-buff', 22000, 20]]) {
    const binary = await readFile(new URL(`${key}.glb`, root));
    const gltf = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString());
    assert.equal(binary.readUInt32LE(0), 0x46546c67); assert.equal(binary.readUInt32LE(8), binary.length);
    assert.ok(gltf.buffers.every((buffer) => !buffer.uri)); assert.equal(gltf.images?.length || 0, 0);
    assert.equal(gltf.cameras?.length || 0, 0);
    const model = cloneModel(key), parts = meshes(model);
    assert.ok(parts.length <= drawCalls, `${key}: ${parts.length} batches`);
    const triangles = parts.reduce((count, part) => count + part.geometry.attributes.position.count / 3, 0);
    assert.ok(triangles < budget);
    assert.equal(triangles, manifest.assets.find((asset) => asset.asset === key).triangles);
    for (const part of parts) for (const value of part.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    const box = new THREE.Box3().setFromObject(model);
    assert.equal(binary.length, manifest.assets.find((asset) => asset.asset === key).bytes);
    if (key === 'sahur-bat') assert.ok(box.min.y < -0.4 && box.max.y > 0.45);
    else {
      assert.ok(Math.abs(box.min.y) < 0.003, `${key} is not grounded: ${box.min.y}`);
      assert.ok(box.max.y > (key === 'case' ? 0.7 : 1.5));
    }
    assert.ok(parts.every((part) => !part.material.map));
    disposeModel(model);
  }
});

test('preview disposal cannot dispose another instance or cached template', () => {
  const first = cloneModel('player'), second = cloneModel('player');
  const a = meshes(first), b = meshes(second); let otherDisposed = false;
  for (let index = 0; index < a.length; index++) {
    assert.notEqual(a[index].geometry, b[index].geometry); assert.notEqual(a[index].material, b[index].material);
    b[index].geometry.addEventListener('dispose', () => { otherDisposed = true; });
    b[index].material.addEventListener('dispose', () => { otherDisposed = true; });
  }
  disposeModel(first); assert.equal(otherDisposed, false);
  assert.equal(cloneModel('player').userData.assetSource, 'blender-v1');
  disposeModel(second);
});

test('all avatar colours/cosmetics and shoulder references survive Blender integration', () => {
  const bare = makeAvatar({ skin: 'purple', antenna: 'none', hat: 'none' });
  assert.equal(bare.children.length, 4); // Only Body, Head and shoulders; no hidden antenna stem.
  disposeModel(bare);
  for (const skin of CATALOG.skin) {
    const avatar = makeAvatar({ skin: skin.id, antenna: 'none', hat: 'none' });
    assert.equal(avatar.userData.assetSource, 'blender-v1');
    assert.equal(avatar.userData.head.name, ({ sahur: 'Sahur_Head', 'sahur-buff': 'Champ_Head' })[skin.id] || 'Head');
    assert.equal(avatar.userData.arms.length, 2);
    assert.ok(avatar.userData.arms.every((arm) => arm.parent === (avatar.userData.tilt || avatar)));
    assert.ok(meshes(avatar).filter((part) => part.material.name === 'STW_Skin').every((part) => part.material.color.getHexString() === new THREE.Color(skin.color).getHexString()));
    disposeModel(avatar);
  }
  for (const kind of ['antenna', 'hat']) for (const item of CATALOG[kind]) {
    const avatar = makeAvatar({ skin: 'purple', antenna: 'none', hat: 'none', [kind]: item.id });
    assert.equal(avatar.userData.appearance[kind], item.id); disposeModel(avatar);
  }
});

test('rabbit clones and chest hinge remain usable; monster head/arm behavior is preserved', () => {
  const rabbit = makeRabbit(); assert.equal(rabbit.userData.assetId, 'rabbit');
  assert.ok(rabbit.clone(true).getObjectByName('STW_Rabbit_Fur'));
  const templateCopy = cloneModel('rabbit'), anotherRabbit = makeRabbit();
  const expectedFur = templateCopy.getObjectByName('STW_Rabbit_Fur').material.color.clone().multiplyScalar(0.35);
  assert.ok(rabbit.getObjectByName('STW_Rabbit_Fur').material.color.equals(expectedFur));
  assert.ok(anotherRabbit.getObjectByName('STW_Rabbit_Fur').material.color.equals(expectedFur));
  disposeModel(templateCopy); disposeModel(anotherRabbit);
  const chest = cloneModel('case'), hinge = chest.getObjectByName('Lid_Hinge');
  assert.ok(hinge); assert.ok(hinge.position.z < 0); hinge.rotation.x = -1.88;
  assert.ok(new THREE.Box3().setFromObject(chest).max.y > 1);
  const monsters = new MonsterModels(new THREE.Scene(), makeAvatar({}));
  assert.equal(monsters.get('chainsaw').userData.head.visible, false);
  assert.ok(monsters.get('newborn').userData.arms.every((arm) => !arm.visible));
  assert.ok(monsters.get('dipsy').userData.arms.every((arm) => arm.scale.y === 1.6));
});

test('failed preloads settle safely and concurrent callers share one request per asset', async () => {
  const isolated = await import('../src/asset-library.js?failed-preload-test');
  let requests = 0;
  const fetcher = async () => { requests++; throw new Error('Offline'); };
  await Promise.all([isolated.preloadModels({ fetcher }), isolated.preloadModels({ fetcher })]);
  assert.equal(requests, 6);
  assert.deepEqual(isolated.modelStatus(), { player: 'fallback', rabbit: 'fallback', case: 'fallback', sahur: 'fallback', 'sahur-bat': 'fallback', 'sahur-buff': 'fallback' });
  assert.equal(isolated.cloneModel('player'), null);
});

test('the Sahur Blender clip winds up, releases and follows through; meshes retain their vertex grain', () => {
  const model = makeAvatar({ skin: 'sahur', hat: 'wizard', antenna: 'none' });
  const other = makeAvatar({ skin: 'sahur' });
  const animation = createSahurThrow(model), arm = model.userData.arms[1];
  assert.equal(model.animations[0].name, 'Sahur_Throw');
  assert.ok(Math.abs(model.animations[0].duration - 0.7) < 0.001);
  assert.ok(meshes(model).some((part) => part.material.vertexColors && part.geometry.attributes.color));
  assert.ok(animation.set(0.23, true) && arm.rotation.x < -1.5 && model.userData.bat.visible);
  assert.ok(animation.set(0.30, false) && !model.userData.bat.visible);
  assert.ok(animation.set(0.40, false) && arm.rotation.x > 0.2);
  assert.ok(Math.abs(other.userData.arms[1].rotation.x) < 1e-7);
  assert.equal(animation.set(0.71, false), false);
  assert.equal(arm.rotation.x, 0);
  assert.ok(!model.userData.bat.visible);
  animation.set(-1, true); assert.ok(model.userData.bat.visible);
  animation.dispose(); disposeModel(model); disposeModel(other);
});
