import * as U from './utils.js';
import * as GFX from './graphics.js';
import { createPetVisual as petCat } from '../assets/models/pet-cat-visual.js';

// Первый элемент — «без питомца», всегда доступен и ничего не строит.
// Чтобы добавить нового питомца — достаточно дописать сюда одну строку.
export const PETS = [
  { id: 'none', name: 'БЕЗ ПИТОМЦА', price: 0, desc: 'Мэл бежит налегке, без спутника.', build: null },
  { id: 'cat', name: 'КОТИК', price: 5, desc: 'Пушистый и ленивый, но всегда рядом.', build: petCat }
];

export const findPet = id => PETS.find(p => p.id === id) || PETS[0];
export function isOwned(id) {
  const p = PETS.find(x => x.id === id);
  return !!p && (p.price === 0 || U.save.ownedPets.indexOf(id) >= 0);
}
export const selectedId = () => (isOwned(U.save.selectedPet) ? U.save.selectedPet : PETS[0].id);

const nodeCache = new Map();
export function buildPetNode(id) {
  const p = findPet(id);
  if (!p.build) return null;
  let n = nodeCache.get(id);
  if (!n) { n = p.build(THREE, GFX); nodeCache.set(id, n); }
  return n;
}

export function buy(id) {
  const p = findPet(id);
  if (isOwned(id) || U.save.currency < p.price) return false;
  U.save.currency -= p.price;
  U.save.ownedPets.push(id);
  U.persistSave();
  return true;
}

export function select(id) {
  if (!isOwned(id) || U.save.selectedPet === id) return false;
  U.save.selectedPet = id;
  U.persistSave();
  return true;
}
