import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as SK from './skins.js';
import * as QLT from './quality.js';
import { createGrannyVisual } from '../assets/models/granny-visual.js';
import { t } from './i18n.js';

export function buildMel(skinId, dark) {
    // dark — чёрный силуэт вместо модели (закрытый секретный скин в магазине)
    return SK.buildSkinNode(skinId || SK.selectedId(), dark);
}

export function buildGranny() {
  return GFX.freezeCharacter(GFX.bakeCharacter(createGrannyVisual(THREE, GFX)));
}

export function buildClassroom() {
  const g = new THREE.Group();
  // Мебель и рама доски — отдельная склейка: только они отбрасывают тень в High (тень стенок класса смотрелась плохо).
  const furn = new THREE.Group();
  GFX.put(g, GFX.tplane(U.WALL_X * 2 + 0.4, U.WALL_H, GFX.wallTex), 0, U.WALL_H / 2, U.CLASS_Z1);
  GFX.put(furn, GFX.box(5.0, 2.6, 0.12, '#5d4634'), 0, 2.7, U.CLASS_Z1 + 0.06); GFX.put(furn, GFX.box(4.7, 2.3, 0.03, '#1b2320'), 0, 2.7, U.CLASS_Z1 + 0.135); GFX.put(furn, GFX.box(5.0, 0.08, 0.18, '#5d4634'), 0, 1.38, U.CLASS_Z1 + 0.2);
  // Картинка на доске класса: своя текстура classBoard, не серия boardN — она всегда одна и та же
  // и существует ровно в этом меше. Полотно 4.6×2.3 = ровно 2:1, под это соотношение и файл.
  // Материал-декаль (MTD) — чтобы PNG с прозрачным фоном (мел на доске) не показывал чёрный.
  if (GFX.classBoardTex) { GFX.put(g, new THREE.Mesh(GFX.GPlane(4.6, 2.3), GFX.MTD(GFX.classBoardTex)), 0, 2.7, U.CLASS_Z1 + 0.16); }
  // Стенка с проёмом. Ни одна грань здесь не должна ЛЕЖАТЬ В ОДНОЙ ПЛОСКОСТИ с соседней:
  // при near=0.1 / far=140 точности буфера глубины не хватает, и совпадающие поверхности
  // мерцают (z-fighting). Раньше так совпадали наружная грань простенка и плоскость стены
  // коридора (обе ровно на x = ±WALL_X) — отсюда мерцающие полосы по краям проёма.
  const outX = U.WALL_X + 0.06;            // наружная кромка уходит ЗА стену коридора и ею же закрыта
  const sideW = outX - U.DOOR_HALF;
  const facW = sideW - 0.06;               // накладки уже основы: изнутри −0.04 (прячется под наличник), снаружи −0.02
  for (const s of [-1, 1]) {
    const px = s * (U.DOOR_HALF + sideW / 2), fx = s * (U.DOOR_HALF + 0.04 + facW / 2);
    GFX.put(g, GFX.box(sideW, U.WALL_H, U.PART_T, '#f0ecd9'), px, U.WALL_H / 2, U.CLASS_Z0);
    GFX.put(g, GFX.box(facW, 2.15, U.PART_T + 0.02, '#a9c98c'), fx, 0.30 + 2.15 / 2, U.CLASS_Z0);   // низ утоплен в плинтус, а не встык
    GFX.put(g, GFX.box(facW, 0.16, U.PART_T + 0.03, '#6f9459'), fx, 2.45, U.CLASS_Z0);
    GFX.put(g, GFX.box(facW, 0.36, U.PART_T + 0.04, '#5c4633'), fx, 0.18, U.CLASS_Z0);
    // наличник заходит на 1 см в проём, чтобы внутренняя грань простенка оказалась внутри него
    GFX.put(g, GFX.box(0.14, U.DOOR_TOP, U.PART_T + 0.06, '#6d4c2f'), s * (U.DOOR_HALF + 0.06), U.DOOR_TOP / 2, U.CLASS_Z0);
  }
  // перемычка тоньше простенков — в зоне нахлёста её лицевая грань не совпадает с их гранью
  GFX.put(g, GFX.box(U.DOOR_HALF * 2 + 0.28, U.WALL_H - U.DOOR_TOP, U.PART_T - 0.02, '#f0ecd9'), 0, (U.WALL_H + U.DOOR_TOP) / 2, U.CLASS_Z0);
  GFX.put(g, GFX.box(U.DOOR_HALF * 2 + 0.32, 0.16, U.PART_T + 0.08, '#6d4c2f'), 0, U.DOOR_TOP + 0.06, U.CLASS_Z0);
  const sign = GFX.put(g, new THREE.Mesh(GFX.GPlane(1.3, 0.45), new THREE.MeshBasicMaterial({
    map: GFX.canvasTex(256, 96, (c) => { c.fillStyle = '#2e7d32'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(6, 6, 244, 84); c.fillStyle = '#ffffff'; c.font = 'bold 52px Arial'; c.textAlign = 'center'; c.fillText(t('world.exit'), 128, 66); })
  })), 0, U.DOOR_TOP + 0.5, U.CLASS_Z0 - U.PART_T / 2 - 0.01); sign.rotation.y = Math.PI;
  for (const dx of [-3.2, 3.2]) { for (const dz of [-4.9, -7.3]) { const d = GFX.put(furn, buildDeskMesh(), dx, 0, dz); d.scale.setScalar(0.92); d.rotation.y = Math.PI; } }
  const td = GFX.buildTeacherDesk(); GFX.put(furn, td.group, 0, 0, -9.7);
  GFX.finalizeStatic(g); GFX.registerSurfaces(g);
  GFX.finalizeStatic(furn); GFX.markCasters(furn, false); g.add(furn);   // добавляем после склейки g — иначе мебель слиплась бы со стенками
  return { group: g, diary: td.diary };
}

// y0/y1 — вертикальный габарит коллизии. Правила честности (проверяются в level.js:runFeasible):
//   перепрыгнуть можно, пока y1 <= 1.72 (апогей прыжка 1.45 + PLATFORM_TOL);
//   подкатиться можно, пока y0 >= 0.76 (рост в подкате 0.80 + запас 0.04);
//   блокер = ни то, ни другое, его обходят сменой полосы.
export const OB_DEFS = {
  desk:      { hw: 0.72, hz: 0.90, y0: 0,    y1: U.DESK_TOP_Y, platform: true },
  tower:     { hw: 0.72, hz: 0.90, y0: 0,    y1: 2.20, platform: true },
  banner:    { hw: 1.02, hz: 0.18, y0: 1.05, y1: 2.95, platform: false },
  locker:    { hw: 0.72, hz: 0.40, y0: 0,    y1: 2.70, platform: true },
  door:      { hw: 0.74, hz: 0.30, y0: 0,    y1: 2.55, platform: false },
  shelf:     { hw: 0.72, hz: 0.36, y0: 0,    y1: 2.40, platform: true },
  cart:      { hw: 0.50, hz: 0.50, y0: 0,    y1: 1.00, platform: true },
  sign:      { hw: 0.30, hz: 0.28, y0: 0,    y1: 0.82, platform: false },
  // завалы и мебель
  lockerDown:{ hw: 0.76, hz: 1.30, y0: 0,    y1: 0.76, platform: true },
  deskStack: { hw: 0.72, hz: 0.90, y0: 0,    y1: 2.15, platform: false },
  chairPile: { hw: 0.68, hz: 0.60, y0: 0,    y1: 1.20, platform: false }, // похож на парту, но приземлиться нельзя
  chairTower:{ hw: 0.40, hz: 0.44, y0: 0,    y1: 2.15, platform: false },
  standBoard:{ hw: 0.75, hz: 0.28, y0: 0,    y1: 2.05, platform: false },
  // мелочь для плотных цепочек
  books:     { hw: 0.55, hz: 0.38, y0: 0,    y1: 0.52, platform: true },
  bags:      { hw: 0.60, hz: 0.42, y0: 0,    y1: 0.46, platform: true },
  bucket:    { hw: 0.42, hz: 0.45, y0: 0,    y1: 0.50, platform: false },
  pipe:      { hw: 0.80, hz: 0.22, y0: 0,    y1: 0.60, platform: false },
  // обязательный подкат
  board:     { hw: 0.86, hz: 0.28, y0: 1.05, y1: 2.33, platform: false },
  ladder:    { hw: 0.64, hz: 0.52, y0: 1.25, y1: 2.53, platform: false },
  bookRack:  { hw: 0.80, hz: 0.34, y0: 1.12, y1: 2.62, platform: false },
  // спортзал и хозчасть
  mat:       { hw: 0.80, hz: 0.80, y0: 0,    y1: 0.80, platform: true },
  vault:     { hw: 0.58, hz: 0.42, y0: 0,    y1: 1.24, platform: true },
  trayCart:  { hw: 0.52, hz: 0.52, y0: 0,    y1: 1.16, platform: true },
  cooler:    { hw: 0.42, hz: 0.38, y0: 0,    y1: 1.92, platform: false }
};

function buildChairMesh() {
  const g = new THREE.Group(); GFX.put(g, GFX.box(0.6, 0.08, 0.52, '#b98450'), 0, 0.52, 0); GFX.put(g, GFX.box(0.6, 0.6, 0.07, '#b98450'), 0, 0.85, -0.24);
  for (const [lx, lz] of [[-0.22, 0.12], [0.22, 0.12], [-0.22, -0.12], [0.22, -0.12]]) GFX.put(g, GFX.box(0.05, 0.52, 0.05, '#3c4148'), lx, 0.26, lz); return g;
}
function buildDeskMesh() {
  const g = new THREE.Group(); GFX.put(g, GFX.box(1.5, 0.09, 0.78, '#a9713c'), 0, 1.0, 0.25); GFX.put(g, GFX.box(0.7, 0.06, 0.7, '#8a5a30'), -0.3, 1.06, 0.25);
  for (const [lx, lz] of [[-0.62, -0.02], [0.62, -0.02], [-0.62, 0.55], [0.62, 0.55]]) GFX.put(g, GFX.box(0.07, 1.0, 0.07, '#3c4148'), lx, 0.5, lz - 0.05);
  GFX.put(g, buildChairMesh(), 0, 0, -0.62); return g;
}
function buildCartMesh() {
  const g = new THREE.Group(); GFX.put(g, GFX.box(1.0, 0.5, 0.9, '#8d98a4'), 0, 0.75, 0); GFX.put(g, GFX.box(1.04, 0.05, 0.94, '#5a636e'), 0, 0.96, 0); GFX.put(g, GFX.box(0.96, 0.04, 0.86, '#6b7580'), 0, 0.22, 0);
  for (const [px, pz] of [[-0.46, -0.41], [0.46, -0.41], [-0.46, 0.41], [0.46, 0.41]]) { GFX.put(g, GFX.box(0.05, 0.5, 0.05, '#5a636e'), px, 0.25, pz); GFX.put(g, GFX.box(0.1, 0.1, 0.1, '#2a2d33'), px, 0.05, pz); }
  GFX.put(g, GFX.cyl(0.15, 0.12, 0.26, 8, '#e0b83e'), 0.2, 0.37, 0.1); GFX.put(g, GFX.box(0.34, 0.24, 0.34, '#3b3f47'), -0.24, 0.36, -0.1); return g;
}
// Цвета полотна доски-стойки: «чёрная» и серо-зелёная — два равновероятных варианта одного
// препятствия, выбираются при сборке экземпляра пула. Полотно держим тёмным нарочно:
// картинки серии boardN рисуют белым мелом по прозрачному фону, и им нужен контраст.
const BOARD_COLORS = ['#2b2e33', '#1b2320'];
// Корешки книг: общая палитра завала books и полок стеллажа bookRack — школьная библиотека
// должна выглядеть одной библиотекой.
const BOOK_COLORS = ['#b23a3a', '#2f5d8a', '#3f7a48', '#c98a2b', '#6a3d8a', '#8a3b2f', '#2e7f8a'];

function buildObstacle(type) {
  const g = new THREE.Group();
  if (type === 'desk') g.add(buildDeskMesh());
  else if (type === 'tower') { g.add(buildDeskMesh()); GFX.put(g, buildChairMesh(), 0.3, U.DESK_TOP_Y, 0.25); }
  // Доска на металлической стойке (тип исторически зовётся banner — имя завязано на level.js).
  // Три варианта полотна разыгрываются НА ЭКЗЕМПЛЯР пула: цвет — обычный одноцветный бокс, его
  // склеивает finalizeStatic, поэтому в рантайме он уже не меняется. Картинка серии boardN, наоборот,
  // назначается на каждый спавн (assignPic), так что одна и та же стойка каждый раз с новым мелом.
  else if (type === 'banner') {
    for (const px of [-1.06, 1.06]) {
      GFX.put(g, GFX.cyl(0.05, 0.05, 2.9, 8, '#5a636e'), px, 1.45, 0);                            // стойка
      GFX.put(g, GFX.box(0.44, 0.07, 0.86, '#5a636e'), px, 0.035, 0);                             // лапа-основание
      GFX.put(g, GFX.box(0.14, 0.1, 0.14, '#3f4750'), px, 1.78, 0);                               // кронштейн к раме
    }
    GFX.put(g, GFX.box(2.24, 0.07, 0.07, '#3f4750'), 0, 2.86, 0);                                 // верхняя перекладина
    GFX.put(g, GFX.box(2.12, 1.24, 0.1, '#5d4634'), 0, 1.78, 0);                                  // рама (как у доски на колёсиках)
    GFX.put(g, GFX.box(1.96, 1.08, 0.03, U.pick(BOARD_COLORS)), 0, 1.78, -0.055);                 // полотно: цвет варианта
    GFX.picMesh(g, 'board', 1.9, 0.95, 0, 1.78, -0.075, true);                                    // картинка серии boardN (2:1)
    GFX.put(g, GFX.box(2.16, 0.05, 0.18, '#4e3521'), 0, 1.14, -0.05);                             // полка для мела
    GFX.put(g, GFX.box(0.17, 0.045, 0.045, '#e8e2c8'), -0.5, 1.19, -0.09);                        // мелок
    GFX.put(g, GFX.box(0.15, 0.07, 0.09, '#b23a3a'), 0.48, 1.2, -0.09);                           // губка
  }
  else if (type === 'locker') { GFX.put(g, GFX.panel(1.5, 2.7, 0.75, '#6d7986', GFX.lockerTex, [-1]), 0, 1.35, 0); GFX.put(g, GFX.box(1.52, 0.03, 0.77, '#8a97a5'), 0, 2.695, 0); GFX.put(g, GFX.box(1.56, 0.12, 0.8, '#4d5762'), 0, 0.06, 0); }
  else if (type === 'shelf') { GFX.put(g, GFX.panel(1.5, 2.4, 0.7, '#6b4a2e', GFX.shelfTex, [1, -1]), 0, 1.2, 0); GFX.put(g, GFX.box(1.56, 0.1, 0.76, '#4e3521'), 0, 0.05, 0); GFX.put(g, GFX.box(1.56, 0.06, 0.76, '#4e3521'), 0, 2.43, 0); }
  else if (type === 'cart') g.add(buildCartMesh());
  else if (type === 'sign') { GFX.put(g, GFX.panel(0.56, 0.84, 0.04, '#e9bb1c', GFX.signTex, [-1]), 0, 0.4, -0.13).rotation.x = 0.3; GFX.put(g, GFX.panel(0.56, 0.84, 0.04, '#e9bb1c', GFX.signTex, [1]), 0, 0.4, 0.13).rotation.x = -0.3; GFX.put(g, GFX.box(0.58, 0.05, 0.08, '#c9a020'), 0, 0.8, 0); }
  else if (type === 'door') { for (const s of [-1, 1]) { GFX.put(g, GFX.box(0.12, 2.5, 0.16, '#6d4c2f'), s * 0.66, 1.25, 0); GFX.put(g, GFX.box(0.16, 0.08, 0.9, '#4e3521'), s * 0.66, 0.04, 0); for (const dz of [-1, 1]) GFX.put(g, GFX.box(0.06, 0.58, 0.06, '#4e3521'), s * 0.66, 0.29, dz * 0.175).rotation.x = dz * 0.65; } GFX.put(g, GFX.box(1.48, 0.14, 0.16, '#6d4c2f'), 0, 2.43, 0); GFX.put(g, GFX.box(1.2, 2.32, 0.07, '#8a5a33'), 0, 1.2, 0); GFX.put(g, GFX.box(0.46, 0.62, 0.03, '#cfe6ee'), 0, 1.85, -0.045); GFX.put(g, GFX.box(0.5, 0.14, 0.02, '#e8e2c8'), 0, 1.42, -0.045); GFX.put(g, GFX.sph(0.06, 8, 8, '#e0b83e'), 0.42, 1.15, -0.08); }
  // Ниже — препятствия из второй волны. У каждого не больше ОДНОЙ текстуры: bakeStatic
  // склеивает все одноцветные ламбертовы детали в единый меш с вершинными цветами, поэтому
  // разноцветная мелочь бесплатна, а каждый текстурный материал — это отдельный draw call.
  else if (type === 'lockerDown') { GFX.put(g, GFX.box(1.5, 0.72, 2.56, '#6d7986'), 0, 0.36, 0); const face = GFX.tplane(1.44, 2.46, GFX.lockerTex); face.rotation.x = -Math.PI / 2; GFX.put(g, face, 0, 0.725, 0); for (const s of [-1, 1]) GFX.put(g, GFX.box(1.56, 0.12, 0.14, '#4d5762'), 0, 0.4, s * 1.28); GFX.put(g, GFX.box(0.16, 0.1, 0.34, '#f3c53d'), 0.62, 0.74, -0.5); }
  else if (type === 'deskStack') { g.add(buildDeskMesh()); GFX.put(g, GFX.box(1.5, 0.09, 0.78, '#a9713c'), 0, 1.1, 0.25); GFX.put(g, GFX.box(0.7, 0.06, 0.7, '#8a5a30'), 0.3, 1.04, 0.25); for (const [lx, lz] of [[-0.62, -0.02], [0.62, -0.02], [-0.62, 0.55], [0.62, 0.55]]) GFX.put(g, GFX.box(0.07, 1.0, 0.07, '#3c4148'), lx, 1.65, lz - 0.05); }
  else if (type === 'chairPile') { const a = buildChairMesh(); a.rotation.z = Math.PI; a.rotation.y = 0.5; GFX.put(g, a, -0.14, 1.18, 0.02); const b = buildChairMesh(); b.rotation.x = Math.PI * 0.5; b.rotation.y = -0.7; GFX.put(g, b, 0.3, 0.28, -0.06); const c = buildChairMesh(); c.rotation.z = 0.16; c.rotation.y = 1.1; GFX.put(g, c, -0.1, 0, 0.22); }
  else if (type === 'chairTower') { for (let i = 0; i < 5; i++) { const c = buildChairMesh(); c.rotation.y = (i % 2 ? 0.09 : -0.07); GFX.put(g, c, (i % 2 ? 0.035 : -0.035), i * 0.235, 0); } }
  // Стенд переиспользуется через пул, поэтому картинка тут только заводится, а назначается
  // в spawnObstacle через GFX.assignPic — см. комментарий у buildDecorUnit('poster').
  else if (type === 'standBoard') { GFX.put(g, GFX.box(1.44, 1.7, 0.1, '#5d4634'), 0, 1.25, 0); GFX.picMesh(g, 'poster', 1.2, 1.48, 0, 1.25, -0.056, true); for (const s of [-1, 1]) GFX.put(g, GFX.box(0.09, 2.05, 0.09, '#4e3521'), s * 0.62, 1.02, 0); GFX.put(g, GFX.box(1.5, 0.08, 0.52, '#4e3521'), 0, 0.04, 0); }
  else if (type === 'books') { const cols = BOOK_COLORS; for (const [bx, bz, n] of [[-0.28, -0.08, 6], [0.24, 0.12, 4], [0.02, -0.24, 3]]) for (let i = 0; i < n; i++) GFX.put(g, GFX.box(0.42 - (i % 2) * 0.05, 0.09, 0.32, cols[(i + n) % cols.length]), bx + (i % 2) * 0.03, 0.045 + i * 0.09, bz); GFX.put(g, GFX.box(0.3, 0.02, 0.24, '#d9d2bd'), -0.02, 0.01, 0.26).rotation.y = 0.4; }
  else if (type === 'bags') { for (const [bx, bz, c, r] of [[-0.26, -0.04, '#2e5f8a', 0.4], [0.26, 0.14, '#7a2f3a', -0.6]]) { const p = GFX.box(0.46, 0.42, 0.32, c); p.rotation.y = r; GFX.put(g, p, bx, 0.21, bz); const f = GFX.box(0.32, 0.16, 0.1, '#1d1f24'); f.rotation.y = r; GFX.put(g, f, bx + Math.sin(r) * 0.16, 0.34, bz + Math.cos(r) * 0.16); } GFX.put(g, GFX.box(0.3, 0.04, 0.22, '#d9d2bd'), 0.02, 0.02, -0.26); GFX.put(g, GFX.cyl(0.03, 0.03, 0.2, 6, '#c98a2b'), -0.02, 0.03, 0.28).rotation.z = Math.PI / 2; }
  else if (type === 'bucket') { GFX.put(g, GFX.cyl(0.28, 0.22, 0.42, 10, '#3f7a8a'), 0, 0.21, 0); GFX.put(g, GFX.cyl(0.27, 0.27, 0.05, 10, '#2b5e6b'), 0, 0.43, 0); const st = GFX.cyl(0.035, 0.035, 1.2, 6, '#9a7040'); st.rotation.x = Math.PI * 0.45; GFX.put(g, st, -0.2, 0.11, 0.14); GFX.put(g, GFX.box(0.3, 0.1, 0.18, '#d9d2bd'), -0.2, 0.06, 0.66); }
  else if (type === 'pipe') { const p = GFX.cyl(0.14, 0.14, 1.94, 10, '#8d98a4'); p.rotation.z = Math.PI / 2; GFX.put(g, p, 0, 0.46, 0); for (const s of [-1, 1]) { GFX.put(g, GFX.box(0.14, 0.46, 0.2, '#5a636e'), s * 0.74, 0.23, 0); GFX.put(g, GFX.box(0.3, 0.07, 0.32, '#4d5762'), s * 0.74, 0.035, 0); } GFX.put(g, GFX.cyl(0.17, 0.17, 0.1, 10, '#6b7580'), 0.3, 0.46, 0).rotation.z = Math.PI / 2; }
  // Школьная доска на колёсиках. Габарит подката (y0 1.05) обязан читаться глазом, поэтому
  // под полотном пусто: стойки и лыжи вынесены за |x| > hw (0.86), перекладин внизу нет.
  else if (type === 'board') {
    for (const s of [-1, 1]) {
      GFX.put(g, GFX.cyl(0.055, 0.055, 2.22, 8, '#8a5a33'), s * 0.99, 1.22, 0);                 // стойка
      GFX.put(g, GFX.box(0.24, 0.09, 0.78, '#5d4634'), s * 0.99, 0.15, 0);                      // лыжа-опора
      for (const dz of [-1, 1]) GFX.put(g, GFX.cyl(0.08, 0.08, 0.05, 10, '#2a2d33'), s * 0.99, 0.08, dz * 0.31).rotation.z = Math.PI / 2; // колёсико
    }
    GFX.put(g, GFX.box(2.16, 1.19, 0.12, '#5d4634'), 0, 1.735, 0);                              // деревянная рама
    GFX.put(g, GFX.box(1.98, 1.01, 0.03, '#1b2320'), 0, 1.735, -0.062);                         // подложка под текстуру (края доски)
    GFX.picMesh(g, 'board', 1.9, 0.95, 0, 1.735, -0.08, true);                                  // картинка серии boardN (2:1, как у настенной доски)
    GFX.put(g, GFX.box(2.16, 0.05, 0.18, '#4e3521'), 0, 1.13, -0.05);                           // полка для мела
    GFX.put(g, GFX.box(0.17, 0.045, 0.045, '#e8e2c8'), -0.52, 1.18, -0.09);                     // мелок
    GFX.put(g, GFX.box(0.15, 0.07, 0.09, '#b23a3a'), 0.46, 1.19, -0.09);                        // губка
  }
  // Стремянка: передняя лестница со ступенями + задняя подпорка, сверху площадка с малярным
  // ведром. Стойки вынесены за |x| > hw (0.64) — как у доски board, коридор подката обязан
  // читаться глазом пустым, поэтому ниже y0 = 1.25 полосу не пересекает вообще ничего:
  // ступени начинаются с 1.42, распорки и башмаки стоят на |x| = 0.72. Пара ног сходится
  // к z ≈ 0 у площадки, ступни разъезжаются на -0.2 / +0.45 — силуэт настоящей стремянки,
  // а не четыре палки. Наклон боксов задаётся rotation.x: верх уезжает по z на sin(a)*h/2.
  // ЛИЦО объекта — грань -Z: игрок бежит в +Z (main.js: player.z += speed*dt), то есть подъезжает
  // со стороны меньших z. Поэтому ступени, бортик и тряпка смотрят в минус, а задняя подпорка
  // и ведро уходят в плюс. У доски и баннера то же самое — их picMesh стоит на -0.08.
  else if (type === 'ladder') {
    for (const s of [-1, 1]) {
      const f = GFX.box(0.1, 2.42, 0.11, '#a8834e'); f.rotation.x = 0.08; GFX.put(g, f, s * 0.72, 1.2, -0.1);      // стойка передней лестницы
      const r = GFX.box(0.09, 2.38, 0.09, '#8a6236'); r.rotation.x = -0.19; GFX.put(g, r, s * 0.72, 1.18, 0.23);   // нога задней подпорки
      const br = GFX.box(0.045, 0.045, 0.28, '#5a636e'); br.rotation.x = 0.45; GFX.put(g, br, s * 0.72, 1.58, 0.03); // распорка-ограничитель раскрытия
      GFX.put(g, GFX.box(0.14, 0.07, 0.16, '#2a2d33'), s * 0.72, 0.035, -0.2);                                      // резиновый башмак
      GFX.put(g, GFX.box(0.13, 0.07, 0.14, '#2a2d33'), s * 0.72, 0.035, 0.45);
    }
    for (let i = 0; i < 3; i++) GFX.put(g, GFX.box(1.44, 0.07, 0.17, '#9a7040'), 0, 1.42 + i * 0.31, -0.085 + i * 0.026); // ступени по линии передних стоек
    GFX.put(g, GFX.box(1.44, 0.05, 0.05, '#5a636e'), 0, 1.98, 0.08);                    // стяжка задней подпорки
    GFX.put(g, GFX.box(1.5, 0.07, 0.5, '#8a6236'), 0, 2.36, 0.12);                      // площадка
    GFX.put(g, GFX.box(1.5, 0.08, 0.05, '#7a5228'), 0, 2.42, -0.11);                      // бортик площадки
    GFX.put(g, GFX.cyl(0.17, 0.13, 0.22, 10, '#3f7a8a'), 0.34, 2.5, 0.12);              // ведро с побелкой
    GFX.put(g, GFX.cyl(0.155, 0.155, 0.04, 10, '#e2ddcd'), 0.34, 2.59, 0.12);           // побелка налита почти до края
    for (const hs of [-1, 1]) GFX.put(g, GFX.box(0.03, 0.15, 0.03, '#4a5560'), 0.34 + hs * 0.16, 2.57, 0.12); // дужка
    GFX.put(g, GFX.box(0.35, 0.03, 0.03, '#4a5560'), 0.34, 2.64, 0.12);
    const brush = GFX.box(0.05, 0.03, 0.28, '#9a7040'); brush.rotation.y = -0.45; GFX.put(g, brush, -0.3, 2.41, 0.12); // кисть на площадке
    GFX.put(g, GFX.box(0.09, 0.04, 0.11, '#d9d2bd'), -0.37, 2.41, 0.25);                // ворс кисти
    const rag = GFX.box(0.21, 0.28, 0.03, '#c9b48a'); rag.rotation.z = 0.22; GFX.put(g, rag, -0.56, 2.24, -0.12); // тряпка через бортик
  }
  // Книжный стеллаж на высоких стойках — второй «честный» подкат после доски: низ открыт
  // (первая полка на y0 = 1.12), пересекать полосу ниже нечему. Боковины вынесены за hw (0.80)
  // на |x| = 0.90, ровно тем же приёмом, что у board и banner. Книги — цветные боксы, а не
  // текстура: bakeStatic сливает одноцветные детали в один меш с вершинными цветами, так что
  // набитая полка бесплатна по draw call. Корешки и открытая сторона смотрят в -Z, к игроку,
  // задняя стенка — в +Z (про лицевую грань см. комментарий у стремянки выше).
  // Размеры книг берутся из фиксированных наборов
  // (не U.rand), потому что геометрия боксов кэшируется по габаритам — непрерывный разброс
  // раздувал бы geoCache на каждый экземпляр пула.
  else if (type === 'bookRack') {
    for (const s of [-1, 1]) {
      GFX.put(g, GFX.box(0.11, 2.62, 0.5, '#5d4634'), s * 0.9, 1.31, 0);                 // боковина-стойка
      GFX.put(g, GFX.box(0.3, 0.07, 0.62, '#4e3521'), s * 0.9, 0.035, 0);                // башмак
    }
    GFX.put(g, GFX.box(1.86, 0.1, 0.52, '#4e3521'), 0, 1.17, 0);                          // днище — его игрок и видит из подката
    GFX.put(g, GFX.box(1.78, 1.34, 0.04, '#5a3f28'), 0, 1.9, 0.23);                       // задняя стенка — она смотрит ОТ игрока, в +Z
    GFX.put(g, GFX.box(1.78, 0.07, 0.48, '#8a5a33'), 0, 1.8, 0);                          // средняя полка
    GFX.put(g, GFX.box(1.78, 0.07, 0.48, '#8a5a33'), 0, 2.38, 0);                         // верхняя полка
    GFX.put(g, GFX.box(1.9, 0.08, 0.56, '#6b4a2e'), 0, 2.58, 0);                          // карниз
    const BW = [0.07, 0.09, 0.11, 0.13], BH = [0.3, 0.36, 0.42, 0.47];
    for (const y of [1.235, 1.835]) {
      let bx = -0.82;
      for (let k = 0; k < 20; k++) {
        const bw = U.pick(BW), bh = U.pick(BH);
        if (bx + bw > 0.82) break;
        GFX.put(g, GFX.box(bw, bh, 0.34, U.pick(BOOK_COLORS)), bx + bw / 2, y + bh / 2, -0.02);
        bx += bw + 0.012;
        if (Math.random() < 0.18) bx += 0.09;                                             // прореха в ряду
      }
      if (bx < 0.6) { const t = GFX.box(0.11, 0.42, 0.32, U.pick(BOOK_COLORS)); t.rotation.z = 0.42; GFX.put(g, t, bx + 0.19, y + 0.19, -0.02); } // упавшая набок книга
    }
    for (let i = 0; i < 2; i++) GFX.put(g, GFX.box(0.34, 0.05, 0.26, U.pick(BOOK_COLORS)), -0.42 + i * 0.03, 2.44 + i * 0.05, -0.04); // пара книг плашмя в верхнем отсеке
  }
  else if (type === 'mat') { const cols = ['#1f6fa8', '#b23a3a', '#2f8a5e']; for (let i = 0; i < 3; i++) GFX.put(g, GFX.box(1.52 - i * 0.06, 0.26, 1.5 - i * 0.06, cols[i]), (i % 2 ? 0.04 : -0.04), 0.13 + i * 0.26, (i % 2 ? -0.03 : 0.04)); GFX.put(g, GFX.box(1.4, 0.03, 1.38, '#d9d2bd'), 0, 0.795, 0); }
  else if (type === 'vault') { GFX.put(g, GFX.box(0.98, 0.32, 0.54, '#8a6236'), 0, 1.04, 0); GFX.put(g, GFX.box(1.04, 0.08, 0.6, '#5c4633'), 0, 1.2, 0); GFX.put(g, GFX.box(0.82, 0.36, 0.48, '#a07a4a'), 0, 0.7, 0); for (const [lx, lz] of [[-0.3, -0.16], [0.3, -0.16], [-0.3, 0.16], [0.3, 0.16]]) { const lg = GFX.box(0.09, 0.64, 0.09, '#3c4148'); lg.rotation.z = lx > 0 ? -0.11 : 0.11; GFX.put(g, lg, lx, 0.32, lz); } }
  else if (type === 'trayCart') { g.add(buildCartMesh()); for (let i = 0; i < 3; i++) GFX.put(g, GFX.box(0.78, 0.05, 0.6, i % 2 ? '#d9d2bd' : '#b8c2cc'), (i % 2 ? 0.035 : -0.035), 1.02 + i * 0.055, 0); }
  else if (type === 'cooler') { GFX.put(g, GFX.box(0.56, 1.2, 0.5, '#e6e8ea'), 0, 0.6, 0); GFX.put(g, GFX.box(0.6, 0.1, 0.54, '#9aa4ae'), 0, 1.22, 0); GFX.put(g, GFX.cyl(0.25, 0.2, 0.6, 12, '#7fb6d9'), 0, 1.57, 0); GFX.put(g, GFX.cyl(0.13, 0.13, 0.1, 10, '#4a5560'), 0, 1.87, 0); GFX.put(g, GFX.box(0.26, 0.1, 0.1, '#2b5e6b'), 0, 0.84, 0.29); GFX.put(g, GFX.box(0.62, 0.08, 0.56, '#4a5560'), 0, 0.04, 0); }
  GFX.finalizeStatic(g); GFX.markCasters(g, true);   // тень в High: препятствие и отбрасывает её, и принимает (Мэл над партой)
  g.matrixAutoUpdate = false; return g; // матрица группы пересчитывается только при спавне, см. spawnObstacle
}

// Тени препятствий: раньше у каждого препятствия был свой прозрачный диск — до 20 отдельных
// draw call за кадр. Теперь это один InstancedMesh, а матрицы пишутся только при спавне и
// освобождении (препятствия не двигаются относительно мира, так что в кадре работы ноль).
const SHADOW_MAX = 96;   // замер на новой плотности: пик 52 одновременно активных препятствий (было 25).
                         // Лимит — только ёмкость инстансинга, рисуется всегда obShadows.count, так что
                         // запас бесплатен; при переполнении тени просто молча пропадали бы.
let obShadows = null;
const shadowOwner = [];
let _shm, _shq, _shv, _shs;
export function initObstacleShadows() {
  _shm = new THREE.Matrix4(); _shq = new THREE.Quaternion(); _shv = new THREE.Vector3(); _shs = new THREE.Vector3();
  _shq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  obShadows = new THREE.InstancedMesh(GFX.GCircle(1), GFX.SHADOW_MAT_OBS, SHADOW_MAX);
  obShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  obShadows.count = 0; obShadows.frustumCulled = false; obShadows.matrixAutoUpdate = false; obShadows.updateMatrix();
  GFX.scene.add(obShadows);
}
function shadowWrite(i, x, z, r) {
  _shv.set(x, 0.02, z); _shs.setScalar(r); _shm.compose(_shv, _shq, _shs);
  obShadows.setMatrixAt(i, _shm); obShadows.instanceMatrix.needsUpdate = true;
}
function shadowAdd(x, z, r) { if (!obShadows || obShadows.count >= SHADOW_MAX) return -1; const i = obShadows.count++; shadowOwner[i] = null; shadowWrite(i, x, z, r); return i; }
function shadowRemove(o) {
  const i = o.shadowIdx; if (i < 0 || !obShadows) return;
  const last = obShadows.count - 1;
  if (i !== last) { obShadows.getMatrixAt(last, _shm); obShadows.setMatrixAt(i, _shm); obShadows.instanceMatrix.needsUpdate = true; const ow = shadowOwner[last]; if (ow) ow.shadowIdx = i; shadowOwner[i] = ow; }
  shadowOwner[last] = null; obShadows.count = last; o.shadowIdx = -1;
}

export const obstaclePool = {};
for (const t in OB_DEFS) obstaclePool[t] = [];
export const activeObstacles = [];
const obDescPool = []; // описатели препятствий тоже переиспользуются (правило нулевых аллокаций)

// Спавн идёт на SPAWN_AHEAD=170 м вперёд, а туман глухой уже на fog.far (130 м в Medium, 100 в Low) —
// всё, что дальше, рисуется впустую. Поэтому препятствие заводится логически сразу (коллизии и маршрут
// считаются от него), а в сцену попадает только когда подходит на границу тумана + 6 м. Граница берётся
// из самого тумана: она зависит от уровня графики (source/quality.js). Дальние объекты лежат в
// pending (он упорядочен по z по построению) и добавляются в pumpObstacles() из игрового цикла.
const pending = [];
let pendHead = 0;
export function pumpObstacles(viewZ) {
  const visAhead = GFX.scene.fog.far + 6;
  while (pendHead < pending.length) {
    const o = pending[pendHead];
    if (o && o.z - viewZ > visAhead) break;
    pending[pendHead] = null; pendHead++;
    if (o) { o.pendIdx = -1; if (o.group) GFX.scene.add(o.group); }
  }
  if (pendHead >= pending.length) { pending.length = 0; pendHead = 0; }
}
export function resetPending() { pending.length = 0; pendHead = 0; }

export function spawnObstacle(type, x, z, rot) {
  let g = obstaclePool[type].pop(); if (!g) g = buildObstacle(type);
  GFX.assignPic(g, z);      // у стенда и доски — свежая картинка на каждый спавн (для остальных типов это no-op)
  g.position.set(x, 0, z);
  if (rot !== undefined) g.rotation.y = rot; else if (type === 'desk' || type === 'tower') g.rotation.y = Math.random() < 0.5 ? Math.PI : 0; else g.rotation.y = 0;
  g.updateMatrix();
  const def = OB_DEFS[type], o = obDescPool.pop() || {};
  o.t = type; o.x = x; o.z = z; o.group = g; o.stumbled = false; o.petHandled = false;
  o.hw = def.hw; o.hz = def.hz; o.y0 = def.y0; o.y1 = def.y1; o.platform = def.platform;
  o.shadowIdx = shadowAdd(x, z, def.hw + 0.25);
  if (o.shadowIdx >= 0) shadowOwner[o.shadowIdx] = o;
  o.pendIdx = -1; pending.push(o); o.pendIdx = pending.length - 1;
  activeObstacles.push(o);
  // Бутылка не должна оказаться внутри препятствия. Награда предыдущего паттерна могла
  // выступить в зазор (арка прыжка тянется на полсекунды дальше последнего объекта),
  // а препятствие ставится сюда только сейчас — значит, чистить надо на этой стороне.
  // Полосы разнесены на 2.3 м при самом широком объекте 1.02 м (banner), поэтому сравнения x хватает.
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const c = activeCoins[i];
    if (Math.abs(c.x - x) > 0.1 || Math.abs(c.z - z) >= def.hz + COIN_PAD_Z) continue;
    if (c.y + COIN_PAD_UP > def.y0 && c.y - COIN_PAD_DOWN < def.y1) releaseCoin(i);   // на крыше парты — можно, внутри — нет
  }
}
export function releaseObstacle(i) {
  const o = activeObstacles[i]; shadowRemove(o); GFX.freePic(o.group); GFX.scene.remove(o.group); obstaclePool[o.t].push(o.group);
  if (o.pendIdx >= 0) { pending[o.pendIdx] = null; o.pendIdx = -1; } // ещё не показан — вычёркиваем, иначе оживёт уже освобождённым
  o.group = null; activeObstacles.splice(i, 1); obDescPool.push(o);
}
export function clearObstacles(fromZ, toZ) { for (let i = activeObstacles.length - 1; i >= 0; i--) { const o = activeObstacles[i]; if (o.z > fromZ && o.z < toZ) releaseObstacle(i); } }
export function clearCoins(fromZ, toZ) { for (let i = activeCoins.length - 1; i >= 0; i--) { const c = activeCoins[i]; if (c.z > fromZ && c.z < toZ) releaseCoin(i); } }

// Бутылки: раньше каждая была THREE.Sprite, то есть отдельный draw call (в забеге до 20 за кадр).
// Теперь все они — один меш из квадов, развёрнутых по базису камеры ровно так же, как это делает
// спрайт, поэтому вид не меняется. Буферы созданы один раз, в кадре только перезапись координат.
// Лимит поднят с 64: паверап MAX WIN (source/powerups.js) раздваивает пузырики в окне перед
// игроком, то есть к замеренному пику 29 добавляются близнецы — со старым лимитом часть пар
// молча терялась бы.
// Квад бутылки — квадратный (COIN_HW = COIN_HH), потому что bottle.webp сам квадратный холст
// 256×256: непропорциональный квад тянул бы картинку по одной из осей.
const COIN_MAX = 96, COIN_HW = 0.7, COIN_HH = 0.7;
// Зазоры вокруг бутылки при проверке на препятствия, м. По вертикали они АСИММЕТРИЧНЫ, и это
// не произвол: квад бутылки высотой 2*COIN_HH = 1.4 м с центром в c.y, текстура заполняет его
// почти целиком, то есть низ картинки уходит на 0.68 м ниже центра. Со старым общим зазором 0.32
// проверка формально проходила, а бутылка на земле (y = 0.95) оказывалась на треть утоплена в
// книгах/сумках/ведре (их верх 0.46..0.60) — самый заметный артефакт. Вверх зазор оставлен
// маленьким нарочно: бутылка подката (y = 0.6) верхушкой чуть заходит в полотно баннера, но
// игрок смотрит на неё снизу и этого не видит, а честный 0.68 вырезал бы центральную бутылку
// у каждой награды за подкат.
export const COIN_PAD_Z = 0.36, COIN_PAD_UP = 0.32, COIN_PAD_DOWN = 0.68;
export const activeCoins = [];
const coinDescPool = [];
let coinMesh = null, coinPos = null;
export function initCoins() {
  const geo = new THREE.BufferGeometry();
  coinPos = new Float32Array(COIN_MAX * 12);
  const uv = new Float32Array(COIN_MAX * 8), idx = new Uint16Array(COIN_MAX * 6);
  for (let i = 0; i < COIN_MAX; i++) {
    const u = i * 8; uv[u] = 0; uv[u + 1] = 1; uv[u + 2] = 1; uv[u + 3] = 1; uv[u + 4] = 1; uv[u + 5] = 0; uv[u + 6] = 0; uv[u + 7] = 0;
    const b = i * 4, o = i * 6; idx[o] = b; idx[o + 1] = b + 3; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 1;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(coinPos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
  coinMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: GFX.texBottle, transparent: true, alphaTest: 0.15 }));
  coinMesh.frustumCulled = false; coinMesh.matrixAutoUpdate = false; coinMesh.updateMatrix(); coinMesh.renderOrder = 1;
  GFX.glow(coinMesh);     // в High пузырики слегка светятся
  // …и отбрасывают тень. Штатный материал глубины three r128 не знает про map/alphaTest и нарисовал
  // бы в теневой карте сплошной прямоугольник — поэтому свой, с той же картинкой и тем же отсечением.
  // Спрайт развёрнут к камере, а «солнце» может видеть его с любой стороны — тень рисуем с обеих.
  coinMesh.castShadow = true; coinMesh.material.shadowSide = THREE.DoubleSide;
  coinMesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: GFX.texBottle, alphaTest: 0.15 });
  GFX.scene.add(coinMesh);
}
// Возвращает описатель (или null, если пул выбран): паверапу MAX WIN нужно дозаполнить
// поля только что созданного близнеца.
export function spawnCoin(x, y, z) {
  if (activeCoins.length >= COIN_MAX) return null;
  const c = coinDescPool.pop() || {};
  c.x = x; c.y = y; c.z = z; c.phase = Math.random() * Math.PI * 2;
  // pull/pv/vx..vz — состояние полёта к игроку под магнитом (source/powerups.js:updateMagnet).
  // bx/tw/sp/pair — состояние пары под MAX WIN (там же, updateDouble): bx — центр ряда, от него
  // считается разъезд; tw=1 у близнеца; sp — доля разъезда 0..1; pair=1 у оригинала с близнецом.
  // Поля заводятся здесь, чтобы у описателя всегда была одна и та же форма (движок не пересобирает
  // скрытый класс объекта в кадре), а паверапы в кадре ничего не аллоцировали.
  c.pull = 0; c.pv = 0; c.vx = 0; c.vy = 0; c.vz = 0;
  c.bx = x; c.tw = 0; c.sp = 0; c.pair = 0;
  activeCoins.push(c);
  return c;
}
export function releaseCoin(i) { coinDescPool.push(activeCoins[i]); activeCoins.splice(i, 1); }
export function updateCoins(bobT) {
  if (!coinMesh) return;
  const n = activeCoins.length, geo = coinMesh.geometry;
  geo.setDrawRange(0, n * 6); if (!n) return;
  GFX.camera.updateMatrixWorld(); // камера уже повёрнута в этом кадре — берём свежий базис, а не прошлый
  const e = GFX.camera.matrixWorld.elements; // правый и верхний векторы камеры — ими спрайт и разворачивается к экрану
  const rx = e[0] * COIN_HW, ry = e[1] * COIN_HW, rz = e[2] * COIN_HW;
  const ux = e[4] * COIN_HH, uy = e[5] * COIN_HH, uz = e[6] * COIN_HH;
  for (let i = 0; i < n; i++) {
    // Летящий под магнитом пузырик не покачивается: его ведёт собственная скорость,
    // и синусоида поверх траектории читалась бы как дрожание.
    const c = activeCoins[i], k = i * 12, cy = c.pull ? c.y : c.y + Math.sin(bobT + c.phase) * 0.09;
    coinPos[k] = c.x - rx + ux; coinPos[k + 1] = cy - ry + uy; coinPos[k + 2] = c.z - rz + uz;
    coinPos[k + 3] = c.x + rx + ux; coinPos[k + 4] = cy + ry + uy; coinPos[k + 5] = c.z + rz + uz;
    coinPos[k + 6] = c.x + rx - ux; coinPos[k + 7] = cy + ry - uy; coinPos[k + 8] = c.z + rz - uz;
    coinPos[k + 9] = c.x - rx - ux; coinPos[k + 10] = cy - ry - uy; coinPos[k + 11] = c.z - rz - uz;
  }
  geo.attributes.position.needsUpdate = true;
}

export const particles = [];
export function initParticles() {
  const geo = GFX.GPlane(0.24, 0.24);
  for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0 })); m.visible = false; GFX.glow(m); GFX.scene.add(m); particles.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 }); }
}
export function burst(x, y, z, color, n, force) {
  // На Low искр нет: каждая — отдельный прозрачный draw call, а на слабом GPU это и перерисовка пикселей.
  if (!QLT.Q.particles) return;
  let used = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.mesh.material.color.set(color); p.mesh.position.set(x + U.rand(-0.2, 0.2), y + U.rand(0, 0.3), z + U.rand(-0.2, 0.2)); p.mesh.visible = true; p.life = 0.45;
    const a = U.rand(0, Math.PI * 2); p.vx = Math.cos(a) * force; p.vz = Math.sin(a) * force; p.vy = U.rand(1.5, 3.2);
    if (++used >= n) break;
  }
}
export function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt; if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.vy -= 6 * dt;
    const k = p.life / 0.45; p.mesh.material.opacity = k; p.mesh.scale.setScalar(0.6 + (1 - k) * 1.4); p.mesh.quaternion.copy(GFX.camera.quaternion);
  }
}




