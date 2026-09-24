import * as U from './utils.js';
import * as TEX from './textures.js';
import * as QLT from './quality.js';
import * as POST from './postfx.js';
import { t } from './i18n.js';

export let renderer, scene, camera;
export let texMel, texGranny, texBottle;
export let maxAniso = 1;
let capsAniso = 1, ctxAA = true;
let hemi, sun, fill;               // свет игровой сцены — интенсивности зависят от уровня графики

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
// В High диск не рисуется там, где уже лежит настоящая тень (ящик теневой карты вокруг точки фокуса):
// две тени друг на друге смотрелись грязно. За краем ящика диск плавно проявляется — дальние
// препятствия без тени не остаются. uShIn — полуширина зоны «без диска» по z (−1e6 = диск всюду).
const discU = { uShZ: { value: 0 }, uShIn: { value: -1e6 } };
function discFade(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uShZ = discU.uShZ; sh.uniforms.uShIn = discU.uShIn;
    sh.vertexShader = 'varying float vDiscZ;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 dwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  dwp = instanceMatrix * dwp;
  #endif
  vDiscZ = (modelMatrix * dwp).z;`);
    sh.fragmentShader = 'uniform float uShZ, uShIn;\nvarying float vDiscZ;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
      '#include <fog_fragment>\n  gl_FragColor.a *= clamp((abs(vDiscZ - uShZ) - uShIn) / 2.5, 0.0, 1.0);');
  };
  return mat;
}
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
  markCasters(node.root, false);   // через freezeCharacter проходят все персонажи: скины, питомцы, бабка
  return node;
}
// Пометить меши как отбрасывающие тень (receive — ещё и принимающие). Флаги нужны только в High,
// но бесплатны в остальных режимах: без теневой карты three их не читает. Прозрачное (диски-тени,
// декали) тени не отбрасывает — иначе полупрозрачный диск рисовал бы в теневой карте сплошной блин.
// Те же меши заслоняют свечение (слой OCCL_LAYER, postfx.js): пузырик за Мэлом не светит сквозь него.
export function markCasters(root, receive) {
  root.traverse(o => {
    if (!o.isMesh || (o.material && o.material.transparent)) return;
    o.castShadow = true; if (receive) o.receiveShadow = true;
    o.layers.enable(POST.OCCL_LAYER);
  });
}
// Слой свечения пост-обработки: объект, помеченный здесь, светится в High (лампы, окна, пузырики, искры).
export function glow(o) { o.layers.enable(POST.BLOOM_LAYER); return o; }
// Свет обязан быть во ВСЕХ слоях, которые рисует пост-обработка: иначе three в каждом проходе видел
// бы другой набор источников и каждый кадр заново перебирал шейдеры всех освещённых материалов.
function lightLayers(l) { l.layers.enable(POST.BLOOM_LAYER); l.layers.enable(POST.OCCL_LAYER); return l; }
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
  lightRig(sc);                                    // тот же свет, что и на игровой сцене (уровня Medium)
  const parent = node.root.parent;                 // нода может висеть в игровой сцене — вернём её на место
  sc.add(node.root);
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.5, 20);
  cam.position.set(0, 1, 4.6); cam.lookAt(0, .95, 0);
  const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha();
  const prevColor = renderer.getClearColor(new THREE.Color());
  renderer.setClearColor(0x000000, 0);             // прозрачный фон картинки
  const prevDisc = discU.uShIn.value; discU.uShIn.value = -1e6;   // диск под персонажем — как в Medium, при любом уровне
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(sc, cam);
  discU.uShIn.value = prevDisc;
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
    put(g, new THREE.Mesh(winLightGeo(), winLightMat()), 0, 0, 0);            // High: лучи из окна и пятно света на полу
  }
  // Картинку здесь НЕ выбираем — только заводим меш-носитель через picMesh(). Конкретную
  // назначает assignPic() в момент показа (randomizeSegmentDecor), иначе она была бы вшита навсегда.
  else if (kind === 'poster') { put(g, box(1.2, 1.6, 0.05, '#5d4634'), 0, 2.15, 0.025); picMesh(g, 'poster', 1.05, 1.45, 0, 2.15, 0.055); }
  // Доска на стене — пустая: рама + тёмное полотно, сверху опциональная картинка серии boardN.
  // Полотно 2.7×1.35 (ровно 2:1) — под тем же соотношением собираются board-текстуры.
  else if (kind === 'board') { put(g, box(2.9, 1.55, 0.08, '#5d4634'), 0, 2.35, 0.04); put(g, box(2.7, 1.35, 0.03, '#1b2320'), 0, 2.35, 0.085); picMesh(g, 'board', 2.7, 1.35, 0, 2.35, 0.105); put(g, box(2.8, 0.07, 0.14, '#5d4634'), 0, 1.55, 0.1); }
  else if (kind === 'extinguisher') { put(g, box(0.34, 0.8, 0.2, '#b0451f'), 0, 1.25, 0.1); put(g, cyl(0.13, 0.13, 0.42, 10, '#c62828'), 0, 1.15, 0.33); put(g, cyl(0.04, 0.04, 0.12, 6, '#37474f'), 0, 1.42, 0.33); }
  finalizeStatic(g); markCasters(g, false);             // High: двери, доски, шкафчики отбрасывают тень на стену и пол
  // Стекло окна светится (вид за окном ярче коридора) и тени не отбрасывает. Заслонителем свечения
  // оно быть не должно: иначе его же глубина из прохода заслонителей спорила бы с ним самим.
  const pm = g.userData.picMesh;
  if (kind === 'windows' && pm) { pm.castShadow = false; pm.layers.disable(POST.OCCL_LAYER); glow(pm); }
  return g;
}
const DECOR_KINDS = ['lockers', 'door', 'windows', 'poster', 'board', 'extinguisher'];

export function randomizeSegmentDecor(seg, minLocalZ) {
  const lo = Math.max(-U.SEG_LEN / 2 + 3, minLocalZ == null ? -Infinity : minLocalZ), hi = U.SEG_LEN / 2 - 3;
  for (const sideKey of ['L', 'R']) {
    const units = seg.userData.decor[sideKey], indices = units.map((_, i) => i);
    for (let i = 0; i < units.length; i++) { if (units[i].visible) freePic(units[i]); units[i].visible = false; }
    for (let i = indices.length - 1; i > 0; i--) { const j = U.randi(0, i), temp = indices[i]; indices[i] = indices[j]; indices[j] = temp; }
    // На Low — не больше одного предмета на стену: каждый предмет это 1–3 draw call на сегмент.
    const n = (QLT.Q.decorMax > 1 && lo <= -3 && U.randi(1, 2) === 2) ? 2 : 1;
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
  registerSurfaces(g);
  // Плафоны — единственные MB-детали сегмента, после склейки это один меш с BAKE_MATS.B: он и светится.
  for (const c of g.children) if (c.isMesh && c.material === BAKE_MATS.B) glow(c);
  const pool = new THREE.Mesh(poolGeo(), poolMat()); pool.matrixAutoUpdate = false; pool.updateMatrix(); g.add(pool);   // High: свет ламп
  const decor = { L: [], R: [] };
  for (const sideKey of ['L', 'R']) {
    const sx = sideKey === 'L' ? -U.WALL_X + 0.01 : U.WALL_X - 0.01, ry = sideKey === 'L' ? Math.PI / 2 : -Math.PI / 2;
    for (const kind of DECOR_KINDS) {
      const u = put(g, buildDecorUnit(kind), sx, 0, 0); u.rotation.y = ry; u.visible = false; u.matrixAutoUpdate = false; u.updateMatrix(); decor[sideKey].push(u);
      // «Солнце» High светит с +x: стена +x к нему спиной, настоящая тень её декора падала бы оторванным
      // пятном на пол. Поэтому там настоящую тень выключаем, а под предмет кладём мягкую «нарисованную».
      if (sideKey === 'R') { u.traverse((o) => { o.castShadow = false; }); const f = new THREE.Mesh(fakeShGeo(kind), fakeShMat()); f.matrixAutoUpdate = false; f.updateMatrix(); u.add(f); }
    }
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
// Магнит в левой руке Мэла — визуал баффа "магнит" (powerups.js: PWR.active.magnet).
// Нарочно крупный (~50×55 см): в забеге камера далеко позади, мелкий предмет терялся в кисти.
// Подкова — выдавленный профиль (как на иконке magnet.webp): красная и синяя половины и серебряные
// наконечники, 3 меша. Стоит как на иконке — дугой вверх, ножками вниз, плоскостью в камеру.
// Начало координат группы — точка хвата: середина дуги (кулак сжимает магнит за центр). Подкова
// шириной ~50 см, свисающая по центру кисти, внутренней половиной уходила бы в бедро — поэтому,
// пока бафф активен, main.js:animatePlayer отводит левую руку в сторону (MAG_ARM_OUT), а сам
// магнит доворачивает обратно на тот же угол, чтобы он висел вертикально.
// Цвета: камера смотрит в спину, +x для неё — слева, поэтому +x — красная половина (как на иконке).
// Не печётся (userData.noBake): bakeCharacter пересоздаёт меш с общим вершинно-окрашенным
// материалом — пропали бы emissive (яркость) и слой свечения. Цена — 3 draw call, и только пока
// бафф активен (group.visible=false иначе). Свечение в High — слой bloom (glow); порог
// POST BLOOM_THRESH = 0.7 режется по каналам, поэтому emissive подобран так, чтобы красный/синий
// канал уверенно выходил к 1.0 и ореол был своего цвета, а не белым.
const MAG_RO = .23, MAG_RI = .105, MAG_LEG = .13, MAG_TIP = .1, MAG_D = .11, MAG_BT = .025, MAG_BS = .022;
let magMats = null;
function magGeo(key, shapes) {
  return cached(geoCache, key, () => {
    const g = new THREE.ExtrudeGeometry(shapes, { depth: MAG_D, bevelEnabled: true, bevelThickness: MAG_BT, bevelSize: MAG_BS, bevelSegments: 2, steps: 1, curveSegments: 7 });
    g.translate(0, 0, -MAG_D / 2); return g;
  });
}
// Половина подковы: s = 1 — правая, -1 — левая. Шов по центру отступает от оси на MAG_BS:
// фаска раздвигает контур наружу, и без отступа стенки половин входили бы друг в друга.
function magHalf(s) {
  const sh = new THREE.Shape(), bs = MAG_BS;
  const ao = Math.acos(bs / MAG_RO), ai = Math.acos(bs / MAG_RI);
  const oA = s > 0 ? ao : Math.PI - ao, iA = s > 0 ? ai : Math.PI - ai, edge = s > 0 ? 0 : Math.PI;
  sh.moveTo(s * bs, MAG_RO * Math.sin(ao));
  sh.absarc(0, 0, MAG_RO, oA, edge, s > 0);
  sh.lineTo(s * MAG_RO, -MAG_LEG); sh.lineTo(s * MAG_RI, -MAG_LEG);
  sh.absarc(0, 0, MAG_RI, edge, iA, s < 0);
  sh.closePath();
  return sh;
}
function magTip(s) {
  // Наконечник чуть шире ножки и отделён от неё канавкой в 2·MAG_BS (та же причина, что у шва).
  const y0 = -MAG_LEG - 2 * MAG_BS, y1 = y0 - MAG_TIP, a = MAG_RI - .012, b = MAG_RO + .012;
  const sh = new THREE.Shape();
  sh.moveTo(s * a, y0); sh.lineTo(s * b, y0); sh.lineTo(s * b, y1); sh.lineTo(s * a, y1); sh.closePath();
  return sh;
}
export function buildMagnetMesh() {
  if (!magMats) magMats = {
    blue: new THREE.MeshLambertMaterial({ color: '#2f7bff', emissive: '#0a3cc8' }),
    red: new THREE.MeshLambertMaterial({ color: '#ff2d2d', emissive: '#b80c0c' }),
    tip: new THREE.MeshLambertMaterial({ color: '#f2f2f2', emissive: '#6a6a6a' })
  };
  const g = new THREE.Group();
  const parts = [
    new THREE.Mesh(magGeo('magRed', magHalf(1)), magMats.red),
    new THREE.Mesh(magGeo('magBlue', magHalf(-1)), magMats.blue),
    new THREE.Mesh(magGeo('magTip', [magTip(1), magTip(-1)]), magMats.tip)
  ];
  // Сдвиг ставит середину дуги (0, (RO+RI)/2) в начало координат группы, то есть в кисть.
  const grip = (MAG_RO + MAG_RI) / 2;
  for (const m of parts) { m.position.y = -grip; m.userData.noBake = true; glow(m); g.add(m); }
  return g;
}

// Крылатый сапог — визуал баффа "сапоги" (powerups.js: PWR.active.boots), по мотивам иконки
// boots.webp: зелёная подошва и стопа, белый носок, голенище с белой полосой и воротником,
// жёлтая кнопка и крупное белое крыло из трёх перьев сбоку. Это кожух, а не накладка:
// каждый скин передаёт габариты с запасом больше своей обуви И штанины у щиколотки, поэтому
// штатный ботинок целиком оказывается внутри, а сапог читается со всех сторон, в том числе сзади.
// Начало координат — низ подошвы под центром стопы (скин ставит группу туда, где у него пол).
// o: w/len — ширина/длина стопы, h — высота голенища от пола, sw/sd — ширина/глубина голенища,
// sz — сдвиг голенища по z относительно центра стопы (голенище стоит над пяткой, а не над носком).
// Ноги у моделей стоят всего в ~.3 друг от друга, поэтому сапог шире ноги растёт НАРУЖУ: скин
// ставит группу со сдвигом side·dx (dx лежит в том же объекте o), внутренняя кромка остаётся у
// средней линии — иначе левый и правый сапог входили бы друг в друга.
// Все меши — одноцветный Lambert без карты: bakeCharacter сплавляет сапог в 1 draw call.
// side: -1 — левая нога, 1 — правая (крыло и кнопка — на внешней стороне).
const BOOT_GREEN = '#46c24f', BOOT_DARK = '#2c8a3a', BOOT_WHITE = '#f5f3ea', BOOT_SINK = .02;
export function buildBootMesh(side, o) {
  const g = new THREE.Group();
  const { w, len, h, sw, sd, sz } = o, sy = .12, sh = h - sy;
  // Подошва уходит на BOOT_SINK ниже начала координат: низ штатной обуви у скинов считан с точностью
  // до мм (каблук «друна» торчал на 2.5 мм и на махе ноги был виден чёрной полоской). В стойке
  // лишнее просто прячется под полом.
  put(g, box(w + .02, .05 + BOOT_SINK, len + .02, BOOT_DARK), 0, (.05 - BOOT_SINK) / 2, 0); // подошва
  put(g, box(w, .16, len, BOOT_GREEN), 0, .13, 0);                                    // стопа
  put(g, box(w + .014, .17, len * .4, BOOT_WHITE), 0, .13, len * .3 + .007);          // носок
  put(g, box(sw, sh, sd, BOOT_GREEN), 0, sy + sh / 2, sz);                            // голенище
  put(g, box(sw + .016, .075, sd + .016, BOOT_WHITE), 0, sy + sh * .42, sz);          // полоса
  put(g, box(sw + .03, .055, sd + .03, BOOT_DARK), 0, h - .0175, sz);                 // воротник (верх — h+.01)
  put(g, box(sw - .06, .012, sd - .06, '#1f5a26'), 0, h + .017, sz);                  // тёмный проём сверху
  const btn = sph(.045, 8, 6, '#ffb300'); btn.scale.x = .45;
  put(g, btn, side * (sw / 2 + .012), sy + sh * .7, sz + sd * .15);                   // кнопка
  // Крыло: три пера (сплюснутые сферы), растут от задней части голенища назад-наружу-вверх.
  // Разворот наружу (ry) нужен ради камеры: перо в плоскости yz сзади видно только ребром.
  const ry = -side * .75, sRy = Math.sin(-ry), cRy = Math.cos(ry);
  // Высота и подъём перьев ограничены: выше колена крыло попадало под магнит в соседней руке
  // (оба баффа могут идти одновременно), рука на махе проходила сквозь перья.
  const bx = side * (sw / 2 + .015), by = sy + sh * .55, bz = sz - sd * .2;
  const FL = [.22, .18, .14], FH = [.07, .058, .046], FA = [.3, .08, -.14];
  for (let k = 0; k < 3; k++) {
    const L = FL[k], a = FA[k], r = L * .8;
    const f = sph(1, 10, 8, BOOT_WHITE); f.scale.set(.04, FH[k], L); f.rotation.set(a, ry, 0);
    // Направление «назад» пера после поворотов XYZ: (-sin ry, cos ry·sin a, -cos ry·cos a).
    put(g, f, bx + sRy * r, by - k * .035 + cRy * Math.sin(a) * r, bz - cRy * Math.cos(a) * r);
  }
  return g;
}

// Сфера-щит вокруг Мэла — визуал баффа "щит" (powerups.js: PWR.active.shield). Единичная сфера,
// размер, появление и вспышки задаёт main.js (масштаб и uniform'ы), здесь только материал.
// Шейдер вместо MeshLambert: полупрозрачный сине-серый пузырь читается по краю (френель), а
// центр почти прозрачен и не прячет Мэла. По поверхности ползут мягкие полосы — «энергия».
// Цвета пишутся в выход как есть: ShaderMaterial не кодирует в sRGB сам, поэтому uniform'ы уже
// в sRGB — что задано в hex, то и на экране. Сама сфера в bloom не входит: в High светится
// дочерняя оболочка-френель (SHIELD_GLOW_FS, ниже) — только край, центр Мэла не засвечивает.
// Тень не отбрасывает и в OCCL не входит — глоу за пузырём не гасится.
const SHIELD_VS = `
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
  gl_Position = projectionMatrix * mv;
}`;
const SHIELD_FS = `
uniform vec3 uBase; uniform vec3 uRim; uniform float uTime; uniform float uAlpha; uniform float uHit;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  f = f * f;
  float band = 0.5 + 0.5 * sin(vY * 16.0 - uTime * 3.2);
  band *= band;
  vec3 c = mix(uBase, uRim, f) + uRim * (uHit * 0.6);
  float a = 0.1 + 0.8 * f + 0.07 * band + uHit * (0.3 + 0.4 * f);
  gl_FragColor = vec4(min(c, vec3(1.0)), min(a, 1.0) * uAlpha);
}`;
export function buildShieldMesh() {
  const u = {
    uBase: { value: new THREE.Color('#7f93ad') }, uRim: { value: new THREE.Color('#d6ebff') },
    uTime: { value: 0 }, uAlpha: { value: 0 }, uHit: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SHIELD_VS, fragmentShader: SHIELD_FS, transparent: true, depthWrite: false });
  const geo = new THREE.SphereGeometry(1, 32, 20);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 4; m.visible = false;
  // Свечение в High — отдельная оболочка только для прохода bloom (см. bloomOnly ниже). uniform'ы
  // альфы и удара — те же объекты, что у сферы: main.js крутит одну пару, светятся обе.
  const gu = { uCol: { value: new THREE.Color(SHIELD_GLOW) }, uAlpha: u.uAlpha, uHit: u.uHit };
  m.add(bloomOnly(new THREE.Mesh(geo, bloomMat(gu, SHIELD_VS, SHIELD_GLOW_FS))));
  return { mesh: m, u };
}

// ===================== Свечение «только для bloom» (High) =====================
// Порог BLOOM_THRESH (postfx.js) режется по каждому каналу. Цветной ореол почти целиком под ним:
// у голубого #4fc3f7 выше 0.7 только синий, у салатового — чуть-чуть зелёного, и свечения не видно.
// Поэтому свечение рисуется ОТДЕЛЬНЫМ мешем, который есть только в слое BLOOM_LAYER: в обычном
// кадре (и в Low/Medium вообще) его нет, а в проходе bloom он пишет THRESH + (1-THRESH)·цвет —
// после порога остаётся ровно нужный цвет. Где свечения нет — discard, иначе база THRESH легла бы
// на соседние светящиеся объекты. Смешивание MAX, а не сложение: база THRESH поверх, например,
// светящихся сапог не выбивает их в белое. ShaderMaterial не кодирует выход в sRGB — цвет как в hex.
const SHIELD_GLOW = '#8cc8ff';
const B_TH = POST.BLOOM_THRESH.toFixed(3);
const SHIELD_GLOW_FS = `
uniform vec3 uCol; uniform float uAlpha; uniform float uHit;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float k = (0.8 * f * f * f + 0.6 * uHit * f) * uAlpha;
  if (k < 0.01) discard;
  gl_FragColor = vec4(${B_TH} + (1.0 - ${B_TH}) * min(uCol * k, vec3(1.0)), 1.0);
}`;
const PU_GLOW_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// Кольцо, а не пятно: в центре слабее — иначе яркое свечение поверх иконки пикапа засветило бы её.
const PU_GLOW_FS = `
uniform vec3 uCol; uniform float uAlpha; varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float k = mix(0.35, 1.0, smoothstep(0.0, 0.5, d)) * (1.0 - smoothstep(0.5, 1.0, d)) * uAlpha;
  if (k < 0.01) discard;
  gl_FragColor = vec4(${B_TH} + (1.0 - ${B_TH}) * uCol * k, 1.0);
}`;
function bloomMat(uniforms, vs, fs) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation
  });
}
// Объект только в слое свечения: в обычном кадре не рисуется.
export function bloomOnly(o) { o.layers.set(POST.BLOOM_LAYER); return o; }
// Материал свечения пикапа паверапа (powerups.js) для квада: цвет color, яркость — uniforms.uAlpha.
export function pickupGlowMat(color) {
  return bloomMat({ uCol: { value: new THREE.Color(color) }, uAlpha: { value: 0 } }, PU_GLOW_VS, PU_GLOW_FS);
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

// Свет сцены (значения — уровень Medium). Одна функция и для игры, и для «фотографии»
// персонажа (renderCharacterShot) — иначе скин на картинке выглядел бы иначе, чем в магазине.
function lightRig(sc) {
  const h = new THREE.HemisphereLight(0xffffff, 0x77808c, 0.95);
  const s = new THREE.DirectionalLight(0xfff0d6, 0.65); s.position.set(3, 10, 4);
  const f = new THREE.DirectionalLight(0xd6e4ff, 0.3); f.position.set(-4, 6, -6);   // s — «солнце»: в High его направление SUN_HI
  sc.add(h, s, f); return { h, s, f };
}

// ===================== Уровни графики (source/quality.js) =====================
// Поверхности коридора, у которых в High другой материал: пол — глянцевый (блик «солнца»), стены —
// попиксельные. Тень у Ламберта ложится на ВЕСЬ прямой свет разом (и на подсветку с другой стороны),
// у Фонга — только на свет «солнца», который её и отбрасывает. В Low/Medium теней нет, там Ламберт.
const surfFloor = [], surfWall = [];
let floorHi = null, wallHi = null;
function surfMat(floor) {
  if (!QLT.Q.lamps) return floor ? MT(floorTex) : MT(wallTex);
  if (!floorHi) {
    floorHi = new THREE.MeshPhongMaterial({ map: floorTex, specular: 0x262626, shininess: 64 });   // линолеум: блик «солнца»
    wallHi = new THREE.MeshPhongMaterial({ map: wallTex, specular: 0x000000, shininess: 1 });      // матовая краска: только диффуз
  }
  return floor ? floorHi : wallHi;
}
function applySurf(o, floor) { o.material = surfMat(floor); o.receiveShadow = QLT.Q.shadows; }
// Вызывается после finalizeStatic у сегментов коридора и у класса: пол и стены там — это меши
// с материалом MT(floorTex)/MT(wallTex) (одиночные или склеенные по этому материалу).
export function registerSurfaces(group) {
  const fm = MT(floorTex), wm = MT(wallTex);
  group.traverse(o => {
    if (!o.isMesh) return;
    if (o.material === fm) { surfFloor.push(o); applySurf(o, true); }
    else if (o.material === wm) { surfWall.push(o); applySurf(o, false); }
  });
}

// Тень «солнца» (High). Теневая камера — узкий ортографический ящик вдоль коридора: ±SH_W поперёк
// и ±SH_L вдоль. Он едет за точкой фокуса перед камерой; карта 1024×2048 — ~1.1 см на тексель
// поперёк и ~2.1 см вдоль, а PCF_SOFT сглаживает край билинейно (без «лесенки»). up = +Z разворачивает
// ящик вдоль коридора: со стандартным up = +Y он лёг бы наискосок и половина карты ушла бы в пустоту.
// «Солнце» в High светит сбоку сильнее, чем в Medium (SUN_HI): иначе стена почти не получала бы его
// света и тени от дверей/досок на ней были бы не видны. Освещена им левая стена (по ходу забега),
// правая — в тени, как в настоящем коридоре с солнцем с одной стороны.
// Центр ящика — на половине высоты стен (SH_Y): при таком наклоне луча ящик ±5.8 накрывает и пол, и
// обе стены до потолка. По z всё сечение коридора в ящике при |z − fz| ≤ 21.5 (проверено перебором) — отсюда
// зона, где гаснут диски-тени: DISC_IN = 19 и 2.5 м перехода (в discFade) — к 21.5 диск уже целиком.
const SH_W = 5.8, SH_L = 22, SH_DIST = 30, SH_MAP_W = 1024, SH_MAP_H = 2048, SH_Y = U.WALL_H / 2;
const SUN_MED = [3, 10, 4], SUN_HI = [6, 10, 4], DISC_IN = 19;
const FOCUS_AHEAD = 14;            // фокус теней — столько метров вперёд по взгляду камеры
let shR = null, shU = null, shZ = null, _fv = null;
function setupShadow() {
  if (shR) return;
  const s = sun.shadow, c = s.camera;
  s.mapSize.set(SH_MAP_W, SH_MAP_H); s.bias = -0.0006; s.normalBias = 0.03;
  c.left = -SH_W; c.right = SH_W; c.top = SH_L; c.bottom = -SH_L; c.near = SH_DIST - 16; c.far = SH_DIST + 16;
  c.up.set(0, 0, 1); c.updateProjectionMatrix();
  // Базис теневой камеры считаем так же, как его построит lookAt (z — от цели к свету, x = up × z,
  // y = z × x): по нему центр ящика квантуется в сетку текселей, иначе при беге края теней «ползут».
  shZ = new THREE.Vector3(...SUN_HI).normalize();
  shR = new THREE.Vector3().crossVectors(c.up, shZ).normalize();
  shU = new THREE.Vector3().crossVectors(shZ, shR);
  _fv = new THREE.Vector3();
  scene.add(sun.target);           // цель должна быть в сцене, иначе её матрица не обновляется
}
function updateShadow(fz) {
  _fv.set(0, SH_Y, fz);            // по x коридор всегда в нуле
  const r = _fv.dot(shR), u = _fv.dot(shU), tr = SH_W * 2 / SH_MAP_W, tu = SH_L * 2 / SH_MAP_H;
  _fv.addScaledVector(shR, Math.round(r / tr) * tr - r).addScaledVector(shU, Math.round(u / tu) * tu - u);
  sun.target.position.copy(_fv); sun.position.copy(_fv).addScaledVector(shZ, SH_DIST);
}

// Полупрозрачные накладки света (High). Геометрия из готовых квадов: [x, y, z, u, v] × 4 на квад.
// Материалы двусторонние — порядок обхода вершин не важен; polygonOffset тянет накладку к камере,
// чтобы она не мерцала с полом/стеной даже при 16-битной глубине.
function quadGeo(quads) {
  const n = quads.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < 4; j++) { const v = quads[k][j]; pos.set([v[0], v[1], v[2]], k * 12 + j * 3); uv[k * 8 + j * 2] = v[3]; uv[k * 8 + j * 2 + 1] = v[4]; }
    const b = k * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeBoundingSphere(); return geo;
}
const overlayMat = (map) => new THREE.MeshBasicMaterial({
  map, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, visible: QLT.Q.lamps
});
const overlayMats = [];
// Альфа-канал текстуры пишется попиксельно: f(nx, nz) → [r, g, b, a], nx/nz — от −1 до 1 в осях UV
// (nx = −1 при u = 0, nz = +1 при v = 1). CanvasTexture переворачивается (flipY): верхняя строка
// холста — это v = 1, поэтому nz считается сверху вниз от +1.
function pixTex(w, h, f) {
  return canvasTex(w, h, (g) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = f((x + 0.5) / w * 2 - 1, 1 - (y + 0.5) / h * 2), i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.round(U.clamp(c[3], 0, 1) * 255);
    }
    g.putImageData(img, 0, 0);
  });
}
const smooth01 = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Свет потолочных ламп (High) — «запечённый»: неподвижная накладка на пол и обе стены сегмента.
// Под каждым плафоном тёплое пятно, между плафонами и у плинтусов — лёгкое затенение. Раньше это были
// три точечных светильника, переезжавших за игроком: на бегу пятна впереди плавно загорались, а под
// ногами гасли — это и читалось как мерцание. Накладка ничего не зажигает и не гасит, дальние пятна
// гасит обычный туман, а стоит она один draw call на сегмент и ни одного источника света в шейдерах.
// Квад накладки — ровно период ламп (12 м, плафон в центре), поэтому соседние квады стыкуются без шва.
// Стена — продолжение пола «на изгибе»: низ стены берёт край пятна (u = 0/1), верх — его середину.
const POOL_WARM = 0.12, POOL_DARK = 0.12;      // сила тёплого пятна и затенения (ручки настройки вида)
let _poolGeo = null, _poolMat = null;
function poolGeo() {
  if (_poolGeo) return _poolGeo;
  const X = U.WALL_X, WX = U.WALL_X - 0.012, Y = 0.012, H = U.WALL_H - 0.01, q = [];
  for (const lz of [-U.SEG_LEN / 4, U.SEG_LEN / 4]) {
    const z0 = lz - U.SEG_LEN / 4, z1 = lz + U.SEG_LEN / 4;
    q.push([[-X, Y, z0, 0, 0], [X, Y, z0, 1, 0], [X, Y, z1, 1, 1], [-X, Y, z1, 0, 1]]);          // пол
  }   // стены без накладки: «продолжение пятна» читалось на них как U-образные засветы
  return (_poolGeo = quadGeo(q));
}
function poolMat() {
  if (_poolMat) return _poolMat;
  // Цвет меняется с тёплого на чёрный там, где альфа ~0 (r ≈ 0.5), поэтому стык не виден.
  const tex = pixTex(64, 128, (nx, nz) => {
    const r = Math.sqrt(nx * nx * 0.8 + nz * nz);
    if (r < 0.5) { const k = 1 - r / 0.5; return [255, 232, 186, POOL_WARM * k * k]; }
    return [0, 0, 0, POOL_DARK * smooth01(0.5, 1.25, r)];
  });
  _poolMat = overlayMat(tex); overlayMats.push(_poolMat); return _poolMat;
}

// Нарисованная тень декора на стене +x (High): мягкий прямоугольник чуть шире предмета, сдвинутый вниз
// тем сильнее, чем дальше предмет выступает от стены. Размеры в координатах юнита: [ширина, низ, верх, вылет].
const FAKE_SH = { lockers: [3.1, 0, 2.31, 0.6], door: [1.4, 0, 2.5, 0.22], windows: [5.36, 0.73, 3.98, 0.26], poster: [1.2, 1.35, 2.95, 0.05], board: [2.9, 1.52, 3.12, 0.14], extinguisher: [0.34, 0.85, 1.65, 0.46] };
const FAKE_SH_A = 0.3;                         // густота нарисованной тени (ручка настройки вида)
const _fakeGeo = {}; let _fakeMat = null;
function fakeShGeo(kind) {
  if (_fakeGeo[kind]) return _fakeGeo[kind];
  const [w, y0, y1, d] = FAKE_SH[kind], pad = 0.1 + d * 0.3, dy = 0.04 + d * 0.5, X = w / 2 + pad, Z = 0.004;
  const b = y0 - pad - dy, t = y1 + pad - dy;
  return (_fakeGeo[kind] = quadGeo([[[-X, b, Z, 0, 0], [X, b, Z, 1, 0], [X, t, Z, 1, 1], [-X, t, Z, 0, 1]]]));
}
function fakeShMat() {
  if (_fakeMat) return _fakeMat;
  const tex = pixTex(64, 64, (nx, nz) => [0, 0, 0, FAKE_SH_A * (1 - smooth01(0.55, 1, Math.abs(nx))) * (1 - smooth01(0.55, 1, Math.abs(nz)))]);
  _fakeMat = overlayMat(tex); overlayMats.push(_fakeMat); return _fakeMat;
}

// Свет из окна (High), в координатах юнита «windows» (x — вдоль стены, y — вверх, z — от стены в
// коридор): два наклонных полупрозрачных листа-луча от стекла к полу (верхний — от верха рамы,
// нижний — от подоконника) и пятно света на полу с тенью от импоста посередине. Свет идёт под 45°
// внутрь и вниз — это рассеянный свет неба, поэтому он одинаков для окон на обеих стенах.
// Одна текстура на всё: левая половина — пятно, правая — луч; один draw call на окно.
const WIN_SPOT = 0.34, WIN_BEAM = 0.2;         // яркость пятна на полу и лучей (ручки настройки вида)
let _winGeo = null, _winMat = null;
function winLightGeo() {
  if (_winGeo) return _winGeo;
  const X = 2.45, Y = 0.016;
  _winGeo = quadGeo([
    [[-X, Y, 1.3, 0, 0], [X, Y, 1.3, 0.5, 0], [X, Y, 4.2, 0.5, 1], [-X, Y, 4.2, 0, 1]],                  // пятно на полу
    [[-X, 3.7, 0.12, 0.5, 1], [X, 3.7, 0.12, 1, 1], [X, Y, 3.82, 1, 0], [-X, Y, 3.82, 0.5, 0]],          // верхний луч
    [[-X, 1.72, 0.4, 0.5, 1], [X, 1.72, 0.4, 1, 1], [X, Y, 2.1, 1, 0], [-X, Y, 2.1, 0.5, 0]]             // нижний луч
  ]);
  return _winGeo;
}
function winLightMat() {
  if (_winMat) return _winMat;
  const tex = pixTex(128, 64, (nx, nz) => {
    const left = nx < 0, sx = left ? nx * 2 + 1 : nx * 2 - 1;   // −1..1 внутри своей половины
    const edgeX = 1 - smooth01(0.8, 0.98, Math.abs(sx));           // мягкие края вдоль стены
    if (left) {                                                    // пятно: тень импоста по центру
      const mull = 1 - 0.7 * (1 - smooth01(0.02, 0.07, Math.abs(sx)));
      return [255, 244, 220, WIN_SPOT * edgeX * (1 - smooth01(0.6, 0.98, Math.abs(nz))) * mull];
    }
    const along = (nz + 1) / 2;                                    // 1 — у стекла, 0 — у пола
    return [255, 246, 226, WIN_BEAM * edgeX * along * along * (1 - smooth01(0.9, 1, nz))];
  });
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;  // половины атласа не смешиваются на мипах
  _winMat = overlayMat(tex); overlayMats.push(_winMat); return _winMat;
}

// Свет в High контрастнее: меньше «заливки» небом, сильнее направленный — тогда тени и пятна
// ламп читаются, а пол (он и в Medium почти белый) не выбивается в плоский белый.
const HI_HEMI = 0.8, HI_SUN = 0.75, HI_FILL = 0.25;

// Применить QLT.Q к уже созданной сцене. Зовётся один раз при старте и при каждой смене уровня
// (только из меню/паузы: смена света перекомпилирует шейдеры — пауза в долю секунды).
export function applyQuality() {
  const q = QLT.Q;
  // Плотность пикселей: новый потолок, адаптивная ступенька сбрасывается — на новом уровне меряем заново.
  prBase = Math.min(window.devicePixelRatio || 1, U.IS_MOBILE ? q.prMobile : q.prDesktop);
  prIdx = 0; prAcc = 0; prFrames = 0; renderer.setPixelRatio(prBase);
  const an = Math.min(q.aniso, capsAniso);
  if (an !== maxAniso) {
    maxAniso = an; TEX.attachRenderer(renderer, maxAniso);
    for (const tx of [floorTex, wallTex]) if (tx) { tx.anisotropy = maxAniso; tx.needsUpdate = true; }
  }
  scene.fog.near = q.fogNear; scene.fog.far = q.fogFar;
  camera.far = q.fogFar + 10; camera.updateProjectionMatrix();   // дальше глухого тумана рисовать нечего
  hemi.intensity = q.shadows ? HI_HEMI : 0.95; sun.intensity = q.shadows ? HI_SUN : 0.65; fill.intensity = q.shadows ? HI_FILL : 0.3;
  if (q.shadows) setupShadow();
  else { sun.position.set(...SUN_MED); sun.target.position.set(0, 0, 0); }   // направление Medium (в High его ставит updateShadow)
  renderer.shadowMap.enabled = q.shadows; sun.castShadow = q.shadows;
  if (!q.shadows && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }   // карта не нужна — отдаём видеопамять
  discU.uShIn.value = q.shadows ? DISC_IN : -1e6;
  for (const m of overlayMats) m.visible = q.lamps;
  for (const o of surfFloor) applySurf(o, true);
  for (const o of surfWall) applySurf(o, false);
  POST.setEnabled(q.post, renderer);
  // Компилируем шейдеры сразу, пока открыто окно настроек, а не в первом кадре забега.
  renderer.compile(scene, camera);
}
// MSAA холста задаётся только при создании WebGL-контекста. В High с WebGL2 сглаживание делает
// пост-обработка, и тогда MSAA холста не важен; иначе новое значение вступит в силу после перезапуска.
export function needsRestart() { return !(QLT.Q.post && POST.hasMSAA()) && QLT.Q.aa !== ctxAA; }

// Кадр целиком. Все места, где раньше звался renderer.render(scene, camera), зовут это.
export function render() {
  if (QLT.Q.shadows) {
    camera.updateMatrixWorld();
    // точка фокуса — перед камерой по горизонтальной проекции взгляда (в меню и магазине это −z, в забеге +z)
    const e = camera.matrixWorld.elements, dx = -e[8], dz = -e[10], len = Math.sqrt(dx * dx + dz * dz);
    const fz = camera.position.z + (len > 1e-4 ? dz / len : 1) * FOCUS_AHEAD;
    updateShadow(fz); discU.uShZ.value = fz;
  }
  if (POST.isActive()) POST.render(renderer, scene, camera); else renderer.render(scene, camera);
}

// Второй проход кадра для окна итогов забега (source/overscreen.js): группа-«студия» глубоко под
// полом ТОЙ ЖЕ сцены рисуется своей камерой в прямоугольник x, y, w, h (CSS-пиксели от левого
// верхнего угла) поверх уже готового кадра. Сцена, свет и туман общие с забегом — шейдеры не
// перекомпилируются и программы материалов не переключаются. Коридор лежит дальше дальней
// плоскости камеры студии и отсекается по frustum. В обычном кадре группа скрыта.
// Цвет не чистим (только глубину): фон студии — полупрозрачная подложка, она проявляется
// поверх кадра одновременно с появлением панели. Теневая карта и матрицы сцены уже посчитаны
// в основном проходе этого кадра — второй раз не нужно.
let _studioSz = null;
export function renderStudio(group, cam, x, y, w, h) {
  if (!_studioSz) _studioSz = new THREE.Vector2();
  renderer.getSize(_studioSz);
  const sm = renderer.shadowMap, autoSm = sm.autoUpdate, autoScene = scene.autoUpdate, autoClr = renderer.autoClear, disc = discU.uShIn.value;
  sm.autoUpdate = false; scene.autoUpdate = false; renderer.autoClear = false;
  discU.uShIn.value = -1e6;                      // диск-тень под персонажем виден при любом уровне графики
  const by = _studioSz.y - y - h;                // у WebGL ось y снизу вверх
  renderer.setViewport(x, by, w, h); renderer.setScissor(x, by, w, h); renderer.setScissorTest(true);
  group.visible = true;
  renderer.clearDepth();                         // при включённом scissor чистится только прямоугольник
  renderer.render(scene, cam);
  group.visible = false;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, _studioSz.x, _studioSz.y);
  sm.autoUpdate = autoSm; scene.autoUpdate = autoScene; renderer.autoClear = autoClr; discU.uShIn.value = disc;
}

export function initGraphics(container) {
  const q = QLT.Q;
  ctxAA = q.aa;
  // stencil не используется: без буфера трафарета кадровый буфер меньше — на мобильных это чистая экономия полосы
  renderer = new THREE.WebGLRenderer({ antialias: ctxAA, powerPreference: 'high-performance', stencil: false });
  prBase = Math.min(window.devicePixelRatio || 1, U.IS_MOBILE ? q.prMobile : q.prDesktop);
  renderer.setPixelRatio(prBase);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.setClearColor(0x9fb2c0);
  renderer.shadowMap.enabled = false; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  capsAniso = renderer.capabilities.getMaxAnisotropy() || 1;
  maxAniso = Math.min(q.aniso, capsAniso);
  TEX.attachRenderer(renderer, maxAniso);
  initBakeHelpers();
  SHADOW_MAT_CHAR = discFade(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
  SHADOW_MAT_OBS = discFade(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 }));
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9fb2c0, q.fogNear, q.fogFar);
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, q.fogFar + 10);
  ({ h: hemi, s: sun, f: fill } = lightRig(scene));
  lightLayers(hemi); lightLayers(sun); lightLayers(fill);
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