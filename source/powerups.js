import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as ENT from './entities.js';
import * as TEX from './textures.js';

// ─── настройки системы (всё крутится отсюда) ──────────────────────────────────────
// Длительности баффов, с. Меняются независимо друг от друга.
export const MAGNET_TIME = 20;
export const BOOTS_TIME = 25;
export const DOUBLE_TIME = 25;

// Расписание спавна. Считаем по МЕТРАМ трассы, а не по секундам: интервал в метрах одинаков
// и для новичка (11 м/с), и для разогнавшегося игрока (27 м/с), тогда как по времени второй
// успевал бы пробежать между пикапами вдвое больше.
const FIRST_DIST = 500;      // на каком метре забега выпадает первый пикап
const INTERVAL_D = 500;      // базовый интервал между пикапами, м
const JITTER_D = 60;         // разброс интервала ±, м

// Магнит: радиус сбора и физика полёта пузырика к игроку.
const MAG_RANGE = 14;        // на сколько метров вперёд дотягивается, все три ряда
const MAG_V0 = 6;            // стартовая скорость подхвата, м/с
const MAG_ACC = 95;          // ускорение, м/с² — к концу полёта пузырик идёт быстрее игрока
const MAG_VMAX = 48;         // предел скорости, м/с (игрок бежит максимум 27 — догоняет с запасом)
const MAG_TURN = 10;         // как резко вектор скорости доворачивается на игрока (коэффициент damp)

// Сапоги: прыжок apex ~3.1 м вместо 1.45 — перелетает любое препятствие игры,
// включая шкафчик (2.70) и стойку-доску (2.95).
export const BOOTS_JUMP_V = 13.2;
// На такой высоте игрок перелетает ряды пузыриков и пикапы выше окна сбора (обычно ±1.2..1.5 м)
// и они остаются позади. Пока бафф активен, окно и у пузыриков (main.js), и у пикапов (ниже в этом
// файле) тянется ВНИЗ на столько метров: всё, что под игроком, собирается на лету.
// 4.2 = apex 3.1 + низкий ряд на 0.6 (центр игрока считается на 0.95 выше пола) + запас на платформы.
// Вверх окно не растём нарочно — иначе висящие в воздухе ряды забирались бы прямо с земли.
export const BOOTS_REACH = 4.2;

// MAX WIN. Смещение пары пузыриков внутри ряда по X: ряды разнесены на 2.3 м, полуширина
// картинки бутылки 0.31 — при ±0.42 пара стоит бок о бок, не залезая в соседний ряд,
// и обе забираются одним касанием (радиус сбора по X в main.js — 0.8 м).
// Удвоение решается НЕ в момент спавна: трасса генерится на 170 м вперёд, то есть до 6 с хода,
// и бафф включался бы и выключался с такой же задержкой. Вместо этого пузырики раздваиваются
// на подлёте игрока: у каждого в окне DBL_RANGE заводится близнец, и пара разъезжается из одной
// точки за ~0.25 с — подмена читается как «пузырик раздвоился», а не как хлопок из ниоткуда.
// Когда бафф кончается, близнецы съезжаются обратно и освобождаются. Задержка реакции теперь
// равна времени подлёта окна — меньше 1.3 с на максимальной скорости.
export const DOUBLE_DX = 0.42;
const DBL_RANGE = 34;        // на сколько метров вперёд работает удвоение, м
const DBL_SPLIT = 4.5;       // скорость разъезда/схлопывания пары, 1/с
const DBL_TAIL = 1.2;        // сколько работаем «на выбеге» после конца баффа, с

// Геометрия и показ самого пикапа.
export const PU_Y = 1.15;    // высота центра над полом — на уровне груди Мэла
const PU_VIS = 70;           // с какого расстояния пикап появляется, м (дальше — за туманом, рисовать нечего)
const PU_FADE = 14;          // на каких метрах он проявляется из ничего
const PU_ICON = 0.95, PU_HALO = 1.7;

// Реестр типов. Порядок здесь = порядок иконок в HUD.
// tex — ключ текстуры в textures.js:MANIFEST, color — цвет нимба и полосы таймера в HUD.
export const TYPES = [
  { id: 'magnet', tex: 'magnet', time: MAGNET_TIME, color: '#4fc3f7' },
  { id: 'boots',  tex: 'boots',  time: BOOTS_TIME,  color: '#9ccc65' },
  { id: 'double', tex: 'double', time: DOUBLE_TIME, color: '#ffd54f' }
];

// Остаток действия каждого баффа в секундах. Плоский объект с фиксированными полями:
// в кадре по нему идёт три явных сравнения, без for..in и без промежуточных массивов.
export const active = { magnet: 0, boots: 0, double: 0 };

let nextD = FIRST_DIST;      // метраж трассы, на котором дозреет следующий пикап
let duePick = null;          // тип дозрел, но место на трассе ещё не нашлось (level.js подберёт)
let lastId = '';             // предыдущий выпавший тип — подряд один и тот же не даём
// Сколько ещё секунд гонять updateDouble после конца баффа — чтобы успели съехаться и
// освободиться уже созданные близнецы. Считать их штуками нельзя: близнеца может забрать
// игрок (или despawn), а те пути про MAX WIN ничего не знают и счётчик бы поплыл.
let dblTail = 0;

// Следующий тип: любой, кроме предыдущего. При трёх типах это ровно один из двух оставшихся.
function pickType() {
  let n = 0;
  for (let i = 0; i < TYPES.length; i++) if (TYPES[i].id !== lastId) pool[n++] = TYPES[i];
  return pool[U.randi(0, n - 1)];
}
const pool = [];

// ─── визуал пикапа ───────────────────────────────────────────────────────────────
// Квад с иконкой + мягкий нимб за ним, оба развёрнуты по камере (как пузырики). Это 2 draw
// call на пикап, а их на трассе одновременно не больше одного — дешевле объёмной модели
// и иконка всегда читается под любым углом.
let haloTex = null;
function getHaloTex() {
  if (!haloTex) haloTex = GFX.canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 3, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.42, 'rgba(255,255,255,0.32)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  return haloTex;
}
// Материалы живут НА ТИПЕ, а не на экземпляре: прозрачность анимируется по дистанции, а
// пикапов одного типа на трассе двух сразу быть не может (подряд один тип не выпадает).
// fog отключён нарочно — светящийся предмет не должен гаснуть вместе с мебелью, вместо
// туманa его проявляет ручной фейд по дистанции (см. update).
function mats(t) {
  if (!t.icMat) {
    t.icMat = new THREE.MeshBasicMaterial({ map: TEX.get(t.tex), transparent: true, alphaTest: 0.08, depthWrite: false, fog: false });
    t.haloMat = new THREE.MeshBasicMaterial({ map: getHaloTex(), color: t.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  }
}
const nodePool = { magnet: [], boots: [], double: [] };
function buildNode(t) {
  mats(t);
  const g = new THREE.Group();
  const halo = new THREE.Mesh(GFX.GPlane(PU_HALO, PU_HALO), t.haloMat); halo.renderOrder = 2; GFX.glow(halo); g.add(halo);   // в High ореол светится
  const ic = new THREE.Mesh(GFX.GPlane(PU_ICON, PU_ICON), t.icMat); ic.position.z = 0.012; ic.renderOrder = 3; g.add(ic);
  return g;
}

export const activePickups = [];
const descPool = [];

// Вызывается из level.js, когда найдено свободное место рядом с маршрутом.
export function place(type, x, y, z) {
  const node = nodePool[type.id].pop() || buildNode(type);
  GFX.scene.add(node);
  const p = descPool.pop() || {};
  p.type = type; p.x = x; p.y = y; p.z = z; p.node = node; p.phase = 0;
  node.position.set(x, y, z); node.visible = false;
  activePickups.push(p);
  duePick = null; lastId = type.id;
  // Следующий порог отсчитываем от РАСПИСАНИЯ, а не от фактического места: если пикап
  // пришлось перенести на пару паттернов вперёд, средний шаг всё равно остаётся 500 м.
  nextD += INTERVAL_D + U.rand(-JITTER_D, JITTER_D);
}
function release(i) {
  const p = activePickups[i];
  GFX.scene.remove(p.node); nodePool[p.type.id].push(p.node);
  p.node = null; activePickups.splice(i, 1); descPool.push(p);
}
// Зовёт main.js:revive() — убирает паверапы в зоне, которую заново открывает воскрешение игрока.
export function clearRange(fromZ, toZ) { for (let i = activePickups.length - 1; i >= 0; i--) { const p = activePickups[i]; if (p.z > fromZ && p.z < toZ) release(i); } }

// Тик расписания. Зовёт level.js из fillSpawns и передаёт метраж ТОЧКИ ГЕНЕРАЦИИ (G.dist + ahead),
// а не текущий метраж игрока: пикап встанет на 170 м впереди, и считать надо там, где он встанет.
export function noteDist(d) { if (!duePick && d >= nextD) duePick = pickType(); }
// Тип, который ждёт места на трассе (level.js спрашивает это на каждом паттерне).
export function pendingType() { return duePick; }

function grant(t) { active[t.id] += t.time; }   // тот же бафф продлевает сам себя

// ─── кадр ────────────────────────────────────────────────────────────────────────
// Таймеры баффов, покачивание и сбор пикапа. Возвращает тип поднятого
// пикапа (или null) — звук и партиклы дёргает main.js, чтобы вся обратная связь была в одном месте.
export function update(dt, px, py, pz) {
  if (active.magnet > 0) { active.magnet -= dt; if (active.magnet < 0) active.magnet = 0; }
  if (active.boots > 0) { active.boots -= dt; if (active.boots < 0) active.boots = 0; }
  if (active.double > 0) { active.double -= dt; if (active.double < 0) active.double = 0; }

  let got = null;
  const pcy = py + 0.95;
  // В сапогах Мэл перелетает пикап выше обычного окна сбора — та же логика, что у пузыриков
  // в main.js: окно тянется ВНИЗ на BOOTS_REACH, вверх нарочно не растёт.
  const reachDown = active.boots > 0 ? BOOTS_REACH : 1.5;
  for (let i = activePickups.length - 1; i >= 0; i--) {
    const p = activePickups[i];
    if (p.z < pz - U.DESPAWN_BEHIND) { release(i); continue; }
    const dz = p.z - pz;
    if (dz > PU_VIS) { if (p.node.visible) p.node.visible = false; continue; }
    if (!p.node.visible) p.node.visible = true;
    p.phase += dt * 2.2;
    const y = p.y + Math.sin(p.phase) * 0.11;
    p.node.position.set(p.x, y, p.z);
    const o = dz > PU_VIS - PU_FADE ? (PU_VIS - dz) / PU_FADE : 1;
    p.type.icMat.opacity = o;
    p.type.haloMat.opacity = o * (0.72 + Math.sin(p.phase * 1.7) * 0.18);   // нимб дышит
    // Окно сбора по Z — тот же порядок, что у пузыриков (0.95): на просадке до 20 fps кадр
    // проходит 1.35 м, поэтому запас нужен, иначе редкий пикап можно физически «перепрыгнуть».
    const dy = pcy - y;                                    // >0 — пикап ниже центра игрока
    if (Math.abs(dz) < 1.2 && Math.abs(px - p.x) < 0.95 && dy < reachDown && dy > -1.5) { got = p.type; grant(p.type); release(i); }
  }
  return got;
}

// Разворот квадов по камере — отдельным проходом и строго ПОСЛЕ updateCamera в игровом цикле,
// иначе пикап отстаёт от камеры на кадр (ровно та же причина, по которой после неё идёт
// ENT.updateCoins). Работы здесь ноль: пикап на трассе не больше одного.
export function faceCamera() {
  if (!activePickups.length) return;
  const q = GFX.camera.quaternion;
  for (let i = 0; i < activePickups.length; i++) { const n = activePickups[i].node; if (n.visible) n.quaternion.copy(q); }
}

// Магнит. Пузырики не телепортируются: каждому заводится собственный вектор скорости, который
// доворачивается на игрока — получается дуга, а не рывок по прямой. Полей у описателя пузырика
// прибавилось четыре (pull/pv/vx..vz), новых объектов в кадре не создаётся.
export function updateMagnet(dt, px, py, pz) {
  if (active.magnet <= 0) return;
  const coins = ENT.activeCoins, ty = py + 0.95;
  const s = 1 - Math.exp(-MAG_TURN * dt);
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (!c.pull) {
      const ahead = c.z - pz;
      if (ahead < -0.5 || ahead > MAG_RANGE) continue;
      c.pull = 1; c.pv = MAG_V0; c.vx = 0; c.vy = 0; c.vz = 0;
    }
    const dx = px - c.x, dy = ty - c.y, dz = pz - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
    c.pv = Math.min(MAG_VMAX, c.pv + MAG_ACC * dt);
    const k = c.pv / d;
    c.vx += (dx * k - c.vx) * s; c.vy += (dy * k - c.vy) * s; c.vz += (dz * k - c.vz) * s;
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
  }
}

// MAX WIN. Держим пары в окне DBL_RANGE перед игроком: пока бафф активен — заводим близнеца
// и разводим пару по X, как только кончился — сводим обратно и близнеца отпускаем. Оригинал
// всегда помнит центр своего ряда (c.bx), поэтому съезд возвращает его ровно на место.
// Летящие под магнитом пузырики пропускаем целиком: их ведёт собственная скорость, и переписывать
// им x значило бы драться с магнитом за одну и ту же координату.
export function updateDouble(dt, pz) {
  const on = active.double > 0;
  if (on) dblTail = DBL_TAIL; else if (dblTail > 0) { dblTail -= dt; if (dblTail < 0) dblTail = 0; }
  if (!on && dblTail === 0) return;               // обычный кадр выходит по первой же проверке
  const coins = ENT.activeCoins, step = DBL_SPLIT * dt, far = pz + DBL_RANGE;
  // Обратный обход: освобождение сплайсит массив, а новые близнецы дописываются в хвост
  // и на этом кадре уже не посещаются (им хватит следующего).
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.pull) continue;
    if (c.tw) {                                   // близнец
      if (on) { c.sp += step; if (c.sp > 1) c.sp = 1; }
      else { c.sp -= step; if (c.sp <= 0) { ENT.releaseCoin(i); continue; } }
      c.x = c.bx + DOUBLE_DX * c.sp;
      continue;
    }
    if (on && !c.pair && c.z > pz && c.z < far) {
      // Фаза покачивания у пары общая — иначе в момент разъезда пузырики идут «вразнобой».
      const tw = ENT.spawnCoin(c.bx, c.y, c.z);
      if (tw) { tw.tw = 1; tw.sp = 0; tw.phase = c.phase; c.pair = 1; c.sp = 0; }
    }
    if (!c.pair) continue;
    if (on) { c.sp += step; if (c.sp > 1) c.sp = 1; }
    else { c.sp -= step; if (c.sp <= 0) { c.sp = 0; c.pair = 0; } }
    c.x = c.bx - DOUBLE_DX * c.sp;
  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────────
// Плашка с иконкой и полосой остатка времени внизу (её длина — transform: scaleX(--p)).
// Масштаб не трогает ни layout, ни растеризацию — только композитинг, поэтому запись
// переменной ничего не пересчитывает; дёргаем её 10 раз в секунду, а не каждый кадр —
// на глаз это плавно, а DOM в кадре не трогается вовсе.
const HUD_HZ = 0.1;
const hudEls = [];
let hudT = 0;
export function initPowerups() {
  for (let i = 0; i < TYPES.length; i++) {
    const t = TYPES[i], box = U.$('buff_' + t.id);
    TEX.get(t.tex);                                  // прогреваем загрузку файла заранее, ещё на загрузочном экране
    if (!box) continue;
    const im = box.querySelector('img'); if (im) im.src = TEX.url(t.tex);
    box.style.setProperty('--c', t.color);
    hudEls.push({ t, box, on: false, low: false });
  }
}
function writeHud() {
  for (let i = 0; i < hudEls.length; i++) {
    const e = hudEls[i], left = active[e.t.id], on = left > 0;
    if (on !== e.on) { e.on = on; e.box.classList.toggle('on', on); }
    if (!on) { if (e.low) { e.low = false; e.box.classList.remove('low'); } continue; }
    e.box.style.setProperty('--p', (left / e.t.time).toFixed(3));
    const low = left <= 3;                           // последние секунды бафф мигает
    if (low !== e.low) { e.low = low; e.box.classList.toggle('low', low); }
  }
}
export function updateHud(dt) { hudT -= dt; if (hudT > 0) return; hudT = HUD_HZ; writeHud(); }

// Вечный бафф питомца: плашка того же вида, но без полосы времени — действует весь забег.
// Стоит последней в #buffs, то есть в самом углу; временные паверапы встают над ней.
// texKey — ключ иконки из pets.js (поле hud) или '' — плашка скрыта. Зовёт main.js:resetRun();
// src меняется только при смене питомца, поэтому картинка не перезапрашивается каждый забег.
let petKey = '';
export function setPetBuff(texKey) {
  const box = U.$('buff_pet'); if (!box) return;
  if (texKey !== petKey) {
    petKey = texKey;
    const im = box.querySelector('img'); if (im && texKey) im.src = TEX.url(texKey);
  }
  box.classList.toggle('on', !!texKey);
}

// Полный сброс на старте забега и при выходе в меню.
export function reset() {
  for (let i = activePickups.length - 1; i >= 0; i--) release(i);
  active.magnet = 0; active.boots = 0; active.double = 0;
  nextD = FIRST_DIST; duePick = null; lastId = ''; dblTail = 0; hudT = 0;
  writeHud();
}
