import * as U from './utils.js';
import * as SHOP from './shop.js';
import * as QST from './quests.js';
import { t } from './i18n.js';

// Награда за просмотр rewarded-рекламы: плюсик у бейджа пузыриков в меню.
// Здесь же — единственное место настройки фичи.
// Цена вещей в роликах от AD_REWARD НЕ зависит — у неё своя формула (adsFor в конце файла).
export const AD_REWARD = 250;              // пузыриков за один досмотренный ролик
export const AD_COOLDOWN_MS = 3 * 60 * 1000; // пауза между наградами, мс

// lastRewardAt намеренно не пишется в сейв: кулдаун защищает от кликания подряд
// в одной сессии, а гонять из-за него облачный сейв смысла нет.
let lastRewardAt = -AD_COOLDOWN_MS, pending = false, cdTimer = 0;

const leftMs = () => Math.max(0, AD_COOLDOWN_MS - (Date.now() - lastRewardAt));
function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Одно окно на все четыре состояния: спрашиваем (ask), ждём рекламу (wait),
// начислили (ok), не получилось (err). Пустой btn прячет кнопку.
function setState(state, title, text, btn) {
  const m = U.UI.adRewardModal; if (!m) return;
  m.dataset.state = state;
  if (U.UI.adRewardTitle) U.UI.adRewardTitle.textContent = title;
  if (U.UI.adRewardText) U.UI.adRewardText.textContent = text;
  const b = U.UI.adRewardBtn;
  if (b) { b.textContent = btn || ''; U.show(b, !!btn); }
}

// Плюсик во время кулдауна гаснет. Вместо опроса каждый кадр — один таймер,
// который будит кнопку ровно в момент окончания паузы.
function syncBtn() {
  const b = U.UI.curAddBtn; if (!b) return;
  const l = leftMs();
  b.dataset.wait = l > 0 ? '1' : '0';
  if (cdTimer) { clearTimeout(cdTimer); cdTimer = 0; }
  if (l > 0) cdTimer = setTimeout(() => { cdTimer = 0; syncBtn(); }, l + 50);
}

export function open() {
  QST.closeAll();
  if (leftMs() > 0) setState('wait', t('ad.waitTitle'), t('ad.waitText', { time: mmss(leftMs()) }), t('modal.ok'));
  else setState('ask', t('ad.title'), t('ad.askText', { n: AD_REWARD }), t('ad.watch'));
  U.show(U.UI.adRewardModal, true);
}
export function close() { if (!pending) U.show(U.UI.adRewardModal, false); }

function grant() {
  U.save.currency += AD_REWARD;
  U.persistSave();
  SHOP.refreshCurrency();  // бейджи меню и магазина
  lastRewardAt = Date.now();
  syncBtn();
  setState('ok', t('ad.okTitle'), t('ad.okText', { n: AD_REWARD }), t('ad.okBtn'));
}

function watch() {
  if (pending || U.adBusy || leftMs() > 0) return;
  const y = U.Sdk.ysdk;
  // Вне Яндекс.Игр (локальный запуск, SDK не загрузился) рекламы нет —
  // выдаём награду сразу, иначе фичу нельзя было бы проверить.
  if (!y || !y.adv) { grant(); return; }
  pending = true;
  setState('wait', t('ad.loadTitle'), t('ad.loadText'), '');
  U.showRewarded(
    () => { pending = false; grant(); },
    () => { pending = false; setState('err', t('ad.errTitle'), t('ad.errText'), t('ad.errBtn')); }
  );
}

// Свои биндинги, как в shop.js/quests.js: main.js только вызывает init.
export function initAdReward() {
  const on = (id, fn) => { const el = U.$(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (U.adBusy) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  on('curAddBtn', act(open));
  on('adRewardClose', act(close));
  // Кнопка окна: в состоянии «спрашиваем» запускает рекламу, в остальных — закрывает.
  on('adRewardBtn', act(() => {
    const m = U.UI.adRewardModal;
    if (m && m.dataset.state === 'ask') watch(); else close();
  }));
  const m = U.UI.adRewardModal;
  if (m) m.addEventListener('click', e => { if (e.target === m && !U.adBusy) { U.Sound.click(); close(); } });
  syncBtn();
}

// ===== Покупка вещей за ролики (магазин, source/shop.js) =====
// Сколько роликов стоит вещь: floor(C / (AD_BASE + floor(C / AD_STEP))), C — цена в пузыриках.
// «Курс» одного ролика растёт вместе с ценой (105 пузыриков у 500, 200 у 10000), поэтому
// дешёвые вещи больше не отдаются за 2 ролика, а дорогие не превращаются в сотню просмотров:
//   500 → 4, 1000 → 9, 2000 → 16, 3000 → 23, 5000 → 33, 10000 → 50.
// Ниже одного ролика не опускаемся (защита на случай очень дешёвых вещей).
// Формула живая: поменяли цену в skins.js/pets.js — число само пересчиталось.
// Каждый досмотренный ролик ещё и снижает цену в пузыриках (adPrice ниже).
const AD_BASE = 100, AD_STEP = 100;
export function adsFor(price) {
  const c = Math.max(0, price | 0);
  return Math.max(1, Math.floor(c / (AD_BASE + Math.floor(c / AD_STEP))));
}

// Цена в пузыриках после seen досмотренных роликов: каждый ролик снимает C/N (N = adsFor(C)),
// то есть цена = C·(N − seen)/N и на последнем ролике доходит до нуля — вещь выдаётся даром.
// Промежуточная цена округляется ВВЕРХ до PRICE_ROUND: круглые числа на ценнике,
// и скидка никогда не больше честной доли. Считаем в целых, чтобы не ловить 0.9999.
const PRICE_ROUND = 10;
export function adPrice(price, seen) {
  const c = Math.max(0, price | 0), n = adsFor(c), k = Math.min(Math.max(0, seen | 0), n);
  if (k === 0) return c;
  const left = Math.ceil(c * (n - k) / n / PRICE_ROUND) * PRICE_ROUND;
  return Math.min(c, left);
}

// Показать ролик «за вещь». Кулдаун плюсика здесь намеренно не действует: он сдерживает
// фарм валюты, а вещь и так стоит несколько просмотров подряд.
export function watchAd(onOk, onFail) {
  if (U.adBusy) return onFail();
  const y = U.Sdk.ysdk;
  // Вне Яндекс.Игр рекламы нет — засчитываем просмотр, иначе фичу не проверить (как и в меню).
  if (!y || !y.adv) return onOk();
  U.showRewarded(onOk, onFail);
}
