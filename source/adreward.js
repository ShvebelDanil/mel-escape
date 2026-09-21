import * as U from './utils.js';
import * as SHOP from './shop.js';
import * as QST from './quests.js';
import { t } from './i18n.js';

// Награда за просмотр rewarded-рекламы: плюсик у бейджа пузыриков в меню.
// Здесь же — единственное место настройки фичи.
// AD_REWARD задаёт сразу две вещи: награду за ролик у плюсика в меню И «курс» покупки вещей
// за рекламу (adsFor в конце файла = цена / награда). 250 выбрано от самого дорогого скина:
// 5000 / 250 = 20 роликов, остальные цены пересчитываются в той же пропорции.
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
// Сколько роликов стоит вещь: её цена, делённая на награду за один ролик в меню.
// Округляем вверх и не даём опуститься ниже одного — дешёвые вещи стоят 1 ролик.
// Формула живая: поменяли AD_REWARD или цену в skins.js/pets.js — число само пересчиталось.
export const adsFor = price => Math.max(1, Math.ceil((price | 0) / AD_REWARD));

// Показать ролик «за вещь». Кулдаун плюсика здесь намеренно не действует: он сдерживает
// фарм валюты, а вещь и так стоит несколько просмотров подряд.
export function watchAd(onOk, onFail) {
  if (U.adBusy) return onFail();
  const y = U.Sdk.ysdk;
  // Вне Яндекс.Игр рекламы нет — засчитываем просмотр, иначе фичу не проверить (как и в меню).
  if (!y || !y.adv) return onOk();
  U.showRewarded(onOk, onFail);
}
