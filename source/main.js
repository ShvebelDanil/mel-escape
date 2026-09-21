import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as ENT from './entities.js';
import * as LVL from './level.js';
import * as SK from './skins.js';
import * as PT from './pets.js';
import * as SHOP from './shop.js';
import * as QST from './quests.js';
import * as AUD from './audio.js';
import * as TEX from './textures.js';
import * as ADR from './adreward.js';
import * as PWR from './powerups.js';
import * as RLT from './roulette.js';
import * as I18N from './i18n.js';

const COMBO_WINDOW = 1.3;
// bankedDist/runBanked — близнецы bankedBottles для системы заданий: метры и сам факт забега
// записываются в сейв ровно один раз, даже если caught() случился дважды (смерть → ревайв → смерть).
export const G = { state: 'loading', speed: U.BASE_SPEED, dist: 0, runTime: 0, bottles: 0, bankedBottles: 0, bankedDist: 0, runBanked: false, nextZ: 0, camBlend: 0, shake: 0, overT: 0, overShown: false, reviveCount: 0, combo: 0, comboT: 0 };
export const player = { node: null, lane: 1, x: 0, y: 0, z: 0, vy: 0, grounded: true, groundY: 0, rolling: 0, invuln: 0, runPhase: 0, squash: 0, spinDir: 0, spinT: 0, spinDur: U.ROLL_TIME };
export const granny = { node: null, zOff: -9.2, targetZOff: -9.2, closeT: 0, phase: 0, catchMode: false };
export const pet = { node: null, id: '', x: 0, y: 0, z: 0, vy: 0, grounded: true, rolling: 0, lane: 1, phase: 0, headingY: 0, voiceT: 0 };
export const intro = { t: 0, faceY: Math.PI, grab: false, alert: false, hop: false, turn: false, runStartZ: 0 };

let deskScene = null, segments = [];
// Ключи, а не готовые фразы: текст берётся из словаря в момент выкрика, поэтому
// уточнение языка от SDK (оно приходит позже загрузки модуля) сразу попадает в игру.
const YELL_KEYS = ['yell.1', 'yell.2', 'yell.3', 'yell.4', 'yell.5', 'yell.6'];
const PET_GAP_Z = 2.4; // безопасный отступ питомца позади игрока по Z — исключает визуальное слияние моделей на любой скорости/манёвре
const PET_FOLLOW_X = 8; // скорость догона питомца до ряда игрока
const PET_MENU_X = 0.75, PET_MENU_Z = -0.7; // смещение питомца рядом с Мэлом в сцене главного меню (подобрано визуально: не перекрывает Мэла и кнопки)
const PET_JUMP_T = 2 * U.JUMP_V / U.GRAVITY; // время полёта прыжка — та же физика, что и у игрока
const PET_JUMP_APEX = (U.JUMP_V * U.JUMP_V) / (2 * U.GRAVITY); // макс. высота прыжка питомца
const TAU = Math.PI * 2, HALF_PI = Math.PI / 2;
const PET_VOICE_MIN = 8, PET_VOICE_MAX = 14; // разброс паузы между репликами питомца на бегу
const FLIP_K = 0.78; // доля полёта, за которую проходит оборот: заметно короче — успеваем раскрыться и приземлиться в ровную стойку
const FLIP_CHANCE = 0.5; // сальто вперёд + сальто назад суммарно равны обычному прыжку (25% / 25% / 50%)
const REVIVE_MAX = 3; // сколько раз за один забег можно воскреснуть за пузырики
const REVIVE_COST_BASE = 100, REVIVE_COST_STEP = 100; // цена растёт на STEP за каждое воскрешение, сбрасывается в resetRun()
const reviveCost = () => REVIVE_COST_BASE + G.reviveCount * REVIVE_COST_STEP;

function move(dir) {
  if (G.state !== 'run') return;
  const nl = U.clamp(player.lane + dir, 0, 2);
  if (nl !== player.lane) { player.lane = nl; U.Sound.lane(); }
}
// Сила прыжка не константа: сапоги-бурмалды (source/powerups.js) поднимают её так, что
// apex вырастает с 1.45 до ~3.1 м. Время полёта и окно трюка считаются от ТЕКУЩЕЙ силы,
// иначе сальто крутилось бы по физике обычного прыжка.
function jumpV() { return PWR.active.boots > 0 ? PWR.BOOTS_JUMP_V : U.JUMP_V; }
const jumpT = jv => 2 * jv / U.GRAVITY;
function jump() {
  if (G.state !== 'run' || !player.grounded) return;
  const jv = jumpV(), jt = jumpT(jv);
  player.vy = jv; player.grounded = false; player.rolling = 0;
  const dir = trickDir(jv, jt);
  // flip() и jump() делят один и тот же пул семплов ('action') — раньше вызывались
  // ОБА на трюковый прыжок и звук слышался дважды подряд. Теперь ровно один вызов на прыжок.
  if (dir) { startSpin(dir, jt * FLIP_K); U.Sound.flip(); ENT.burst(player.x, player.y + 0.9, player.z, '#ffe9a8', 4, 2); }
  else { if (player.spinDir) { player.spinDir = 0; player.node.pivot.rotation.x = 0; } U.Sound.jump(); }
  if (jv > U.JUMP_V) ENT.burst(player.x, player.groundY + 0.08, player.z, '#c5e1a5', 5, 2.6);   // пыль от толчка сапог
}
function roll() {
  if (G.state !== 'run') return;
  if (player.grounded && player.rolling <= 0) { player.rolling = U.ROLL_TIME; startSpin(1, U.ROLL_TIME); U.Sound.roll(); ENT.burst(player.x, player.groundY + 0.1, player.z, '#b8a58c', 4, 1.6); }
  else if (!player.grounded) { player.vy = Math.min(player.vy, -4); player.rolling = U.ROLL_TIME; if (!player.spinDir) startSpin(1, U.ROLL_TIME); }
}
// Особый прыжок доступен только «осмысленному» прыжку: с платформы (парта, тележка)
// или через препятствие в своём ряду, до которого игрок реально долетит.
// Геометрия берётся из уже существующих полей препятствия (y0/y1 из OB_DEFS), отдельной таблицы типов нет.
function trickJump(jv, jt) {
  if (player.groundY > 0.01) return true; // спрыгиваем с парты/тележки
  for (const o of ENT.activeObstacles) {
    const dz = o.z - player.z;
    if (dz <= 0 || o.y0 > 0.01) continue; // позади или висит над головой (это подкат, а не перепрыгивание)
    if (nearestLane(o.x) !== player.lane) continue;
    const t = dz / Math.max(1, G.speed); // момент, когда игрок поравняется с препятствием
    if (t > jt) continue; // за этот прыжок не долетит
    const h = jv * t - 0.5 * U.GRAVITY * t * t; // высота в этот момент — та же физика, что и в loop()
    if (h >= o.y1 - U.PLATFORM_TOL) return true; // траектория реально проходит поверх препятствия
  }
  return false;
}
// 0 — обычный прыжок, 1 — сальто вперёд, -1 — сальто назад.
function trickDir(jv, jt) {
  if (!trickJump(jv, jt)) return 0;
  const r = Math.random();
  return r < FLIP_CHANCE * 0.5 ? 1 : (r < FLIP_CHANCE ? -1 : 0);
}
function startSpin(dir, dur) { player.spinDir = dir; player.spinT = dur; player.spinDur = dur; }
function nearestLane(x) { let best = 0, bd = 1e9; for (let i = 0; i < 3; i++) { const d = Math.abs(x - U.LANES[i]); if (d < bd) { bd = d; best = i; } } return best; }

const hitsXZ = o => Math.abs(player.z - o.z) <= o.hz + U.HIT_Z && Math.abs(player.x - o.x) <= o.hw + U.HIT_W;
function updateCollisions() {
  const rolling = player.rolling > 0; const py1 = player.y + (rolling ? 0.80 : 1.86);
  // Сапоги забрасывают игрока на 3.1 м — прямо в подкатные препятствия, которые висят в воздухе
  // (баннер 1.05–2.95, доска, лестница). Пока он в прыжке, такие препятствия его не трогают:
  // иначе собственный бафф убивал бы игрока там, где раньше он спокойно подкатывался.
  // На земле подкат работает как прежде.
  const airSafe = PWR.active.boots > 0 && !player.grounded;
  for (let i = ENT.activeObstacles.length - 1; i >= 0; i--) {
    const o = ENT.activeObstacles[i]; if (o.z < player.z - U.DESPAWN_BEHIND) { ENT.releaseObstacle(i); continue; }
    if (airSafe && o.y0 > 0.01) continue;
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
  // Рык бабки на столкновении убран по просьбе — раньше синтезированный growl() наслаивался
  // поверх кастомного звука hit, когда growl.mp3 ещё не добавлен. Сам звук растрёпы (hit) остаётся.
  U.Sound.stumble(); U.replayCss(U.UI.flash); U.setYell(I18N.t(U.pick(YELL_KEYS))); ENT.burst(player.x, player.y + 1, player.z, '#ffd94a', 5, 2.2);
}
function caught() {
  G.state = 'over'; G.overT = 0; G.overShown = false; granny.catchMode = true; granny.targetZOff = -0.85; G.shake = 0.8;
  U.Sound.crash(); U.replayCss(U.UI.flash); ENT.burst(player.x, player.y + 1.2, player.z, '#b0451f', 8, 3);
  U.Sdk.gameplayStop(); const m = Math.floor(G.dist); const isRecord = m > U.save.best;
  if (isRecord) U.save.best = m;
  const gained = G.bottles - G.bankedBottles; U.save.bottles += gained; U.save.currency += gained; G.bankedBottles = G.bottles;
  U.save.totalDist += m - G.bankedDist; G.bankedDist = m;
  if (!G.runBanked) { G.runBanked = true; U.save.runs++; }
  U.persistSave(); if (U.UI.over) U.UI.over.dataset.record = isRecord ? '1' : '0';
  syncQuests(); // прогресс уже в сейве — live-прибавка обнуляется тут же
}

// Мост между забегом и quests.js: отдаёт ещё не записанный в сейв прогресс текущего забега
// и сразу проверяет задания. Дёргается на смене метра и на сборе пузырика — временных
// объектов не создаёт, тяжёлая работа внутри check() идёт только в момент выполнения задания.
function syncQuests() { QST.setLive(Math.floor(G.dist) - G.bankedDist, G.bottles - G.bankedBottles); return QST.check(); }

function updateMenuStats() { if (U.UI.menuBest) U.UI.menuBest.textContent = U.save.best; if (U.UI.menuBottles) U.UI.menuBottles.textContent = U.save.bottles; SHOP.refreshCurrency(); }
// QST.check() перед updateMenuStats(): покупка скина/питомца могла закрыть задание,
// награда должна попасть в плашку валюты тем же кадром, что и само меню.
function showMenu() { setupMenuScene(); QST.closeAll(); QST.check(); U.screens('menu'); updateMenuStats(); U.Sdk.gameplayStop(); U.Sound.setMusic('menu'); }
function openShop() { if (G.state !== 'menu') return; QST.closeAll(); G.state = 'shop'; SHOP.open(); }
function exitShop() { if (G.state !== 'shop') return; SHOP.close(); showMenu(); }
function applyPlayerSkin(id, dark) {
  const next = ENT.buildMel(id, dark); if (next === player.node) return;
  const old = player.node;
  if (old) { GFX.scene.remove(old.root); next.diary.visible = old.diary.visible; }
  player.node = next; GFX.scene.add(next.root);
}
function applyPlayerPet(id) {
  pet.id = id; // нужен для голоса питомца даже когда нода не меняется ('none')
  const next = PT.buildPetNode(id); if (next === pet.node) return;
  if (pet.node) GFX.scene.remove(pet.node.root);
  pet.node = next;
  if (next) GFX.scene.add(next.root);
}
function syncPetBehindPlayer() {
  pet.lane = player.lane; pet.x = U.LANES[pet.lane]; pet.z = player.z - PET_GAP_Z; pet.y = 0; pet.vy = 0; pet.grounded = true; pet.rolling = 0; pet.phase = 0; pet.headingY = 0;
  pet.voiceT = U.rand(PET_VOICE_MIN * 0.75, PET_VOICE_MAX * 0.75); // первая реплика не сразу на старте
  if (pet.node) {
    pet.node.root.position.set(pet.x, 0, pet.z); pet.node.root.rotation.y = 0; pet.node.root.scale.setScalar(1); pet.node.root.visible = true;
    pet.node.bob.position.y = 0; pet.node.bob.scale.set(1, 1, 1);
  }
}
// Питомец повторяет только ряд игрока (player.lane); препятствия в этом ряду
// проходит САМ — ищет ближайшее впереди и по его геометрии (OB_DEFS через
// ENT.activeObstacles, без отдельной таблицы типов) решает прыгнуть или подкатиться,
// той же физикой, что и игрок (U.JUMP_V/GRAVITY/ROLL_TIME).
function updatePet(dt) {
  const n = pet.node; if (!n) return;
  if (G.state === 'run') {
    pet.lane = player.lane;
    pet.voiceT -= dt;
    if (pet.voiceT <= 0) { pet.voiceT = U.rand(PET_VOICE_MIN, PET_VOICE_MAX); U.Sound.petVoice(pet.id); }
  }
  const targetX = U.LANES[pet.lane];
  pet.x = U.damp(pet.x, targetX, PET_FOLLOW_X, dt);
  pet.z = player.z - PET_GAP_Z;
  pet.headingY = U.damp(pet.headingY, U.clamp(-(targetX - pet.x) * 1.6, -0.5, 0.5), 6, dt);

  if (G.state === 'run' && pet.grounded && pet.rolling <= 0) {
    let target = null, bestZ = Infinity;
    for (const o of ENT.activeObstacles) {
      if (o.petHandled || o.z <= pet.z) continue;
      if (nearestLane(o.x) !== pet.lane) continue;
      if (o.z < bestZ) { bestZ = o.z; target = o; }
    }
    if (target) {
      const tReach = (target.z - pet.z) / Math.max(1, G.speed);
      if (target.y1 <= PET_JUMP_APEX + U.PLATFORM_TOL && tReach <= PET_JUMP_T / 2) { pet.vy = U.JUMP_V; pet.grounded = false; target.petHandled = true; }
      else if (target.y0 >= 0.76 && tReach <= U.ROLL_TIME / 2) { pet.rolling = U.ROLL_TIME; target.petHandled = true; }
    }
  }
  // гравитация/подкат резолвятся всегда (не только в 'run'), чтобы после смерти игрока
  // питомец корректно долетел/докатился, а не завис в воздухе
  if (!pet.grounded) { pet.vy -= U.GRAVITY * dt; pet.y += pet.vy * dt; if (pet.y <= 0) { pet.y = 0; pet.vy = 0; pet.grounded = true; } }
  if (pet.rolling > 0) { pet.rolling -= dt; if (pet.rolling <= 0) pet.rolling = 0; }

  n.root.position.set(pet.x, pet.y, pet.z);
  n.root.rotation.y = pet.headingY;
  pet.phase += dt * (6 + G.speed * 0.5);
  const bounce = pet.grounded ? Math.abs(Math.sin(pet.phase)) * 0.09 : 0;
  n.bob.position.y = bounce;
  n.tailPivot.rotation.y = Math.sin(pet.phase * 0.6) * 0.3;
  const duckK = pet.rolling > 0 ? Math.sin((1 - pet.rolling / U.ROLL_TIME) * Math.PI) : 0;
  n.bob.scale.y = 1 - duckK * 0.45;
  n.shadow.position.y = -pet.y + 0.02;
  n.shadow.scale.setScalar(U.clamp(1 - pet.y * 0.32 - bounce * 1.2, 0.4, 1));
}
function animatePetMenuIdle(dt) {
  const n = pet.node; if (!n) return;
  pet.phase += dt * 3;
  n.bob.position.y = Math.sin(pet.phase) * 0.03;
  n.tailPivot.rotation.y = Math.sin(pet.phase * 0.5) * 0.25;
}
function diaryTaken(on) { deskScene.diary.visible = !on; player.node.diary.visible = on; }
function showCombo() {
  G.combo++; G.comboT = COMBO_WINDOW;
  const el = U.UI.comboText; if (!el) return;
  const span = el.querySelector('span'); if (span) span.textContent = '×' + G.combo;
  el.style.transform = `translate(${U.rand(-16, 16).toFixed(0)}px, ${U.rand(-12, 12).toFixed(0)}px)`;
  U.replayCss(el);
}
function resetPose() { const n = player.node; n.pivot.rotation.x = 0; n.inner.rotation.set(0, 0, 0); n.root.rotation.set(0, 0, 0); n.headG.rotation.x = 0; n.inner.visible = true; player.spinDir = 0; player.spinT = 0; }
function resetRun() {
  GFX.rollRunPics();      // вид за окном разыгрывается на забег — до перегенерации декора ниже
  for (let i = ENT.activeObstacles.length - 1; i >= 0; i--) ENT.releaseObstacle(i);
  ENT.resetPending();
  for (let i = ENT.activeCoins.length - 1; i >= 0; i--) ENT.releaseCoin(i);
  segments.forEach((seg, i) => { seg.position.z = i * U.SEG_LEN; seg.updateMatrix(); GFX.randomizeSegmentDecor(seg, i === 0 ? U.CLASS_Z0 + 3 : undefined); });
  player.lane = 1; player.x = 0; player.y = 0; player.vy = 0; player.z = 0; player.groundY = 0; player.grounded = true; player.rolling = 0; player.invuln = 0; player.squash = 0;
  resetPose(); player.node.inner.scale.set(1, 1, 1); player.node.inner.position.y = -0.92;
  G.speed = U.BASE_SPEED; G.dist = 0; G.runTime = 0; G.bottles = 0; G.bankedBottles = 0; G.bankedDist = 0; G.runBanked = false; G.nextZ = 42; G.reviveCount = 0; G.overShown = false; G.shake = 0;
  granny.closeT = 0; granny.catchMode = false;
  G.combo = 0; G.comboT = 0; if (U.UI.comboText) U.UI.comboText.classList.remove('on'); GFX.resetResolution();
  PWR.reset();   // баффы и пикапы живут только внутри забега
  if (U.UI.bottleNum) U.UI.bottleNum.textContent = '0'; updateScoreHud(true);
  LVL.resetDirector(); LVL.fillSpawns();
}
function setupMenuScene() {
  resetRun(); G.state = 'menu'; G.camBlend = 0; camSnap = true; player.z = -4.6; player.node.root.rotation.y = Math.PI;
  diaryTaken(false); granny.zOff = -9.2; granny.targetZOff = -9.2; granny.node.root.position.set(0, 0, -10.7); granny.node.root.rotation.y = 0;
  if (pet.node) {
    pet.y = 0; pet.vy = 0; pet.grounded = true; pet.rolling = 0; pet.headingY = 0; pet.lane = player.lane;
    pet.x = player.x + PET_MENU_X; pet.z = player.z + PET_MENU_Z;
    pet.node.root.position.set(pet.x, 0, pet.z); pet.node.root.rotation.y = Math.PI; pet.node.root.scale.setScalar(1); pet.node.root.visible = true;
    pet.node.bob.position.y = 0; pet.node.bob.scale.set(1, 1, 1);
  }
  Object.assign(intro, { t: 0, grab: false, alert: false, hop: false, turn: false, faceY: Math.PI });
}
function startIntro() { G.state = 'intro'; G.camBlend = 0; intro.t = 0; intro.runStartZ = 0; QST.closeAll(); U.screens('skipIntroBtn'); U.Sound.ensure(); U.Sound.setMusic('run'); }
function beginRun() {
  G.state = 'run'; intro.runStartZ = player.z; G.camBlend = 1; G.speed = U.BASE_SPEED; granny.zOff = granny.node.root.position.z - player.z; granny.targetZOff = -9.2;
  syncPetBehindPlayer();
  U.show(U.UI.skipIntroBtn, false); U.show(U.UI.hud, true);
  U.Sound.ensure(); U.Sdk.gameplayStart();
}
function skipIntro() { player.z = -0.4; player.y = 0; player.vy = 0; player.grounded = true; intro.faceY = 0; intro.turn = true; intro.grab = true; intro.alert = true; diaryTaken(true); granny.node.root.position.set(U.GRANNY_INTRO_X, 0, -3.2); beginRun(); }
function quickRestart() { QST.closeAll(); resetRun(); player.z = 0; diaryTaken(true); granny.zOff = -4.5; granny.targetZOff = -9.2; granny.node.root.position.set(0, 0, -4.5); G.state = 'run'; G.camBlend = 1; camSnap = true; syncPetBehindPlayer(); U.screens('hud'); U.Sound.ensure(); U.Sound.setMusic('run'); U.Sdk.gameplayStart(); }
function updateIntro(dt) {
  intro.t += dt; const t = intro.t, n = player.node;
  if (t < 1.1) {
    player.z = U.lerp(-4.6, -8.3, U.smooth(U.clamp(t / 1.1, 0, 1))); player.runPhase += dt * 6.5; const s = Math.sin(player.runPhase);
    n.legL.rotation.x = s * 0.55; n.legR.rotation.x = -s * 0.55; n.armL.rotation.x = -s * 0.4; n.armR.rotation.x = U.damp(n.armR.rotation.x, -0.7, 4, dt); n.inner.position.y = -0.92 + Math.abs(Math.cos(player.runPhase)) * 0.03;
  } else if (t < 2.0) {
    n.legL.rotation.x = U.damp(n.legL.rotation.x, 0, 8, dt); n.legR.rotation.x = U.damp(n.legR.rotation.x, 0, 8, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, t < 1.45 ? -1.55 : -2.4, 6, dt);
    if (!intro.grab && t >= 1.3) { intro.grab = true; diaryTaken(true); U.Sound.book(); }
  } else {
    if (!intro.turn) { intro.turn = true; intro.faceY = 0; }
    if (!intro.hop && player.grounded) { player.vy = 4.4; player.grounded = false; intro.hop = true; U.Sound.jump(); }
    player.z += 8 * dt; n.armR.rotation.x = U.damp(n.armR.rotation.x, -0.6, 5, dt); player.runPhase += dt * 12;
    const s = Math.sin(player.runPhase); n.legL.rotation.x = s; n.legR.rotation.x = -s; n.armL.rotation.x = -s * 0.8; n.inner.position.y = -0.92 + (player.grounded ? Math.abs(Math.cos(player.runPhase)) * 0.06 : 0.02);
  }
  if (!player.grounded) { player.vy -= U.GRAVITY * dt; player.y += player.vy * dt; if (player.y <= 0) { player.y = 0; player.vy = 0; player.grounded = true; player.squash = 0.18; } }
  if (!intro.alert && t >= 1.6) { intro.alert = true; U.setYell(I18N.t('yell.intro')); U.Sound.growl(); }
  const gn = granny.node;
  if (intro.alert) {
    gn.armL.rotation.x = U.damp(gn.armL.rotation.x, -2.4, 6, dt); gn.armR.rotation.x = U.damp(gn.armR.rotation.x, -2.7 + Math.sin(t * 18) * 0.25, 6, dt); gn.headG.rotation.x = U.damp(gn.headG.rotation.x, -0.12, 6, dt); gn.inner.position.y = -0.92 + Math.abs(Math.sin(t * 10)) * 0.1; gn.root.position.x = U.damp(gn.root.position.x, U.GRANNY_INTRO_X, 2.5, dt);
    if (t >= 2.0) gn.root.position.z += 8.2 * dt;
  } else { gn.armL.rotation.x = U.damp(gn.armL.rotation.x, -1.25, 4, dt); gn.armR.rotation.x = U.damp(gn.armR.rotation.x, -1.45, 4, dt); gn.headG.rotation.x = U.damp(gn.headG.rotation.x, 0.42, 3, dt); gn.inner.position.y = -0.96; }
  if (t >= 3.0) beginRun();
}
let pausedW = -1, pausedH = -1; // размер холста на последнем отрисованном кадре паузы (см. loop)
function pauseRun() { if (G.state !== 'run') return; G.state = 'paused'; pausedW = -1; U.show(U.UI.pause, true); U.Sound.pauseAll(); U.Sdk.gameplayStop(); }
function resumeRun() { if (G.state !== 'paused') return; QST.closeAll(); G.state = 'run'; U.show(U.UI.pause, false); U.Sound.resumeAll(); U.Sdk.gameplayStart(); }
function showOverScreen() {
  G.overShown = true; const m = Math.floor(G.dist);
  if (U.UI.overScore) U.UI.overScore.textContent = m; if (U.UI.overBottles) U.UI.overBottles.textContent = G.bottles;
  U.show(U.UI.newRecord, U.UI.over && U.UI.over.dataset.record === '1'); U.screens('over');
  const canRevive = G.reviveCount < REVIVE_MAX;
  U.show(U.UI.reviveBtn, canRevive);
  if (canRevive) {
    if (U.UI.reviveCost) U.UI.reviveCost.textContent = reviveCost();
    if (U.UI.reviveBtn) U.UI.reviveBtn.classList.toggle('locked', U.save.currency < reviveCost());
  }
}
// Воскрешение за пузырики: оплата и лимит проверены в биндинге 'reviveBtn', здесь только
// сам возврат в забег — очистка ближайших к игроку паттернов (препятствия, пузырики И
// паверапы — иначе игрок может ожить внутри объекта, который сам не убивает, но выглядит багом),
// чтобы не влететь в то, от чего он только что умер, и короткая неуязвимость на случай, если рядом ещё что-то есть.
function revive() {
  G.reviveCount++; U.screens('hud'); G.state = 'run';
  const z0 = player.z - 6, z1 = player.z + Math.max(50, G.speed * 2.6);
  ENT.clearObstacles(z0, z1); ENT.clearCoins(z0, z1); PWR.clearRange(z0, z1);
  player.invuln = 2.8; player.rolling = 0; resetPose(); G.speed = Math.max(U.BASE_SPEED, G.speed * 0.7);
  granny.closeT = 0; granny.catchMode = false; granny.targetZOff = -9.2; G.shake = 0.3; U.Sdk.gameplayStart();
  pet.y = 0; pet.vy = 0; pet.grounded = true; pet.rolling = 0;
}

let lastScore = -1, scoreNum = null;
function updateScoreHud(force) {
  const m = Math.floor(G.dist);
  if (m === lastScore && !force) return;
  lastScore = m; syncQuests(); if (!U.UI.score) return;
  // раньше здесь был innerHTML — браузер пересобирал разметку ~20 раз в секунду; теперь меняется только текст
  if (!scoreNum) { U.UI.score.innerHTML = '<span></span> <small>' + I18N.t('hud.meters') + '</small>'; scoreNum = U.UI.score.firstChild; }
  scoreNum.textContent = m;
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

// Единый привод вращения корпуса: и перекат, и сальто крутят один и тот же pivot.
// Поворот по +X наклоняет голову по ходу движения, поэтому вперёд — это «+», назад — «-»
// (перекат всегда вперёд). Оборот линейный, ровно за отведённое время — отклик мгновенный,
// как у исходного переката. Под группировкой (k) продолжает играть обычный цикл бега/полёта,
// поэтому конечности не «замирают» и нет рывка ни на входе, ни на выходе.
// Вызывается только когда вращение реально идёт (см. animatePlayer) — в остальных кадрах стоит 0 работы.
function updateSpin(dt, n) {
  // приземлились, а оборот не закончен (например, запрыгнули на парту) — доворачиваем втрое быстрее
  player.spinT -= (player.grounded && player.rolling <= 0) ? dt * 3 : dt;
  if (player.spinT <= 0) {
    player.spinDir = 0; player.spinT = 0;
    n.pivot.rotation.x = 0; n.headG.rotation.x = 0; n.inner.position.y = -0.92; n.inner.scale.y = 1;
    return;
  }
  const p = 1 - player.spinT / player.spinDur; // 0..1
  const k = p < 0.5 ? p + p : 2 - p - p; // группировка «в клубок»: 0 → 1 → 0, без Math.sin
  const w = 1 - k; // вес обычной позы под группировкой
  n.pivot.rotation.x = player.spinDir * TAU * p;
  let bl, br, al, ar;
  if (player.grounded) { player.runPhase += dt * (6 + G.speed * 0.55); const s = Math.sin(player.runPhase); bl = s * 1.05; br = -s * 1.05; al = -s * 0.85; ar = s * 0.85; }
  else { bl = -1.15; br = 0.45; al = -2.4; ar = -2.4; }
  n.legL.rotation.x = U.damp(n.legL.rotation.x, bl * w - 1.75 * k, 18, dt);
  n.legR.rotation.x = U.damp(n.legR.rotation.x, br * w - 1.5 * k, 18, dt);
  n.armL.rotation.x = U.damp(n.armL.rotation.x, al * w - 1.9 * k, 16, dt);
  n.armR.rotation.x = U.damp(n.armR.rotation.x, ar * w - 1.75 * k, 16, dt);
  n.headG.rotation.x = (player.spinDir > 0 ? 0.5 : -0.32) * k;
  n.inner.position.y = -0.92 + 0.13 * k;
  n.inner.scale.y = 1 - 0.1 * k;
}
// Шаг звучит в нижней точке корпуса: n.inner.position.y минимальна там, где |cos(runPhase)| = 0,
// то есть при runPhase = π/2 + k·π. Считаем номер такого перехода и стреляем на его смене —
// звук сам подстраивается под темп бега, который растёт вместе с G.speed.
let stepIdx = -1;
function footstep() {
  const i = Math.floor((player.runPhase - HALF_PI) / Math.PI);
  if (i === stepIdx) return;
  stepIdx = i; U.Sound.footstep();
}
function animatePlayer(dt) {
  const n = player.node; n.root.position.set(player.x, player.y, player.z); const faceTarget = (G.state === 'run' || G.state === 'over' || G.state === 'paused') ? 0 : intro.faceY; n.root.rotation.y = U.damp(n.root.rotation.y, faceTarget, 6, dt);
  const h = Math.max(0, player.y - player.groundY); n.shadow.position.y = player.groundY - player.y + 0.02; n.shadow.scale.setScalar(U.clamp(1 - h * 0.32, 0.4, 1));
  if (G.state === 'menu') { n.legL.rotation.x = U.damp(n.legL.rotation.x, -0.06, 8, dt); n.legR.rotation.x = U.damp(n.legR.rotation.x, 0.06, 8, dt); n.armL.rotation.x = U.damp(n.armL.rotation.x, -0.18, 8, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, -0.14, 8, dt); n.inner.position.y = -0.92 + Math.sin(performance.now() / 500) * 0.02; n.pivot.rotation.x = 0; return; }
  if (G.state === 'intro') return;
  const spinning = player.spinDir !== 0;
  const running = G.state === 'run' && player.grounded && player.rolling <= 0 && !spinning;
  if (running) { player.runPhase += dt * (6 + G.speed * 0.55); footstep(); const s = Math.sin(player.runPhase); n.legL.rotation.x = s * 1.05; n.legR.rotation.x = -s * 1.05; n.armL.rotation.x = -s * 0.85; n.armR.rotation.x = s * 0.85; n.inner.position.y = -0.92 + Math.abs(Math.cos(player.runPhase)) * 0.07; n.inner.rotation.z = 0; }
  else if (!player.grounded && !spinning) { player.runPhase += dt * 4; n.legL.rotation.x = U.damp(n.legL.rotation.x, -1.15, 10, dt); n.legR.rotation.x = U.damp(n.legR.rotation.x, 0.45, 10, dt); n.armL.rotation.x = U.damp(n.armL.rotation.x, -2.4, 8, dt); n.armR.rotation.x = U.damp(n.armR.rotation.x, -2.4, 8, dt); }
  if (player.rolling > 0) { player.rolling -= dt; if (player.rolling <= 0) player.rolling = 0; }
  if (spinning) updateSpin(dt, n); else n.pivot.rotation.x = 0;
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

// Адаптивное разрешение работает не только в забеге: слабое устройство должно определиться
// ещё в меню, а не через полторы секунды после старта. Но первые кадры нового экрана дороже
// из-за компиляции шейдеров и раскладки UI, поэтому после каждой смены состояния даём сцене
// прогреться и только потом начинаем мерить — иначе разрешение упадёт на ровном месте.
const TUNE_WARM_UP = 1.5;
let tuneWarm = 0, tunePrevState = '';
function tuneFrame(dt) {
  if (G.state !== tunePrevState) { tunePrevState = G.state; tuneWarm = TUNE_WARM_UP; return; }
  if (tuneWarm > 0) { tuneWarm -= dt; if (tuneWarm <= 0) GFX.resetResolution(); return; }
  GFX.tuneResolution(dt);
}

let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop); const dt = U.clamp((t - lastT) / 1000, 0, 0.05); lastT = t;
  if (G.state === 'loading') return;
  // На паузе кадр не меняется, а перерисовка каждые 16 мс греет телефон и садит батарею.
  // Рисуем один раз и потом только если поменялся размер холста (поворот экрана, адресная строка).
  if (G.state === 'paused') {
    const cv = GFX.renderer.domElement;
    if (pausedW !== cv.width || pausedH !== cv.height) { pausedW = cv.width; pausedH = cv.height; GFX.renderer.render(GFX.scene, GFX.camera); }
    return;
  }
  if (G.state === 'shop') { SHOP.update(dt); GFX.renderer.render(GFX.scene, GFX.camera); tuneFrame(dt); return; }
  if (G.state === 'run') {
    G.speed = Math.min(U.MAX_SPEED, G.speed + U.ACCEL * dt); G.runTime += dt; G.dist += G.speed * dt; player.z += G.speed * dt; player.x = U.damp(player.x, U.LANES[player.lane], 11, dt);
    player.groundY = getGroundY();
    if (player.y > player.groundY || player.vy > 0) {
      player.grounded = false; player.vy -= U.GRAVITY * dt; player.y += player.vy * dt;
      if (player.y <= player.groundY && player.vy < 0) { player.y = player.groundY; player.vy = 0; player.grounded = true; player.squash = 0.18; U.Sound.land(); ENT.burst(player.x, player.groundY + 0.08, player.z, '#c9c2b4', 3, 1.4); }
    } else { player.y = player.groundY; player.grounded = true; }
    if (player.invuln > 0) player.invuln -= dt; if (granny.closeT > 0) { granny.closeT -= dt; if (granny.closeT <= 0) granny.targetZOff = -9.2; }
    // Паверапы до сбора пузыриков: магнит успевает подтянуть их на этом же кадре, а поднятый
    // пикап начинает действовать сразу, не ожидая следующего.
    const got = PWR.update(dt, player.x, player.y, player.z);
    // Паверапы копятся сразу в сейв (задание power10): за забег их единицы, так что на кадр
    // это ничего не стоит, а на диск всё уйдёт вместе с остальным прогрессом в caught().
    if (got) { U.save.powerups++; U.Sound.powerup(); ENT.burst(player.x, player.y + 1.1, player.z, got.color, 8, 2.6); G.shake = Math.max(G.shake, 0.18); syncQuests(); }
    PWR.updateDouble(dt, player.z);   // раздвоение раньше магнита: подтягивать уже есть что
    PWR.updateMagnet(dt, player.x, player.y, player.z);
    PWR.updateHud(dt);
    const pcy = player.y + 0.95;
    // В сапогах Мэл перелетает ряды выше обычного окна сбора, поэтому на время баффа окно
    // растягивается ВНИЗ (PWR.BOOTS_REACH): всё, что оказалось под игроком, подбирается на лету.
    const reachDown = PWR.active.boots > 0 ? PWR.BOOTS_REACH : 1.2;
    for (let i = ENT.activeCoins.length - 1; i >= 0; i--) {
      const c = ENT.activeCoins[i]; if (c.z < player.z - U.DESPAWN_BEHIND) { ENT.releaseCoin(i); continue; }
      const dy = pcy - c.y;                                   // >0 — пузырик ниже центра игрока
      if (Math.abs(player.z - c.z) < 0.95 && Math.abs(player.x - c.x) < 0.8 && dy < reachDown && dy > -1.2) { G.bottles++; if (U.UI.bottleNum) U.UI.bottleNum.textContent = G.bottles; U.Sound.coin(); ENT.burst(c.x, c.y, c.z, '#ffe36e', 3, 1.8); ENT.releaseCoin(i); showCombo(); syncQuests(); }
    }
    updateCollisions(); LVL.fillSpawns(); updateScoreHud();
    for (const seg of segments) { if (seg.position.z + U.SEG_LEN / 2 < player.z - 16) { seg.position.z += U.SEG_LEN * U.SEG_COUNT; seg.updateMatrix(); GFX.randomizeSegmentDecor(seg); } }
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; if (U.UI.comboText) U.UI.comboText.classList.remove('on'); } }
    G.camBlend = Math.min(1, G.camBlend + dt * 1.6);
  } else if (G.state === 'over') {
    G.overT += dt; G.speed = Math.max(0, G.speed - 30 * dt); player.z += G.speed * dt;
    if (player.y > player.groundY) { player.vy -= U.GRAVITY * dt; player.y = Math.max(player.groundY, player.y + player.vy * dt); if (player.y <= player.groundY) { player.vy = 0; player.grounded = true; } }
    player.node.root.rotation.z = Math.sin(G.overT * 9) * 0.16 * Math.max(0, 1 - G.overT); player.node.inner.rotation.x = U.damp(player.node.inner.rotation.x, -0.35, 4, dt);
    if (G.overT > 1.15 && !G.overShown) showOverScreen();
  } else if (G.state === 'menu') { G.camBlend = Math.max(0, G.camBlend - dt * 1.6); } else if (G.state === 'intro') { updateIntro(dt); }
  ENT.pumpObstacles(player.z); // дальние препятствия входят в сцену только у границы тумана
  if (G.state === 'run' || G.state === 'over') updatePet(dt); else if (G.state === 'menu') animatePetMenuIdle(dt);
  animatePlayer(dt); if (G.state !== 'intro') animateGranny(dt); ENT.updateParticles(dt);
  if (G.state === 'intro') updateIntroCamera(dt); else updateCamera(dt);
  ENT.updateCoins(t / 300); // квады бутылок разворачиваются по камере — строго после updateCamera
  PWR.faceCamera();         // по той же причине здесь, а не в PWR.update()
  GFX.renderer.render(GFX.scene, GFX.camera);
  tuneFrame(dt);
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
      // Открытая модалка меню (настройки/задания/заглушка) перехватывает Escape и блокирует Enter:
      // кликами она недоступна (её фон перекрывает меню), а вот с клавиатуры забег стартовал бы прямо под ней.
      case 'Escape': case 'KeyP': if (QST.modalOpen()) QST.closeAll(); else if (G.state === 'run') pauseRun(); else if (G.state === 'paused') resumeRun(); else if (G.state === 'shop') exitShop(); break;
      case 'Enter': if (QST.modalOpen()) break; if (G.state === 'menu') startIntro(); else if (G.state === 'over' && G.overShown) U.maybeInterstitial(quickRestart, true); break;
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
  // Уходя со вкладки, глушим звук в ЛЮБОМ состоянии: раньше в меню/на экране смерти музыка
  // продолжала играть в фоне (Яндекс.Игры это не пропускают).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.state === 'intro') skipIntro(); if (G.state === 'run') pauseRun(); U.Sound.pauseAll(); U.flushSave(); }
    else if (G.state !== 'paused') U.Sound.resumeAll();
  });
  // Свёрнутое окно или переключение в другую программу/окно браузера visibilitychange НЕ ловит:
  // вкладка формально остаётся видимой (document.hidden === false), игра продолжала бежать без игрока.
  // Ловим потерю фокуса окна и ведём себя так же, как при уходе со вкладки.
  // Во время рекламы фокус забирает её iframe — это не уход игрока, звуком и паузой там рулит SDK.
  window.addEventListener('blur', () => {
    if (U.adBusy) return;
    if (G.state === 'intro') skipIntro();
    if (G.state === 'run') pauseRun();
    U.Sound.pauseAll();
  });
  // Закрытие вкладки visibilitychange застаёт не всегда (на мобильных особенно), а pagehide —
  // последнее событие, которое гарантированно приходит перед выгрузкой страницы. Дублируем сброс
  // сейва здесь: flushSave сам проверит, есть ли что писать, поэтому двойного запроса не будет.
  window.addEventListener('pagehide', () => U.flushSave());
  window.addEventListener('focus', () => {
    if (U.adBusy || document.hidden) return;
    if (G.state !== 'paused') U.Sound.resumeAll();
  });
  const on = (id, fn) => { const el = U.$(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (U.adBusy) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  on('playBtn', act(() => { if (G.state === 'menu') startIntro(); })); on('skipIntroBtn', act(() => { if (G.state === 'intro') skipIntro(); }));
  on('shopBtn', act(openShop));
  on('settingsBtn', act(() => QST.openSettings()));
  on('questsBtn', act(() => QST.openQuests()));
  on('minigameBtn', act(() => RLT.open()));
  on('pauseBtn', act(() => pauseRun())); on('resumeBtn', act(() => resumeRun()));
  on('restartBtn', act(() => { if (G.state !== 'paused') return; U.show(U.UI.pause, false); U.Sound.resumeAll(); U.maybeInterstitial(quickRestart); }));
  on('pauseMenuBtn', act(() => { if (G.state !== 'paused') return; U.Sound.resumeAll(); U.show(U.UI.pause, false); U.maybeInterstitial(showMenu); }));
  // Уход с экрана смерти — единственный выход после каждого проигрыша, поэтому здесь
  // межстраничная запускается принудительно (force), без нашего кулдауна в 75 секунд.
  on('againBtn', act(() => { if (G.state === 'over' && G.overShown) U.maybeInterstitial(quickRestart, true); })); on('overMenuBtn', act(() => { if (G.state === 'over' && G.overShown) U.maybeInterstitial(showMenu, true); }));
  on('reviveBtn', act(() => {
    if (G.state !== 'over' || G.reviveCount >= REVIVE_MAX) return;
    const cost = reviveCost();
    if (U.save.currency < cost) { U.Sound.denied(); return; }
    U.save.currency -= cost; U.persistSave();
    revive();
  }));
  on('pauseSettingsBtn', act(() => { if (G.state === 'paused') QST.openSettings(); }));
  // Ползунки громкости. На 'input' (каждое движение) только применяем громкость — слышно сразу;
  // сейв и клик вешаем на 'change' (отпустили бегунок), иначе каждое движение писало бы
  // в localStorage и дёргало облачный сейв.
  // Клик по иконке слева от ползунка — мгновенный mute/unmute раздела. Прошлый уровень
  // помним в замыкании и возвращаем при включении обратно: сбрасывать в 100 % было бы грубо,
  // этот уровень пользователь выставлял сам. 100 берём только если помнить нечего.
  const volSlider = (id, key) => {
    const el = U.$(id); if (!el) return;
    el.addEventListener('input', () => { U.save[key] = U.clamp(el.value | 0, 0, 100); U.syncAudioUI(); U.Sound.ensure(); U.Sound.applyVolume(); });
    el.addEventListener('change', () => { U.persistSave(); U.Sound.click(); });
    const row = el.closest('.vol-row'), ico = row && row.querySelector('.vol-ico');
    if (!ico) return;
    let prev = 0;
    ico.addEventListener('click', () => {
      const v = U.save[key] | 0;
      if (v > 0) prev = v;
      U.save[key] = v > 0 ? 0 : (prev || 100);
      U.syncAudioUI(); U.Sound.ensure(); U.Sound.applyVolume(); U.persistSave(); U.Sound.click();
    });
  };
  volSlider('musicVol', 'musicVol'); volSlider('soundVol', 'soundVol');
}

let initStarted = false;
function init() {
  if (initStarted) return; initStarted = true; U.cacheUI();
  GFX.initGraphics(U.UI.game); GFX.buildEnvTextures();
  for (let i = 0; i < U.SEG_COUNT; i++) { const seg = GFX.buildSegment(i); segments.push(seg); GFX.scene.add(seg); }
  player.node = ENT.buildMel(SK.selectedId()); GFX.scene.add(player.node.root);
  granny.node = ENT.buildGranny(); GFX.scene.add(granny.node.root);
  deskScene = ENT.buildClassroom(); GFX.scene.add(deskScene.group);
  applyPlayerPet(PT.selectedId());
  ENT.initParticles(); ENT.initObstacleShadows(); ENT.initCoins();
  // DOM-иконки берут тот же файл, что и текстура монеты: браузер качает его один раз.
  const bottleUrl = TEX.url('bottle');
  for (const id of ['bottleIcon', 'menuBottleIcon', 'overBottleIcon', 'menuCurIcon', 'shopCurIcon', 'shopModalIcon', 'adRewardIcon', 'rouletteCurIcon', 'rouletteBetIcon', 'rouletteResultIcon', 'reviveCostIcon']) { const im = U.$(id); if (im) im.src = bottleUrl; }
  SHOP.initShop({ setPreviewSkin: applyPlayerSkin, setPreviewPet: applyPlayerPet, getPlayerNode: () => player.node, getPetNode: () => pet.node, getGrannyNode: () => granny.node, exitToMenu: exitShop });
  QST.initQuests();
  PWR.initPowerups();
  ADR.initAdReward();
  RLT.initRoulette();
  AUD.initAudio();
  bindInput(); setupMenuScene(); requestAnimationFrame(loop);
  const t0 = performance.now();
  setTimeout(() => { U.show(U.UI.loading, false); showMenu(); U.Sdk.loadingReady(); }, Math.max(0, 500 - (performance.now() - t0)));
}

U.readLocalSave(); U.syncAudioUI();
// Ранний язык из браузера: экран загрузки показывается ещё до ответа SDK, и без этого
// он секунду-другую висел бы по-русски у иностранного игрока. Точный язык площадки
// придёт из ysdk ниже, до сборки процедурных текстур в init().
I18N.detectFromBrowser(); I18N.applyStaticTexts();
function boot() {
  if (typeof THREE === 'undefined') { const lt = U.$('loadingText'); if (lt) lt.textContent = I18N.t('loading.noThree'); return; }
  Promise.all([GFX.loadTextures(), U.withTimeout(U.Sdk.init(), 8000)]).then(() => { if (I18N.detectFromSdk(U.Sdk.ysdk)) I18N.applyStaticTexts(); return U.withTimeout(U.Sdk.loadCloud(), 5000); }).then(() => { U.syncAudioUI(); init(); }).catch(err => { console.error(err); try { init(); } catch (e) { console.error(e); const lt = U.$('loadingText'); if (lt) lt.textContent = I18N.t('loading.error'); } });
}
boot();