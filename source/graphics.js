import * as U from './utils.js';
import * as TEX from './textures.js';
import { t } from './i18n.js';

export let renderer, scene, camera;
export let texMel, texGranny, texBottle;
export let maxAniso = 1;

export const matCache = {}, basicMatCache = {}, mapMatCache = new Map(), geoCache = {};
export const cached = (store, key, make) => store[key] || (store[key] = make());
export function M(color) { return cached(matCache, color, () => new THREE.MeshLambertMaterial({ color })); }
export function MB(color) { return cached(basicMatCache, color, () => new THREE.MeshBasicMaterial({ color })); }
export function MT(tex) { let m = mapMatCache.get(tex); if (!m) { m = new THREE.MeshLambertMaterial({ map: tex }); mapMatCache.set(tex, m); } return m; }
export function GBox(w, h, d) { return cached(geoCache, 'b' + w + '_' + h + '_' + d, () => new THREE.BoxGeometry(w, h, d)); }
export function GPlane(w, h) { return cached(geoCache, 'p' + w + '_' + h, () => new THREE.PlaneGeometry(w, h)); }
export function GCircle(r) { return cached(geoCache, 'c' + r, () => new THREE.CircleGeometry(r, 16)); }
export function box(w, h, d, color) { return new THREE.Mesh(GBox(w, h, d), M(color)); }
export const cyl = (rt, rb, h, n, color) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), M(color));
export const sph = (r, ws, hs, color) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), M(color));
export const tplane = (w, h, tex) => new THREE.Mesh(GPlane(w, h), MT(tex));
export function put(parent, mesh, x, y, z) { mesh.position.set(x, y, z); parent.add(mesh); return mesh; }
export function limb(parent, x, y, parts) {
  const g = new THREE.Group(); g.position.set(x, y, 0);
  for (const [w, h, d, c, py, pz] of parts) put(g, box(w, h, d, c), 0, py, pz || 0);
  parent.add(g); return g;
}

// Бокс с текстурной накладкой на грани по Z (sides: [1] — лицом на +Z, [-1] — на -Z, [1,-1] — на обе).
// Раньше такие детали (шкафчики, стеллаж, знак, дневник) делались ОДНИМ боксом с массивом из 6
// материалов, а three.js рисует такой бокс 6 раз — по группе на каждую грань, даже если материалы
// повторяются. Теперь это одноцветный бокс + плоские накладки, и bakeStatic сливает всё в 2 вызова.
export function panel(w, h, d, color, tex, sides) {
  const g = new THREE.Group(); put(g, box(w, h, d, color), 0, 0, 0);
  for (const s of sides) { const p = tplane(w, h, tex); if (s < 0) p.rotation.y = Math.PI; put(g, p, 0, 0, s * (d / 2 + 0.006)); }
  return g;
}

export let SHADOW_MAT_CHAR, SHADOW_MAT_OBS;
export function shadowDisc(parent, r, mat) { const s = put(parent, new THREE.Mesh(GCircle(r), mat), 0, 0.02, 0); s.rotation.x = -Math.PI / 2; return s; }
export function canvasTex(w, h, fn, repeat, aniso) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (aniso) t.anisotropy = aniso; return t;
}

let _bm, _bn, _bv, _binv, BAKE_MATS;
export function initBakeHelpers() {
  _bm = new THREE.Matrix4(); _bn = new THREE.Matrix3(); _bv = new THREE.Vector3(); _binv = new THREE.Matrix4();
  BAKE_MATS = { L: new THREE.MeshLambertMaterial({ vertexColors: true }), B: new THREE.MeshBasicMaterial({ vertexColors: true }) };
}
// Корзины склейки: 'L'/'B' — одноцветные детали (цвет уезжает в вершинные цвета и материал
// становится общим на всю группу), а для деталей с текстурой ключ — сам материал: такие
// склеиваются только между собой и сохраняют UV. Прозрачные, вершинно-окрашенные и детали
// с массивом материалов пропускаются. Узлы с userData.noBake не трогаются вообще (и вся их ветка).
function bakeCollect(o, buckets) {
  if (o.userData.noBake) return;
  const m = o.material, g = o.geometry;
  if (o.isMesh && m && !Array.isArray(m) && !m.transparent && !m.vertexColors && g && g.attributes.position && g.attributes.normal) {
    let key = null;
    if (m.map) { if (g.attributes.uv) key = m; }           // индекс не обязателен: у ExtrudeGeometry (rounded() в моделях) его нет
    else if (m.isMeshLambertMaterial) key = 'L';
    else if (m.isMeshBasicMaterial) key = 'B';
    if (key !== null) { const list = buckets.get(key); if (list) list.push(o); else buckets.set(key, [o]); }
  }
  for (const c of o.children) bakeCollect(c, buckets);
}
export function bakeStatic(group) {
  group.updateMatrixWorld(true); _binv.copy(group.matrixWorld).invert();
  const buckets = new Map();
  for (const c of group.children) bakeCollect(c, buckets);
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const textured = typeof key !== 'string';
    let vc = 0, ic = 0;
    for (const o of list) { const g = o.geometry; vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3);
    const col = textured ? null : new Float32Array(vc * 3), uvs = textured ? new Float32Array(vc * 2) : null;
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic); let vo = 0, io = 0;
    for (const o of list) {
      const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, ind = g.index;
      const c = textured ? null : o.material.color, tu = textured ? g.attributes.uv : null;
      _bm.multiplyMatrices(_binv, o.matrixWorld); _bn.getNormalMatrix(_bm);
      for (let i = 0; i < p.count; i++) {
        const k = (vo + i) * 3; _bv.fromBufferAttribute(p, i).applyMatrix4(_bm); pos[k] = _bv.x; pos[k + 1] = _bv.y; pos[k + 2] = _bv.z;
        _bv.fromBufferAttribute(n, i).applyMatrix3(_bn).normalize(); nor[k] = _bv.x; nor[k + 1] = _bv.y; nor[k + 2] = _bv.z;
        if (textured) { const j = (vo + i) * 2; uvs[j] = tu.getX(i); uvs[j + 1] = tu.getY(i); }
        else { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
      }
      const icount = ind ? ind.count : p.count;
      for (let i = 0; i < icount; i++) idx[io + i] = (ind ? ind.getX(i) : i) + vo;
      vo += p.count; io += icount;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (textured) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); else geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); for (const o of list) o.parent.remove(o); group.add(new THREE.Mesh(geo, textured ? key : BAKE_MATS[key]));
  }
  return group;
}
// Выбросить опустевшие после склейки группы-обёртки, чтобы не таскать мёртвые узлы при обходе сцены.
// Только для статики: у персонажей пустая группа может быть «ручкой» анимации (см. bakeCharacter).
function pruneEmpty(group) {
  const dead = []; group.traverse(o => { if (o !== group && o.isGroup && !o.children.length) dead.push(o); });
  for (const o of dead) o.parent.remove(o); return group;
}
export function freezeStatic(group) { group.traverse(o => { if (o !== group) { o.matrixAutoUpdate = false; o.updateMatrix(); } }); return group; }
// Собрать все Object3D, которые модель отдаёт наружу в своей ноде — только они анимируются.
function exposedNodes(node) {
  const out = [];
  for (const key in node) {
    const v = node[key];
    if (v && v.isObject3D) out.push(v);
    else if (Array.isArray(v)) for (const o of v) { if (o && o.isObject3D) out.push(o); }
  }
  return out;
}
// Слепить неподвижные детали ВНУТРИ каждой подвижной группы персонажа в один меш.
// Каждая группа печётся отдельно и с временно отцепленными дочерними «ручками», поэтому
// иерархия анимации остаётся прежней, а число draw call падает в разы (Мэл: 92 → ~18).
// Детали с текстурой/прозрачностью/массивом материалов bakeStatic пропускает — они остаются как есть.
export function bakeCharacter(node) {
  const exposed = exposedNodes(node), exposedSet = new Set(exposed);
  const depth = o => { let d = 0, p = o.parent; while (p) { d++; p = p.parent; } return d; };
  const groups = exposed.filter(o => o.isGroup).sort((a, b) => depth(b) - depth(a)); // сначала самые глубокие
  for (const g of groups) {
    const moved = g.children.filter(c => exposedSet.has(c));
    for (const c of moved) g.remove(c);
    bakeStatic(g);
    for (const c of moved) g.add(c);
  }
  return node;
}
// Персонаж анимируется только через «ручки» из своей ноды (root/pivot/inner/legL/armR/headG/shadow/bob/...).
// Все остальные узлы модели — жёстко приклеенные детали: замораживаем им локальную матрицу, чтобы
// three.js не пересобирал её каждый кадр (у Мэла это ~85 узлов, у бабки ~50). Идемпотентно.
export function freezeCharacter(node) {
  const keep = new Set(exposedNodes(node));
  node.root.updateMatrixWorld(true);
  node.root.traverse(o => { if (!keep.has(o) && o.matrixAutoUpdate) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  return node;
}
export function finalizeStatic(group) { return freezeStatic(pruneEmpty(bakeStatic(group))); }

// Одноразовая «фотография» персонажа в картинку (data URL) — нужна окну заданий, где
// силуэт секретного скина показывается обычным <img>. Рисуем во временный буфер и тут же
// его освобождаем: в видеопамяти после вызова ничего не остаётся, игровая сцена и камера
// не трогаются. SS=2 — рендерим вдвое крупнее и ужимаем через canvas: в three r128 у
// render target нет мультисэмплинга, а так край получается сглаженным.
export function renderCharacterShot(node, w, h) {
  if (!renderer || !node || !node.root) return '';
  const SS = 2, rw = w * SS, rh = h * SS;
  const rt = new THREE.WebGLRenderTarget(rw, rh);
  const sc = new THREE.Scene();
  // Тот же свет, что и на игровой сцене (см. init) — иначе цветной скин на картинке
  // выглядел бы иначе, чем в магазине.
  sc.add(new THREE.HemisphereLight(0xffffff, 0x77808c, 0.95));
  const l1 = new THREE.DirectionalLight(0xfff0d6, 0.65); l1.position.set(3, 10, 4); sc.add(l1);
  const l2 = new THREE.DirectionalLight(0xd6e4ff, 0.3); l2.position.set(-4, 6, -6); sc.add(l2);
  const parent = node.root.parent;                 // нода может висеть в игровой сцене — вернём её на место
  sc.add(node.root);
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.5, 20);
  cam.position.set(0, 1, 4.6); cam.lookAt(0, .95, 0);
  const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha();
  const prevColor = renderer.getClearColor(new THREE.Color());
  renderer.setClearColor(0x000000, 0);             // прозрачный фон картинки
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(sc, cam);
  const buf = new Uint8Array(rw * rh * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, rw, rh, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  sc.remove(node.root);
  if (parent) parent.add(node.root);
  rt.dispose();
  // WebGL отдаёт строки снизу вверх — переворачиваем при переносе в canvas.
  const big = document.createElement('canvas'); big.width = rw; big.height = rh;
  const bctx = big.getContext('2d'), img = bctx.createImageData(rw, rh);
  for (let y = 0; y < rh; y++) img.data.set(buf.subarray((rh - 1 - y) * rw * 4, (rh - y) * rw * 4), y * rw * 4);
  bctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d'); octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, w, h);
  return out.toDataURL('image/png');
}

function makeBottleFallbackTex() {
  return canvasTex(64, 128, (g) => {
    g.clearRect(0, 0, 64, 128); g.fillStyle = '#3fa66b';
    g.beginPath(); g.moveTo(24, 10); g.lineTo(40, 10); g.lineTo(40, 34); g.quadraticCurveTo(52, 44, 52, 60); g.lineTo(52, 116); g.quadraticCurveTo(52, 124, 44, 124); g.lineTo(20, 124); g.quadraticCurveTo(12, 124, 12, 116); g.lineTo(12, 60); g.quadraticCurveTo(12, 44, 24, 34); g.closePath(); g.fill();
    g.fillStyle = '#f4f0dc'; g.fillRect(16, 66, 32, 30); g.fillStyle = '#c62828'; g.fillRect(22, 4, 20, 8);
  });
}
// Критичные к первому кадру файловые текстуры. Сначала выбираем формат (webp/png),
// затем ждём саму картинку — на неё завязан меш монет (entities.initCoins).
// Если файл не доехал, TEX оставляет прозрачную заглушку — подменяем её нарисованной бутылкой,
// чтобы монеты остались видимыми даже без ассетов.
export function loadTextures() {
  return TEX.detectFormat().then(() => Promise.all([
    TEX.preload(['bottle']).then(() => {
      const t = TEX.get('bottle');
      texBottle = (t && t.image && t.image.width > 1) ? t : makeBottleFallbackTex();
    }),
    // Доска класса на главном экране: одна-единственная картинка, живёт вне серий.
    // Ждём её здесь же — класс собирается сразу после loadTextures(), и к этому моменту
    // уже должно быть известно, класть меш с картинкой или оставить пустое полотно.
    TEX.load('classBoard').then(t => { classBoardTex = (t && t.image && t.image.width > 1) ? t : null; }),
    // Пользовательские серии картинок (poster1, poster2, … и board1, board2, …) — сколько бы их
    // ни добавили, просто кладутся в assets/textures/ под этими именами, без правок кода.
    ...PIC_SERIES.map(s => TEX.discoverSeries(s).then(keys => setPicKeys(s, keys))),
  ]));
}

function makeMelFaceTex() {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#f0c19b'; g.fillRect(0, 0, 512, 512); g.fillStyle = 'rgba(214,140,96,0.25)'; g.fillRect(0, 0, 66, 512); g.fillRect(446, 0, 66, 512);
    for (const ex of [26, 486]) { g.fillStyle = '#e9b58d'; g.beginPath(); g.ellipse(ex, 292, 26, 42, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#c98d5f'; g.lineWidth = 7; g.beginPath(); g.ellipse(ex, 292, 12, 22, 0, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#3d2a1a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(512, 0); g.lineTo(512, 118); g.quadraticCurveTo(470, 148, 420, 128); g.quadraticCurveTo(360, 102, 300, 126); g.quadraticCurveTo(256, 144, 212, 126); g.quadraticCurveTo(152, 102, 92, 128); g.quadraticCurveTo(42, 148, 0, 118); g.closePath(); g.fill();
    g.fillStyle = 'rgba(61,42,26,0.5)'; g.fillRect(0, 0, 44, 300); g.fillRect(468, 0, 44, 300); g.strokeStyle = 'rgba(30,20,12,0.6)'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); for (const [x1, y1, x2, y2] of [[80, 40, 96, 96], [160, 24, 168, 84], [250, 18, 254, 80], [340, 24, 332, 84], [430, 40, 414, 96]]) { g.moveTo(x1, y1); g.lineTo(x2, y2); } g.stroke();
    g.strokeStyle = '#2e2013'; g.lineWidth = 22; g.lineCap = 'round'; g.beginPath(); g.moveTo(140, 232); g.lineTo(238, 224); g.stroke(); g.beginPath(); g.moveTo(372, 232); g.lineTo(274, 224); g.stroke();
    for (const cx of [188, 324]) {
      g.fillStyle = '#fbf7f2'; g.beginPath(); g.ellipse(cx, 272, 42, 24, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#a8744d'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#69795a'; g.beginPath(); g.arc(cx, 274, 17, 0, Math.PI * 2); g.fill(); g.fillStyle = '#14100c'; g.beginPath(); g.arc(cx, 274, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx + 5, 268, 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#7a5236'; g.lineWidth = 5; g.beginPath(); g.arc(cx, 276, 43, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
    g.strokeStyle = 'rgba(180,116,72,0.85)'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(246, 288); g.quadraticCurveTo(242, 336, 250, 352); g.stroke(); g.beginPath(); g.moveTo(268, 288); g.quadraticCurveTo(272, 336, 264, 352); g.stroke();
    g.strokeStyle = 'rgba(160,98,60,0.9)'; g.lineWidth = 7; g.beginPath(); g.moveTo(240, 360); g.quadraticCurveTo(252, 372, 264, 366); g.quadraticCurveTo(272, 362, 272, 358); g.stroke();
    g.strokeStyle = '#9c5f43'; g.lineWidth = 9; g.beginPath(); g.moveTo(206, 424); g.quadraticCurveTo(256, 434, 306, 424); g.stroke();
    g.strokeStyle = 'rgba(180,110,80,0.5)'; g.lineWidth = 6; g.beginPath(); g.moveTo(222, 448); g.quadraticCurveTo(256, 454, 290, 448); g.stroke();
    g.strokeStyle = 'rgba(200,130,88,0.5)'; g.lineWidth = 6; g.beginPath(); g.moveTo(216, 486); g.quadraticCurveTo(256, 496, 296, 486); g.stroke();
    g.fillStyle = 'rgba(224,130,92,0.18)'; g.beginPath(); g.ellipse(96, 376, 34, 20, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(416, 376, 34, 20, 0, 0, Math.PI * 2); g.fill();
  });
}
function makeGrannyFaceTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#a9abb2'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#e9e9e9'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(32, 10); g.quadraticCurveTo(52, 40, 42, 66); g.moveTo(92, 4); g.quadraticCurveTo(102, 26, 98, 48); g.moveTo(168, 4); g.quadraticCurveTo(158, 26, 164, 48); g.moveTo(224, 10); g.quadraticCurveTo(204, 40, 214, 66); g.stroke();
    g.strokeStyle = '#8b8d94'; g.lineWidth = 4; g.beginPath(); g.moveTo(58, 62); g.quadraticCurveTo(128, 48, 198, 62); g.stroke(); g.beginPath(); g.moveTo(64, 82); g.quadraticCurveTo(128, 70, 192, 82); g.stroke();
    g.fillStyle = '#dcdcdc'; g.save(); g.translate(58, 114); g.rotate(0.30); g.fillRect(-28, -9, 56, 18); g.restore(); g.save(); g.translate(198, 114); g.rotate(-0.30); g.fillRect(-28, -9, 56, 18); g.restore();
    for (const cx of [88, 168]) { g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(cx, 148, 21, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#7c7e85'; g.lineWidth = 4; g.stroke(); g.strokeStyle = 'rgba(170,70,70,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 8, 140); g.lineTo(cx - 2, 148); g.stroke(); }
    g.strokeStyle = '#8f9198'; g.lineWidth = 3; g.beginPath(); g.moveTo(60, 170); g.quadraticCurveTo(72, 180, 86, 175); g.stroke(); g.beginPath(); g.moveTo(196, 170); g.quadraticCurveTo(184, 180, 170, 175); g.stroke();
    g.strokeStyle = '#85878e'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(122, 152); g.quadraticCurveTo(112, 190, 128, 196); g.quadraticCurveTo(146, 200, 142, 186); g.stroke();
    g.strokeStyle = '#8f9198'; g.lineWidth = 5; g.beginPath(); g.moveTo(96, 178); g.quadraticCurveTo(80, 206, 84, 228); g.stroke(); g.beginPath(); g.moveTo(160, 178); g.quadraticCurveTo(176, 206, 172, 228); g.stroke();
    g.fillStyle = '#4b1414'; g.beginPath(); g.moveTo(84, 212); g.quadraticCurveTo(128, 200, 172, 212); g.quadraticCurveTo(178, 246, 128, 252); g.quadraticCurveTo(78, 246, 84, 212); g.closePath(); g.fill(); g.strokeStyle = '#6e2a24'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#e6dca4'; for (const [x, y, w, h] of [[92, 213, 15, 14], [112, 210, 14, 16], [132, 210, 14, 16], [152, 212, 14, 14]]) g.fillRect(x, y, w, h);
    for (const [x, y, w, h] of [[104, 236, 13, 12], [126, 237, 13, 12], [148, 234, 12, 12]]) g.fillRect(x, y, w, h);
    g.fillStyle = '#7c7e85'; g.beginPath(); g.arc(158, 198, 7, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#dcdcdc'; g.lineWidth = 2; g.beginPath(); g.moveTo(156, 192); g.lineTo(152, 182); g.moveTo(162, 192); g.lineTo(166, 183); g.stroke();
  });
}

export let floorTex, wallTex, lockerTex, shelfTex, signTex;
// Картинка доски в классе (главный экран): null, пока файла assets/textures/class_board.*
// нет — тогда на доске остаётся просто тёмное полотно. Никуда, кроме buildClassroom(),
// не передаётся, поэтому на других объектах появиться не может.
export let classBoardTex = null;
// Серии пользовательских файловых картинок: постеры на стенах (poster1, poster2, …), доски
// (board1, board2, …) и вид за окном (window1, window2, …). Ключи находит TEX.discoverSeries()
// в loadTextures(). У каждой серии свой список ключей и свой реестр размещённых нод, поэтому
// серии не конкурируют за картинки. Пока серия пуста — рисуется только пустая рамка/полотно.
export const PIC_SERIES = ['poster', 'board', 'window'];
export const picKeys = { poster: [], board: [], window: [] };
export function setPicKeys(series, keys) { picKeys[series] = keys; }
// Текстура по индексу — нужна только чтобы создать меш-носитель при сборке.
export function picTex(series, idx) { return TEX.get(picKeys[series][idx]); }

// У каких серий картинки с альфа-каналом. Мел на доске рисуется на ПРОЗРАЧНОМ фоне, чтобы сквозь
// него было видно зелёное полотно; обычный MT() альфу не читает вовсе и показывает RGB прозрачных
// пикселей — то есть чёрный. Постеры и вид за окном непрозрачны по смыслу, им это не нужно.
const PIC_ALPHA = { poster: false, board: true, window: false };
// Материал-декаль: depthWrite выключен, чтобы плоскость поверх полотна не писала глубину и не
// перекрывала то, что нарисуют после неё; alphaTest отсекает полностью прозрачные пиксели ещё до
// смешивания (дешевле), а мягкие края мела остаются мягкими за счёт transparent.
const decalMatCache = new Map();
export function MTD(tex) {
  let m = decalMatCache.get(tex);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.02, depthWrite: false }); decalMatCache.set(tex, m); }
  return m;
}
const picMat = (series, tex) => (PIC_ALPHA[series] ? MTD(tex) : MT(tex));

// Заводит на ноде меш-носитель картинки: геометрия и позиция фиксированы навсегда, а конкретная
// картинка назначается в момент показа через assignPic() — иначе она была бы вшита при сборке.
// faceBack — развернуть лицом в −Z (игрок бежит в +Z, камера сзади, так что к нему обращена −Z).
// Возвращает null, если картинок в серии нет: тогда у объекта остаётся только пустое полотно.
export function picMesh(node, series, w, h, x, y, z, faceBack) {
  const keys = picKeys[series];
  if (!keys.length) return null;
  const p = tplane(w, h, TEX.get(keys[0]));
  p.material = picMat(series, TEX.get(keys[0]));   // серии с альфой рисуются материалом-декалью
  if (faceBack) p.rotation.y = Math.PI;
  put(node, p, x, y, z);
  p.userData.noBake = true;                 // материал подменяется в рантайме — склеивать нельзя
  node.userData.picMesh = p; node.userData.picSeries = series; node.userData.picIdx = -1;
  return p;
}

// Реестры картинок, размещённых на трассе ПРЯМО СЕЙЧАС (и стены, и обстаклы), по одному на серию.
// У каждой ноды в userData лежат picIdx (какая картинка) и picZ (где она по трассе).
// Раздача не случайная: новой ноде достаётся картинка, чья ближайшая копия ДАЛЬШЕ ВСЕГО.
// Пока картинок не меньше, чем носителей в поле зрения, двух одинаковых в кадре не будет вообще;
// если картинок меньше — повторы автоматически разносятся на максимальное расстояние, а не
// оказываются рядом. Число картинок нигде не зашито: добавил poster6 — запас сразу вырос.
const placedPics = { poster: [], board: [], window: [] };

// Серии, у которых картинка выбирается ОДИН РАЗ НА ЗАБЕГ (сейчас это окна): все окна коридора
// в рамках попытки показывают одну и ту же картинку — вид за окном в одном здании не меняется от
// окна к окну, — а какую именно, разыгрывается в начале забега. Раздача «подальше друг от друга»
// таким сериям не нужна, в placedPics они не попадают.
const picRunIdx = { window: 0 };
// Зовётся из main.js:resetRun() ДО перегенерации декора сегментов, поэтому новая картинка
// встаёт сразу во все окна, а не только в те, что переедут вперёд по ходу забега.
export function rollRunPics() {
  for (const s in picRunIdx) { const n = picKeys[s].length; picRunIdx[s] = n ? (Math.random() * n | 0) : 0; }
}

export function assignPic(node, worldZ) {
  const mesh = node.userData.picMesh;
  if (!mesh) return;                        // не носитель картинки (или серия была пуста при сборке)
  freePic(node);                            // прошлую картинку отпускаем до выбора новой
  const keys = picKeys[node.userData.picSeries], placed = placedPics[node.userData.picSeries];
  const n = keys.length;
  if (!n) { mesh.visible = false; return; }
  if (node.userData.picRun) {               // окна: картинка одна на весь забег, выбрана в rollRunPics
    const r = Math.min(picRunIdx[node.userData.picSeries], n - 1);
    node.userData.picIdx = r; node.userData.picZ = worldZ;   // в placed не кладём — учёт не нужен
    mesh.material = picMat(node.userData.picSeries, TEX.get(keys[r])); mesh.visible = true; return;
  }
  // Для каждой картинки ищем расстояние до её ближайшей копии на трассе и берём максимум из них.
  // Никогда не показанная картинка даёт Infinity, поэтому сначала разойдутся все уникальные.
  let best = -1, bestGap = -1, ties = 0;
  for (let i = 0; i < n; i++) {
    let gap = Infinity;
    for (let k = 0; k < placed.length; k++) {
      const p = placed[k].userData;
      if (p.picIdx !== i) continue;
      const d = Math.abs(p.picZ - worldZ);
      if (d < gap) gap = d;
    }
    if (gap > bestGap) { bestGap = gap; ties = 1; best = i; }
    // среди равных выбираем случайную резервуарной выборкой — без временного массива кандидатов
    else if (gap === bestGap && Math.random() * (++ties) < 1) best = i;
  }
  node.userData.picIdx = best; node.userData.picZ = worldZ;
  placed.push(node);
  mesh.material = picMat(node.userData.picSeries, TEX.get(keys[best])); mesh.visible = true;
}
// Носитель уходит с трассы (сегмент переносится вперёд / обстакл вернулся в пул) — картинка свободна.
export function freePic(node) {
  if (!node || !node.userData || node.userData.picIdx == null || node.userData.picIdx < 0) return;
  const placed = placedPics[node.userData.picSeries];
  const k = placed.indexOf(node);
  if (k >= 0) { placed[k] = placed[placed.length - 1]; placed.pop(); }
  node.userData.picIdx = -1;
}

export function buildEnvTextures() {
  texMel = makeMelFaceTex(); texGranny = makeGrannyFaceTex();
  floorTex = canvasTex(256, 256, (g) => { g.fillStyle = '#c9cfd5'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#b4bbc2'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128); g.strokeStyle = '#98a1a9'; g.lineWidth = 6; g.strokeRect(0, 0, 256, 256); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke(); g.fillStyle = 'rgba(90,100,110,0.25)'; for (let i = 0; i < 26; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }, [3.7, 9.6], maxAniso);
  wallTex = canvasTex(128, 256, (g) => { g.fillStyle = '#f0ecd9'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#a9c98c'; g.fillRect(0, 148, 128, 92); g.fillStyle = '#6f9459'; g.fillRect(0, 144, 128, 7); g.fillStyle = '#5c4633'; g.fillRect(0, 240, 128, 16); }, [6, 1], maxAniso);
  lockerTex = canvasTex(256, 512, (g) => { g.fillStyle = '#7e8b99'; g.fillRect(0, 0, 256, 512); for (let i = 0; i < 2; i++) { const x = 4 + i * 126; g.fillStyle = '#8895a3'; g.fillRect(x, 6, 118, 496); g.strokeStyle = '#5d6873'; g.lineWidth = 4; g.strokeRect(x, 6, 118, 496); g.fillStyle = '#55606a'; for (let v = 0; v < 3; v++) g.fillRect(x + 20, 30 + v * 16, 78, 7); g.fillStyle = '#f3c53d'; g.fillRect(x + 88, 250, 16, 34); } });
  shelfTex = canvasTex(256, 512, (g) => { g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 256, 512); const cols = ['#b23a3a', '#2f5d8a', '#3f7a48', '#c98a2b', '#6a3d8a', '#d9d2bd', '#8a3b2f', '#2e7f8a']; for (let s = 0; s < 4; s++) { const y0 = 14 + s * 122; g.fillStyle = '#3a2716'; g.fillRect(12, y0, 232, 104); let x = 16; while (x < 236) { const bw = U.randi(12, 26), bh = U.randi(62, 94); if (x + bw > 240) break; g.fillStyle = U.pick(cols); g.fillRect(x, y0 + 104 - bh, bw, bh); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y0 + 104 - bh, 3, bh); x += bw + 2; if (Math.random() < 0.12) x += U.randi(10, 30); } g.fillStyle = '#8a5a33'; g.fillRect(8, y0 + 104, 240, 14); } });
  signTex = canvasTex(128, 192, (g) => { g.fillStyle = '#f2c320'; g.fillRect(0, 0, 128, 192); g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 184); g.fillStyle = '#1a1a1a'; g.font = 'bold 19px Arial'; g.textAlign = 'center'; g.fillText(t('world.caution'), 64, 38); g.beginPath(); g.arc(64, 70, 10, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(58, 82); g.lineTo(76, 108); g.lineTo(98, 100); g.moveTo(76, 108); g.lineTo(58, 130); g.moveTo(66, 92); g.lineTo(40, 88); g.stroke(); g.font = 'bold 21px Arial'; g.fillText(t('world.wet'), 64, 160); g.fillText(t('world.floor'), 64, 182); });
}

function buildDecorUnit(kind) {
  const g = new THREE.Group();
  if (kind === 'lockers') { put(g, panel(3, 2.3, 0.5, '#6d7986', lockerTex, [1]), 0, 1.15, 0.25); put(g, box(3.02, 0.03, 0.52, '#8a97a5'), 0, 2.295, 0.25); put(g, box(3.1, 0.14, 0.6, '#4d5762'), 0, 0.07, 0.3); }
  else if (kind === 'door') { for (const jx of [-0.64, 0.64]) put(g, box(0.12, 2.5, 0.22, '#6d4c2f'), jx, 1.25, 0.11); put(g, box(1.4, 0.12, 0.22, '#6d4c2f'), 0, 2.44, 0.11); put(g, box(1.16, 2.38, 0.06, '#8a5a33'), 0, 1.19, 0.16); put(g, box(0.42, 0.62, 0.03, '#cfe6ee'), 0, 1.78, 0.195); put(g, sph(0.05, 8, 8, '#e0b83e'), 0.42, 1.18, 0.21); }
  // Окно: объёмная рама из брусков вместо плоской картинки «три створки». Всё, кроме стекла, —
  // одноцветные боксы, поэтому finalizeStatic склеивает их в один меш: +0 draw call к прежнему.
  // Стекло — носитель серии windowN (вид за окном, строго 2.5:1), импост проходит ПОВЕРХ него,
  // так что вид остаётся цельным, а окно читается как двустворчатое.
  else if (kind === 'windows') {
    put(g, box(4.86, 1.96, 0.05, '#cfdbe4'), 0, 2.78, 0.025);                 // подложка: пустое стекло, когда картинок нет
    const glass = picMesh(g, 'window', 4.6, 1.84, 0, 2.78, 0.058);
    if (glass) g.userData.picRun = true;                                      // вид за окном один на весь забег
    put(g, box(0.13, 1.88, 0.13, '#f2efe4'), 0, 2.78, 0.085);                 // импост (перегородка по центру)
    for (const s of [-1, 1]) put(g, box(0.16, 2.16, 0.16, '#f2efe4'), s * 2.38, 2.78, 0.08);   // боковые стойки рамы
    put(g, box(4.92, 0.16, 0.16, '#f2efe4'), 0, 3.78, 0.08); put(g, box(4.92, 0.16, 0.16, '#f2efe4'), 0, 1.78, 0.08);
    for (const s of [-1, 1]) put(g, box(0.05, 0.16, 0.06, '#9aa3a8'), s * 0.13, 2.55, 0.14);   // шпингалеты на импосте
    put(g, box(5.36, 0.12, 0.26, '#e6e1d3'), 0, 3.92, 0.11);                  // наличник сверху
    put(g, box(5.24, 0.1, 0.4, '#d9d3c2'), 0, 1.65, 0.18);                    // подоконник (верх на 1.70)
    put(g, box(4.7, 0.16, 0.08, '#e6e1d3'), 0, 1.52, 0.04);                   // фартук под подоконником
    // Батарея под окном: корпус + рёбра-секции + коллекторы сверху и снизу + подводка сбоку.
    // Висит в 0.73 от пола (выше плинтуса) и не достаёт до фартука — как настоящая.
    put(g, box(4.6, 0.62, 0.22, '#f4f2ec'), 0, 1.05, 0.13);
    for (let i = -11; i <= 11; i++) put(g, box(0.08, 0.54, 0.28, '#eceae2'), i * 0.2, 1.05, 0.15);
    put(g, box(4.68, 0.06, 0.26, '#f4f2ec'), 0, 1.34, 0.14); put(g, box(4.68, 0.06, 0.26, '#f4f2ec'), 0, 0.76, 0.14);
    // Труба уходит за плинтус: тот выступает от стены на 0.16 (бокс 0.14 с центром на ±4.5 при
    // юните на ±4.59), поэтому её перед (0.11 + 0.035 = 0.145) обязан остаться меньше этого.
    put(g, cyl(0.035, 0.035, 0.73, 6, '#e8e4d8'), 2.36, 0.42, 0.11);
    put(g, cyl(0.13, 0.1, 0.24, 8, '#b7643a'), 1.78, 1.82, 0.22); put(g, sph(0.18, 8, 6, '#4f8a4b'), 1.78, 2.06, 0.22); put(g, sph(0.11, 8, 6, '#5f9e58'), 1.66, 2.2, 0.24);
  }
  // Картинку здесь НЕ выбираем — только заводим меш-носитель через picMesh(). Конкретную
  // назначает assignPic() в момент показа (randomizeSegmentDecor), иначе она была бы вшита навсегда.
  else if (kind === 'poster') { put(g, box(1.2, 1.6, 0.05, '#5d4634'), 0, 2.15, 0.025); picMesh(g, 'poster', 1.05, 1.45, 0, 2.15, 0.055); }
  // Доска на стене — пустая: рама + тёмное полотно, сверху опциональная картинка серии boardN.
  // Полотно 2.7×1.35 (ровно 2:1) — под тем же соотношением собираются board-текстуры.
  else if (kind === 'board') { put(g, box(2.9, 1.55, 0.08, '#5d4634'), 0, 2.35, 0.04); put(g, box(2.7, 1.35, 0.03, '#1b2320'), 0, 2.35, 0.085); picMesh(g, 'board', 2.7, 1.35, 0, 2.35, 0.105); put(g, box(2.8, 0.07, 0.14, '#5d4634'), 0, 1.55, 0.1); }
  else if (kind === 'extinguisher') { put(g, box(0.34, 0.8, 0.2, '#b0451f'), 0, 1.25, 0.1); put(g, cyl(0.13, 0.13, 0.42, 10, '#c62828'), 0, 1.15, 0.33); put(g, cyl(0.04, 0.04, 0.12, 6, '#37474f'), 0, 1.42, 0.33); }
  return finalizeStatic(g);
}
const DECOR_KINDS = ['lockers', 'door', 'windows', 'poster', 'board', 'extinguisher'];

export function randomizeSegmentDecor(seg, minLocalZ) {
  const lo = Math.max(-U.SEG_LEN / 2 + 3, minLocalZ == null ? -Infinity : minLocalZ), hi = U.SEG_LEN / 2 - 3;
  for (const sideKey of ['L', 'R']) {
    const units = seg.userData.decor[sideKey], indices = units.map((_, i) => i);
    for (let i = 0; i < units.length; i++) { if (units[i].visible) freePic(units[i]); units[i].visible = false; }
    for (let i = indices.length - 1; i > 0; i--) { const j = U.randi(0, i), temp = indices[i]; indices[i] = indices[j]; indices[j] = temp; }
    const n = (lo <= -3 && U.randi(1, 2) === 2) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const u = units[indices[i]]; u.visible = true;
      if (n === 1) u.position.z = U.rand(lo, hi); else if (i === 0) u.position.z = U.rand(lo, -3); else u.position.z = U.rand(3, hi);
      assignPic(u, seg.position.z + u.position.z);      // позиция уже известна — от неё зависит выбор картинки
      u.updateMatrix();
    }
  }
}
export function buildSegment(i) {
  const g = new THREE.Group(); g.position.z = i * U.SEG_LEN;
  const floor = tplane(9.4, U.SEG_LEN, floorTex); floor.rotation.x = -Math.PI / 2; g.add(floor);
  const ceil = put(g, new THREE.Mesh(GPlane(9.4, U.SEG_LEN), M('#e3e7ea')), 0, U.WALL_H, 0); ceil.rotation.x = Math.PI / 2;
  for (const lampZ of [-U.SEG_LEN / 4, U.SEG_LEN / 4]) { put(g, new THREE.Mesh(GBox(2, 0.1, 0.6), MB('#fff3c4')), 0, U.WALL_H - 0.06, lampZ); put(g, new THREE.Mesh(GBox(1.7, 0.06, 0.42), MB('#fdf6dd')), 0, U.WALL_H - 0.13, lampZ); }
  const mkWall = (x, ry) => { const w = tplane(U.SEG_LEN, U.WALL_H, wallTex); w.rotation.y = ry; put(g, w, x, U.WALL_H / 2, 0); put(g, box(0.14, 0.4, U.SEG_LEN, '#55402f'), x + (x < 0 ? 0.1 : -0.1), 0.2, 0); };
  mkWall(-U.WALL_X, Math.PI / 2); mkWall(U.WALL_X, -Math.PI / 2);
  finalizeStatic(g);
  const decor = { L: [], R: [] };
  for (const sideKey of ['L', 'R']) {
    const sx = sideKey === 'L' ? -U.WALL_X + 0.01 : U.WALL_X - 0.01, ry = sideKey === 'L' ? Math.PI / 2 : -Math.PI / 2;
    for (const kind of DECOR_KINDS) { const u = put(g, buildDecorUnit(kind), sx, 0, 0); u.rotation.y = ry; u.visible = false; u.matrixAutoUpdate = false; u.updateMatrix(); decor[sideKey].push(u); }
  }
  g.userData.decor = decor; randomizeSegmentDecor(g, i === 0 ? U.CLASS_Z0 + 3 : undefined);
  // Сегмент сдвигается только при переносе вперёд. С matrixAutoUpdate three.js каждый кадр
  // пересобирал его матрицу и, как следствие, ПРИНУДИТЕЛЬНО все матрицы внутри (декор, склейки).
  // Теперь матрица считается вручную в момент сдвига (см. seg.updateMatrix() в main.js).
  g.matrixAutoUpdate = false; g.updateMatrix(); return g;
}

// Дневник: обложка + страницы + текстурная крышка. Боксом с массивом из 6 материалов он стоил
// 6 draw call и висел прямо в руке игрока, то есть в кадре постоянно; склеенный — 2.
export function buildDiaryMesh() {
  if (!buildDiaryMesh.tex) buildDiaryMesh.tex = canvasTex(128, 128, (g) => { g.fillStyle = '#1d5c3f'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#d9b64a'; g.lineWidth = 6; g.strokeRect(8, 8, 112, 112); g.fillStyle = '#d9b64a'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText(t('world.diary1'), 64, 58); g.font = 'bold 18px Arial'; g.fillText(t('world.diary2'), 64, 86); });
  // Раскладка граней повторяет прежний массив материалов: корпус зелёный, снизу светлые страницы,
  // текстурная наклейка — на переднем торце (+Z), как и было.
  const g = panel(0.3, 0.07, 0.4, '#14523a', buildDiaryMesh.tex, [1]);
  const pages = new THREE.Mesh(GPlane(0.3, 0.4), M('#f4f0dc')); pages.rotation.x = Math.PI / 2; // накладка нулевой толщины — не даёт светлой каймы по бокам
  put(g, pages, 0, -0.0351, 0);
  return g;
}
export function buildTeacherDesk() {
  const g = new THREE.Group(); put(g, box(2.0, 0.1, 1.0, '#8a5a33'), 0, 1.02, 0); put(g, box(1.4, 0.02, 0.66, '#2e6b46'), 0, 1.08, 0);
  for (const dx of [-0.72, 0.72]) { put(g, box(0.5, 0.92, 0.85, '#7a4e2b'), dx, 0.48, 0); put(g, box(0.34, 0.05, 0.05, '#e0b83e'), dx, 0.62, 0.45); put(g, box(0.34, 0.05, 0.05, '#e0b83e'), dx, 0.34, 0.45); }
  put(g, box(0.42, 0.05, 0.3, '#a02020'), -0.34, 1.1, 0.08).rotation.y = 0.3;
  // noBake: дневник на столе включается/выключается по ходу интро, поэтому его нельзя
  // слить с общей геометрией класса — иначе он останется видимым навсегда.
  const diary = put(g, buildDiaryMesh(), 0.34, 1.13, 0.02); diary.rotation.set(-Math.PI / 2, 0, 0.2); diary.userData.noBake = true; return { group: g, diary };
}

// Динамическое разрешение. На слабых телефонах кадр не влезает в бюджет из-за числа пикселей,
// а не из-за логики, поэтому при устойчивой просадке плотность пикселей понижается ступенькой.
// Понижение односторонее в пределах забега (сбрасывается в resetResolution при новом старте) —
// так нет качелей «то резко, то мутно». На нормальном железе не срабатывает никогда.
const PR_STEPS = [1, 0.85, 0.72];
let prBase = 1, prIdx = 0, prAcc = 0, prFrames = 0;
export function tuneResolution(dt) {
  if (prIdx >= PR_STEPS.length - 1) return;
  prAcc += dt; prFrames++;
  if (prAcc < 1.5) return;
  const avgMs = prAcc / prFrames * 1000; prAcc = 0; prFrames = 0;
  if (avgMs > 24) { prIdx++; renderer.setPixelRatio(prBase * PR_STEPS[prIdx]); } // ~меньше 42 FPS полторы секунды подряд
}
export function resetResolution() { prAcc = 0; prFrames = 0; }

export function initGraphics(container) {
  // stencil не используется: без буфера трафарета кадровый буфер меньше — на мобильных это чистая экономия полосы
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  prBase = Math.min(window.devicePixelRatio || 1, U.IS_MOBILE ? 1.5 : 2);
  renderer.setPixelRatio(prBase);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.setClearColor(0x9fb2c0);
  container.appendChild(renderer.domElement);
  maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy() || 1);
  TEX.attachRenderer(renderer, maxAniso);
  initBakeHelpers();
  SHADOW_MAT_CHAR = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });
  SHADOW_MAT_OBS = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9fb2c0, U.FOG_NEAR, U.FOG_FAR);
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, U.CAM_FAR);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77808c, 0.95));
  const dir = new THREE.DirectionalLight(0xfff0d6, 0.65); dir.position.set(3, 10, 4); scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xd6e4ff, 0.3); dir2.position.set(-4, 6, -6); scene.add(dir2);
  // На телефонах resize сыплется пачками при показе/скрытии адресной строки. Без сверки размеров
  // каждый такой шум пересоздавал кадровые буферы — это заметные рывки на ходу.
  let lastW = 0, lastH = 0;
  const applySize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', applySize);
  applySize();
}