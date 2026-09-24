import * as U from './utils.js';
import * as GFX from './graphics.js';
import { createPetVisual as petCatost } from '../assets/models/pet-catost-visual.js';
import { createPetVisual as petRabbitBurmaldaets } from '../assets/models/pet-rabbit-burmaldaets-visual.js';

// Первый элемент — «без питомца», всегда доступен и ничего не строит.
// Дальше — по возрастанию цены (порядок массива = порядок карусели в магазине).
// Чтобы добавить нового питомца — достаточно дописать сюда одну строку.
// nameKey/descKey — ключи словаря source/i18n.js (см. комментарий в skins.js).
// Бафы питомца (необязательные поля, по умолчанию 1 — «без бонуса»):
//   distK   — множитель засчитанных метров (счётчик, рекорд, лидерборд, задания);
//   bottleK — множитель пузыриков за каждый подобранный на трассе.
//   hud     — ключ иконки в textures.js:MANIFEST для постоянной плашки бафа в HUD (powerups.js:setPetBuff).
// Трасса и её сложность считаются по реальному пути, бафы трогают только награду.
// Строку бонуса в магазине shop.js собирает из этих же чисел — текст не разъедется с логикой.
export const PETS = [
  { id: 'none', nameKey: 'pet.none.name', price: 0, descKey: 'pet.none.desc', build: null },
  { id: 'rabbitBurmaldaets', nameKey: 'pet.rabbitBurmaldaets.name', price: 3000, descKey: 'pet.rabbitBurmaldaets.desc', build: petRabbitBurmaldaets, distK: 1.25, hud: 'bunnyPowerup' },
  { id: 'catost', nameKey: 'pet.catost.name', price: 10000, descKey: 'pet.catost.desc', build: petCatost, bottleK: 1.25, hud: 'catPowerup' }
];

export const findPet = id => PETS.find(p => p.id === id) || PETS[0];
export const distK = p => p.distK || 1;
export const bottleK = p => p.bottleK || 1;
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
  if (!n) { n = GFX.freezeCharacter(GFX.bakeCharacter(p.build(THREE, GFX))); nodeCache.set(id, n); }
  return n;
}

// cost — цена со скидкой за досмотренные ролики (ADR.adPrice в shop.js); без него — полная.
export function buy(id, cost) {
  const p = findPet(id);
  const c = cost == null ? p.price : cost;
  if (isOwned(id) || U.save.currency < c) return false;
  U.save.currency -= c;
  U.save.ownedPets.push(id);
  U.persistSave();
  return true;
}

// Выдать питомца без оплаты (награда за просмотр роликов, source/shop.js).
export function grant(id) {
  const p = PETS.find(x => x.id === id);
  if (!p || U.save.ownedPets.indexOf(id) >= 0) return false;
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
