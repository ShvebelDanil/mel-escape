import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as QST from './quests.js';
import * as TEX from './textures.js';
import { t } from './i18n.js';

// ===== Экран смерти: два этапа =====
// 1) REVIVE — маленькое окно поверх затемнения: обратный отсчёт, «Попался!», «Восстать за N».
//    Время вышло или тап мимо окна → итоги. Кнопка при нехватке пузыриков серая, отсчёт идёт дальше.
// 2) STATS — большое окно итогов: слева живые 3D-модели Мэла и питомца, справа цифры забега,
//    рекорд, баланс и задания, продвинувшиеся за забег (полоса едет от «было» к «стало»).
// Решение, КОГДА какой этап открыть, принимает main.js (лимит воскрешений, цена, оплата);
// модуль только показывает окна, считает отсчёт и анимирует итоги.
const NONE = 0, REVIVE = 1, STATS = 2;
export const REVIVE_TIME = 5;                // секунд на решение; та же длительность у кольца в CSS (задаётся в init)
const URGENT_AT = 2;                         // последние секунды — кольцо и цифра краснеют

// Тайминги итогов, секунды от открытия окна. FADE совпадает с анимацией .os-panel (osIn) в index.html:
// подложка студии проявляется тем же темпом, что и сама панель.
const FADE = 0.25;
const MEL_POP_AT = 0.12, PET_POP_AT = 0.28, POP_DUR = 0.5;
const METERS_AT = 0.25, METERS_DUR = 1.0, BOTTLES_AT = 0.4, BOTTLES_DUR = 0.8;
const BALANCE_AT = 0.65, BALANCE_DUR = 0.9;
const QUEST_AT = 0.85, QUEST_STEP = 0.2, QUEST_DUR = 0.9, CARD_IN_AT = 0.55, CARD_IN_STEP = 0.1;

// «Студия» — группа глубоко под полом общей сцены (см. GFX.renderStudio). Камера смотрит вдоль −z,
// дальняя плоскость короткая: весь коридор (y ≥ 0) остаётся за ней и отсекается.
const STUDIO_Y = -40, FOV = 30, TAN_H = Math.tan(FOV * Math.PI / 360);
// Питомец почти в линию с Мэлом: вынесенный вперёд, он из-за взгляда камеры сверху
// опускался в кадре ниже Мэла, и передние лапы срезались нижней кромкой окна.
const MEL_X = -0.3, MEL_YAW = 0.22, PET_X = 0.62, PET_Z = 0.1, PET_YAW = -0.4;
// Габарит кадра (м): Мэл с причёской ~2.15 м; снизу запас под лапы и диски-тени.
// С питомцем кадр шире и сдвинут вправо, к нему. CAM_LIFT — насколько камера выше центра кадра.
const FRAME_H = 2.6, FRAME_Y = 1.02, FRAME_W_SOLO = 1.1, FRAME_W_PET = 1.95, FRAME_X_PET = 0.16, CAM_LIFT = 0.2;
// Скругление окна студии, CSS-пиксели — то же, что border-radius у .os-stage в index.html.
const STAGE_R = 16;

let phase = NONE, deps = null;
let reviveStart = 0, lastCount = -1, urgent = false;
let st = 0;                                  // время с открытия итогов
let studio = null, cam = null, back = null, mel = null, petN = null;
let sx = 0, sy = 0, sw = 0, sh = 0;          // прямоугольник окна студии, CSS-пиксели
const tweens = [];                           // счётчики цифр текущего показа итогов
let recordAt = -1, recordShown = false, gainShown = false, remeasured = false;

export const inRevive = () => phase === REVIVE;
export const inStats = () => phase === STATS;

const easeOut = k => 1 - (1 - k) * (1 - k) * (1 - k);                // тот же изгиб, что cubic-bezier(.33,1,.68,1) у полос
function popK(tt) {                                                   // easeOutBack: лёгкий «перелёт» при появлении модели
  if (tt <= 0) return 0.001;
  if (tt >= POP_DUR) return 1;
  const k = tt / POP_DUR - 1, s = 1.7;
  return 1 + k * k * ((s + 1) * k + s);
}

// ===== Этап 1: воскрешение =====
export function showRevive(cost, affordable) {
  phase = REVIVE; reviveStart = performance.now(); lastCount = -1; urgent = false;
  if (U.UI.reviveCost) U.UI.reviveCost.textContent = cost;
  if (U.UI.reviveBtn) U.UI.reviveBtn.classList.toggle('locked', !affordable);
  const box = U.UI.reviveBox;
  if (box) box.classList.remove('urgent');
  U.screens('over');
  U.replayCss(box);                          // перезапуск кольца и всплытия окна при каждой смерти
  tickRevive();
}
// Время считаем по часам, а не по dt кадра: кольцо в CSS идёт по тем же реальным секундам,
// поэтому цифра и кольцо не разъедутся даже после свёрнутой вкладки.
function tickRevive() {
  const left = REVIVE_TIME - (performance.now() - reviveStart) / 1000;
  if (left <= 0) { toStats(); return; }
  const n = Math.ceil(left);
  if (n === lastCount) return;
  lastCount = n;
  const el = U.UI.reviveCount;
  if (el) { el.textContent = n; U.replayCss(el); }
  if (!urgent && n <= URGENT_AT) { urgent = true; if (U.UI.reviveBox) U.UI.reviveBox.classList.add('urgent'); }
}
function toStats() { if (phase === REVIVE && deps) deps.onReviveEnd(); }

// ===== Этап 2: итоги =====
// data: { meters, bottles, best, record, currency, quests: QST.runProgress() }.
// melNode/petNode — те же ноды, что бегут по коридору: на время окна они переезжают в студию.
export function showStats(data, melNode, petNode) {
  phase = STATS; st = 0;
  tweens.length = 0; recordShown = false; gainShown = false; remeasured = false;
  const reward = fillQuests(data.quests);
  const gained = data.bottles + reward;      // пузырики забега + награды за закрытые в нём задания
  const best = data.record ? data.meters : data.best;
  addTween(U.UI.overScore, 0, data.meters, METERS_AT, METERS_DUR, null);
  addTween(U.UI.overBottles, 0, data.bottles, BOTTLES_AT, BOTTLES_DUR, null);
  // Рекорд побит — «Рекорд» считает вместе с метрами, а плашка всплывает, когда счёт добежал.
  if (data.record) addTween(U.UI.overBest, 0, best, METERS_AT, METERS_DUR, null);
  else if (U.UI.overBest) U.UI.overBest.textContent = best;
  recordAt = data.record ? METERS_AT + METERS_DUR : -1;
  addTween(U.UI.overBalance, Math.max(0, data.currency - gained), data.currency, BALANCE_AT, BALANCE_DUR, null);
  if (U.UI.overGain) { U.UI.overGain.textContent = '+' + gained; U.UI.overGain.classList.remove('on'); U.show(U.UI.overGain, gained > 0); }
  U.show(U.UI.newRecord, false);
  if (U.UI.overBestBox) U.UI.overBestBox.classList.remove('rec');
  enterStudio(melNode, petNode);
  U.screens('overStats');
  measure();                                 // окно уже в раскладке — берём прямоугольник студии
}

// Карточки заданий. Разметка — как в окне заданий (quests.js), только полоса едет transform'ом:
// сдвиг по X вместо ширины не трогает раскладку, и скруглённый край полосы не сплющивается.
function fillQuests(list) {
  const box = U.UI.overQuests; if (!box) return 0;
  box.innerHTML = '';
  U.show(U.UI.overQuestsHead, list.length > 0);
  const bottleUrl = TEX.url('bottle');
  let reward = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i], q = it.q;
    if (it.done) reward += q.reward;
    const card = document.createElement('div');
    card.className = 'quest-card ui-tile os-q';
    card.dataset.done = '0';
    card.style.animationDelay = (CARD_IN_AT + i * CARD_IN_STEP) + 's';
    card.innerHTML = '<div class="q-icon">' + QST.ico(q.icon) + '</div>' +
      '<div class="q-main"><div class="q-name"></div><div class="q-row"><div class="q-bar"><i></i></div><div class="q-prog"></div>' +
      '<div class="q-check hidden">' + QST.ico('ic-check') + '</div></div></div>' +
      '<div class="q-reward"><div class="l">' + t('quests.reward') + '</div><div class="v"><img alt=""><span></span></div></div>';
    card.querySelector('.q-name').textContent = t(q.nameKey);
    card.querySelector('.q-reward img').src = bottleUrl;
    card.querySelector('.q-reward span').textContent = q.reward;
    const bar = card.querySelector('.q-bar i');
    bar.style.transform = barPos(it.from, q.goal);
    bar.style.transitionDuration = QUEST_DUR + 's';
    box.appendChild(card);
    const at = QUEST_AT + i * QUEST_STEP;
    // Полосу двигает CSS-переход (запускается один раз в момент at), цифры — счётчик ниже;
    // у обоих одна длительность и один изгиб, поэтому они идут синхронно.
    addTween(card.querySelector('.q-prog'), it.from, it.to, at, QUEST_DUR, it.done ? () => markDone(card) : null, q.goal, bar, barPos(it.to, q.goal));
  }
  return reward;
}
const barPos = (v, goal) => 'translateX(' + ((v / goal - 1) * 100).toFixed(2) + '%)';
function markDone(card) {
  card.dataset.done = '1';
  const chk = card.querySelector('.q-check'); U.show(chk, true);
  card.querySelector('.q-reward').classList.add('got');
}

// Счётчик: текст меняется только когда меняется само целое число (не каждый кадр).
// goal — для записи «12 / 25»; bar/barTo — полоса, которую надо запустить в момент старта.
function addTween(el, from, to, at, dur, onEnd, goal, bar, barTo) {
  if (!el) return;
  el.textContent = goal ? from + ' / ' + goal : from;
  tweens.push({ el, from, to, at, dur, onEnd, goal: goal || 0, bar: bar || null, barTo: barTo || '', last: from, started: false, ended: false });
}
function updateTweens() {
  for (let i = 0; i < tweens.length; i++) {
    const w = tweens[i];
    if (w.ended || st < w.at) continue;
    if (!w.started) { w.started = true; if (w.bar) { w.bar.classList.add('run'); w.bar.style.transform = w.barTo; } }
    const k = Math.min(1, (st - w.at) / w.dur);
    const v = Math.round(w.from + (w.to - w.from) * easeOut(k));
    if (v !== w.last) { w.last = v; w.el.textContent = w.goal ? v + ' / ' + w.goal : v; }
    if (k >= 1) { w.ended = true; if (w.onEnd) w.onEnd(); }
  }
}

// ===== Студия =====
function buildStudio() {
  studio = new THREE.Group(); studio.position.set(0, STUDIO_Y, 0); studio.visible = false;
  GFX.scene.add(studio);
  cam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 20);
  // Подложка — квад прямо в экранных координатах на весь прямоугольник окна (не плоскость в мире):
  // мягкое светлое пятно за персонажами, к краям — в тон панели. Главное — скруглённые углы
  // той же формы, что у рамки .os-stage: прямоугольник scissor квадратный, и раньше острые углы
  // подложки просвечивали сквозь полупрозрачную панель за скруглением рамки.
  // Цвета заданы сразу в sRGB и выводятся как есть — совпадают с цветами CSS.
  back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uSize: { value: new THREE.Vector2(1, 1) }, uR: { value: STAGE_R }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }',
    fragmentShader: `uniform vec2 uSize; uniform float uR, uA; varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;                                     // пиксели от центра окна
  vec2 q = abs(p) - (uSize * 0.5 - uR);
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;  // расстояние до края скруглённого прямоугольника
  float mask = clamp(0.5 - dist, 0.0, 1.0);                         // сглаженный край в один пиксель
  float r = clamp(length(vec2((vUv.x - 0.5) * uSize.x / uSize.y, vUv.y - 0.44)) / 0.8, 0.0, 1.0);
  vec3 col = r < 0.55 ? mix(vec3(0.325, 0.396, 0.361), vec3(0.188, 0.227, 0.212), r / 0.55)
                      : mix(vec3(0.188, 0.227, 0.212), vec3(0.122, 0.145, 0.137), (r - 0.55) / 0.45);
  gl_FragColor = vec4(col, uA * mask);
}`,
    transparent: true, depthWrite: false
  }));
  // Глубина ~1 (дальше всего) и depthTest: подложка ложится только туда, где нет моделей.
  // renderOrder −1 — первой среди прозрачных, раньше дисков-теней под ногами.
  back.frustumCulled = false; back.renderOrder = -1;
  studio.add(back);
}
function enterStudio(melNode, petNode) {
  mel = melNode; petN = petNode || null;
  studio.add(mel.root);                      // add() сам снимает ноду с прежнего родителя (сцены)
  mel.root.position.set(petN ? MEL_X : 0, 0, 0); mel.root.rotation.set(0, petN ? MEL_YAW : 0, 0); mel.root.scale.setScalar(0.001);
  mel.pivot.rotation.x = 0; mel.headG.rotation.x = 0; mel.inner.rotation.set(0, 0, 0); mel.inner.scale.set(1, 1, 1); mel.inner.visible = true;
  mel.legL.rotation.x = -0.06; mel.legR.rotation.x = 0.06; mel.armL.rotation.x = -0.18; mel.armR.rotation.x = -0.14;   // поза меню
  mel.shadow.position.y = 0.02; mel.shadow.scale.setScalar(1);
  if (petN) {
    studio.add(petN.root);
    petN.root.position.set(PET_X, 0, PET_Z); petN.root.rotation.set(0, PET_YAW, 0); petN.root.scale.setScalar(0.001); petN.root.visible = true;
    petN.bob.position.y = 0; petN.bob.scale.set(1, 1, 1);
    petN.shadow.position.y = 0.02; petN.shadow.scale.setScalar(1);
  }
  back.material.uniforms.uA.value = 0;
}
// Вернуть ноды в общую сцену. Позы и позиции дальше выставляет main.js (resetRun / меню / забег).
function leaveStudio() {
  if (mel) { GFX.scene.add(mel.root); mel.root.scale.setScalar(1); mel = null; }
  if (petN) { GFX.scene.add(petN.root); petN.root.scale.setScalar(1); petN = null; }
}
// Прямоугольник окна студии. Читается только при открытии и на resize — не в кадре.
function measure() {
  const el = U.UI.overStage; if (!el || phase !== STATS) return;
  const r = el.getBoundingClientRect();
  sx = Math.round(r.left); sy = Math.round(r.top); sw = Math.round(r.width); sh = Math.round(r.height);
  if (sw < 2 || sh < 2) return;
  const aspect = sw / sh, fw = petN ? FRAME_W_PET : FRAME_W_SOLO, cx = petN ? FRAME_X_PET : 0;
  const d = Math.max(FRAME_H / 2 / TAN_H, fw / 2 / (TAN_H * aspect));   // влезть и по высоте, и по ширине
  cam.aspect = aspect; cam.far = d + 3; cam.updateProjectionMatrix();
  cam.position.set(cx, STUDIO_Y + FRAME_Y + CAM_LIFT, d); cam.lookAt(cx, STUDIO_Y + FRAME_Y, 0);
  back.material.uniforms.uSize.value.set(sw, sh);
}
function animateStudio() {
  back.material.uniforms.uA.value = Math.min(1, st / FADE);
  mel.root.scale.setScalar(popK(st - MEL_POP_AT));
  mel.root.rotation.y = (petN ? MEL_YAW : 0) + Math.sin(st * 0.7) * 0.1;   // медленно поворачивается, как на витрине
  mel.inner.position.y = -0.92 + Math.sin(st * 2.2) * 0.02;               // дыхание
  if (petN) {
    petN.root.scale.setScalar(popK(st - PET_POP_AT));
    petN.bob.position.y = Math.sin(st * 3) * 0.03;
    petN.tailPivot.rotation.y = Math.sin(st * 1.5) * 0.25;
  }
}

// ===== Кадр =====
// Зовётся из main.js каждый кадр в состоянии 'over'. Временных объектов не создаёт.
export function update(dt) {
  if (phase === REVIVE) { tickRevive(); return; }
  if (phase !== STATS) return;
  st += dt;
  // Одна контрольная перемерка после появления панели: если раскладка сдвинулась в первые кадры
  // (догрузилась иконка, шрифт, показался баннер), окно студии встанет точно в свою рамку.
  if (!remeasured && st >= FADE) { remeasured = true; measure(); }
  animateStudio();
  updateTweens();
  if (!recordShown && recordAt >= 0 && st >= recordAt) {
    recordShown = true; U.show(U.UI.newRecord, true);
    if (U.UI.overBestBox) U.UI.overBestBox.classList.add('rec');
  }
  if (!gainShown && st >= BALANCE_AT) { gainShown = true; if (U.UI.overGain) U.UI.overGain.classList.add('on'); }
}
// После основного кадра (GFX.render) — дорисовать студию в окно.
export function renderStage() {
  if (phase === STATS && sw > 1 && sh > 1) GFX.renderStudio(studio, cam, sx, sy, sw, sh);
}

// Закрыть экран смерти в любом этапе (воскрешение, «Ещё раз», «В меню»). Безопасно звать повторно.
export function close() {
  if (phase === STATS) leaveStudio();
  phase = NONE; tweens.length = 0;
}

// d: { onReviveEnd } — main.js открывает итоги (там же собираются данные забега).
export function initOverScreen(d) {
  deps = d;
  buildStudio();
  // Длительность кольца отсчёта берём отсюда, чтобы число жило в одном месте.
  const ring = document.querySelector('#reviveBox .rv-ring');
  if (ring) ring.style.animationDuration = REVIVE_TIME + 's';
  // Тап по затемнению мимо окна — сразу к итогам.
  const over = U.UI.over;
  if (over) over.addEventListener('click', e => { if (e.target === over && phase === REVIVE && !U.adBusy) { U.Sound.click(); toStats(); } });
  window.addEventListener('resize', measure);
}
