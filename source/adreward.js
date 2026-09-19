import * as U from './utils.js';
import * as SHOP from './shop.js';
import * as QST from './quests.js';

// Награда за просмотр rewarded-рекламы: плюсик у бейджа чекушек в меню.
// Здесь же — единственное место настройки фичи.
export const AD_REWARD = 100;              // чекушек за один досмотренный ролик
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
  if (leftMs() > 0) setState('wait', 'Подожди', 'Награда за рекламу уже получена. Следующая — через ' + mmss(leftMs()) + '.', 'Ок');
  else setState('ask', 'Бонус', 'Посмотреть рекламу за ' + AD_REWARD + ' чекушек?', 'Смотреть');
  U.show(U.UI.adRewardModal, true);
}
export function close() { if (!pending) U.show(U.UI.adRewardModal, false); }

function grant() {
  U.save.currency += AD_REWARD;
  U.persistSave();
  SHOP.refreshCurrency();  // бейджи меню и магазина
  lastRewardAt = Date.now();
  syncBtn();
  setState('ok', 'Готово', '+' + AD_REWARD + ' чекушек зачислено!', 'Отлично');
}

function watch() {
  if (pending || U.adBusy || leftMs() > 0) return;
  const y = U.Sdk.ysdk;
  // Вне Яндекс.Игр (локальный запуск, SDK не загрузился) рекламы нет —
  // выдаём награду сразу, иначе фичу нельзя было бы проверить.
  if (!y || !y.adv) { grant(); return; }
  pending = true;
  setState('wait', 'Реклама', 'Загружаем ролик…', '');
  U.showRewarded(
    () => { pending = false; grant(); },
    () => { pending = false; setState('err', 'Не вышло', 'Награда не засчитана: ролик не был досмотрен до конца или реклама сейчас недоступна.', 'Понятно'); }
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
