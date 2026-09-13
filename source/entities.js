import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as SK from './skins.js';
import { createGrannyVisual } from '../assets/models/granny-visual.js';

export function buildMel(skinId) {
    return SK.buildSkinNode(skinId || SK.selectedId());
}

export function buildGranny() {
  return GFX.freezeCharacter(GFX.bakeCharacter(createGrannyVisual(THREE, GFX)));
}

export function buildClassroom() {
  const g = new THREE.Group();
  GFX.put(g, GFX.tplane(U.WALL_X * 2 + 0.4, U.WALL_H, GFX.wallTex), 0, U.WALL_H / 2, U.CLASS_Z1);
  GFX.put(g, GFX.box(5.0, 2.6, 0.12, '#5d4634'), 0, 2.7, U.CLASS_Z1 + 0.06); GFX.put(g, GFX.tplane(4.7, 2.3, GFX.boardTex), 0, 2.7, U.CLASS_Z1 + 0.14); GFX.put(g, GFX.box(5.0, 0.08, 0.18, '#5d4634'), 0, 1.38, U.CLASS_Z1 + 0.2);
  const sideW = U.WALL_X - U.DOOR_HALF;
  for (const s of [-1, 1]) {
    const px = s * (U.DOOR_HALF + sideW / 2);
    GFX.put(g, GFX.box(sideW, U.WALL_H, U.PART_T, '#f0ecd9'), px, U.WALL_H / 2, U.CLASS_Z0);
    GFX.put(g, GFX.box(sideW, 2.09, U.PART_T + 0.02, '#a9c98c'), px, 0.36 + 2.09 / 2, U.CLASS_Z0);
    GFX.put(g, GFX.box(sideW, 0.16, U.PART_T + 0.03, '#6f9459'), px, 2.45, U.CLASS_Z0);
    GFX.put(g, GFX.box(sideW, 0.36, U.PART_T + 0.04, '#5c4633'), px, 0.18, U.CLASS_Z0);
    GFX.put(g, GFX.box(0.14, U.DOOR_TOP, U.PART_T + 0.06, '#6d4c2f'), s * (U.DOOR_HALF + 0.07), U.DOOR_TOP / 2, U.CLASS_Z0);
  }
  GFX.put(g, GFX.box(U.DOOR_HALF * 2 + 0.28, U.WALL_H - U.DOOR_TOP, U.PART_T, '#f0ecd9'), 0, (U.WALL_H + U.DOOR_TOP) / 2, U.CLASS_Z0);
  GFX.put(g, GFX.box(U.DOOR_HALF * 2 + 0.28, 0.14, U.PART_T + 0.06, '#6d4c2f'), 0, U.DOOR_TOP + 0.07, U.CLASS_Z0);
  const sign = GFX.put(g, new THREE.Mesh(GFX.GPlane(1.3, 0.45), new THREE.MeshBasicMaterial({
    map: GFX.canvasTex(256, 96, (c) => { c.fillStyle = '#2e7d32'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(6, 6, 244, 84); c.fillStyle = '#ffffff'; c.font = 'bold 52px Arial'; c.textAlign = 'center'; c.fillText('ВЫХОД', 128, 66); })
  })), 0, U.DOOR_TOP + 0.5, U.CLASS_Z0 - U.PART_T / 2 - 0.01); sign.rotation.y = Math.PI;
  for (const dx of [-3.2, 3.2]) { for (const dz of [-4.9, -7.3]) { const d = GFX.put(g, buildDeskMesh(), dx, 0, dz); d.scale.setScalar(0.92); d.rotation.y = Math.PI; } }
  const td = GFX.buildTeacherDesk(); GFX.put(g, td.group, 0, 0, -9.7);
  GFX.finalizeStatic(g); return { group: g, diary: td.diary };
}

export const OB_DEFS = {
  desk:   { hw: 0.72, hz: 0.90, y0: 0,    y1: U.DESK_TOP_Y, platform: true },
  tower:  { hw: 0.72, hz: 0.90, y0: 0,    y1: 2.20, platform: true },
  banner: { hw: 1.02, hz: 0.18, y0: 1.05, y1: 2.95, platform: false },
  locker: { hw: 0.72, hz: 0.40, y0: 0,    y1: 2.70, platform: true },
  door:   { hw: 0.74, hz: 0.30, y0: 0,    y1: 2.55, platform: false },
  shelf:  { hw: 0.72, hz: 0.36, y0: 0,    y1: 2.40, platform: true },
  cart:   { hw: 0.50, hz: 0.50, y0: 0,    y1: 1.00, platform: true },
  sign:   { hw: 0.30, hz: 0.28, y0: 0,    y1: 0.82, platform: false }
};

function buildChairMesh() {
  const g = new THREE.Group(); GFX.put(g, GFX.box(0.6, 0.08, 0.52, '#b98450'), 0, 0.52, 0); GFX.put(g, GFX.box(0.6, 0.6, 0.07, '#b98450'), 0, 0.85, -0.24);
  for (const [lx, lz] of [[-0.22, 0.12], [0.22, 0.12], [-0.22, -0.12], [0.22, -0.12]]) GFX.put(g, GFX.box(0.05, 0.52, 0.05, '#3c4148'), lx, 0.26, lz); return g;
}
function buildDeskMesh() {
  const g = new THREE.Group(); GFX.put(g, GFX.box(1.5, 0.09, 0.78, '#a9713c'), 0, 1.0, 0.25); GFX.put(g, GFX.box(0.7, 0.06, 0.7, '#8a5a30'), -0.3, 1.06, 0.25);
  for (const [lx, lz] of [[-0.62, -0.02], [0.62, -0.02], [-0.62, 0.55], [0.62, 0.55]]) GFX.put(g, GFX.box(0.07, 1.0, 0.07, '#3c4148'), lx, 0.5, lz - 0.05);
  GFX.put(g, buildChairMesh(), 0, 0, -0.62); return g;
}
function buildCartMesh() {
  const g = new THREE.Group(); GFX.put(g, GFX.box(1.0, 0.5, 0.9, '#8d98a4'), 0, 0.75, 0); GFX.put(g, GFX.box(1.04, 0.05, 0.94, '#5a636e'), 0, 0.96, 0); GFX.put(g, GFX.box(0.96, 0.04, 0.86, '#6b7580'), 0, 0.22, 0);
  for (const [px, pz] of [[-0.46, -0.41], [0.46, -0.41], [-0.46, 0.41], [0.46, 0.41]]) { GFX.put(g, GFX.box(0.05, 0.5, 0.05, '#5a636e'), px, 0.25, pz); GFX.put(g, GFX.box(0.1, 0.1, 0.1, '#2a2d33'), px, 0.05, pz); }
  GFX.put(g, GFX.cyl(0.15, 0.12, 0.26, 8, '#e0b83e'), 0.2, 0.37, 0.1); GFX.put(g, GFX.box(0.34, 0.24, 0.34, '#3b3f47'), -0.24, 0.36, -0.1); return g;
}
function buildObstacle(type) {
  const g = new THREE.Group();
  if (type === 'desk') g.add(buildDeskMesh());
  else if (type === 'tower') { g.add(buildDeskMesh()); GFX.put(g, buildChairMesh(), 0.3, U.DESK_TOP_Y, 0.25); }
  else if (type === 'banner') { for (const px of [-0.95, 0.95]) { GFX.put(g, GFX.cyl(0.055, 0.055, 2.95, 8, '#5a636e'), px, 1.47, 0); GFX.put(g, GFX.box(0.42, 0.07, 0.8, '#5a636e'), px, 0.035, 0); } GFX.put(g, new THREE.Mesh(GFX.GBox(2.0, 1.1, 0.09), GFX.MT(U.pick(GFX.bannerTexes))), 0, 1.85, 0); GFX.put(g, GFX.box(2.1, 0.06, 0.06, '#3f4750'), 0, 2.43, 0); }
  else if (type === 'locker') { GFX.put(g, GFX.panel(1.5, 2.7, 0.75, '#6d7986', GFX.lockerTex, [-1]), 0, 1.35, 0); GFX.put(g, GFX.box(1.52, 0.03, 0.77, '#8a97a5'), 0, 2.695, 0); GFX.put(g, GFX.box(1.56, 0.12, 0.8, '#4d5762'), 0, 0.06, 0); }
  else if (type === 'shelf') { GFX.put(g, GFX.panel(1.5, 2.4, 0.7, '#6b4a2e', GFX.shelfTex, [1, -1]), 0, 1.2, 0); GFX.put(g, GFX.box(1.56, 0.1, 0.76, '#4e3521'), 0, 0.05, 0); GFX.put(g, GFX.box(1.56, 0.06, 0.76, '#4e3521'), 0, 2.43, 0); }
  else if (type === 'cart') g.add(buildCartMesh());
  else if (type === 'sign') { GFX.put(g, GFX.panel(0.56, 0.84, 0.04, '#e9bb1c', GFX.signTex, [-1]), 0, 0.4, -0.13).rotation.x = 0.3; GFX.put(g, GFX.panel(0.56, 0.84, 0.04, '#e9bb1c', GFX.signTex, [1]), 0, 0.4, 0.13).rotation.x = -0.3; GFX.put(g, GFX.box(0.58, 0.05, 0.08, '#c9a020'), 0, 0.8, 0); }
  else if (type === 'door') { for (const s of [-1, 1]) { GFX.put(g, GFX.box(0.12, 2.5, 0.16, '#6d4c2f'), s * 0.66, 1.25, 0); GFX.put(g, GFX.box(0.16, 0.08, 0.9, '#4e3521'), s * 0.66, 0.04, 0); for (const dz of [-1, 1]) GFX.put(g, GFX.box(0.06, 0.58, 0.06, '#4e3521'), s * 0.66, 0.29, dz * 0.175).rotation.x = dz * 0.65; } GFX.put(g, GFX.box(1.48, 0.14, 0.16, '#6d4c2f'), 0, 2.43, 0); GFX.put(g, GFX.box(1.2, 2.32, 0.07, '#8a5a33'), 0, 1.2, 0); GFX.put(g, GFX.box(0.46, 0.62, 0.03, '#cfe6ee'), 0, 1.85, -0.045); GFX.put(g, GFX.box(0.5, 0.14, 0.02, '#e8e2c8'), 0, 1.42, -0.045); GFX.put(g, GFX.sph(0.06, 8, 8, '#e0b83e'), 0.42, 1.15, -0.08); }
  GFX.finalizeStatic(g); g.matrixAutoUpdate = false; return g; // матрица группы пересчитывается только при спавне, см. spawnObstacle
}

// Тени препятствий: раньше у каждого препятствия был свой прозрачный диск — до 20 отдельных
// draw call за кадр. Теперь это один InstancedMesh, а матрицы пишутся только при спавне и
// освобождении (препятствия не двигаются относительно мира, так что в кадре работы ноль).
const SHADOW_MAX = 64;
let obShadows = null;
const shadowOwner = [];
let _shm, _shq, _shv, _shs;
export function initObstacleShadows() {
  _shm = new THREE.Matrix4(); _shq = new THREE.Quaternion(); _shv = new THREE.Vector3(); _shs = new THREE.Vector3();
  _shq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  obShadows = new THREE.InstancedMesh(GFX.GCircle(1), GFX.SHADOW_MAT_OBS, SHADOW_MAX);
  obShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  obShadows.count = 0; obShadows.frustumCulled = false; obShadows.matrixAutoUpdate = false; obShadows.updateMatrix();
  GFX.scene.add(obShadows);
}
function shadowWrite(i, x, z, r) {
  _shv.set(x, 0.02, z); _shs.setScalar(r); _shm.compose(_shv, _shq, _shs);
  obShadows.setMatrixAt(i, _shm); obShadows.instanceMatrix.needsUpdate = true;
}
function shadowAdd(x, z, r) { if (!obShadows || obShadows.count >= SHADOW_MAX) return -1; const i = obShadows.count++; shadowOwner[i] = null; shadowWrite(i, x, z, r); return i; }
function shadowRemove(o) {
  const i = o.shadowIdx; if (i < 0 || !obShadows) return;
  const last = obShadows.count - 1;
  if (i !== last) { obShadows.getMatrixAt(last, _shm); obShadows.setMatrixAt(i, _shm); obShadows.instanceMatrix.needsUpdate = true; const ow = shadowOwner[last]; if (ow) ow.shadowIdx = i; shadowOwner[i] = ow; }
  shadowOwner[last] = null; obShadows.count = last; o.shadowIdx = -1;
}

export const obstaclePool = { desk: [], tower: [], banner: [], locker: [], door: [], shelf: [], cart: [], sign: [] };
export const activeObstacles = [];
const obDescPool = []; // описатели препятствий тоже переиспользуются (правило нулевых аллокаций)
export function spawnObstacle(type, x, z, rot) {
  let g = obstaclePool[type].pop(); if (!g) g = buildObstacle(type);
  g.position.set(x, 0, z);
  if (rot !== undefined) g.rotation.y = rot; else if (type === 'desk' || type === 'tower') g.rotation.y = Math.random() < 0.5 ? Math.PI : 0; else g.rotation.y = 0;
  g.updateMatrix(); GFX.scene.add(g);
  const def = OB_DEFS[type], o = obDescPool.pop() || {};
  o.t = type; o.x = x; o.z = z; o.group = g; o.stumbled = false; o.petHandled = false;
  o.hw = def.hw; o.hz = def.hz; o.y0 = def.y0; o.y1 = def.y1; o.platform = def.platform;
  o.shadowIdx = shadowAdd(x, z, def.hw + 0.25);
  if (o.shadowIdx >= 0) shadowOwner[o.shadowIdx] = o;
  activeObstacles.push(o);
}
export function releaseObstacle(i) {
  const o = activeObstacles[i]; shadowRemove(o); GFX.scene.remove(o.group); obstaclePool[o.t].push(o.group);
  o.group = null; activeObstacles.splice(i, 1); obDescPool.push(o);
}
export function clearObstacles(fromZ, toZ) { for (let i = activeObstacles.length - 1; i >= 0; i--) { const o = activeObstacles[i]; if (o.z > fromZ && o.z < toZ) releaseObstacle(i); } }

// Бутылки: раньше каждая была THREE.Sprite, то есть отдельный draw call (в забеге до 20 за кадр).
// Теперь все они — один меш из квадов, развёрнутых по базису камеры ровно так же, как это делает
// спрайт, поэтому вид не меняется. Буферы созданы один раз, в кадре только перезапись координат.
const COIN_MAX = 64, COIN_HW = 0.31, COIN_HH = 0.7; // наблюдаемый максимум в забеге ~20, запас трёхкратный
export const activeCoins = [];
const coinDescPool = [];
let coinMesh = null, coinPos = null;
export function initCoins() {
  const geo = new THREE.BufferGeometry();
  coinPos = new Float32Array(COIN_MAX * 12);
  const uv = new Float32Array(COIN_MAX * 8), idx = new Uint16Array(COIN_MAX * 6);
  for (let i = 0; i < COIN_MAX; i++) {
    const u = i * 8; uv[u] = 0; uv[u + 1] = 1; uv[u + 2] = 1; uv[u + 3] = 1; uv[u + 4] = 1; uv[u + 5] = 0; uv[u + 6] = 0; uv[u + 7] = 0;
    const b = i * 4, o = i * 6; idx[o] = b; idx[o + 1] = b + 3; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 1;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(coinPos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
  coinMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: GFX.texBottle, transparent: true, alphaTest: 0.15 }));
  coinMesh.frustumCulled = false; coinMesh.matrixAutoUpdate = false; coinMesh.updateMatrix(); coinMesh.renderOrder = 1;
  GFX.scene.add(coinMesh);
}
export function spawnCoin(x, y, z) {
  if (activeCoins.length >= COIN_MAX) return;
  const c = coinDescPool.pop() || {};
  c.x = x; c.y = y; c.z = z; c.phase = Math.random() * Math.PI * 2;
  activeCoins.push(c);
}
export function releaseCoin(i) { coinDescPool.push(activeCoins[i]); activeCoins.splice(i, 1); }
export function updateCoins(bobT) {
  if (!coinMesh) return;
  const n = activeCoins.length, geo = coinMesh.geometry;
  geo.setDrawRange(0, n * 6); if (!n) return;
  GFX.camera.updateMatrixWorld(); // камера уже повёрнута в этом кадре — берём свежий базис, а не прошлый
  const e = GFX.camera.matrixWorld.elements; // правый и верхний векторы камеры — ими спрайт и разворачивается к экрану
  const rx = e[0] * COIN_HW, ry = e[1] * COIN_HW, rz = e[2] * COIN_HW;
  const ux = e[4] * COIN_HH, uy = e[5] * COIN_HH, uz = e[6] * COIN_HH;
  for (let i = 0; i < n; i++) {
    const c = activeCoins[i], k = i * 12, cy = c.y + Math.sin(bobT + c.phase) * 0.09;
    coinPos[k] = c.x - rx + ux; coinPos[k + 1] = cy - ry + uy; coinPos[k + 2] = c.z - rz + uz;
    coinPos[k + 3] = c.x + rx + ux; coinPos[k + 4] = cy + ry + uy; coinPos[k + 5] = c.z + rz + uz;
    coinPos[k + 6] = c.x + rx - ux; coinPos[k + 7] = cy + ry - uy; coinPos[k + 8] = c.z + rz - uz;
    coinPos[k + 9] = c.x - rx - ux; coinPos[k + 10] = cy - ry - uy; coinPos[k + 11] = c.z - rz - uz;
  }
  geo.attributes.position.needsUpdate = true;
}

export const particles = [];
export function initParticles() {
  const geo = GFX.GPlane(0.24, 0.24);
  for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0 })); m.visible = false; GFX.scene.add(m); particles.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 }); }
}
export function burst(x, y, z, color, n, force) {
  let used = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.mesh.material.color.set(color); p.mesh.position.set(x + U.rand(-0.2, 0.2), y + U.rand(0, 0.3), z + U.rand(-0.2, 0.2)); p.mesh.visible = true; p.life = 0.45;
    const a = U.rand(0, Math.PI * 2); p.vx = Math.cos(a) * force; p.vz = Math.sin(a) * force; p.vy = U.rand(1.5, 3.2);
    if (++used >= n) break;
  }
}
export function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt; if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.vy -= 6 * dt;
    const k = p.life / 0.45; p.mesh.material.opacity = k; p.mesh.scale.setScalar(0.6 + (1 - k) * 1.4); p.mesh.quaternion.copy(GFX.camera.quaternion);
  }
}




