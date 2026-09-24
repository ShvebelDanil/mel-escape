// Профили качества графики. Модуль-«лист»: только данные и выбор уровня, никаких импортов —
// его читают graphics.js / entities.js / postfx.js, а применяет выбор GFX.applyQuality().
//
// medium — ЭТАЛОН: ровно та картинка и те числа, что были в игре до появления настройки.
// low    — всё, что заметно экономит GPU на слабых телефонах: меньше пикселей, без MSAA,
//          ближе туман (меньше объектов в кадре), без частиц, беднее декор стен.
// high   — «шейдеры»: настоящие тени (пол и стены), свет ламп и окон, глянцевый пол,
//          свечение (bloom), цветокоррекция и виньетка. Рассчитан на телефоны уровня iPhone,
//          а не на мощные ПК: один теневой проход, свет ламп/окон «запечён» в накладки, свечение в 1/2–1/8.
//
// Выбор хранится ОТДЕЛЬНО от облачного сейва (ключ melEscapeGfx): это свойство устройства,
// а не игрока — на телефоне и на ПК одного и того же аккаунта нужны разные уровни.

const KEY = 'melEscapeGfx';
// Есть ли у браузера WebGL2 вообще. Нужен ДО создания рендера: в High сглаживание делает
// мультисэмплинговый буфер пост-обработки (он есть только в WebGL2), поэтому MSAA самого
// холста там не нужен и только тратит память. Без WebGL2 High оставляет MSAA холста.
const HAS_GL2 = typeof WebGL2RenderingContext !== 'undefined';

const MEDIUM = {
  id: 'medium',
  aa: true,              // MSAA холста (меняется только при создании WebGL-контекста — см. needsRestart)
  prMobile: 1.5,         // потолок плотности пикселей на телефоне / на ПК
  prDesktop: 2,
  aniso: 4,              // потолок анизотропной фильтрации текстур
  fogNear: 34, fogFar: 130,
  particles: true,       // искры/пыль от действий (entities.burst)
  decorMax: 2,           // сколько предметов декора максимум на одну стену сегмента
  shadows: false,        // теневая карта от «солнца»
  lamps: false,          // накладки света ламп и окон + попиксельный (Phong) пол/стены
  post: false            // пост-обработка: bloom + цветокоррекция + виньетка
};

export const PRESETS = {
  low: { ...MEDIUM, id: 'low', aa: false, prMobile: 1, prDesktop: 1, aniso: 1, fogNear: 28, fogFar: 100, particles: false, decorMax: 1 },
  medium: MEDIUM,
  high: { ...MEDIUM, id: 'high', aa: !HAS_GL2, shadows: true, lamps: true, post: true }
};
export const LEVELS = ['low', 'medium', 'high'];

function readLevel() {
  try { const v = localStorage.getItem(KEY); if (v && PRESETS[v]) return v; } catch (e) {}
  return 'medium';       // по умолчанию — привычная картинка; High сам никогда не включается
}

export let level = readLevel();
export let Q = PRESETS[level];

// true — уровень действительно сменился (тогда вызывающий обязан позвать GFX.applyQuality()).
export function setLevel(id) {
  if (!PRESETS[id] || id === level) return false;
  level = id; Q = PRESETS[id];
  try { localStorage.setItem(KEY, id); } catch (e) {}
  return true;
}
