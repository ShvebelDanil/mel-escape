import * as U from './utils.js';
import * as GFX from './graphics.js';
import { createMelVisual as melSchoolboy } from '../assets/models/mel6-visual.js';
import { createMelVisual as melSchoolboy2 } from '../assets/models/mel7-visual.js';
import { createMelVisual as melPunk } from '../assets/models/mel5-visual.js';

// Чтобы добавить новый скин — достаточно дописать сюда одну строку.
export const SKINS = [
  { id: 'schoolboy', name: 'ШКОЛЬНИК', price: 0, desc: 'Классический скин Мэла. Всё как в обычной школе.', build: melSchoolboy },
  { id: 'schoolboy2', name: 'ШКОЛЬНИК 2.0', price: 500, desc: 'Свежая форма, зелёный галстук и рюкзак отличника.', build: melSchoolboy2 },
  { id: 'punk', name: 'ПАНК', price: 1000, desc: 'Дневник сдавать не собирается. Вообще никогда.', build: melPunk }
];

export const findSkin = id => SKINS.find(s => s.id === id) || SKINS[0];
export function isOwned(id) {
  const s = SKINS.find(x => x.id === id);
  return !!s && (s.price === 0 || U.save.ownedSkins.indexOf(id) >= 0);
}
export const selectedId = () => (isOwned(U.save.selectedSkin) ? U.save.selectedSkin : SKINS[0].id);

const nodeCache = new Map();
export function buildSkinNode(id) {
  let n = nodeCache.get(id);
  if (!n) { n = findSkin(id).build(THREE, GFX); nodeCache.set(id, n); }
  return n;
}

export function buy(id) {
  const s = findSkin(id);
  if (isOwned(id) || U.save.currency < s.price) return false;
  U.save.currency -= s.price;
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
