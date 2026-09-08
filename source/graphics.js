import * as U from './utils.js';

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
export function bakeStatic(group) {
  group.updateMatrixWorld(true); _binv.copy(group.matrixWorld).invert(); const buckets = { L: [], B: [] };
  group.traverse(o => {
    if (!o.isMesh) return; const m = o.material, g = o.geometry;
    if (!m || Array.isArray(m) || m.map || m.transparent || m.vertexColors) return;
    if (!g || !g.index || !g.attributes.position || !g.attributes.normal) return;
    if (m.isMeshLambertMaterial) buckets.L.push(o); else if (m.isMeshBasicMaterial) buckets.B.push(o);
  });
  for (const key in buckets) {
    const list = buckets[key]; if (list.length < 2) continue;
    let vc = 0, ic = 0;
    for (const o of list) { vc += o.geometry.attributes.position.count; ic += o.geometry.index.count; }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic); let vo = 0, io = 0;
    for (const o of list) {
      const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, ind = g.index, c = o.material.color;
      _bm.multiplyMatrices(_binv, o.matrixWorld); _bn.getNormalMatrix(_bm);
      for (let i = 0; i < p.count; i++) {
        const k = (vo + i) * 3; _bv.fromBufferAttribute(p, i).applyMatrix4(_bm); pos[k] = _bv.x; pos[k + 1] = _bv.y; pos[k + 2] = _bv.z;
        _bv.fromBufferAttribute(n, i).applyMatrix3(_bn).normalize(); nor[k] = _bv.x; nor[k + 1] = _bv.y; nor[k + 2] = _bv.z; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      }
      for (let i = 0; i < ind.count; i++) idx[io + i] = ind.getX(i) + vo;
      vo += p.count; io += ind.count;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); for (const o of list) o.parent.remove(o); group.add(new THREE.Mesh(geo, BAKE_MATS[key]));
  }
  return group;
}
export function freezeStatic(group) { group.traverse(o => { if (o !== group) { o.matrixAutoUpdate = false; o.updateMatrix(); } }); return group; }
export function finalizeStatic(group) { return freezeStatic(bakeStatic(group)); }

function makeBottleFallbackTex() {
  return canvasTex(64, 128, (g) => {
    g.clearRect(0, 0, 64, 128); g.fillStyle = '#3fa66b';
    g.beginPath(); g.moveTo(24, 10); g.lineTo(40, 10); g.lineTo(40, 34); g.quadraticCurveTo(52, 44, 52, 60); g.lineTo(52, 116); g.quadraticCurveTo(52, 124, 44, 124); g.lineTo(20, 124); g.quadraticCurveTo(12, 124, 12, 116); g.lineTo(12, 60); g.quadraticCurveTo(12, 44, 24, 34); g.closePath(); g.fill();
    g.fillStyle = '#f4f0dc'; g.fillRect(16, 66, 32, 30); g.fillStyle = '#c62828'; g.fillRect(22, 4, 20, 8);
  });
}
export function loadTextures() {
  return new Promise(res => {
    const url = (typeof ASSETS !== 'undefined' && ASSETS && ASSETS.bottle) ? ASSETS.bottle : null;
    if (!url) { texBottle = makeBottleFallbackTex(); return res(); }
    new THREE.TextureLoader().load(url, tex => { tex.encoding = THREE.sRGBEncoding; texBottle = tex; res(); }, undefined, () => { texBottle = makeBottleFallbackTex(); res(); });
  });
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

export let floorTex, wallTex, lockerTex, boardTex, windowTex, shelfTex, signTex, posterTexes = [], bannerTexes = [];
export let LOCKER_MATS_FRONT, LOCKER_MATS_BACK, SHELF_MATS, SIGN_MATS_FRONT, SIGN_MATS_BACK;

export function buildEnvTextures() {
  texMel = makeMelFaceTex(); texGranny = makeGrannyFaceTex();
  floorTex = canvasTex(256, 256, (g) => { g.fillStyle = '#c9cfd5'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#b4bbc2'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128); g.strokeStyle = '#98a1a9'; g.lineWidth = 6; g.strokeRect(0, 0, 256, 256); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke(); g.fillStyle = 'rgba(90,100,110,0.25)'; for (let i = 0; i < 26; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }, [3.7, 9.6], maxAniso);
  wallTex = canvasTex(128, 256, (g) => { g.fillStyle = '#f0ecd9'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#a9c98c'; g.fillRect(0, 148, 128, 92); g.fillStyle = '#6f9459'; g.fillRect(0, 144, 128, 7); g.fillStyle = '#5c4633'; g.fillRect(0, 240, 128, 16); }, [6, 1], maxAniso);
  lockerTex = canvasTex(256, 512, (g) => { g.fillStyle = '#7e8b99'; g.fillRect(0, 0, 256, 512); for (let i = 0; i < 2; i++) { const x = 4 + i * 126; g.fillStyle = '#8895a3'; g.fillRect(x, 6, 118, 496); g.strokeStyle = '#5d6873'; g.lineWidth = 4; g.strokeRect(x, 6, 118, 496); g.fillStyle = '#55606a'; for (let v = 0; v < 3; v++) g.fillRect(x + 20, 30 + v * 16, 78, 7); g.fillStyle = '#f3c53d'; g.fillRect(x + 88, 250, 16, 34); } });
  boardTex = canvasTex(512, 256, (g) => { g.fillStyle = '#1e4034'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#f5f2e4'; g.lineWidth = 6; g.font = 'bold 56px Arial'; g.fillStyle = '#f5f2e4'; g.fillText('2 × 2 = 5?', 90, 105); g.font = 'bold 40px Arial'; g.fillText('диктант!! завтра', 70, 180); g.strokeStyle = 'rgba(245,242,228,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 210); g.lineTo(460, 214); g.stroke(); });
  windowTex = canvasTex(512, 166, (g, w, h) => { g.fillStyle = '#e6e1d3'; g.fillRect(0, 0, w, h); const pw = w / 3; for (let i = 0; i < 3; i++) { const x0 = i * pw + 12, y0 = 10, ww = pw - 24, hh = h - 20; g.save(); g.beginPath(); g.rect(x0, y0, ww, hh); g.clip(); const gr = g.createLinearGradient(0, y0, 0, y0 + hh); gr.addColorStop(0, '#93aec6'); gr.addColorStop(0.6, '#b6cbd9'); gr.addColorStop(1, '#c9d6cc'); g.fillStyle = gr; g.fillRect(x0, y0, ww, hh); g.fillStyle = 'rgba(96,128,96,0.28)'; g.beginPath(); g.ellipse(x0 + ww * 0.3, y0 + hh * 0.95, ww * 0.28, hh * 0.32, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x0 + ww * 0.75, y0 + hh * 1.0, ww * 0.3, hh * 0.4, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 + ww * 0.12, y0 + hh * 0.9); g.lineTo(x0 + ww * 0.48, y0 + hh * 0.1); g.stroke(); g.fillStyle = '#dcd6c6'; g.fillRect(x0 + ww / 2 - 3, y0, 6, hh); g.fillRect(x0, y0 + hh * 0.38 - 3, ww, 6); g.strokeStyle = 'rgba(50,60,70,0.35)'; g.lineWidth = 4; g.strokeRect(x0 + 2, y0 + 2, ww - 4, hh - 4); g.restore(); } g.strokeStyle = '#cfc8b6'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); }, null, maxAniso);
  shelfTex = canvasTex(256, 512, (g) => { g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 256, 512); const cols = ['#b23a3a', '#2f5d8a', '#3f7a48', '#c98a2b', '#6a3d8a', '#d9d2bd', '#8a3b2f', '#2e7f8a']; for (let s = 0; s < 4; s++) { const y0 = 14 + s * 122; g.fillStyle = '#3a2716'; g.fillRect(12, y0, 232, 104); let x = 16; while (x < 236) { const bw = U.randi(12, 26), bh = U.randi(62, 94); if (x + bw > 240) break; g.fillStyle = U.pick(cols); g.fillRect(x, y0 + 104 - bh, bw, bh); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y0 + 104 - bh, 3, bh); x += bw + 2; if (Math.random() < 0.12) x += U.randi(10, 30); } g.fillStyle = '#8a5a33'; g.fillRect(8, y0 + 104, 240, 14); } });
  signTex = canvasTex(128, 192, (g) => { g.fillStyle = '#f2c320'; g.fillRect(0, 0, 128, 192); g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 184); g.fillStyle = '#1a1a1a'; g.font = 'bold 19px Arial'; g.textAlign = 'center'; g.fillText('ОСТОРОЖНО', 64, 38); g.beginPath(); g.arc(64, 70, 10, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(58, 82); g.lineTo(76, 108); g.lineTo(98, 100); g.moveTo(76, 108); g.lineTo(58, 130); g.moveTo(66, 92); g.lineTo(40, 88); g.stroke(); g.font = 'bold 21px Arial'; g.fillText('МОКРЫЙ', 64, 160); g.fillText('ПОЛ', 64, 182); });
  posterTexes = [['#fff6dd', '#c62828', 'ДИКТАНТ', 'ЗАВТРА!'], ['#e3f2fd', '#1565c0', 'ОБЕД', 'В 13:00'], ['#fff1f1', '#6a1b9a', 'ПОБЕГ', 'ЗАПРЕЩЁН'], ['#e8f5e9', '#2e7d32', 'Субботник', 'в 9:00']].map(([bg, fg, l1, l2]) => canvasTex(256, 352, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 256, 352); g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(10, 10, 236, 332); g.fillStyle = fg; g.font = 'bold 42px Arial'; g.textAlign = 'center'; g.fillText(l1, 128, 120); g.fillText(l2, 128, 172); g.fillStyle = '#9e9e9e'; for (let i = 0; i < 5; i++) g.fillRect(50, 210 + i * 22, 156 - (i % 3) * 40, 9); }));
  bannerTexes = [['#e53935', '#ffffff', 'КОНТРОЛЬНАЯ', 'РАБОТА!'], ['#fdd835', '#b71c1c', 'НЕ БЕГАТЬ', 'ПО КОРИДОРАМ'], ['#43a047', '#ffffff', 'ЛИНЕЙКА', 'В 8:00']].map(([bg, fg, l1, l2]) => canvasTex(512, 256, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 512, 256); g.fillStyle = fg; for (let i = -2; i < 8; i++) { g.save(); g.translate(i * 80, 0); g.globalAlpha = 0.12; g.fillRect(0, 0, 40, 256); g.restore(); } g.globalAlpha = 1; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.fillText(l1, 256, 108); g.font = 'bold 64px Arial'; g.fillText(l2, 256, 190); g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(8, 8, 496, 240); }));
  LOCKER_MATS_FRONT = [M('#6d7986'), M('#6d7986'), M('#8a97a5'), M('#55606a'), MT(lockerTex), M('#6d7986')]; LOCKER_MATS_BACK = [M('#6d7986'), M('#6d7986'), M('#8a97a5'), M('#55606a'), M('#6d7986'), MT(lockerTex)];
  SHELF_MATS = [M('#6b4a2e'), M('#6b4a2e'), M('#6b4a2e'), M('#4e3521'), MT(shelfTex), MT(shelfTex)];
  const Y = M('#e9bb1c'); SIGN_MATS_FRONT = [Y, Y, Y, Y, MT(signTex), Y]; SIGN_MATS_BACK = [Y, Y, Y, Y, Y, MT(signTex)];
}

function buildDecorUnit(kind) {
  const g = new THREE.Group();
  if (kind === 'lockers') { put(g, new THREE.Mesh(GBox(3, 2.3, 0.5), LOCKER_MATS_FRONT), 0, 1.15, 0.25); put(g, box(3.1, 0.14, 0.6, '#4d5762'), 0, 0.07, 0.3); }
  else if (kind === 'door') { for (const jx of [-0.64, 0.64]) put(g, box(0.12, 2.5, 0.22, '#6d4c2f'), jx, 1.25, 0.11); put(g, box(1.4, 0.12, 0.22, '#6d4c2f'), 0, 2.44, 0.11); put(g, box(1.16, 2.38, 0.06, '#8a5a33'), 0, 1.19, 0.16); put(g, box(0.42, 0.62, 0.03, '#cfe6ee'), 0, 1.78, 0.195); put(g, sph(0.05, 8, 8, '#e0b83e'), 0.42, 1.18, 0.21); }
  else if (kind === 'windows') { put(g, box(5.2, 1.86, 0.1, '#e6e1d3'), 0, 3.48, 0.05); put(g, tplane(5.0, 1.62, windowTex), 0, 3.5, 0.105); put(g, box(5.4, 0.1, 0.3, '#d9d3c2'), 0, 2.6, 0.15); put(g, cyl(0.12, 0.09, 0.22, 8, '#b7643a'), 1.7, 2.76, 0.15); put(g, sph(0.17, 8, 6, '#4f8a4b'), 1.7, 2.98, 0.15); }
  else if (kind === 'poster') { put(g, box(1.2, 1.6, 0.05, '#5d4634'), 0, 2.15, 0.025); put(g, tplane(1.05, 1.45, U.pick(posterTexes)), 0, 2.15, 0.055); }
  else if (kind === 'board') { put(g, box(2.9, 1.55, 0.08, '#5d4634'), 0, 2.35, 0.04); put(g, tplane(2.7, 1.35, boardTex), 0, 2.35, 0.085); put(g, box(2.8, 0.07, 0.14, '#5d4634'), 0, 1.55, 0.1); }
  else if (kind === 'extinguisher') { put(g, box(0.34, 0.8, 0.2, '#b0451f'), 0, 1.25, 0.1); put(g, cyl(0.13, 0.13, 0.42, 10, '#c62828'), 0, 1.15, 0.33); put(g, cyl(0.04, 0.04, 0.12, 6, '#37474f'), 0, 1.42, 0.33); }
  return finalizeStatic(g);
}
const DECOR_KINDS = ['lockers', 'door', 'windows', 'poster', 'board', 'extinguisher'];

export function randomizeSegmentDecor(seg, minLocalZ) {
  const lo = Math.max(-U.SEG_LEN / 2 + 3, minLocalZ == null ? -Infinity : minLocalZ), hi = U.SEG_LEN / 2 - 3;
  for (const sideKey of ['L', 'R']) {
    const units = seg.userData.decor[sideKey], indices = units.map((_, i) => i);
    for (let i = 0; i < units.length; i++) units[i].visible = false;
    for (let i = indices.length - 1; i > 0; i--) { const j = U.randi(0, i), temp = indices[i]; indices[i] = indices[j]; indices[j] = temp; }
    const n = (lo <= -3 && U.randi(1, 2) === 2) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const u = units[indices[i]]; u.visible = true;
      if (n === 1) u.position.z = U.rand(lo, hi); else if (i === 0) u.position.z = U.rand(lo, -3); else u.position.z = U.rand(3, hi);
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
  g.userData.decor = decor; randomizeSegmentDecor(g, i === 0 ? U.CLASS_Z0 + 3 : undefined); return g;
}

export function buildDiaryMesh() {
  if (!buildDiaryMesh.tex) {
    buildDiaryMesh.tex = canvasTex(128, 128, (g) => { g.fillStyle = '#1d5c3f'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#d9b64a'; g.lineWidth = 6; g.strokeRect(8, 8, 112, 112); g.fillStyle = '#d9b64a'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('ДНЕВНИК', 64, 58); g.font = 'bold 18px Arial'; g.fillText('МЭЛА', 64, 86); });
    buildDiaryMesh.mats = [M('#14523a'), M('#14523a'), M('#14523a'), M('#f4f0dc'), MT(buildDiaryMesh.tex), M('#14523a')];
  }
  return new THREE.Mesh(GBox(0.3, 0.07, 0.4), buildDiaryMesh.mats);
}
export function buildTeacherDesk() {
  const g = new THREE.Group(); put(g, box(2.0, 0.1, 1.0, '#8a5a33'), 0, 1.02, 0); put(g, box(1.4, 0.02, 0.66, '#2e6b46'), 0, 1.08, 0);
  for (const dx of [-0.72, 0.72]) { put(g, box(0.5, 0.92, 0.85, '#7a4e2b'), dx, 0.48, 0); put(g, box(0.34, 0.05, 0.05, '#e0b83e'), dx, 0.62, 0.45); put(g, box(0.34, 0.05, 0.05, '#e0b83e'), dx, 0.34, 0.45); }
  put(g, box(0.42, 0.05, 0.3, '#a02020'), -0.34, 1.1, 0.08).rotation.y = 0.3;
  const diary = put(g, buildDiaryMesh(), 0.34, 1.13, 0.02); diary.rotation.set(-Math.PI / 2, 0, 0.2); return { group: g, diary };
}

export function initGraphics(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, U.IS_MOBILE ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.setClearColor(0x9fb2c0);
  container.appendChild(renderer.domElement);
  maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy() || 1);
  initBakeHelpers();
  SHADOW_MAT_CHAR = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });
  SHADOW_MAT_OBS = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9fb2c0, U.FOG_NEAR, U.FOG_FAR);
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, U.CAM_FAR);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77808c, 0.95));
  const dir = new THREE.DirectionalLight(0xfff0d6, 0.65); dir.position.set(3, 10, 4); scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xd6e4ff, 0.3); dir2.position.set(-4, 6, -6); scene.add(dir2);
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  });
  renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
}