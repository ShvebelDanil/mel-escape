//Visual-only replacement. Uses the game's existing THREE and GFX instances.
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
  // Ступни модели заканчивались не на полу, а на y=.186: группа ноги висит внутри
  // inner на y=.92, а самая нижняя деталь обуви не достаёт до -.92. Скин из-за этого
  // "летал" над собственной тенью (тень лежит на root в y=.02, пол сцены — y=0), тогда
  // как модели с более длинными ногами стояли ровно. Опускаем фигуру целиком высотой
  // pivot: ступни встают на пол, а точка вращения сальто остаётся в той же точке ТЕЛА
  // (pivot едет вниз вместе с фигурой). Двигать inner нельзя — игра переписывает его
  // позицию каждый кадр (main.js/shop.js ставят inner.position.y = -0.92 + ...).
  const GROUND_FIX = .186;
  const pivot = put(root, new THREE.Group(), 0, .92 - GROUND_FIX, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  const skin = '#d7a883';
  const hairCol = options.hairColor || '#4d3320';
  const shirtCol = '#f1eee6', shirtShade = '#e1dccb';
  const tieCol = options.tieColor || '#5c1a1a', tieDark = '#3f1010';
  const beltCol = '#1c1c1c', buckleCol = '#c3c3ba';
  const shortsCol = options.shortsColor || '#8a3729', shortsCuff = '#6a281d';
  const sockCol = '#eeece2', sockRib = '#d3d0c2';
  const shoeCol = options.shoeColor || '#3a3d42', soleCol = '#f4f1e8', stripeCol = '#c9433a';
  const backpackCol = options.backpackColor || '#7a2222', backpackDark = '#551515', strapCol = '#181818';
  const watchCol = '#141414', watchFace = '#c9c9c1';

  const material = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mats = {};
  const mat = c => mats[c] || (mats[c] = material(c));

  function rounded(w, h, d, c, r = .025) {
    const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -d / 2 + r);
    return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
  }
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
  const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof c === 'string' ? mat(c) : c);
  const cyl = (rt, rb, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), typeof c === 'string' ? mat(c) : c);

  function texturize(t, repeatX, repeatY) {
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.anisotropy = 4;
    return t;
  }
  function weave(base, line, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .45;
    for (let i = -16; i < 160; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
    return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
  }
  function ribbed(base, rib, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = rib; g.lineWidth = 2;
    for (let y = 3; y < 64; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
    return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), repeatX, repeatY) });
  }
  // Seeded PRNG (mulberry32-ish xorshift) so the "chaotic" hair speckle
  // pattern is irregular but still deterministic/reproducible per model.
  function fleck(base, spot, seed = 1337) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    let s = seed >>> 0;
    const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    g.fillStyle = spot;
    for (let i = 0; i < 280; i++) {
      const x = rand() * 128, y = rand() * 128;
      const r = .55 + rand() * 1.5;
      g.globalAlpha = .3 + rand() * .5;
      g.beginPath();
      g.ellipse(x, y, r, r * (.55 + rand() * .7), rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return new THREE.MeshLambertMaterial({ map: texturize(new THREE.CanvasTexture(c), 1, 1) });
  }

  const shirtMat = weave(shirtCol, shirtShade, 1.3, 1.2);
  const shortsMat = weave(shortsCol, shortsCuff, 1.4, 1.3);
  const sockMat = ribbed(sockCol, sockRib, 1, 2);
  const hairMat = fleck(hairCol, '#2e1e10', 1337);

  // ---- torso (slightly leaner single-block torso) ----
  put(inner, rounded(.62, .58, .37, shirtMat, .045), 0, 1.26, 0);
  put(inner, rounded(.64, .045, .39, shirtMat, .02), 0, .985, 0);
  put(inner, box(.60, .045, .41, beltCol), 0, .965, 0);
  put(inner, box(.055, .04, .018, buckleCol), 0, .965, .21);

  for (const side of [-1, 1]) {
    const lap = put(inner, box(.115, .14, .01, shirtCol), side * .065, 1.49, .185);
    lap.rotation.z = side * .55; lap.rotation.x = -.1;
  }
  put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565, 0); // neck

  const tieShape = new THREE.Shape();
  tieShape.moveTo(-.04, .14); tieShape.lineTo(.04, .14); tieShape.lineTo(.024, -.02);
  tieShape.lineTo(.02, -.32); tieShape.lineTo(-.02, -.32); tieShape.lineTo(-.024, -.02); tieShape.closePath();
  const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .015, bevelEnabled: false, curveSegments: 2 });
  tieGeo.translate(0, 0, -.0075);
  put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40, .2);
  put(inner, box(.048, .045, .026, tieDark), 0, 1.5, .195);

  // ---- backpack (fixed straps + bottom pocket) ----
  // The straps are built from pieces that stay OUTSIDE the torso's solid
  // volume at all times: a yoke that caps the shoulder, a diagonal chest
  // strap that runs just in front of the shirt down to a belt buckle, and
  // a back strap per side that continues from the yoke down the spine to
  // roughly the pack's mid-height, so the pack visibly hangs from the
  // shoulders instead of floating behind the torso.
  for (const side of [-1, 1]) {
    const yoke = put(inner, rounded(.1, .09, .32, strapCol, .03), side * .335, 1.515, -.05);
    yoke.rotation.x = -.1; yoke.rotation.z = side * -.1;

    const chestStrap = put(inner, box(.075, .48, .022, strapCol), side * .24, 1.28, .196);
    chestStrap.rotation.z = side * -.35;

    const buckle = put(inner, box(.058, .05, .026, buckleCol), side * .152, 1.045, .202);
    buckle.rotation.z = side * -.35;

    // Back strap: bridges the shoulder yoke down to the pack's body so the
    // pack reads as physically suspended from the shoulders. Runs along the
    // pack's side edge, overlapping the yoke above and the pack body below.
    const backStrap = put(inner, rounded(.09, .34, .05, strapCol, .02), side * .225, 1.34, -.215);
    backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;
  }
  // Top strap-loop bar: caps the pack at shoulder height, visually the
  // piece both back straps feed into, closing the gap above the pack.
  put(inner, rounded(.34, .06, .05, strapCol, .02), 0, 1.495, -.235);

  put(inner, rounded(.4, .48, .16, backpackCol, .045), 0, 1.28, -.27);
  put(inner, box(.26, .2, .018, backpackDark), 0, 1.17, -.19);
  put(inner, box(.02, .1, .1, backpackDark), .16, 1.4, -.27); // zip pull tab strip

  // Bottom back pocket: карман на нижней внешней стенке рюкзака. Низ кармана
  // (y 1.075) выше дна корпуса (y 1.04), сам он утоплен в корпус на .022 —
  // иначе деталь читается как отдельно висящая коробка.
  put(inner, rounded(.24, .17, .06, backpackDark, .025), 0, 1.16, -.358);
  put(inner, box(.16, .012, .02, strapCol), 0, 1.215, -.389);
  put(inner, cyl(.014, .014, .03, buckleCol, 8), .08, 1.215, -.389).rotation.x = Math.PI / 2;

  for (const side of [-1, 1]) {
    const seam = put(inner, box(.1, .011, .011, shirtShade), side * .175, 1.09, .17); seam.rotation.z = side * .3;
  }

  function leg(x) {
    const l = put(inner, new THREE.Group(), x, .92, 0);
    put(l, rounded(.24, .30, .25, shortsMat, .03), 0, -.15, 0);
    put(l, box(.25, .026, .26, shortsCuff), 0, -.30, 0);
    put(l, rounded(.205, .06, .235, skin, .02), 0, -.335, 0); // visible knee sliver
    put(l, rounded(.2, .22, .225, sockMat, .028), 0, -.475, 0); // calf-length sock
    put(l, box(.202, .016, .228, sockRib), 0, -.37, 0);
    for (const yy of [-.575, -.595]) put(l, box(.212, .011, .242, '#232323'), 0, yy, 0);
    put(l, rounded(.245, .062, .38, soleCol, .014), 0, -.705, .062);
    put(l, rounded(.238, .115, .35, shoeCol, .028), 0, -.653, .066);
    put(l, box(.03, .05, .30, stripeCol), Math.sign(x) * .118, -.66, .08);
    put(l, box(.145, .048, .145, '#161616'), 0, -.598, .04);
    for (let i = 0; i < 4; i++) put(l, box(.13, .011, .015, '#f4f1e8'), 0, -.59 + i * .011, .006 + i * .03);
    return l;
  }
  const legL = leg(-.15), legR = leg(.15);

  function arm(x) {
    const a = put(inner, new THREE.Group(), x, 1.46, 0);
    const side = Math.sign(x);
    put(a, rounded(.185, .19, .205, shirtMat, .022), 0, -.095, 0); // shorter, higher-rolled sleeve
    put(a, rounded(.20, .052, .215, shirtShade, .018), 0, -.205, 0); // bunched roll
    put(a, rounded(.15, .33, .175, skin, .019), 0, -.395, 0); // long bare forearm
    if (side < 0) {
      // Wristwatch on the left arm: the band wraps the wrist like a real
      // bracelet (kept at the cylinder's natural vertical axis so its
      // radius .108 против полуглубины предплечья .0875 — браслет гарантированно
      // выступает наружу и не тонет в руке), with a face
      // plate mounted flush on the front so it doesn't get swallowed by
      // the arm geometry.
      const band = put(a, cyl(.108, .108, .052, watchCol, 14), 0, -.545, 0);
      const face = put(a, cyl(.05, .05, .024, watchFace, 14), 0, -.545, .118);
      face.rotation.x = Math.PI / 2;
      put(a, cyl(.038, .038, .006, watchCol, 14), 0, -.545, .132).rotation.x = Math.PI / 2;
      put(a, box(.014, .022, .016, watchCol), 0, -.505, .118); // crown nub
    } else {
      put(a, rounded(.145, .05, .165, skin, .016), 0, -.548, 0); // plain wrist joint
    }
    put(a, rounded(.13, .135, .145, skin, .022), 0, -.64, 0); // hand
    put(a, sphere(.032, skin), -side * .056, -.625, .037);
    return a;
  }
  const armL = arm(-.375), armR = arm(.375);
  const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

  // ---- head ----
  const headG = put(inner, new THREE.Group(), 0, 1.79, 0);
  const skull = put(headG, sphere(1, skin, 24, 14), 0, .008, 0); skull.scale.set(.245, .29, .235);
  const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.185, .155, .185);
  // Волосы — та же причёска, что в mel-visual.js. Сплошная сферическая шапочка
  // читалась как надетая шапка: её нижняя кромка шла на одной высоте по всей
  // окружности и закрывала лоб. Поэтому строим свою сетку по эллипсоиду вокруг
  // черепа с ПЕРЕМЕННОЙ линией низа: спереди она высокая (лоб открыт), на висках
  // спускается к скуле, сзади уходит на затылок. Это один меш, один draw call.
  // Толщина слоя переменная: .012 на макушке и .003 у кромки. Постоянный отступ
  // делал край «козырьком», стоящим в воздухе, — заметнее всего на висках.
  // Череп уплотнён до 24 сегментов: просадка между рёбрами упала с
  // R*(1-cos 11.25°)=.0047 до R*(1-cos 7.5°)=.0021, т.е. стала меньше зазора
  // даже у самой кромки — кожа не пробивается «проплешинами» сквозь тонкий край.
  // UV обязательны: материал волос текстурный, и bakeStatic склеивает такие
  // детали только при наличии uv. v=1 на макушке, v=0 у кромки — ровно вдоль
  // вертикального градиента текстуры.
  const hairGeo = (() => {
    // Колонок AZ+1: последняя дублирует первую, но с u=1 вместо 0. Без дубля
    // замыкающий квад прогонял текстуру задом наперёд через весь атлас — на
    // макушке был виден шов. Нормали шовных колонок потом усредняются.
    const AZ = 36, TH = 10, bx = .245, by = .29, bz = .235;
    const CN = (AZ + 1) * (TH + 1);
    const pos = new Float32Array(CN * 3), uvs = new Float32Array(CN * 2), idx = [];
    for (let i = 0; i <= AZ; i++) {
      const a = (i % AZ) / AZ * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // Линия низа причёски. База: .34pi спереди (ca=1), .52pi сзади (ca=-1).
      // Плюс «клин» виска — лепесток вокруг азимута 60 градусов, то есть ПЕРЕД
      // ухом: он спускает волосы к скуле и ломает ровную дугу, из-за которой
      // причёска читалась шлемом. Ширина .26 подобрана так, чтобы у самого уха
      // (90 градусов) клин уже сошёл на нет и не резал ушную раковину.
      const da = (a < Math.PI ? a : Math.PI * 2 - a) - 1.05;
      const tMax = Math.PI * (.43 - .09 * ca + .012 * sa * sa + .09 * Math.exp(-(da / .26) * (da / .26)));
      for (let j = 0; j <= TH; j++) {
        const u = j / TH, off = .012 - .009 * u * u;   // сходит на нет к кромке
        const t = tMax * u, st = Math.sin(t), n = i * (TH + 1) + j, k = n * 3;
        pos[k] = st * sa * (bx + off); pos[k + 1] = Math.cos(t) * (by + off); pos[k + 2] = st * ca * (bz + off);
        uvs[n * 2] = i / AZ; uvs[n * 2 + 1] = 1 - u;
      }
    }
    for (let i = 0; i < AZ; i++) {
      const c0 = i * (TH + 1), c1 = (i + 1) * (TH + 1);
      for (let j = 0; j < TH; j++) idx.push(c0 + j, c0 + j + 1, c1 + j + 1, c0 + j, c1 + j + 1, c1 + j);
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    hg.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    hg.setIndex(idx); hg.computeVertexNormals();
    // Первая и последняя колонки лежат в одной точке, но каждая получила нормали
    // только со своей стороны — усредняем, иначе по шву была бы полоса освещения.
    const nr = hg.attributes.normal.array;
    for (let j = 0; j <= TH; j++) {
      const a = j * 3, b = (AZ * (TH + 1) + j) * 3;
      const nx = nr[a] + nr[b], ny = nr[a + 1] + nr[b + 1], nz = nr[a + 2] + nr[b + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      nr[a] = nr[b] = nx / l; nr[a + 1] = nr[b + 1] = ny / l; nr[a + 2] = nr[b + 2] = nz / l;
    }
    return hg;
  })();
  put(headG, new THREE.Mesh(hairGeo, hairMat), 0, .008, 0);
  for (const side of [-1, 1]) {
    const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.024, 0); ear.scale.set(.045, .078, .04);
    put(headG, sphere(1, '#bd8c73', 8, 6), side * .264, -.026, .025).scale.set(.017, .034, .014);
    put(headG, sphere(1, '#ba927d'), side * .088, .02, .215).scale.set(.056, .033, .017);
    put(headG, sphere(1, '#e9e2d1'), side * .088, .022, .231).scale.set(.037, .016, .009);
    put(headG, sphere(.011, '#4d3826', 8, 6), side * .086, .022, .241).scale.y = .95;
    put(headG, sphere(.0055, '#1c1108', 8, 6), side * .086, .023, .25);
    const brow = put(headG, rounded(.078, .018, .018, '#3a2916', .005), side * .087, .058, .227); brow.rotation.z = side * -.08;
    const cheek = put(headG, sphere(1, skin), side * .118, -.07, .19); cheek.scale.set(.056, .058, .03);
  }
  // Нос — одна «картошина»: раньше два разных эллипсоида (узкий длинный +
  // плоский снизу) стыковались видимым уступом. Сегментов больше (12x9),
  // чтобы шар читался круглым, а не гранёным — деталь крупная и в центре лица.
  const nose = put(headG, sphere(1, '#cfa084', 12, 9), 0, -.05, .236); nose.scale.set(.055, .047, .046);
  put(headG, rounded(.1, .012, .014, '#916b5a', .004), 0, -.152, .208);
  put(headG, rounded(.072, .01, .012, '#c18e77', .004), 0, -.165, .205);
  const chin = put(headG, sphere(1, skin), 0, -.2, .143); chin.scale.set(.084, .046, .046);

  const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}














