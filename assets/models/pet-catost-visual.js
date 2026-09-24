// «Котость» — шуточно толстый трёхцветный (calico) кот-шар по фото-референсу.
// Контракт питомца: { root, bob, tailPivot, shadow } — ровно то, что анимируют main.js:updatePet
// и shop.js. headG/legs намеренно не отдаются: они никем не анимируются, а каждая отданная наружу
// ручка печётся отдельно (GFX.bakeCharacter) и стоит лишний draw call.
//
// Окрас не собран из мешей-пятен, а нарисован попиксельно в ОДНОЙ canvas-текстуре-атласе:
// верхняя половина — голова, нижняя — тело (UV сфер перенесены в свою половину). Цвет пикселя
// считается по 3D-точке на единичной сфере через value-noise, поэтому пятна без шва на стыке UV
// и без сжатия у полюсов, края пятен «рваные», как у настоящей шерсти.
// Итог после запекания: ~5 draw call (текстура головы+тела, одноцветные детали, блики, хвост, тень).

// Эллипсоиды тела и головы (полуоси после scale) — на них завязана раскладка глаз, ушей и лап.
const BODY_R = 0.5, BODY_S = [1.12, 0.92, 1.05], BODY_Y = 0.47;
const HEAD_R = 0.3, HEAD_S = [1.15, 0.88, 0.85], HEAD_POS = [0, 0.77, 0.27];
const TEX = 512;          // атлас TEX×TEX: голова в верхних TEX/2 строках, тело — в нижних
const SEED = 1337;        // фиксированный: кот всегда один и тот же

// Палитра: рыжий плавно гуляет от тёмного к светлому внутри пятна, чёрный — тёплый, не угольный.
const C_WHITE = [243, 238, 229], C_BLACK = [33, 26, 22];
const C_ORANGE_D = [184, 99, 36], C_ORANGE_L = [226, 152, 80];

// ─── шум ────────────────────────────────────────────────────────────────────
function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const fade = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
// Value-noise 3D, 0..1: трилинейная интерполяция хешей в узлах решётки.
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const x00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u);
  const x10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u);
  const x01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u);
  const x11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
// Три октавы: крупная форма + средняя «рваность» + мелкий шум (граница белого нагрудника).
function fbm(x, y, z) { return noise3(x, y, z) * 0.57 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.29 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.14; }

const MOTTLE_T = 0.56; // порог чёрного: подобран так, чтобы на спине и боках было ~50% чёрного
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
function mix(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; }

// ─── окрас ──────────────────────────────────────────────────────────────────
// Рисование в два прохода — ради скорости (текстура строится при первом показе кота, в т.ч. на телефоне):
//  1) «поля» — плавные низкочастотные величины, считаются на сетке вдвое грубее (в 4 раза меньше точек):
//     W — насколько точка «белая» (>0 — белый), M — «чёрность» пятна, T — тон рыжего;
//  2) в полном разрешении поля берутся билинейно, и к ним добавляется только мелкий шум —
//     рваная кромка пятен и ворс. Вид тот же, а вызовов шума примерно втрое меньше.

// Форма пятна — две низкие октавы: крупные цельные пятна, как у настоящих calico. bias > 0 — чернее.
const mottleField = (x, y, z, bias) =>
  noise3(x * 1.5 + 3.1, y * 1.5 - 7.4, z * 1.5 + 5.3) * 0.72 + noise3(x * 3.2 + 1, y * 3.2 + 2, z * 3.2 - 3) * 0.28 + bias;
// Тон рыжего — одна плавная октава: высокие октавы рисовали «изолинии», как на карте высот.
const toneField = (x, y, z) => clamp01((noise3(x * 2.4 - 9, y * 2.4 + 2, z * 2.4 + 4) - 0.2) / 0.6);

// Тело: белый нагрудник спереди (шире к животу) и белое брюхо снизу; у края белого — рыжие
// «плечи», дальше к спине — крупные чёрно-рыжие пятна.
function bodyFields(f, i, x, y, z) {
  const low = y < 0 ? -y : 0;
  const bib = (z - 0.8 + 0.55 * low) * 2 + (fbm(x * 1.7 + 11, y * 1.7, z * 1.7) - 0.5) * 0.45;
  const belly = (low - 0.84) * 3;
  const w = bib > belly ? bib : belly;
  f[i] = w;
  f[i + 1] = mottleField(x, y, z, 0.04 * (1 - z) - (w > -1 ? 0.06 * (1 + w) : 0)); // чем дальше от белого, тем чернее
  f[i + 2] = toneField(x, y, z);
}
// Голова: поля нужны только для затылка — чем выше, тем чернее (макушка на фото чёрная).
function headFields(f, i, x, y, z) {
  f[i] = 0;
  f[i + 1] = mottleField(x, y, z, 0.05 + 0.35 * clamp01(y));
  f[i + 2] = toneField(x, y, z);
}

// Рыже-чёрная шерсть по полям M/T; e — мелкий шум кромки (-0.5..0.5).
function coatAt(out, m, t, e) {
  mix(out, C_ORANGE_D, C_ORANGE_L, fade(t));
  const k = clamp01((m + e * 0.08 - MOTTLE_T) / 0.035);   // узкая полоса перехода вместо ступеньки
  if (k > 0) mix(out, out, C_BLACK, k);
  return out;
}
function bodyColor(out, x, y, z, w, m, t, e) {
  coatAt(out, m, t, e);
  const wk = w + e * 0.12;
  if (wk > 0) mix(out, out, C_WHITE, clamp01(wk / 0.06));
}
const nape = [0, 0, 0]; // буфер цвета затылка — не создаём массив на каждый пиксель
// Голова: чёрная «маска» вокруг глаз и на макушке, узкая белая проточина от носа ко лбу,
// белые морда и щёки, затылок — в тон спине. Формы маски заданы прямо по x/y/z — они дешёвые.
function headColor(out, x, y, z, w, m, t, e) {
  if (z < -0.05) { coatAt(out, m, t, e); return; }
  const ax = x < 0 ? -x : x, edge = e * 0.06;
  out[0] = C_BLACK[0]; out[1] = C_BLACK[1]; out[2] = C_BLACK[2];
  // Проточина: шире у носа, сужается к лбу и сходит на нет у макушки.
  // Кромка у проточины вдвое ровнее, чем у пятен: иначе узкая полоса рвётся и похожа на трещину.
  const bw = 0.09 * clamp01(1 - (y - 0.25) / 0.45) + 0.2 * clamp01((0.15 - y) / 0.5);
  const blaze = z > 0.45 && bw > 0.02 && ax + edge * 0.5 < bw; // bw > 0.02: над лбом шум не пробивает белые точки
  // Морда и щёки: граница ниже глаз по центру и поднимается к бокам щёк.
  const muzzle = y + edge < -0.3 + 0.4 * clamp01((ax - 0.55) / 0.4);
  if (blaze || muzzle) {
    out[0] = C_WHITE[0]; out[1] = C_WHITE[1]; out[2] = C_WHITE[2];
    // Рыжеватый мазок на спинке носа, как на фото.
    const nose = clamp01(1 - Math.hypot(x / 0.1, (y + 0.24) / 0.09));
    if (nose > 0) mix(out, out, C_ORANGE_L, nose * 0.55);
  }
  // Переход к затылку — рваной кромкой, а не линейным смешиванием: смесь белого с чёрным давала серую кайму.
  if (z < 0.1) mix(out, out, coatAt(nape, m, t, e), clamp01((0.02 - z + edge * 2) / 0.03));
}

// Нарисовать половину атласа: строка — широта сферы, столбец — долгота. Направление
// восстанавливается ровно по формуле THREE.SphereGeometry (phi от -X к +Z, theta от макушки).
const LOW = 2; // во сколько раз грубее сетка полей
function paintHalf(img, row0, fieldsFn, colorFn) {
  const d = img.data, W = TEX, H = TEX / 2, LW = W / LOW, LH = H / LOW;
  // 1) поля на грубой сетке
  const f = new Float32Array(LW * LH * 3);
  for (let gy = 0; gy < LH; gy++) {
    const th = (gy + 0.5) / LH * Math.PI, st = Math.sin(th), y = Math.cos(th);
    for (let gx = 0; gx < LW; gx++) {
      const ph = (gx + 0.5) / LW * Math.PI * 2;
      fieldsFn(f, (gy * LW + gx) * 3, -Math.cos(ph) * st, y, Math.sin(ph) * st);
    }
  }
  // 2) полное разрешение: билинейно берём поля (по долготе — с заворотом), добавляем кромку и ворс.
  // cos/sin долготы одинаковы для всего столбца — считаем их один раз, а не на каждый пиксель.
  const c = [0, 0, 0], cph = new Float32Array(W), sph = new Float32Array(W);
  for (let px = 0; px < W; px++) { const ph = (px + 0.5) / W * Math.PI * 2; cph[px] = Math.cos(ph); sph[px] = Math.sin(ph); }
  for (let py = 0; py < H; py++) {
    const th = (py + 0.5) / H * Math.PI, st = Math.sin(th), y = Math.cos(th);
    let sy = (py + 0.5) / LOW - 0.5; sy = sy < 0 ? 0 : sy > LH - 1 ? LH - 1 : sy;
    const y0 = Math.floor(sy), y1 = Math.min(LH - 1, y0 + 1), fy = sy - y0;
    for (let px = 0; px < W; px++) {
      const x = -cph[px] * st, z = sph[px] * st;
      const sx = (px + 0.5) / LOW - 0.5, xf = Math.floor(sx), fx = sx - xf;
      const x0 = (xf + LW) % LW, x1 = (xf + 1) % LW;
      const a = (y0 * LW + x0) * 3, b = (y0 * LW + x1) * 3, cc = (y1 * LW + x0) * 3, dd = (y1 * LW + x1) * 3;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const fw = f[a] * w00 + f[b] * w10 + f[cc] * w01 + f[dd] * w11;
      const fm = f[a + 1] * w00 + f[b + 1] * w10 + f[cc + 1] * w01 + f[dd + 1] * w11;
      const ft = f[a + 2] * w00 + f[b + 2] * w10 + f[cc + 2] * w01 + f[dd + 2] * w11;
      colorFn(c, x, y, z, fw, fm, ft, noise3(x * 32, y * 32, z * 32) - 0.5);
      // Ворс: мелкие продольные штрихи (шум растянут вдоль меридиана) ±7% яркости.
      const fur = 0.93 + noise3(x * 40, y * 11, z * 40) * 0.14;
      const i = ((row0 + py) * W + px) * 4;
      d[i] = Math.min(255, c[0] * fur); d[i + 1] = Math.min(255, c[1] * fur); d[i + 2] = Math.min(255, c[2] * fur); d[i + 3] = 255;
    }
  }
}

// Перенести UV сферы в свою половину атласа (v: 0..1 → v0..v0+0.5).
function toAtlas(geo, v0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * 0.5);
  uv.needsUpdate = true;
  return geo;
}

const HA = HEAD_R * HEAD_S[0], HB = HEAD_R * HEAD_S[1], HC = HEAD_R * HEAD_S[2]; // полуоси головы

// Точка на эллипсоиде головы (относительно её центра) по направлению dir на единичной сфере —
// то же параметрическое пространство, в котором рисуется окрас (headColor), поэтому глаза,
// уши и нос совпадают с нарисованной маской. Возвращает точку и внешнюю нормаль.
function headPoint(THREE, dir) {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const p = new THREE.Vector3(d.x * HA, d.y * HB, d.z * HC);
  const n = new THREE.Vector3(p.x / (HA * HA), p.y / (HB * HB), p.z / (HC * HC)).normalize();
  return { p, n };
}

// Круглая «накладка» на голову: диск радиуса r в касательной плоскости точки dir
// (со сдвигом du вправо / dv вверх), каждая вершина спроецирована на эллипсоид головы,
// раздутый в (1 + eps) раз. Накладка повторяет кривизну и лежит на голове с зазором
// в миллиметры — поэтому глаз не выступает за силуэт головы ни с какого ракурса.
// Слои глаза отличаются только eps: чем выше слой, тем больше eps.
const DECAL_SEG = 24, DECAL_RINGS = 3;
function headDecal(THREE, mat, dir, du, dv, r, eps) {
  const { p: c0, n: n0 } = headPoint(THREE, dir);
  const t1 = new THREE.Vector3(0, 1, 0).cross(n0).normalize(), t2 = n0.clone().cross(t1);
  const pos = [], nor = [], idx = [], q = new THREE.Vector3();
  const push = (lx, ly) => {
    q.copy(c0).addScaledVector(t1, du + lx).addScaledVector(t2, dv + ly);
    const k = (1 + eps) / Math.sqrt((q.x / HA) ** 2 + (q.y / HB) ** 2 + (q.z / HC) ** 2);
    q.multiplyScalar(k);
    pos.push(q.x + HEAD_POS[0], q.y + HEAD_POS[1], q.z + HEAD_POS[2]);
    const nl = Math.hypot(q.x / (HA * HA), q.y / (HB * HB), q.z / (HC * HC));
    nor.push(q.x / (HA * HA) / nl, q.y / (HB * HB) / nl, q.z / (HC * HC) / nl);
  };
  push(0, 0);
  for (let ring = 1; ring <= DECAL_RINGS; ring++) {
    const rr = r * ring / DECAL_RINGS;
    for (let s = 0; s < DECAL_SEG; s++) { const a = s / DECAL_SEG * Math.PI * 2; push(Math.cos(a) * rr, Math.sin(a) * rr); }
  }
  for (let s = 0; s < DECAL_SEG; s++) idx.push(0, 1 + s, 1 + (s + 1) % DECAL_SEG);   // центральный веер
  for (let ring = 1; ring < DECAL_RINGS; ring++) {
    const i0 = 1 + (ring - 1) * DECAL_SEG, i1 = i0 + DECAL_SEG;
    for (let s = 0; s < DECAL_SEG; s++) {
      const s1 = (s + 1) % DECAL_SEG;
      idx.push(i0 + s, i1 + s, i1 + s1, i0 + s, i1 + s1, i0 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, mat);
}

export function createPetVisual(THREE, GFX) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); root.add(bob);

  const coat = GFX.MT(GFX.canvasTex(TEX, TEX, (g, w, h) => {
    const img = g.createImageData(w, h);
    paintHalf(img, 0, headFields, headColor);
    paintHalf(img, h / 2, bodyFields, bodyColor);
    g.putImageData(img, 0, 0);
  }));

  // Тело — почти идеальный шар; сегментов больше, чем у остальных моделей: на силуэте-шаре
  // гранёность видна сильнее всего, а это единственный крупный меш кота.
  const body = GFX.put(bob, new THREE.Mesh(toAtlas(new THREE.SphereGeometry(BODY_R, 28, 18), 0), coat), 0, BODY_Y, 0);
  body.scale.set(BODY_S[0], BODY_S[1], BODY_S[2]);
  const head = GFX.put(bob, new THREE.Mesh(toAtlas(new THREE.SphereGeometry(HEAD_R, 28, 18), 0.5), coat), HEAD_POS[0], HEAD_POS[1], HEAD_POS[2]);
  head.scale.set(HEAD_S[0], HEAD_S[1], HEAD_S[2]);

  // Глаза — стопка накладок (см. headDecal): чёрная обводка → светлая радужка → крупный
  // зрачок → два блика. Крупные, как на фото, но целиком внутри чёрной маски и контура головы.
  const dark = '#16100d', EYE_X = 0.35, EYE_Y = 0.12;
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const sx of [-1, 1]) {
    const dir = [sx * EYE_X, EYE_Y, 0.93];
    bob.add(headDecal(THREE, GFX.M(dark), dir, 0, 0, 0.082, 0.004));
    bob.add(headDecal(THREE, GFX.M('#e6ddb6'), dir, 0, 0, 0.066, 0.008));
    bob.add(headDecal(THREE, GFX.M(dark), dir, 0, 0, 0.05, 0.012));
    // Блики чуть выше и снаружи от центра зрачка — «влажный» взгляд.
    bob.add(headDecal(THREE, glintMat, dir, sx * 0.018, 0.02, 0.016, 0.016));
    bob.add(headDecal(THREE, glintMat, dir, -sx * 0.02, -0.018, 0.007, 0.016));
  }

  // Нос — маленький розовый приплюснутый шарик внизу проточины.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 6), GFX.M('#c7867c'));
  const np = headPoint(THREE, [0, -0.3, 0.95]).p;
  nose.scale.set(1.25, 0.8, 0.45); nose.position.set(np.x + HEAD_POS[0], np.y + HEAD_POS[1], np.z + HEAD_POS[2]); bob.add(nose);

  // Уши — маленькие скруглённые конусы по бокам макушки, слегка наружу; внутри — розовое.
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.15, 10), GFX.M(dark));
    const { p: ep, n: en } = headPoint(THREE, [sx * 0.58, 0.8, 0.1]);
    const sink = 0.012; // основание чуть утоплено в голову, чтобы не было щели
    ear.position.set(ep.x - en.x * sink + HEAD_POS[0], ep.y - en.y * sink + HEAD_POS[1] + 0.045, ep.z - en.z * sink + HEAD_POS[2]);
    ear.scale.set(1, 1, 0.55); ear.rotation.set(-0.12, 0, -sx * 0.5); bob.add(ear);
    // Розовое нутро — тот же конус поменьше, сдвинутый к передней грани уха.
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.095, 8), GFX.M('#b9766f'));
    inner.scale.set(1, 1, 0.3); inner.rotation.copy(ear.rotation);
    inner.position.set(ear.position.x, ear.position.y - 0.012, ear.position.z + 0.03); bob.add(inner);
  }

  // Лапы — крошечные белые «подушечки», едва выглядывают из-под шара: передние спереди, задние по бокам.
  const paw = '#f4f0e8';
  for (const [x, z, sx, sz] of [[-0.15, 0.30, 1, 1.3], [0.15, 0.30, 1, 1.3], [-0.30, -0.12, 1.3, 1], [0.30, -0.12, 1.3, 1]]) {
    const p = GFX.put(bob, new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), GFX.M(paw)), x, 0.04, z);
    p.scale.set(sx, 0.6, sz);
  }

  // Хвост — маленький чёрный шарик на спине внизу, наполовину утоплен в тело.
  // Цвет — ровно чёрный текстуры (C_BLACK). Рендер выводит в sRGB, и в three r128 цвет материала
  // считается линейным: GFX.M с тем же hex на экране вышел бы заметно светлее пятен на теле.
  // Поэтому переводим sRGB → linear. Материал свой, а не из кэша GFX.M: общий кэш менять нельзя.
  const tailMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(C_BLACK[0] / 255, C_BLACK[1] / 255, C_BLACK[2] / 255).convertSRGBToLinear() });
  // Пивот утоплен в тело перед шариком: игра качает tailPivot по Y на ±0.3–0.35 рад, и шарик,
  // сдвинутый на TAIL_ARM от оси, лишь чуть покачивается вбок (~2 см), а не ездит по спине.
  const TAIL_ARM = 0.06;
  const tailPivot = new THREE.Group(); tailPivot.position.set(0, 0.18, -0.425 + TAIL_ARM); bob.add(tailPivot);
  GFX.put(tailPivot, new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), tailMat), 0, 0, -TAIL_ARM);

  const shadow = GFX.shadowDisc(root, 0.55, GFX.SHADOW_MAT_CHAR);
  return { root, bob, tailPivot, shadow };
}
