import * as U from './utils.js';
import * as QST from './quests.js';
import { t } from './i18n.js';

// Таблица лидеров Яндекс Игр: рекорд забега в метрах.
//
// LB_NAME — ТЕХНИЧЕСКОЕ имя таблицы, заданное в консоли разработчика. Должно совпадать
// с консолью буква в букву, иначе SDK отвечает ошибкой «leaderboard not found».
// Тип значения — числовой, сортировка — по убыванию, размерность — метры.
export const LB_NAME = 'bestDistance';

const TOP = 10;    // сколько строк показываем сверху
const AROUND = 3;  // сколько соседей показываем вокруг самого игрока, если он не в топе

// Последнее отправленное в таблицу значение. Та же защита, что у lastCloudJson в utils.js:
// setLeaderboardScore с уже записанным рекордом тратит лимит запросов впустую. Метку ставим
// ДО отправки и при ошибке не откатываем — следующий рекорд всё равно перешлёт результат.
let sentScore = -1;
let loading = false;

// Отправка рекорда. Неавторизованного игрока таблица не принимает вовсе, поэтому для него
// это пустой вызов: его результат уйдёт позже, сразу после входа (pushBest).
export function submit(meters) {
  const m = meters | 0;
  if (!U.Sdk.ysdk || !U.Sdk.authorized || m <= sentScore || m <= 0) return;
  sentScore = m;
  U.Sdk.getLeaderboards().then(lb => lb.setLeaderboardScore(LB_NAME, m)).catch(() => {});
}

// Досылка рекорда, набитого до входа в аккаунт (или в прошлой сессии, когда SDK не ответил).
// Вызывается один раз после проверки авторизации и сразу после успешного входа.
const pushBest = () => submit(U.save.best);

// ===== Окно =====
// Четыре состояния, как в adreward.js: грузим / не авторизован / список / ошибка.
// Показ элементов — обычный U.show, без отдельного data-state: блоков всего три.
function setMsg(text, showLogin) {
  U.show(U.UI.lbList, false);
  U.show(U.UI.lbYou, false);
  U.show(U.UI.lbLoginBtn, !!showLogin);
  const el = U.UI.lbMsg; if (!el) return;
  el.textContent = text;
  U.show(el, true);
}

export function open() {
  QST.closeAll();
  U.show(U.UI.leaderboardModal, true);
  render();
}
export function close() { U.show(U.UI.leaderboardModal, false); }

function render() {
  if (!U.Sdk.ysdk) { setMsg(t('lb.offline'), false); return; }   // локальный запуск вне Яндекс Игр
  if (U.Sdk.authorized) { renderList(); return; }
  // Флаг мог ещё не обновиться (SDK ответил медленно, окно открыли сразу) — перепроверяем,
  // прежде чем показывать экран «войди»: авторизованный игрок не должен его видеть.
  setMsg(t('lb.loading'), false);
  U.Sdk.checkAuth().then(ok => { if (ok) renderList(); else setMsg(t('lb.guest'), true); });
}

function renderList() {
  if (loading) return;
  loading = true;
  setMsg(t('lb.loading'), false);
  // Игрок нужен, чтобы подсветить его собственную строку: сравнивать по имени нельзя —
  // тёзки не редкость, а uniqueID уникален.
  Promise.all([
    U.Sdk.getLeaderboards().then(lb => lb.getLeaderboardEntries(LB_NAME, { quantityTop: TOP, includeUser: true, quantityAround: AROUND })),
    U.Sdk.getPlayer().then(p => p.getUniqueID()).catch(() => '')
  ]).then(([res, myId]) => {
    loading = false;
    const entries = (res && res.entries) || [];
    if (!entries.length) { setMsg(t('lb.empty'), false); return; }
    fillList(entries, myId, res.userRank | 0);
  }).catch(() => { loading = false; setMsg(t('lb.error'), false); });
}

// Список строится только при открытии окна, не в игровом цикле, — создавать узлы здесь нормально.
// Всё складываем в DocumentFragment и вставляем одной операцией: меньше пересчётов вёрстки.
function fillList(entries, myId, userRank) {
  const list = U.UI.lbList; if (!list) return;
  const frag = document.createDocumentFragment();
  let prevRank = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i], p = e.player || {}, rank = e.rank | 0;
    // Между топом и блоком вокруг игрока в ответе Яндекса дыра в рангах — рисуем многоточие,
    // иначе «10-е место, 274-е место» подряд выглядит как ошибка.
    if (prevRank && rank > prevRank + 1) {
      const gap = document.createElement('div');
      gap.className = 'lb-gap'; gap.textContent = '···';
      frag.appendChild(gap);
    }
    prevRank = rank;
    const row = document.createElement('div');
    row.className = 'lb-row ui-tile';
    row.dataset.rank = rank <= 3 ? String(rank) : '';
    row.dataset.me = (myId && p.uniqueID === myId) ? '1' : '0';
    row.innerHTML = '<div class="lb-rank"></div><div class="lb-ava"><img alt=""></div>' +
      '<div class="lb-name"></div><div class="lb-score"><span></span><small></small></div>';
    row.querySelector('.lb-rank').textContent = rank;
    row.querySelector('.lb-name').textContent = p.publicName || t('lb.anon');
    row.querySelector('.lb-score span').textContent = e.score | 0;
    row.querySelector('.lb-score small').textContent = t('hud.meters');
    const img = row.querySelector('.lb-ava img');
    const src = typeof p.getAvatarSrc === 'function' ? p.getAvatarSrc('small') : '';
    // Аватар может быть закрыт настройками приватности или просто не загрузиться —
    // тогда прячем <img>, и остаётся тёмный кружок-заглушка.
    if (src) { img.addEventListener('error', () => U.show(img, false)); img.src = src; }
    else U.show(img, false);
    frag.appendChild(row);
  }
  list.innerHTML = '';
  list.appendChild(frag);
  U.show(U.UI.lbMsg, false);
  U.show(U.UI.lbLoginBtn, false);
  U.show(list, true);
  // userRank === 0 — игрока в таблице ещё нет (ни одного забега после входа).
  const you = U.UI.lbYou;
  if (you) { you.textContent = userRank > 0 ? t('lb.yourPlace', { n: userRank }) : t('lb.noPlace'); U.show(you, true); }
}

// ===== Вход в аккаунт =====
// Чужие данные сюда не подмешиваются: loadCloud() мёржит облако с текущим сейвом по максимуму
// и объединению списков, поэтому прогресс, набитый до входа, не теряется. persistSave() сразу
// после — чтобы этот объединённый сейв лёг уже в аккаунт, а не остался только локально.
let onMerged = () => {};
function login() {
  if (!U.Sdk.ysdk) return;
  setMsg(t('lb.loading'), false);
  U.Sdk.login().then(ok => {
    if (!ok) { render(); return; }
    // askName() до загрузки облака: разрешение на имя и аватар нужно, чтобы своя строка
    // в таблице не называлась «Аноним». Отказ игрока не мешает остальному — промис не падает.
    return U.Sdk.askName().then(() => U.withTimeout(U.Sdk.loadCloud(), 5000)).then(() => {
      U.syncAudioUI(); U.persistSave(); onMerged();
      sentScore = -1;   // рекорд анонима в таблицу не уходил — отправляем его уже от аккаунта
      pushBest();
      render();
    });
  }).catch(() => render());   // игрок закрыл окно входа — просто возвращаем прежний экран
}

// Свои биндинги, как в shop.js/quests.js: main.js только вызывает init.
// opts.onSaveMerged — перерисовка меню после подтягивания облачного сейва (рекорд, пузырики).
export function initLeaderboard(opts) {
  onMerged = (opts && opts.onSaveMerged) || (() => {});
  const on = (id, fn) => { const el = U.$(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (U.adBusy) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  on('lbClose', act(close));
  on('lbLoginBtn', act(login));
  const m = U.UI.leaderboardModal;
  if (m) m.addEventListener('click', e => { if (e.target === m && !U.adBusy) { U.Sound.click(); close(); } });
  // Один вызов на всю сессию: игрок закеширован, так что это бесплатно. Если аккаунт уже
  // есть — сразу досылаем локальный рекорд, иначе он попал бы в таблицу только после забега.
  U.Sdk.checkAuth().then(ok => { if (ok) pushBest(); });
}
