// Гипертрофированно толстый заяц с шуточно «вклеенным» человеческим лицом.
// Контракт питомца: { root, bob, tailPivot, shadow } — ровно то, что анимируют main.js:updatePet
// и shop.js (как у pet-catost-visual.js). headG/legs больше не отдаются: их никто не анимировал,
// а каждая отданная ручка печётся отдельно (GFX.bakeCharacter) и стоит лишний draw call.
//
// Лицо не накладка поверх головы, а часть её текстуры: кожа нарисована прямо на сфере головы
// и уходит под мех рваной кромкой, у кромки кожа чуть темнее — лицо будто утоплено в шерсть.
// Глаза-щёлочки, брови, румянец и тени у носа тоже в текстуре; объёмные только нос-картошка
// (шарик + два крылышка) и прежний рот.

// Эллипсоид головы (полуоси после scale) — на нём раскладка носа, рта и ушей.
const HEAD_R = 0.265, HEAD_S = [1.12, 0.98, 0.92], HEAD_POS = [0, 0.74, 0.42];
const HA = HEAD_R * HEAD_S[0], HB = HEAD_R * HEAD_S[1], HC = HEAD_R * HEAD_S[2];
const TEX_W = 512, TEX_H = 256; // развёртка сферы 2:1 — пиксель квадратный на экваторе, там и лицо

// Палитра кожи задана сразу в sRGB (как видно на экране). Мех в текстуре пересчитывается
// из цвета тела, чтобы голова и тело не отличались на стыке (см. createPetVisual).
const C_SKIN = [226, 170, 150], C_CHEEK = [216, 138, 124], C_NOSE = [222, 150, 134];
const C_EYE = [48, 33, 30], C_LASH = [70, 44, 38], C_BROW = [118, 82, 66], C_BRIDGE = [240, 192, 172];

// Лицо в угловых координатах направления: lon — долгота от «вперёд» (+ вправо), lat — широта.
const FACE_LAT = -0.08, FACE_LON_R = 0.8, FACE_LAT_R = 0.66;
const EYE_X = 0.27, EYE_Y = 0.12, EYE_W = 0.13, EYE_H = 0.04;    // глаза почти закрыты
const BROW_Y = 0.29, BROW_W = 0.16, BROW_T = 0.03;                // брови тонкие и редкие
const NOSE_LAT = -0.13, WING_LON = 0.13, WING_LAT = -0.17;
const MOUTH_Y = -0.095;                                           // рот — как был

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function mix(out, c, t) { out[0] += (c[0] - out[0]) * t; out[1] += (c[1] - out[1]) * t; out[2] += (c[2] - out[2]) * t; }
function mul(out, k) { out[0] *= k; out[1] *= k; out[2] *= k; }
// Целочисленный хеш 0..1 — редкие волоски бровей.
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Цвет точки головы. fur — мех в sRGB, h — хеш пикселя для бровей.
const s = [0, 0, 0]; // буфер цвета кожи — не создаём массив на каждый пиксель
function faceColor(out, fur, lon, lat, h) {
  out[0] = fur[0]; out[1] = fur[1]; out[2] = fur[2];
  const fx = lon / FACE_LON_R, fy = (lat - FACE_LAT) / FACE_LAT_R;
  const d = Math.hypot(fx, fy);
  if (d > 1.25) return;
  // Кромка — мелкие неровные пряди, а не ровные волны. Частоты целые, чтобы узор замыкался по кругу без шва.
  const a = Math.atan2(fy, fx);
  const edge = 1 + 0.018 * Math.sin(a * 7 + 0.6) + 0.014 * Math.sin(a * 29 + 1.3) + 0.01 * Math.sin(a * 47 + 2.1) + 0.007 * Math.sin(a * 83);
  // Мех вокруг лица слегка в тени — лицо сидит в «гнезде» из шерсти.
  mul(out, 1 - 0.08 * (1 - smooth(edge, edge + 0.18, d)));
  const k = 1 - smooth(edge - 0.1, edge, d);
  if (k <= 0) return;

  s[0] = C_SKIN[0]; s[1] = C_SKIN[1]; s[2] = C_SKIN[2];
  mul(s, 1 - 0.13 * smooth(0.7, edge, d));                                   // кожа темнеет к кромке
  // Румянец на щеках.
  for (let sx = -1; sx <= 1; sx += 2) mix(s, C_CHEEK, 0.4 * clamp01(1 - Math.hypot((lon - sx * 0.42) / 0.2, (lat + 0.17) / 0.14)));
  // Нос: светлая спинка и тень под картошкой — вместе с объёмным носом читается рельеф.
  mix(s, C_BRIDGE, 0.35 * clamp01(1 - Math.hypot(lon / 0.05, lat / 0.13)));
  mul(s, 1 - 0.1 * clamp01(1 - Math.hypot(lon / 0.13, (lat + 0.28) / 0.03)));

  for (let sx = -1; sx <= 1; sx += 2) {
    // Глаз: миндаль, нижнее веко почти прямое, верхнее тяжёлое — глаз «минимально открыт».
    const u = (lon - sx * EYE_X) / EYE_W, v = lat - EYE_Y;
    if (u > -1.3 && u < 1.3) {
      const w = clamp01(1 - u * u);
      const top = EYE_H * Math.pow(w, 0.7), bot = -EYE_H * 0.45 * w;
      mul(s, 1 - 0.1 * clamp01(1 - Math.abs(v - top - 0.04) / 0.05) * w);    // складка века
      mul(s, 1 - 0.06 * clamp01(1 - Math.abs(v - bot + 0.045) / 0.035) * w); // лёгкие мешки
      if (w > 0 && v < top && v > bot) mix(s, C_EYE, smooth(0, 0.35, Math.min(top - v, v - bot) / EYE_H + 0.12));
      const lash = clamp01(1 - Math.abs(v - top) / 0.011) * smooth(0, 0.15, w);
      mix(s, C_LASH, 0.85 * lash);
    }
    // Бровь: пологая дуга, к концам тоньше; волоски — случайная прозрачность.
    const bu = (lon - sx * EYE_X) / BROW_W;
    if (bu > -1 && bu < 1) {
      const by = BROW_Y + 0.025 * (1 - bu * bu) - 0.012 * bu * sx;
      const t = BROW_T * (1 - 0.45 * bu * bu);
      const b = clamp01(1.5 * (1 - Math.abs(lat - by) / t)) * smooth(1, 0.7, Math.abs(bu));
      if (b > 0) mix(s, C_BROW, b * (0.45 + 0.4 * h));
    }
  }
  mix(out, s, k);
}

// Рисуем развёртку сферы: строка — широта, столбец — долгота, направление по формуле
// THREE.SphereGeometry (как в pet-catost-visual.js). Вне лица — сплошной мех; в зоне лица
// 4 подвыборки на пиксель, иначе тонкие щёлочки глаз и брови рисуются лесенкой.
function paintHead(img, fur) {
  const d = img.data, c = [0, 0, 0];
  for (let py = 0; py < TEX_H; py++) {
    for (let px = 0; px < TEX_W; px++) {
      const h = hash2(px, py), front = Math.sin((px + 0.5) / TEX_W * Math.PI * 2) > 0; // z > 0 — перёд головы
      const ss = front ? 2 : 1;                     // затылок: лица там нет, одной выборки хватит
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const th = (py + (sy + 0.5) / ss) / TEX_H * Math.PI, ph = (px + (sx + 0.5) / ss) / TEX_W * Math.PI * 2;
        const st = Math.sin(th);
        faceColor(c, fur, Math.atan2(-Math.cos(ph) * st, Math.sin(ph) * st), Math.PI / 2 - th, h);
        r += c[0]; g += c[1]; b += c[2];
      }
      const i = (py * TEX_W + px) * 4, n = ss * ss;
      d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; d[i + 3] = 255;
    }
  }
}

// Точка на эллипсоиде головы (в координатах bob) по долготе/широте и внешняя нормаль —
// то же пространство, в котором нарисовано лицо, поэтому нос и рот садятся ровно на рисунок.
function headPoint(THREE, lon, lat) {
  const cl = Math.cos(lat);
  const p = new THREE.Vector3(Math.sin(lon) * cl * HA, Math.sin(lat) * HB, Math.cos(lon) * cl * HC);
  const n = new THREE.Vector3(p.x / (HA * HA), p.y / (HB * HB), p.z / (HC * HC)).normalize();
  p.x += HEAD_POS[0]; p.y += HEAD_POS[1]; p.z += HEAD_POS[2];
  return { p, n };
}

export function createPetVisual(THREE, GFX) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); root.add(bob);

  const fur = '#f2eee7', furShade = '#d8d1c8', innerEar = '#e6a6a2';
  const dark = '#332d2b';

  // Цвет GFX.M three r128 считает линейным, а вывод идёт в sRGB — на экране мех тела светлее hex.
  // Текстура же хранит sRGB, поэтому мех для неё переводим linear → sRGB: стык головы с телом не виден.
  const fc = new THREE.Color(fur).convertLinearToSRGB();
  const furSrgb = [fc.r * 255, fc.g * 255, fc.b * 255];
  // Обратный случай — однотонный меш (нос) цвета кожи из текстуры: sRGB → linear.
  const skinMat = rgb => new THREE.MeshLambertMaterial({ color: new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear() });

  const body = GFX.put(bob, GFX.sph(0.43, 10, 8, fur), 0, 0.43, 0);
  body.scale.set(1.42, 1.18, 1.42);
  const belly = GFX.put(bob, GFX.sph(0.29, 8, 6, '#fffdfa'), 0, 0.34, 0.38);
  belly.scale.set(1.08, 1.16, 0.32);

  const headMat = GFX.MT(GFX.canvasTex(TEX_W, TEX_H, (g, w, h) => {
    const img = g.createImageData(w, h);
    paintHead(img, furSrgb);
    g.putImageData(img, 0, 0);
  }));
  const head = GFX.put(bob, new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 24, 16), headMat), HEAD_POS[0], HEAD_POS[1], HEAD_POS[2]);
  head.scale.set(HEAD_S[0], HEAD_S[1], HEAD_S[2]);

  // Нос-картошка: округлый кончик и два крылышка по бокам, наполовину утоплены в лицо.
  const noseMat = skinMat(C_NOSE);
  const tip = headPoint(THREE, 0, NOSE_LAT);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), noseMat);
  bulb.scale.set(1.2, 0.95, 0.85);
  bulb.position.copy(tip.p).addScaledVector(tip.n, 0.012); bob.add(bulb);
  for (const sx of [-1, 1]) {
    const w = headPoint(THREE, sx * WING_LON, WING_LAT);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 6), noseMat);
    wing.scale.set(1.1, 0.85, 0.8);
    wing.position.copy(w.p).addScaledVector(w.n, 0.004); bob.add(wing);
  }

  // Рот прежний; сажаем его на поверхность головы (раньше он лежал на плоской накладке лица).
  const mz = HC * Math.sqrt(1 - (MOUTH_Y / HB) ** 2);
  GFX.put(bob, GFX.box(0.075, 0.012, 0.012, dark), HEAD_POS[0], HEAD_POS[1] + MOUTH_Y, HEAD_POS[2] + mz);

  for (const sx of [-1, 1]) {
    const ear = GFX.put(bob, GFX.sph(0.105, 8, 6, fur), sx * 0.13, HEAD_POS[1] + 0.30, HEAD_POS[2] - 0.015);
    ear.scale.set(0.72, 1.85, 0.48); ear.rotation.z = sx * 0.10;
    const inner = GFX.put(bob, GFX.sph(0.052, 7, 5, innerEar), sx * 0.13, HEAD_POS[1] + 0.31, HEAD_POS[2] + 0.035);
    inner.scale.set(0.60, 1.55, 0.08); inner.rotation.z = sx * 0.10;
  }

  // Лапы как на фото: белые, выглядывают из-под шара. Передние — вытянутые вперёд, с тремя
  // пальцами-бугорками на носке; задние — крупные плоские ступни по бокам, носком чуть наружу.
  for (const sx of [-1, 1]) {
    const paw = GFX.put(bob, GFX.sph(0.07, 10, 6, fur), sx * 0.15, 0.035, 0.37);
    paw.scale.set(1, 0.6, 1.4);
    for (const tx of [-0.032, 0, 0.032]) {
      const toe = GFX.put(bob, GFX.sph(0.027, 8, 5, fur), sx * 0.15 + tx, 0.03, 0.455 - Math.abs(tx) * 0.35);
      toe.scale.set(1, 0.85, 1.1);
    }
    const foot = GFX.put(bob, GFX.sph(0.085, 10, 6, fur), sx * 0.34, 0.03, 0.16);
    foot.scale.set(0.9, 0.55, 1.55); foot.rotation.y = sx * 0.25;
  }

  const tailPivot = new THREE.Group(); tailPivot.position.set(0, 0.40, -0.54); bob.add(tailPivot);
  const tail = GFX.put(tailPivot, GFX.sph(0.13, 8, 6, furShade), 0, 0.08, 0);
  tail.scale.set(1, 1, 0.72);

  const shadow = GFX.shadowDisc(root, 0.44, GFX.SHADOW_MAT_CHAR);
  return { root, bob, tailPivot, shadow };
}
