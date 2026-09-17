import * as U from './utils.js';
import * as TEX from './textures.js';

// ===== Реестр заданий =====
// Чтобы добавить/изменить задание — правится только этот массив:
//   id       — ключ в save.questsDone, менять у существующего задания НЕЛЬЗЯ (иначе награда выдастся повторно);
//   icon     — id символа в SVG-спрайте (<symbol> в начале <body> index.html);
//   name     — заголовок карточки;
//   goal     — цель;
//   reward   — награда в чекушках (save.currency — единственная валюта игры);
//   progress — текущее значение; считается из уже существующих показателей сейва,
//              плюс «живая» прибавка текущего забега (liveDist/liveBottles), чтобы
//              задание закрывалось прямо на бегу, а не только после смерти.
export const QUESTS = [
  { id: 'dist10k',    icon: 'ic-flag',   name: 'Пробеги 10000 метров',      goal: 10000, reward: 300, progress: () => U.save.totalDist + liveDist },
  { id: 'bottles300', icon: 'ic-bottle', name: 'Собери 300 чекушек',        goal: 300,   reward: 200, progress: () => U.save.bottles + liveBottles },
  { id: 'runs10',     icon: 'ic-play',   name: 'Сделай 10 забегов',         goal: 10,    reward: 150, progress: () => U.save.runs },
  { id: 'skin1',      icon: 'ic-shirt',  name: 'Купи скин',                 goal: 1,     reward: 100, progress: () => U.save.ownedSkins.length },
  { id: 'pet1',       icon: 'ic-paw',    name: 'Заведи питомца',            goal: 1,     reward: 100, progress: () => U.save.ownedPets.length },
  { id: 'mini3',      icon: 'ic-money',  name: 'Сыграй в мини-игру 3 раза', goal: 3,     reward: 200, progress: () => U.save.miniGames }
];

// Вставка иконки из общего SVG-спрайта index.html (одноцветная, красится через currentColor).
const ico = id => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';

const TOAST_MS = 3200;   // сколько уведомление висит до начала растворения
const TOAST_OUT = 400;   // длительность анимации ухода (.quest-toast.out в index.html)
const TOAST_MAX = 3;     // больше трёх карточек на экране не копим

// Прогресс текущего забега, ещё не записанный в save (банкуется в main.js при caught()).
let liveDist = 0, liveBottles = 0;
export function setLive(dist, bottles) { liveDist = dist; liveBottles = bottles; }

export const isDone = id => U.save.questsDone.indexOf(id) >= 0;

// Проверка выполнения. Вызывается из игрового цикла (смена метра, сбор чекушки),
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
  if (done) { U.persistSave(); if (isOpen(U.UI.questsModal)) render(); }
  return done;
}

// ===== Уведомление =====
function toast(q) {
  const box = U.UI.questToasts; if (!box) return;
  const el = document.createElement('div');
  el.className = 'quest-toast';
  el.innerHTML = '<div class="qt-check">' + ico('ic-check') + '</div>' +
    '<div class="qt-body"><div class="qt-title">Выполнено задание!</div><div class="qt-name"></div></div>' +
    '<div class="qt-reward"><img alt=""><span></span></div>';
  el.querySelector('.qt-name').textContent = q.name;
  el.querySelector('.qt-reward img').src = TEX.url('bottle');
  el.querySelector('.qt-reward span').textContent = '+' + q.reward;
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
  const list = U.UI.questsList; if (!list) return;
  const bottleUrl = TEX.url('bottle');
  list.innerHTML = '';
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i], done = isDone(q.id);
    const cur = Math.min(Math.max(0, q.progress() | 0), q.goal);
    const card = document.createElement('div');
    card.className = 'quest-card ui-tile';
    card.dataset.done = done ? '1' : '0';
    card.innerHTML = '<div class="q-icon">' + ico(q.icon) + '</div>' +
      '<div class="q-main"><div class="q-name"></div><div class="q-row"><div class="q-bar"><i></i></div><div class="q-prog"></div>' +
      (done ? '<div class="q-check">' + ico('ic-check') + '</div>' : '') + '</div></div>' +
      '<div class="q-reward"><div class="l">Награда</div><div class="v"><img alt=""><span></span></div></div>';
    card.querySelector('.q-name').textContent = q.name;
    card.querySelector('.q-prog').textContent = cur + ' / ' + q.goal;
    card.querySelector('.q-bar i').style.width = Math.round(cur / q.goal * 100) + '%';
    card.querySelector('.q-reward img').src = bottleUrl;
    card.querySelector('.q-reward span').textContent = q.reward;
    list.appendChild(card);
  }
}

// ===== Модалки =====
const isOpen = el => !!el && !el.classList.contains('hidden');
export const modalOpen = () => isOpen(U.UI.settingsModal) || isOpen(U.UI.questsModal) || isOpen(U.UI.soonModal);
export function closeAll() { U.show(U.UI.settingsModal, false); U.show(U.UI.questsModal, false); U.show(U.UI.soonModal, false); }
export function openSettings() { closeAll(); U.show(U.UI.settingsModal, true); }
export function openQuests() { closeAll(); render(); U.show(U.UI.questsModal, true); }
export function openSoon() { closeAll(); U.show(U.UI.soonModal, true); }

// Свои биндинги (как в shop.js): main.js остаётся точкой входа, но не тащит на себе
// внутренние кнопки окон заданий/настроек.
export function initQuests() {
  const act = fn => () => { if (U.adBusy) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  for (const id of ['settingsClose', 'questsClose', 'soonClose', 'soonOkBtn']) {
    const el = U.$(id); if (el) el.addEventListener('click', act(closeAll));
  }
  // Клик по затемнённому фону (не по самой панели) тоже закрывает окно.
  for (const el of [U.UI.settingsModal, U.UI.questsModal, U.UI.soonModal]) {
    if (el) el.addEventListener('click', e => { if (e.target === el) { U.Sound.click(); closeAll(); } });
  }
}
