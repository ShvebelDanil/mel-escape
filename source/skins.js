import * as U from './utils.js';
import * as GFX from './graphics.js';
import { createMelVisual as melSchoolboy } from '../assets/models/mel6-visual.js';
import { createMelVisual as melSchoolboy2 } from '../assets/models/mel7-visual.js';
import { createMelVisual as melDarkDrun } from '../assets/models/mel8-visual.js';
import { createMelVisual as melPunk } from '../assets/models/mel5-visual.js';
import { createMelVisual as melGucci } from '../assets/models/mel-visual.js';
import { createMelVisual as melPropeller } from '../assets/models/mel9-visual.js';

// Порядок массива = порядок карусели в магазине: скины идут по возрастанию цены,
// секретный — последним. Чтобы добавить новый скин — достаточно дописать сюда одну строку.
// nameKey/descKey — ключи словаря source/i18n.js, а не готовый текст: магазин переводит их
// в момент отрисовки карточки, поэтому язык может уточниться уже после загрузки модуля.
export const SKINS = [
  { id: 'schoolboy', nameKey: 'skin.schoolboy.name', price: 0, descKey: 'skin.schoolboy.desc', build: melSchoolboy },
  { id: 'schoolboy2', nameKey: 'skin.schoolboy2.name', price: 500, descKey: 'skin.schoolboy2.desc', build: melSchoolboy2 },
  { id: 'punk', nameKey: 'skin.punk.name', price: 1000, descKey: 'skin.punk.desc', build: melPunk },
  { id: 'darkdrun', nameKey: 'skin.darkdrun.name', price: 2000, descKey: 'skin.darkdrun.desc', build: melDarkDrun },
  { id: 'mell', nameKey: 'skin.mell.name', price: 5000, descKey: 'skin.mell.desc', build: melGucci },
  // secret: не продаётся ни за какие пузырики — выдаётся за ВСЕ выполненные задания (source/quests.js).
  // Пока не выдан, магазин прячет имя/описание и показывает чёрный силуэт модели.
  { id: 'propeller', nameKey: 'skin.propeller.name', price: 0, secret: true, descKey: 'skin.propeller.desc', build: melPropeller }
];

export const findSkin = id => SKINS.find(s => s.id === id) || SKINS[0];
export function isOwned(id) {
  const s = SKINS.find(x => x.id === id);
  if (!s) return false;
  // Секретный скин тоже «бесплатный», но своим считается только после выдачи за задания,
  // поэтому для него послабление price === 0 не действует.
  if (s.secret) return U.save.ownedSkins.indexOf(id) >= 0;
  return s.price === 0 || U.save.ownedSkins.indexOf(id) >= 0;
}
export const secretSkin = () => SKINS.find(s => s.secret) || null;
// Скин есть в карусели, но ещё не заработан: показываем силуэт вместо модели.
export const isLocked = id => { const s = SKINS.find(x => x.id === id); return !!s && !!s.secret && !isOwned(id); };
export const selectedId = () => (isOwned(U.save.selectedSkin) ? U.save.selectedSkin : SKINS[0].id);

// Силуэт: все материалы модели меняем на ОДИН чёрный (кроме диска тени — он
// полупрозрачный и должен остаться тенью). Общий материал заодно позволяет bakeCharacter
// склеить модель почти в один меш, поэтому силуэт дешевле обычного скина.
let blackMat = null;
function blackout(node) {
  if (!blackMat) blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  node.root.traverse(o => { if (o.isMesh && o !== node.shadow) o.material = blackMat; });
  return node;
}

// dark=true — чёрная копия того же скина; кешируется отдельным ключом, потому что
// материалы у неё подменены и обычной нодой она быть уже не может.
const nodeCache = new Map();
export function buildSkinNode(id, dark) {
  const key = dark ? id + '#dark' : id;
  let n = nodeCache.get(key);
  if (!n) {
    const raw = findSkin(id).build(THREE, GFX);
    n = GFX.freezeCharacter(GFX.bakeCharacter(dark ? blackout(raw) : raw));
    nodeCache.set(key, n);
  }
  return n;
}

// Освободить временную модель после «фотографии». Трогаем только её собственное добро:
// геометрии из общего кеша (GFX.geoCache) и общие текстуры (GFX.mapMatCache) используют
// настоящие персонажи на сцене. Свои текстуры модель рисует на canvas при каждой сборке —
// вот их и материалы с ними выгружаем, иначе картинка ушла бы, а текстура осталась в видеопамяти.
function disposeShot(node) {
  const shared = new Set(Object.keys(GFX.geoCache).map(k => GFX.geoCache[k]));
  node.root.traverse(o => {
    if (!o.isMesh) return;
    if (!shared.has(o.geometry)) o.geometry.dispose();
    const m = o.material, t = m && m.map;
    if (t && !GFX.mapMatCache.has(t)) { t.dispose(); m.dispose(); }
  });
}

// Картинка секретного скина для баннера в окне заданий: пока закрыт — чёрный силуэт,
// после выдачи — сам скин. Модель строится, один раз «фотографируется» и тут же
// выбрасывается — в памяти остаётся только data URL.
// undefined = ещё не пробовали, '' = рендер недоступен (второй раз не пытаемся).
const shots = [undefined, undefined];             // [0] — силуэт, [1] — открытый скин
export function secretShot(open) {
  const k = open ? 1 : 0;
  if (shots[k] !== undefined) return shots[k];
  const s = secretSkin();
  shots[k] = '';
  if (s) {
    const raw = s.build(THREE, GFX);
    const n = GFX.bakeCharacter(k ? raw : blackout(raw));
    n.shadow.visible = false;                       // на баннере тень не нужна
    shots[k] = GFX.renderCharacterShot(n, 96, 128);
    disposeShot(n);
  }
  return shots[k];
}

// cost — цена со скидкой за досмотренные ролики (ADR.adPrice в shop.js); без него — полная.
export function buy(id, cost) {
  const s = findSkin(id);
  const c = cost == null ? s.price : cost;
  if (s.secret || isOwned(id) || U.save.currency < c) return false;
  U.save.currency -= c;
  U.save.ownedSkins.push(id);
  U.persistSave();
  return true;
}

// Выдать скин без оплаты (награда за задания). true — только в момент первой выдачи.
export function grant(id) {
  const s = SKINS.find(x => x.id === id);
  if (!s || U.save.ownedSkins.indexOf(id) >= 0) return false;
  U.save.ownedSkins.push(id);
  U.persistSave();
  return true;
}

export function select(id) {
  if (!isOwned(id) || U.save.selectedSkin === id) return false;
  U.save.selectedSkin = id;
  U.persistSave();
  return true;
}
