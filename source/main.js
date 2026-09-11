import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as ENT from './entities.js';
import * as LVL from './level.js';
import * as SK from './skins.js';
import * as SHOP from './shop.js';

export const G = { state: 'loading', speed: U.BASE_SPEED, dist: 0, runTime: 0, bottles: 0, bankedBottles: 0, nextZ: 0, camBlend: 0, shake: 0, overT: 0, overShown: false, reviveUsed: false, hintT: 0 };
export const player = { node: null, lane: 1, x: 0, y: 0, z: 0, vy: 0, grounded: true, groundY: 0, rolling: 0, invuln: 0, runPhase: 0, squash: 0 };
export const granny = { node: null, zOff: -9.2, targetZOff: -9.2, closeT: 0, phase: 0, catchMode: false };
export const intro = { t: 0, faceY: Math.PI, grab: false, alert: false, hop: false, turn: false, runStartZ: 0 };

let deskScene = null, segments = [];
const YELLS = ['СТОЙ, ХУЛИГАН!', 'ПОПАЛСЯ!', 'БЕГЛЕЦ!', 'В КЛАСС ВЕРНИСЬ!', 'А Я ПРЕДУПРЕЖДАЛА!', 'ДОМОЙ!'];

function move(dir) {
  if (G.state !== 'run') return;
  const nl = U.clamp(player.lane + dir, 0, 2);
  if (nl !== player.lane) { player.lane = nl; U.Sound.lane(); }
}
function jump() {
  if (G.state !== 'run') return;
  if (player.grounded) { player.vy = U.JUMP_V; player.grounded = false; player.rolling = 0; player.node.pivot.rotation.x = 0; U.Sound.jump(); }
}
function roll() {
  if (G.state !== 'run') return;
  if (player.grounded && player.rolling <= 0) { player.rolling = U.ROLL_TIME; U.Sound.roll(); ENT.burst(player.x, player.groundY + 0.1, player.z, '#b8a58c', 4, 1.6); }
  else if (!player.grounded) { player.vy = Math.min(player.vy, -4); player.rolling = U.ROLL_TIME; }
}
function nearestLane(x) { let best = 0, bd = 1e9; for (let i = 0; i < 3; i++) { const d = Math.abs(x - U.LANES[i]); if (d < bd) { bd = d; best = i; } } return best; }

const hitsXZ = o => Math.abs(player.z - o.z) <= o.hz + U.HIT_Z && Math.abs(player.x - o.x) <= o.hw + U.HIT_W;
function updateCollisions() {
  const rolling = player.rolling > 0; const py1 = player.y + (rolling ? 0.80 : 1.86);
  for (let i = ENT.activeObstacles.length - 1; i >= 0; i--) {
    const o = ENT.activeObstacles[i]; if (o.z < player.z - U.DESPAWN_BEHIND) { ENT.releaseObstacle(i); continue; }
    if (!hitsXZ(o)) continue;
    if (player.y >= o.y1 - U.PLATFORM_TOL) continue;
    if (py1 <= o.y0 + 0.04) continue;
    if (player.invuln > 0 || o.stumbled) continue;
    const ox = (o.hw + U.HIT_W) - Math.abs(player.x - o.x); const changing = Math.abs(player.x - U.LANES[player.lane]) > 0.6;
    if (ox < 0.5 && changing) stumble(o); else caught(); return;
  }
}
function getGroundY() {
  let cg = 0; for (const o of ENT.activeObstacles) { if (!o.platform || !hitsXZ(o)) continue; if (player.y >= o.y1 - U.PLATFORM_TOL) cg = Math.max(cg, o.y1); } return cg;
}
function stumble(o) {
  if (granny.closeT > 1.2) { caught(); return; }
  o.stumbled = true; const movingPlusX = U.LANES[player.lane] > player.x;
  let nl = nearestLane(player.x);
  if (Math.abs(U.LANES[nl] - o.x) < o.hw + 0.35) nl = U.clamp(nl + (movingPlusX ? -1 : 1), 0, 2);
  player.lane = nl; player.invuln = 1.4;
  granny.closeT = 5; granny.targetZOff = -2.7; G.shake = Math.max(G.shake, 0.45);
  U.Sound.stumble(); U.Sound.growl(); U.replayCss(U.UI.flash); U.setYell(U.pick(YELLS)); ENT.burst(player.x, player.y + 1, player.z, '#ffd94a', 5, 2.2);
}
function caught() {
  G.state = 'over'; G.overT = 0; G.overShown = false; granny.catchMode = true; granny.targetZOff = -0.85; G.shake = 0.8;
  U.Sound.crash(); U.Sound.growl(); U.replayCss(U.UI.flash); ENT.burst(player.x, player.y + 1.2, player.z, '#b0451f', 8, 3);
  U.Sdk.gameplayStop(); const m = Math.floor(G.dist); const isRecord = m > U.save.best;
  if (isRecord) U.save.best = m;
  const gained = G.bottles - G.bankedBottles; U.save.bottles += gained; U.save.currency += gained; G.bankedBottles = G.bottles;
  U.persistSave(); if (U.UI.over) U.UI.over.dataset.record = isRecord ? '1' : '0';
}

function updateMenuStats() { if (U.UI.menuBest) U.UI.menuBest.textContent = U.save.best; if (U.UI.menuBottles) U.UI.menuBottles.textContent = U.save.bottles; SHOP.refreshCurrency(); }
function showMenu() { setupMenuScene(); U.screens('menu'); updateMenuStats(); U.Sdk.gameplayStop(); }
function openShop() { if (G.state !== 'menu') return; G.state = 'shop'; SHOP.open(); }
function exitShop() { if (G.state !== 'shop') return; SHOP.close(); showMenu(); }
function applyPlayerSkin(id) {
  const next = ENT.buildMel(id); if (next === player.node) return;
  const old = player.node;
  if (old) { GFX.scene.remove(old.root); next.diary.visible = old.diary.visible; }
  player.node = next; GFX.scene.add(next.root);
}
function diaryTaken(on) { deskScene.diary.visible = !on; player.node.diary.visible = on; }
function resetPose() { const n = player.node; n.pivot.rotation.x = 0; n.inner.rotation.set(0, 0, 0); n.root.rotation.set(0, 0, 0); n.inner.visible = true; }
function resetRun() {
  for (let i = ENT.activeObstacles.length - 1; i >= 0; i--) ENT.releaseObstacle(i);
  for (let i = ENT.activeCoins.length - 1; i >= 0; i--) ENT.releaseCoin(i);
  segments.forEach((seg, i) => { seg.position.z = i * U.SEG_LEN; GFX.randomizeSegmentDecor(seg, i === 0 ? U.CLASS_Z0 + 3 : undefined); });
  player.lane = 1; player.x = 0; player.y = 0; player.vy = 0; player.z = 0; player.groundY = 0; player.grounded = true; player.rolling = 0; player.invuln = 0; player.squash = 0;
  resetPose(); player.node.inner.scale.set(1, 1, 1); player.node.inner.position.y = -0.92;
  G.speed = U.BASE_SPEED; G.dist = 0; G.runTime = 0; G.bottles = 0; G.bankedBottles = 0; G.nextZ = 42; G.reviveUsed = false; G.overShown = false; G.shake = 0;
  granny.closeT = 0; granny.catchMode = false;
  if (U.UI.bottleNum) U.UI.bottleNum.textContent = '0'; updateScoreHud(true);
  LVL.resetDirector(); LVL.fillSpawns();
}
function setupMenuScene() {
  resetRun(); G.state = 'menu'; G.camBlend = 0; camSnap = true; player.z = -4.6; player.node.root.rotation.y = Math.PI;
  diaryTaken(false); granny.zOff = -9.2; granny.targetZOff = -9.2; granny.node.root.position.set(0, 0, -10.7); granny.node.root.rotation.y = 0;
  Object.assign(intro, { t: 0, grab: false, alert: false, hop: false, turn: false, faceY: Math.PI });
}
function startIntro() { G.state = 'intro'; G.camBlend = 0; intro.t = 0; intro.runStartZ = 0; U.screens('skipIntroBtn'); U.Sound.ensure(); }
function beginRun() {
  G.state = 'run'; intro.runStartZ = player.z; G.camBlend = 1; G.speed = U.BASE_SPEED; granny.zOff = granny.node.root.position.z - player.z; granny.targetZOff = -9.2;
  U.show(U.UI.skipIntroBtn, false); U.show(U.UI.hud, true); G.hintT = 3.2; if (U.UI.hint) U.UI.hint.classList.add('on');
  U.Sound.ensure(); U.Sdk.gameplayStart();
}
function skipIntro() { player.z = -0.4; player.y = 0; player.vy = 0; player.grounded = true; intro.faceY = 0; intro.turn = true; intro.grab = true; intro.alert = true; diaryTaken(true); granny.node.root.position.set(U.GRANNY_INTRO_X, 0, -3.2); beginRun(); }
function quickRestart() { resetRun(); player.z = 0; diaryTaken(true); granny.zOff = -4.5; granny.targetZOff = -9.2; granny.node.root.position.set(0, 0, -4.5); G.state = 'run'; G.camBlend = 1; camSnap = true; U.screens('hud'); G.hintT = 0; if (U.UI.hint) U.UI.hint.classList.remove('on'); U.Sound.ensure(); U.Sdk.gameplayStart(); }
function updateIntro(dt) {
  intro.t += dt; const t = intro.t, n = player.node;
  if (t < 1.1) {
    player.z = U.lerp(-4.6, -8.3, U.smooth(U.clamp(t / 1.1, 0, 1))); player.runPhase += dt * 6.5; const s = Math.sin(player.runPhase);
    n.legL.rotation.x = s * 0.55; n.legR.rotation.x = -s * 0.55; n.armL.rotation.x = -s * 0.4; n.armR.rotation.x = U.damp(n.armR.rotation.x, -0.7, 4, dt); n.inner.position.y = -0.92 + Math.abs(Math.cos(player.runPhase)) * 0.03;
  } else if (t < 2.0) {
    n.legL.rotation.x = U.damp(n.legL.rotation.x, 0, 8, dt); n.legR.rotation.x = U.damp(n.legR.rotation.x, 0, 8, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, t < 1.45 ? -1.55 : -2.4, 6, dt);
    if (!intro.grab && t >= 1.3) { intro.grab = true; diaryTaken(true); U.Sound.coin(); }
  } else {
    if (!intro.turn) { intro.turn = true; intro.faceY = 0; }
    if (!intro.hop && player.grounded) { player.vy = 4.4; player.grounded = false; intro.hop = true; U.Sound.jump(); }
    player.z += 8 * dt; n.armR.rotation.x = U.damp(n.armR.rotation.x, -0.6, 5, dt); player.runPhase += dt * 12;
    const s = Math.sin(player.runPhase); n.legL.rotation.x = s; n.legR.rotation.x = -s; n.armL.rotation.x = -s * 0.8; n.inner.position.y = -0.92 + (player.grounded ? Math.abs(Math.cos(player.runPhase)) * 0.06 : 0.02);
  }
  if (!player.grounded) { player.vy -= U.GRAVITY * dt; player.y += player.vy * dt; if (player.y <= 0) { player.y = 0; player.vy = 0; player.grounded = true; player.squash = 0.18; } }
  if (!intro.alert && t >= 1.6) { intro.alert = true; U.setYell('МОЙ ДНЕВНИК!!!'); U.Sound.growl(); }
  const gn = granny.node;
  if (intro.alert) {
    gn.armL.rotation.x = U.damp(gn.armL.rotation.x, -2.4, 6, dt); gn.armR.rotation.x = U.damp(gn.armR.rotation.x, -2.7 + Math.sin(t * 18) * 0.25, 6, dt); gn.headG.rotation.x = U.damp(gn.headG.rotation.x, -0.12, 6, dt); gn.inner.position.y = -0.92 + Math.abs(Math.sin(t * 10)) * 0.1; gn.root.position.x = U.damp(gn.root.position.x, U.GRANNY_INTRO_X, 2.5, dt);
    if (t >= 2.0) gn.root.position.z += 8.2 * dt;
  } else { gn.armL.rotation.x = U.damp(gn.armL.rotation.x, -1.25, 4, dt); gn.armR.rotation.x = U.damp(gn.armR.rotation.x, -1.45, 4, dt); gn.headG.rotation.x = U.damp(gn.headG.rotation.x, 0.42, 3, dt); gn.inner.position.y = -0.96; }
  if (t >= 3.0) beginRun();
}
function pauseRun() { if (G.state !== 'run') return; G.state = 'paused'; U.show(U.UI.pause, true); U.Sound.pauseAll(); U.Sdk.gameplayStop(); }
function resumeRun() { if (G.state !== 'paused') return; G.state = 'run'; U.show(U.UI.pause, false); U.Sound.resumeAll(); U.Sdk.gameplayStart(); }
function showOverScreen() {
  G.overShown = true; const m = Math.floor(G.dist);
  if (U.UI.overScore) U.UI.overScore.textContent = m; if (U.UI.overBottles) U.UI.overBottles.textContent = G.bottles; if (U.UI.overBest) U.UI.overBest.textContent = U.save.best;
  U.show(U.UI.newRecord, U.UI.over && U.UI.over.dataset.record === '1'); U.screens('over'); U.show(U.UI.reviveBtn, !G.reviveUsed && !!U.Sdk.ysdk);
}
function revive() {
  G.reviveUsed = true; U.screens('hud'); G.state = 'run'; ENT.clearObstacles(player.z - 6, player.z + Math.max(50, G.speed * 2.6));
  player.invuln = 2.8; player.rolling = 0; resetPose(); G.speed = Math.max(U.BASE_SPEED, G.speed * 0.7);
  granny.closeT = 0; granny.catchMode = false; granny.targetZOff = -9.2; G.shake = 0.3; U.Sdk.gameplayStart();
}

let lastScore = -1;
function updateScoreHud(force) {
  const m = Math.floor(G.dist);
  if (m !== lastScore || force) { lastScore = m; if (U.UI.score) U.UI.score.innerHTML = m + ' <small>м</small>'; }
}

let camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), smPos = new THREE.Vector3(), smLook = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
let camInit = false, camSnap = false;
function updateIntroCamera(dt) {
  const t = intro.t; let cx, cy, cz, lx, ly, lz;
  if (t < 1.6) { const p = U.smooth(U.clamp(t / 1.6, 0, 1)); cx = U.lerp(4.6, 3.6, p); cy = U.lerp(2.7, 2.2, p); cz = U.lerp(-4.4, -5.4, p); lx = 0; ly = 1.3; lz = -8.0; }
  else { const pz = player.z, runDist = Math.max(0, pz - intro.runStartZ), rise = U.smooth(U.clamp((runDist - 10) / 8, 0, 1)); cx = player.x * 0.5; cy = 2.2 + rise * 1.6 + U.clamp((pz + 3) * 0.35, 0, 1.1); cz = pz - 3.5; lx = player.x * 0.7; ly = 1.35; lz = pz + 6; }
  const f = 1 - Math.exp(-9 * dt); camPos.lerp(tmpA.set(cx, cy, cz), f); camLook.lerp(tmpB.set(lx, ly, lz), f); GFX.camera.position.copy(camPos); GFX.camera.lookAt(camLook);
  if (GFX.camera.fov !== 60) { GFX.camera.fov = 60; GFX.camera.updateProjectionMatrix(); } smPos.copy(camPos); smLook.copy(camLook); camInit = true;
}
function updateCamera(dt) {
  const px = player.x, pz = player.z, spN = U.clamp((G.speed - U.BASE_SPEED) / (U.MAX_SPEED - U.BASE_SPEED), 0, 1);
  tmpA.set(px * 0.5, 4.35 + spN * 0.25, pz - 6.9 - spN * 1.1); tmpB.set(px * 0.72, 1.55, pz + 8.5);
  if (G.state === 'over' && G.overT > 0.05) {
    const k = U.smooth(U.clamp(G.overT / 0.9, 0, 1)); tmpA.set(px + 3.2, 2.3, pz - 1.6); tmpB.set(px, 1.25, pz); G.camBlend = 1; camPos.lerp(tmpA, k); camLook.lerp(tmpB, k);
  } else { const b = U.smooth(U.clamp(G.camBlend, 0, 1)); camPos.lerpVectors(tmpC.set(3.3, 2.0, pz + 1.6), tmpA, b); camLook.lerpVectors(tmpD.set(-0.3, 1.25, pz - 2.2), tmpB, b); }
  if (!camInit || camSnap) { smPos.copy(camPos); smLook.copy(camLook); camInit = true; camSnap = false; } else { const f = 1 - Math.exp(-10 * dt); smPos.lerp(camPos, f); smLook.lerp(camLook, f); }
  GFX.camera.position.copy(smPos); GFX.camera.lookAt(smLook);
  if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 1.6); const s = G.shake * G.shake * 0.35; GFX.camera.position.x += U.rand(-s, s); GFX.camera.position.y += U.rand(-s, s); GFX.camera.position.z += U.rand(-s, s); }
  const portrait = window.innerHeight > window.innerWidth, fov = (portrait ? 68 : 58) + spN * 6; if (Math.abs(GFX.camera.fov - fov) > 0.3) { GFX.camera.fov = fov; GFX.camera.updateProjectionMatrix(); }
}

function animatePlayer(dt) {
  const n = player.node; n.root.position.set(player.x, player.y, player.z); const faceTarget = (G.state === 'run' || G.state === 'over' || G.state === 'paused') ? 0 : intro.faceY; n.root.rotation.y = U.damp(n.root.rotation.y, faceTarget, 6, dt);
  const h = Math.max(0, player.y - player.groundY); n.shadow.position.y = player.groundY - player.y + 0.02; n.shadow.scale.setScalar(U.clamp(1 - h * 0.32, 0.4, 1));
  if (G.state === 'menu') { n.legL.rotation.x = U.damp(n.legL.rotation.x, -0.06, 8, dt); n.legR.rotation.x = U.damp(n.legR.rotation.x, 0.06, 8, dt); n.armL.rotation.x = U.damp(n.armL.rotation.x, -0.18, 8, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, -0.14, 8, dt); n.inner.position.y = -0.92 + Math.sin(performance.now() / 500) * 0.02; n.pivot.rotation.x = 0; return; }
  if (G.state === 'intro') return;
  const running = G.state === 'run' && player.grounded && player.rolling <= 0;
  if (running) { player.runPhase += dt * (6 + G.speed * 0.55); const s = Math.sin(player.runPhase); n.legL.rotation.x = s * 1.05; n.legR.rotation.x = -s * 1.05; n.armL.rotation.x = -s * 0.85; n.armR.rotation.x = s * 0.85; n.inner.position.y = -0.92 + Math.abs(Math.cos(player.runPhase)) * 0.07; n.inner.rotation.z = 0; }
  else if (!player.grounded) { player.runPhase += dt * 4; n.legL.rotation.x = U.damp(n.legL.rotation.x, -1.15, 10, dt); n.legR.rotation.x = U.damp(n.legR.rotation.x, 0.45, 10, dt); n.armL.rotation.x = U.damp(n.armL.rotation.x, -2.4, 8, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, -2.4, 8, dt); }
  if (player.rolling > 0) { player.rolling -= dt; const k = 1 - U.clamp(player.rolling / U.ROLL_TIME, 0, 1); n.pivot.rotation.x = -Math.PI * 2 * k; if (player.rolling <= 0) { player.rolling = 0; n.pivot.rotation.x = 0; } }
  else if (player.grounded) { n.pivot.rotation.x = 0; }
  if (player.squash > 0) { player.squash -= dt; const k = U.clamp(player.squash / 0.18, 0, 1); n.inner.scale.y = 1 - 0.22 * Math.sin(k * Math.PI); if (player.squash <= 0) n.inner.scale.y = 1; }
  if (G.state !== 'over') { const laneX = U.LANES[player.lane]; n.root.rotation.z = U.clamp(-(laneX - player.x) * 0.14, -0.3, 0.3); }
  n.inner.visible = player.invuln > 0 ? (Math.floor(performance.now() / 90) % 2 === 0) : true;
}
function animateGranny(dt) {
  const n = granny.node; granny.zOff = U.damp(granny.zOff, granny.targetZOff, 2.4, dt);
  if (G.state === 'menu' || G.state === 'intro') { n.armL.rotation.x = U.damp(n.armL.rotation.x, -1.3, 4, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, -1.7, 4, dt); n.inner.position.y = -0.96; n.headG.rotation.x = 0; return; }
  if (G.state === 'over') { n.root.position.x = U.damp(n.root.position.x, player.x, 3, dt); n.root.position.z = U.damp(n.root.position.z, player.z - 0.85, 5, dt); } else { n.root.position.x = U.damp(n.root.position.x, player.x, 2, dt); n.root.position.z = player.z + granny.zOff; }
  n.root.rotation.y = 0; granny.phase += dt * (G.state === 'over' ? 4 : 7 + G.speed * 0.5); const s = Math.sin(granny.phase);
  if (granny.catchMode) { n.armL.rotation.x = U.damp(n.armL.rotation.x, -2.5, 6, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, -2.7, 6, dt); n.headG.rotation.x = 0.15; n.inner.position.y = -0.92 + Math.abs(Math.cos(granny.phase)) * 0.06; }
  else { n.armL.rotation.x = -s * 0.7; n.armR.rotation.x = -1.9 + Math.sin(granny.phase * 0.7) * 0.35; n.headG.rotation.x = 0; n.inner.position.y = -0.92 + Math.abs(Math.cos(granny.phase)) * 0.1; n.inner.rotation.z = s * 0.04; }
}

let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop); const dt = U.clamp((t - lastT) / 1000, 0, 0.05); lastT = t;
  if (G.state === 'loading') return;
  if (G.state === 'paused') { GFX.renderer.render(GFX.scene, GFX.camera); return; }
  if (G.state === 'shop') { SHOP.update(dt); GFX.renderer.render(GFX.scene, GFX.camera); return; }
  if (G.state === 'run') {
    G.speed = Math.min(U.MAX_SPEED, G.speed + U.ACCEL * dt); G.runTime += dt; G.dist += G.speed * dt; player.z += G.speed * dt; player.x = U.damp(player.x, U.LANES[player.lane], 11, dt);
    player.groundY = getGroundY();
    if (player.y > player.groundY || player.vy > 0) {
      player.grounded = false; player.vy -= U.GRAVITY * dt; player.y += player.vy * dt;
      if (player.y <= player.groundY && player.vy < 0) { player.y = player.groundY; player.vy = 0; player.grounded = true; player.squash = 0.18; U.Sound.land(); ENT.burst(player.x, player.groundY + 0.08, player.z, '#c9c2b4', 3, 1.4); }
    } else { player.y = player.groundY; player.grounded = true; }
    if (player.invuln > 0) player.invuln -= dt; if (granny.closeT > 0) { granny.closeT -= dt; if (granny.closeT <= 0) granny.targetZOff = -9.2; }
    const pcy = player.y + 0.95;
    for (let i = ENT.activeCoins.length - 1; i >= 0; i--) {
      const c = ENT.activeCoins[i]; if (c.z < player.z - U.DESPAWN_BEHIND) { ENT.releaseCoin(i); continue; }
      if (Math.abs(player.z - c.z) < 0.95 && Math.abs(player.x - c.x) < 0.8 && Math.abs(pcy - c.y) < 1.2) { G.bottles++; if (U.UI.bottleNum) U.UI.bottleNum.textContent = G.bottles; U.Sound.coin(); ENT.burst(c.x, c.y, c.z, '#ffe36e', 3, 1.8); ENT.releaseCoin(i); }
    }
    updateCollisions(); LVL.fillSpawns(); updateScoreHud();
    for (const seg of segments) { if (seg.position.z + U.SEG_LEN / 2 < player.z - 16) { seg.position.z += U.SEG_LEN * U.SEG_COUNT; GFX.randomizeSegmentDecor(seg); } }
    const bobT = t / 300; for (const c of ENT.activeCoins) { c.sprite.position.y = c.y + Math.sin(bobT + c.sprite.userData.phase) * 0.09; }
    if (G.hintT > 0) { G.hintT -= dt; if (G.hintT <= 0 && U.UI.hint) U.UI.hint.classList.remove('on'); }
    G.camBlend = Math.min(1, G.camBlend + dt * 1.6);
  } else if (G.state === 'over') {
    G.overT += dt; G.speed = Math.max(0, G.speed - 30 * dt); player.z += G.speed * dt;
    if (player.y > player.groundY) { player.vy -= U.GRAVITY * dt; player.y = Math.max(player.groundY, player.y + player.vy * dt); if (player.y <= player.groundY) { player.vy = 0; player.grounded = true; } }
    player.node.root.rotation.z = Math.sin(G.overT * 9) * 0.16 * Math.max(0, 1 - G.overT); player.node.inner.rotation.x = U.damp(player.node.inner.rotation.x, -0.35, 4, dt);
    if (G.overT > 1.15 && !G.overShown) showOverScreen();
  } else if (G.state === 'menu') { G.camBlend = Math.max(0, G.camBlend - dt * 1.6); } else if (G.state === 'intro') { updateIntro(dt); }
  animatePlayer(dt); if (G.state !== 'intro') animateGranny(dt); ENT.updateParticles(dt);
  if (G.state === 'intro') updateIntroCamera(dt); else updateCamera(dt);
  GFX.renderer.render(GFX.scene, GFX.camera);
}

function bindInput() {
  window.addEventListener('pointerdown', () => U.Sound.ensure());
  window.addEventListener('keydown', (e) => {
    const c = e.code; if (c === 'Space' || c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight') e.preventDefault();
    if (e.repeat || U.adBusy) return;
    if (G.state === 'intro') { if (!e.ctrlKey && !e.metaKey && !e.altKey) skipIntro(); return; }
    switch (c) {
      case 'ArrowLeft': case 'KeyA': move(1); break; case 'ArrowRight': case 'KeyD': move(-1); break;
      case 'ArrowUp': case 'KeyW': case 'Space': jump(); break; case 'ArrowDown': case 'KeyS': roll(); break;
      case 'Escape': case 'KeyP': if (G.state === 'run') pauseRun(); else if (G.state === 'paused') resumeRun(); else if (G.state === 'shop') exitShop(); break;
      case 'Enter': if (G.state === 'menu') startIntro(); else if (G.state === 'over' && G.overShown) U.maybeInterstitial(quickRestart); break;
    }
  });
  const gameEl = U.UI.game;
  if (gameEl) {
    gameEl.style.touchAction = 'none'; let ts = null;
    gameEl.addEventListener('pointerdown', (e) => { U.Sound.ensure(); if (U.adBusy) return; if (G.state === 'intro') { skipIntro(); return; } if (G.state !== 'run') return; ts = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), used: false }; try { gameEl.setPointerCapture(e.pointerId); } catch (err) {} });
    gameEl.addEventListener('pointermove', (e) => { if (!ts || ts.used || e.pointerId !== ts.id || G.state !== 'run') return; const dx = e.clientX - ts.x, dy = e.clientY - ts.y; if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return; ts.used = true; if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? -1 : 1); else if (dy < 0) jump(); else roll(); });
    gameEl.addEventListener('pointerup', (e) => { if (!ts || e.pointerId !== ts.id) return; if (!ts.used && G.state === 'run' && performance.now() - ts.t < 260) jump(); ts = null; });
    gameEl.addEventListener('pointercancel', (e) => { if (ts && e.pointerId === ts.id) ts = null; });
  }
  window.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'intro') skipIntro(); if (G.state === 'run') pauseRun(); } });
  const on = (id, fn) => { const el = U.$(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (U.adBusy) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  on('playBtn', act(() => { if (G.state === 'menu') startIntro(); })); on('skipIntroBtn', act(() => { if (G.state === 'intro') skipIntro(); }));
  on('shopBtn', act(openShop));
  on('pauseBtn', act(() => pauseRun())); on('resumeBtn', act(() => resumeRun()));
  on('restartBtn', act(() => { if (G.state !== 'paused') return; U.show(U.UI.pause, false); U.Sound.resumeAll(); U.maybeInterstitial(quickRestart); }));
  on('pauseMenuBtn', act(() => { if (G.state !== 'paused') return; U.Sound.resumeAll(); U.show(U.UI.pause, false); U.maybeInterstitial(showMenu); }));
  on('againBtn', act(() => { if (G.state === 'over' && G.overShown) U.maybeInterstitial(quickRestart); })); on('overMenuBtn', act(() => { if (G.state === 'over' && G.overShown) U.maybeInterstitial(showMenu); }));
  on('reviveBtn', act(() => { if (G.state !== 'over' || G.reviveUsed) return; U.show(U.UI.reviveBtn, false); U.showRewarded(revive, () => { if (G.state === 'over') U.show(U.UI.reviveBtn, true); }); }));
  const toggle = key => () => { U.save[key] = U.save[key] ? 0 : 1; U.syncToggleUI(); U.Sound.applyToggles(); U.persistSave(); U.Sound.click(); };
  on('musicBtn', toggle('music')); on('soundBtn', toggle('sound'));
}

let initStarted = false;
function init() {
  if (initStarted) return; initStarted = true; U.cacheUI();
  GFX.initGraphics(U.UI.game); GFX.buildEnvTextures();
  for (let i = 0; i < U.SEG_COUNT; i++) { const seg = GFX.buildSegment(i); segments.push(seg); GFX.scene.add(seg); }
  player.node = ENT.buildMel(SK.selectedId()); GFX.scene.add(player.node.root);
  granny.node = ENT.buildGranny(); GFX.scene.add(granny.node.root);
  deskScene = ENT.buildClassroom(); GFX.scene.add(deskScene.group);
  ENT.initParticles();
  const bottleUrl = (typeof ASSETS !== 'undefined' && ASSETS && ASSETS.bottle) ? ASSETS.bottle : null;
  if (bottleUrl) { for (const id of ['bottleIcon', 'menuBottleIcon', 'overBottleIcon', 'menuCurIcon', 'shopCurIcon', 'shopModalIcon']) { const im = U.$(id); if (im) im.src = bottleUrl; } }
  if (U.UI.hint) U.UI.hint.innerHTML = '<span>⬅️➡️ полосы</span><span>⬆️ прыжок</span><span>⬇️ подкат</span>';
  SHOP.initShop({ setPreviewSkin: applyPlayerSkin, getPlayerNode: () => player.node, getGrannyNode: () => granny.node, exitToMenu: exitShop });
  bindInput(); setupMenuScene(); requestAnimationFrame(loop);
  const t0 = performance.now();
  setTimeout(() => { U.show(U.UI.loading, false); showMenu(); U.Sdk.loadingReady(); }, Math.max(0, 500 - (performance.now() - t0)));
}

U.readLocalSave(); U.syncToggleUI();
function boot() {
  if (typeof THREE === 'undefined') { const lt = U.$('loadingText'); if (lt) lt.textContent = 'Ошибка: не загружен three.js'; return; }
  Promise.all([GFX.loadTextures(), U.withTimeout(U.Sdk.init(), 8000)]).then(() => U.withTimeout(U.Sdk.loadCloud(), 5000)).then(() => { U.syncToggleUI(); init(); }).catch(err => { console.error(err); try { init(); } catch (e) { console.error(e); const lt = U.$('loadingText'); if (lt) lt.textContent = 'Ошибка загрузки :('; } });
}
boot();