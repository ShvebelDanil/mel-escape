import * as U from './utils.js';
import * as TEX from './textures.js';
import * as SK from './skins.js';
import { t } from './i18n.js';

// ===== Реестр заданий =====
// Чтобы добавить/изменить задание — правится только этот массив:
//   id       — ключ в save.questsDone, менять у существующего задания НЕЛЬЗЯ (иначе награда выдастся повторно);
//   icon     — id символа в SVG-спрайте (<symbol> в начале <body> index.html);
//   nameKey  — ключ заголовка карточки в словаре source/i18n.js;
//   goal     — цель;
//   reward   — награда в пузыриках (save.currency — единственная валюта игры);
//   progress — текущее значение; считается из уже существующих показателей сейва,
//              плюс «живая» прибавка текущего забега (liveDist/liveBottles), чтобы
//              задание закрывалось прямо на бегу, а не только после смерти.
// id остаются прежними даже там, где цель изменилась (bottles300 → 2000, runs10 → 25,
// mini3 → 5): id — ключ в save.questsDone, и его смена выдала бы награду повторно.
// Актуальные числа живут в goal и в тексте (nameKey), а не в идентификаторе.
export const QUESTS = [
  { id: 'dist10k',    icon: 'ic-flag',   nameKey: 'quest.dist10k',     goal: 10000, reward: 300, progress: () => U.save.totalDist + liveDist },
  { id: 'bottles300', icon: 'ic-bottle', nameKey: 'quest.bottles2000', goal: 2000,  reward: 200, progress: () => U.save.bottles + liveBottles },
  { id: 'runs10',     icon: 'ic-play',   nameKey: 'quest.runs25',      goal: 25,    reward: 150, progress: () => U.save.runs },
  { id: 'skin1',      icon: 'ic-shirt',  nameKey: 'quest.skin1',       goal: 1,     reward: 100, progress: () => U.save.ownedSkins.length },
  { id: 'pet1',       icon: 'ic-paw',    nameKey: 'quest.pet1',        goal: 1,     reward: 100, progress: () => U.save.ownedPets.length },
  { id: 'mini3',      icon: 'ic-money',  nameKey: 'quest.mini5',       goal: 5,     reward: 200, progress: () => U.save.miniGames },
  // Паверапы считаются все вместе: магнит, х2 и сапоги (source/powerups.js).
  { id: 'power10',    icon: 'ic-bolt',   nameKey: 'quest.power10',     goal: 10,    reward: 200, progress: () => U.save.powerups }
];

// Вставка иконки из общего SVG-спрайта index.html (одноцветная, красится через currentColor).
// Экспорт — для карточек заданий на экране итогов забега (source/overscreen.js).
export const ico = id => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';

const TOAST_MS = 3200;   // сколько уведомление висит до начала растворения
const TOAST_OUT = 400;   // длительность анимации ухода (.quest-toast.out в index.html)
const TOAST_MAX = 3;     // больше трёх карточек на экране не копим

// Прогресс текущего забега, ещё не записанный в save (банкуется в main.js при caught()).
let liveDist = 0, liveBottles = 0;
export function setLive(dist, bottles) { liveDist = dist; liveBottles = bottles; }

export const isDone = id => U.save.questsDone.indexOf(id) >= 0;
// Сколько заданий из реестра закрыто. Считаем по QUESTS, а не по длине save.questsDone:
// в сейве могут остаться id заданий, которых в игре уже нет.
export function doneCount() {
  let n = 0;
  for (let i = 0; i < QUESTS.length; i++) if (isDone(QUESTS[i].id)) n++;
  return n;
}
export const allDone = () => doneCount() >= QUESTS.length;
// Прогресс для показа: целое число от 0 до цели (сверх цели полоса не растёт).
const shownProgress = q => Math.min(Math.max(0, q.progress() | 0), q.goal);

// ===== Прогресс за один забег (экран итогов, source/overscreen.js) =====
// Снимок берётся в момент старта забега (main.js: beginRun / quickRestart), а не при сборке меню:
// между ними игрок может купить скин или сыграть в мини-игру, и это не должно выглядеть прогрессом забега.
// Массивы заводятся один раз по длине реестра, снимок только перезаписывает числа.
const runFrom = QUESTS.map(() => 0), runWasDone = QUESTS.map(() => false);
export function snapshotRun() {
  for (let i = 0; i < QUESTS.length; i++) { runFrom[i] = shownProgress(QUESTS[i]); runWasDone[i] = isDone(QUESTS[i].id); }
}
// Задания, которые продвинулись с последнего snapshotRun(): { q, from, to, done }.
// done — задание закрылось именно в этом забеге (закрытые раньше не показываем вовсе).
// Зовётся один раз на открытие окна итогов, поэтому новый массив здесь допустим.
export function runProgress() {
  const out = [];
  for (let i = 0; i < QUESTS.length; i++) {
    if (runWasDone[i]) continue;
    const q = QUESTS[i], to = shownProgress(q);
    if (to > runFrom[i]) out.push({ q, from: runFrom[i], to, done: isDone(q.id) });
  }
  return out;
}

// Приз за полный комплект заданий — секретный скин (SKINS[...].secret в source/skins.js).
// Выдаётся молча и только один раз; true — если выдали прямо сейчас.
function grantSecret() {
  const s = SK.secretSkin();
  return !!s && allDone() && SK.grant(s.id);
}

// Проверка выполнения. Вызывается из игрового цикла (смена метра, сбор пузырика),
// поэтому внутри — обычный цикл по индексу без временных объектов и без for..of:
// аллокаций на кадр быть не должно, тяжёлое (persist/DOM) выполняется только в момент
// реального выполнения задания. Возвращает число закрытых за вызов заданий.
export function check() {
  let done = 0;
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i];
    if (isDone(q.id) || q.progress() < q.goal) continue;
    U.save.questsDone.push(q.id);
    U.save.currency += q.reward;
    toast(q);
    done++;
  }
  if (done) {
    if (grantSecret()) secretToast();
    U.persistSave();
    if (isOpen(U.UI.questsModal)) render();
  }
  return done;
}

// ===== Уведомление =====
function toast(q) {
  const box = U.UI.questToasts; if (!box) return;
  const el = document.createElement('div');
  el.className = 'quest-toast';
  el.innerHTML = '<div class="qt-check">' + ico('ic-check') + '</div>' +
    '<div class="qt-body"><div class="qt-title">' + t('quests.toastDone') + '</div><div class="qt-name"></div></div>' +
    '<div class="qt-reward"><img alt=""><span></span></div>';
  el.querySelector('.qt-name').textContent = t(q.nameKey);
  el.querySelector('.qt-reward img').src = TEX.url('bottle');
  el.querySelector('.qt-reward span').textContent = '+' + q.reward;
  pushToast(box, el);
}

// Тост об открытии секретного скина: блока награды нет — приз выдаётся не пузыриками.
function secretToast() {
  const box = U.UI.questToasts; if (!box) return;
  const el = document.createElement('div');
  el.className = 'quest-toast';
  el.innerHTML = '<div class="qt-check">' + ico('ic-shirt') + '</div>' +
    '<div class="qt-body"><div class="qt-title">' + t('quests.toastSkin') + '</div><div class="qt-name">' + t('quests.toastSkinSub') + '</div></div>';
  pushToast(box, el);
}

function pushToast(box, el) {
  box.appendChild(el);
  // Контейнер — flex-колонка, поэтому несколько подряд выполненных заданий
  // встают друг под другом; самые старые убираем, чтобы не залить пол-экрана.
  while (box.children.length > TOAST_MAX) box.removeChild(box.firstChild);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, TOAST_OUT);
  }, TOAST_MS);
}

// ===== Список заданий =====
// Перестраивается только при открытии окна (и при выполнении задания с открытым окном),
// не в игровом цикле — поэтому создавать узлы здесь нормально.
export function render() {
  renderSecret();
  const list = U.UI.questsList; if (!list) return;
  const bottleUrl = TEX.url('bottle');
  list.innerHTML = '';
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i], done = isDone(q.id);
    const cur = shownProgress(q);
    const card = document.createElement('div');
    card.className = 'quest-card ui-tile';
    card.dataset.done = done ? '1' : '0';
    card.innerHTML = '<div class="q-icon">' + ico(q.icon) + '</div>' +
      '<div class="q-main"><div class="q-name"></div><div class="q-row"><div class="q-bar"><i></i></div><div class="q-prog"></div>' +
      (done ? '<div class="q-check">' + ico('ic-check') + '</div>' : '') + '</div></div>' +
      '<div class="q-reward"><div class="l">' + t('quests.reward') + '</div><div class="v"><img alt=""><span></span></div></div>';
    card.querySelector('.q-name').textContent = t(q.nameKey);
    card.querySelector('.q-prog').textContent = cur + ' / ' + q.goal;
    card.querySelector('.q-bar i').style.width = Math.round(cur / q.goal * 100) + '%';
    card.querySelector('.q-reward img').src = bottleUrl;
    card.querySelector('.q-reward span').textContent = q.reward;
    list.appendChild(card);
  }
}

// Баннер приза: прогресс по ВСЕМ заданиям плюс картинка настоящей модели —
// чёрный силуэт, пока скин закрыт, и сам скин после выдачи. Картинка запрашивается
// лениво и только один раз на состояние (data-open помнит, что уже стоит в <img>).
function renderSecret() {
  const el = U.UI.secretQuest; if (!el) return;
  const s = SK.secretSkin();
  U.show(el, !!s);
  if (!s) return;
  const open = SK.isOwned(s.id), cur = doneCount();
  el.dataset.done = open ? '1' : '0';
  el.querySelector('.sq-sub').textContent = open
    ? t('quests.secretOpen')
    : t('quests.secretLocked');
  el.querySelector('.q-bar i').style.width = Math.round(cur / QUESTS.length * 100) + '%';
  el.querySelector('.q-prog').textContent = cur + ' / ' + QUESTS.length;
  const img = el.querySelector('.sq-shot img');
  const want = open ? '1' : '0';
  if (img && img.dataset.open !== want) {
    const url = SK.secretShot(open);
    if (url) { img.src = url; img.dataset.open = want; }
  }
}

// ===== Модалки =====
const isOpen = el => !!el && !el.classList.contains('hidden');
export const modalOpen = () => isOpen(U.UI.settingsModal) || isOpen(U.UI.questsModal) || isOpen(U.UI.rouletteModal) || isOpen(U.UI.adRewardModal) || isOpen(U.UI.leaderboardModal) || isOpen(U.UI.powerupsModal);
// adRewardModal, rouletteModal, leaderboardModal и powerupsModal тоже гасим здесь (Escape, уход в магазин/забег), но их
// собственные кнопки живут в source/adreward.js, source/roulette.js, source/leaderboard.js и source/powerups.js — сюда они попадают только как элементы.
export function closeAll() { U.show(U.UI.settingsModal, false); U.show(U.UI.questsModal, false); U.show(U.UI.rouletteModal, false); U.show(U.UI.adRewardModal, false); U.show(U.UI.leaderboardModal, false); U.show(U.UI.powerupsModal, false); }
export function openSettings() { closeAll(); U.show(U.UI.settingsModal, true); }
export function openQuests() { closeAll(); render(); U.show(U.UI.questsModal, true); }

// Свои биндинги (как в shop.js): main.js остаётся точкой входа, но не тащит на себе
// внутренние кнопки окон заданий/настроек.
export function initQuests() {
  // Старый сейв мог закрыть все задания ещё до появления приза — выдаём скин молча.
  grantSecret();
  const act = fn => () => { if (U.adBusy) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  for (const id of ['settingsClose', 'questsClose']) {
    const el = U.$(id); if (el) el.addEventListener('click', act(closeAll));
  }
  // Клик по затемнённому фону (не по самой панели) тоже закрывает окно.
  for (const el of [U.UI.settingsModal, U.UI.questsModal]) {
    if (el) el.addEventListener('click', e => { if (e.target === el) { U.Sound.click(); closeAll(); } });
  }
}
