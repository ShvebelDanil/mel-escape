import * as U from './utils.js';
import * as SHOP from './shop.js';
import * as QST from './quests.js';

// Рулетка пузыриков — мини-игра из главного меню (кнопка 💵 → #minigameBtn).
// Экономика — обе константы только здесь: HOUSE_EDGE — средний возврат игроку (казино
// забирает разницу), множитель выигрыша = HOUSE_EDGE*100/шанс%, то есть чем ниже выбранный
// шанс, тем выше выплата (классика гэмблинг-рулеток, подтверждено пользователем).
const HOUSE_EDGE = 0.95;
export const BET_MIN = 10, BET_STEP = 10;
const CHANCE_MIN = 5, CHANCE_MAX = 75, CHANCE_DEFAULT = 50;
const PRESETS = [10, 30, 50, 75];
const SPIN_MS = 4200;                 // длительность анимации остановки колеса
const SPIN_TURNS_MIN = 5, SPIN_TURNS_MAX = 7; // сколько полных оборотов делает колесо перед остановкой
const ZONE_MARGIN = 4;                // отступ от границы цветовой зоны (град.), чтобы указатель не вставал точно на стык
const LOSE_LINES = ['Ничего страшного!', 'Не повезло — попробуй ещё раз!', 'В другой раз получится!', 'Почти! Крути ещё.'];

const multiplier = chancePct => HOUSE_EDGE * 100 / chancePct;

let bet = 100, chance = CHANCE_DEFAULT;
let spinning = false, finished = true, finishTimer = 0, rotationDeg = 0;
let pendingWin = false, pendingPayout = 0;

const afford = () => (U.save.currency | 0) >= BET_MIN;
// Ставка — любое целое число в [BET_MIN, баланс], без привязки к сетке шага: шаг нужен
// только степперам (±10), а ручной ввод/ALL IN должны принимать точное число.
function clampBet(v) {
  const cur = Math.max(0, U.save.currency | 0);
  if (cur < BET_MIN) return cur; // нечем даже минимально поставить — показываем остаток, кнопка спина всё равно заблокирована
  return U.clamp(Math.round(v), BET_MIN, cur);
}
const potentialWin = () => Math.round(bet * multiplier(chance));

// ===== Геометрия колеса =====
// Диск неподвижен — это просто «бак с водой» с двумя зонами: «вода» (низ, высота = chance%)
// и «воздух» (верх), обе зафиксированы в экранных координатах (0° — 12 часов, 180° — низ).
// Крутится только указатель-стрелка (отдельный слой того же размера, что диск, см. CSS
// .rlt-wheel-arrow), облетая круг вокруг его центра. Реальный исход решает RNG в spin() —
// расчёт угла ниже только подбирает, ГДЕ на статичном диске остановить указатель, чтобы он
// визуально попал в уже решённую зону.
// φ0 — половина дуги «воздуха» от верхней точки (в градусах), считается из простой геометрии
// круга: хорда на высоте chance% от низа пересекает окружность в точке cos(φ)=2*chance-1.
function airHalfArc(c) { return Math.acos(U.clamp(2 * c - 1, -1, 1)) * 180 / Math.PI; }
function pickTargetAngle(win) {
  const half = airHalfArc(chance / 100);
  if (win) {
    // «вода» — дуга вокруг нижней точки (180°), от half до 360-half
    const lo = half + ZONE_MARGIN, hi = 360 - half - ZONE_MARGIN;
    return hi > lo ? U.rand(lo, hi) : 180;
  }
  // «воздух» — дуга вокруг верхней точки (0°), от -half до half
  const lo = -(half - ZONE_MARGIN), hi = half - ZONE_MARGIN;
  const a = hi > lo ? U.rand(lo, hi) : 0;
  return (a + 360) % 360;
}
// Переводит целевой угол (уже в экранных координатах статичного диска) в абсолютный
// transform:rotate() для указателя, плюс несколько полных оборотов ради эффекта вращения.
// Отсчёт всегда идёт вперёд от текущего положения указателя, назад он никогда не дёргается.
function spinTo(win) {
  const target = pickTargetAngle(win);
  const prevMod = ((rotationDeg % 360) + 360) % 360;
  let delta = (target - prevMod + 360) % 360;
  delta += 360 * U.randi(SPIN_TURNS_MIN, SPIN_TURNS_MAX);
  rotationDeg += delta;
  const arrow = U.UI.rouletteWheelArrow; if (!arrow) return;
  arrow.style.transition = `transform ${SPIN_MS / 1000}s cubic-bezier(.14,.66,.14,1)`;
  arrow.style.transform = `rotate(${rotationDeg}deg)`;
}

// ===== UI =====
function updateCurrencyUI() {
  if (U.UI.rouletteCurrency) U.UI.rouletteCurrency.textContent = U.save.currency | 0;
  SHOP.refreshCurrency();
}
function syncControls() {
  const busy = spinning, ok = afford();
  if (U.UI.rouletteSpinBtn) U.UI.rouletteSpinBtn.disabled = busy || !ok;
  if (U.UI.rouletteChanceSlider) U.UI.rouletteChanceSlider.disabled = busy;
  for (const c of PRESETS) { const b = U.$('rouletteChance' + c); if (b) b.disabled = busy; }
  if (U.UI.rouletteBetInc) U.UI.rouletteBetInc.disabled = busy || !ok || bet + BET_STEP > (U.save.currency | 0);
  if (U.UI.rouletteBetDec) U.UI.rouletteBetDec.disabled = busy || !ok || bet <= BET_MIN;
  if (U.UI.rouletteBetVal) U.UI.rouletteBetVal.disabled = busy || !ok;
  if (U.UI.rouletteAllIn) U.UI.rouletteAllIn.disabled = busy || !ok;
}
// Поле ставки — не трогаем его value, пока пользователь сам печатает в нём (иначе курсор
// и вводимые цифры будут сбрасываться на каждый вызов updateBetUI()).
function updateBetUI() {
  const el = U.UI.rouletteBetVal;
  if (el && document.activeElement !== el) el.value = bet;
  syncControls();
}
function updateWheelVisual() {
  if (U.UI.rouletteWheelWater) U.UI.rouletteWheelWater.style.height = chance + '%';
  if (U.UI.rouletteWheelChance) U.UI.rouletteWheelChance.textContent = chance + '%';
}
function updateChanceUI() {
  const slider = U.UI.rouletteChanceSlider;
  if (slider) {
    if ((slider.value | 0) !== chance) slider.value = chance;
    slider.style.setProperty('--p', ((chance - CHANCE_MIN) / (CHANCE_MAX - CHANCE_MIN) * 100) + '%');
  }
  for (const c of PRESETS) { const b = U.$('rouletteChance' + c); if (b) b.dataset.active = c === chance ? '1' : '0'; }
  updateWheelVisual();
}
function updateHint() {
  const el = U.UI.rouletteHint; if (!el) return;
  if (!afford()) { el.textContent = 'Недостаточно пузыриков для ставки'; el.dataset.warn = '1'; }
  else { el.textContent = 'Множитель при победе: ×' + multiplier(chance).toFixed(2); el.dataset.warn = '0'; }
}
function setResultState(state, title, val) {
  const box = U.UI.rouletteResult; if (!box) return;
  box.dataset.state = state;
  if (U.UI.rouletteResultTitle) U.UI.rouletteResultTitle.textContent = title;
  if (state === 'lose') {
    if (U.UI.rouletteResultText) U.UI.rouletteResultText.textContent = val;
    U.show(U.UI.rouletteResultText, true);
  } else {
    if (U.UI.rouletteResultAmount) U.UI.rouletteResultAmount.textContent = val;
    U.show(U.UI.rouletteResultText, false);
  }
}
// Приглушённый превью потенциального выигрыша — состояние по умолчанию и после
// любого изменения ставки/шанса (пока колесо не крутится).
function updatePreview() { if (!spinning) setResultState('idle', 'Возможный выигрыш', potentialWin()); }

function setBet(v) { bet = clampBet(v); updateBetUI(); updatePreview(); }
function changeBet(d) { setBet(bet + d); }
function setChance(v) { chance = U.clamp(Math.round(v), CHANCE_MIN, CHANCE_MAX); updateChanceUI(); updatePreview(); updateHint(); }

function finishSpin() {
  if (finished) return; finished = true; clearTimeout(finishTimer); finishTimer = 0;
  if (pendingWin) {
    U.save.currency += pendingPayout;
    U.Sound.purchase();
    setResultState('win', 'Вы выиграли!', pendingPayout);
    U.replayCss(U.UI.rouletteResultBody);
  } else {
    U.Sound.denied();
    setResultState('lose', 'Не повезло', U.pick(LOSE_LINES));
    U.replayCss(U.UI.rouletteResultText);
  }
  U.persistSave();
  QST.check();
  spinning = false;
  bet = clampBet(bet); // баланс мог измениться (проигрыш/выигрыш) — ставка не должна превышать новый остаток
  updateCurrencyUI(); updateBetUI(); updateHint();
}

function spin() {
  if (spinning || !afford()) return;
  spinning = true; finished = false;
  U.save.currency -= bet;
  U.save.miniGames++;
  U.persistSave();
  pendingWin = Math.random() * 100 < chance;
  pendingPayout = Math.round(bet * multiplier(chance));
  setResultState('idle', 'Крутим…', potentialWin());
  updateCurrencyUI(); updateBetUI(); updateHint();
  spinTo(pendingWin);
  clearTimeout(finishTimer);
  finishTimer = setTimeout(finishSpin, SPIN_MS + 300); // подстраховка на случай, если transitionend не придёт
}
function onTransitionEnd(e) {
  if (e.target !== U.UI.rouletteWheelArrow || e.propertyName !== 'transform') return;
  finishSpin();
}

export function open() {
  QST.closeAll();
  bet = clampBet(bet);
  updateCurrencyUI(); updateBetUI(); updateChanceUI(); updatePreview(); updateHint();
  U.show(U.UI.rouletteModal, true);
}
// Пока крутится колесо — закрыть окно нельзя (как adreward.js блокирует close() во время pending).
export function close() { if (!spinning) U.show(U.UI.rouletteModal, false); }

export function initRoulette() {
  const on = (id, fn) => { const el = U.$(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (U.adBusy) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  on('rouletteClose', act(close));
  on('rouletteSpinBtn', act(spin));
  on('rouletteBetInc', act(() => changeBet(BET_STEP)));
  on('rouletteBetDec', act(() => changeBet(-BET_STEP)));
  on('rouletteAllIn', act(() => setBet(U.save.currency | 0)));
  const betVal = U.UI.rouletteBetVal;
  if (betVal) {
    // Свободный ручной ввод суммы: во время печати только чистим нецифровые символы,
    // а сам клэмп/применение — по blur/Enter, чтобы не мешать вводить многозначное число.
    betVal.addEventListener('input', () => { betVal.value = betVal.value.replace(/\D/g, '').slice(0, 7); });
    const commit = () => { const v = parseInt(betVal.value, 10); setBet(Number.isFinite(v) ? v : bet); };
    betVal.addEventListener('blur', commit);
    betVal.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); betVal.blur(); } });
  }
  for (const c of PRESETS) on('rouletteChance' + c, act(() => setChance(c)));
  const slider = U.UI.rouletteChanceSlider;
  if (slider) {
    slider.addEventListener('input', () => setChance(slider.value | 0));
    slider.addEventListener('change', () => U.Sound.click());
  }
  const arrow = U.UI.rouletteWheelArrow;
  if (arrow) arrow.addEventListener('transitionend', onTransitionEnd);
  const m = U.UI.rouletteModal;
  if (m) m.addEventListener('click', e => { if (e.target === m && !U.adBusy) { U.Sound.click(); close(); } });
}
