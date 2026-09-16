// Visual-only skin: невысокий школьник в тёмно-синем костюме, с синим портфелем
// и цветной шапочкой с пропеллером. Построен по образцу mel6-visual.js:
// та же иерархия root -> pivot -> inner -> (legL/legR, armL/armR, headG),
// потому что игра анимирует ТОЛЬКО эти узлы (main.js/shop.js крутят их и
// переписывают inner.position.y каждый кадр).
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
  // Персонаж на референсе низкий (~155 см), поэтому корпус опущен на .10
  // относительно mel6, а ноги короче. Из-за этого ступни заканчиваются не на
  // y=-.92 внутри inner, а выше — опускаем всю фигуру на GROUND_FIX, чтобы
  // подошвы встали ровно на пол (тень лежит на root в y=.02, пол сцены — y=0).
  // Двигать сам inner нельзя: игра переписывает его позицию каждый кадр.
  const GROUND_FIX = .2245;
  const pivot = put(root, new THREE.Group(), 0, .92 - GROUND_FIX, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  const DY = -.07;               // общий сдвиг верха тела вниз (низкий рост)
  const HIP = .86;               // высота тазобедренного сустава внутри inner

  const skin = '#e3b491', skinShade = '#cf9d7c';
  const hairCol = options.hairColor || '#9a7346';
  const shirtCol = '#f4f2ec', shirtShade = '#e2dfd4';
  const suitCol = options.suitColor || '#1b2341', suitDark = '#12182e';
  const tieCol = options.tieColor || '#171d33', tieDark = '#0d1120';
  const buckleCol = '#c3c3ba';
  const shoeCol = '#141416', soleCol = '#f2efe6', shoeNavy = '#26355f', laceCol = '#f4f1e8';
  const packCol = options.backpackColor || '#2b4c96', packDark = '#1c356e', strapCol = '#213a72';
  const hatBand = '#161616', hatRed = '#d8393f', hatBlue = '#1f52b5', hatYellow = '#f0bc2a', hatGreen = '#4cad2b';
  const propCol = '#b5d629', propHub = '#f2c21c';

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
  // Открытое кольцо (без крышек) — околыш шапки: внутрь всё равно не видно,
  // а полигонов вдвое меньше, чем у сплошного цилиндра.
  const ring = (r, h, c, s = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s, 1, true), typeof c === 'string' ? mat(c) : c);

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
  // Детерминированный шум (xorshift): волосы должны быть «неровными», но
  // одинаковыми при каждом запуске.
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

  const suitMat = weave(suitCol, suitDark, 1.3, 1.2);   // один материал на пиджак, рукава и брюки
  const shirtMat = weave(shirtCol, shirtShade, 1.2, 1.1);
  const hairMat = fleck(hairCol, '#6d4e2c', 4271);

  // ---- корпус: пиджак поверх рубашки ----
  put(inner, rounded(.57, .56, .35, suitMat, .045), 0, 1.26 + DY, 0);
  // Рубашка в вырезе пиджака: плоская панель чуть перед корпусом, её и закрывают лацканы.
  put(inner, rounded(.165, .33, .04, shirtMat, .02), 0, 1.365 + DY, .172);
  put(inner, rounded(.2, .1, .195, skin, .02), 0, 1.565 + DY, 0);     // шея
  // Воротник пиджака: дуга из семи звеньев вокруг задней половины шеи, каждое
  // повёрнуто по касательной и отвалено наружу, как отложной воротник. Верх
  // звеньев (1.50 + DY) совпадает с верхом лацканов, поэтому сзади воротник
  // переходит в них без ступеньки. Звенья одного материала — bakeStatic
  // склеивает их в тот же меш, что и пиджак, лишних draw call нет.
  // rotation.order = 'YXZ' обязателен: при штатном XYZ наклон наружу считался
  // бы до разворота по касательной и звенья заваливались бы вбок.
  const COLLAR_R = .165, COLLAR_A0 = 1.0, COLLAR_A1 = 2 * Math.PI - 1.0;
  for (let i = 0; i < 7; i++) {
    const a = COLLAR_A0 + (COLLAR_A1 - COLLAR_A0) * (i / 6);
    const link = put(inner, rounded(.115, .125, .075, suitMat, .022),
      Math.sin(a) * COLLAR_R, 1.4375 + DY, Math.cos(a) * COLLAR_R);
    link.rotation.order = 'YXZ';
    link.rotation.y = a; link.rotation.x = -.22;
  }

  // Лацканы: две наклонные пластины, сходящиеся клином к груди — из-за них
  // белая панель читается как V-образный вырез пиджака, а не как нашивка.
  for (const side of [-1, 1]) {
    const lapel = put(inner, rounded(.18, .34, .05, suitMat, .02), side * .162, 1.355 + DY, .165);
    lapel.rotation.z = side * .34;
    const edge = put(inner, box(.02, .33, .012, suitDark), side * .088, 1.355 + DY, .193);
    edge.rotation.z = side * .34;
  }

  // Галстук: узкий клин от узла до низа груди (форма как у остальных скинов).
  const tieShape = new THREE.Shape();
  tieShape.moveTo(-.035, .12); tieShape.lineTo(.035, .12); tieShape.lineTo(.022, -.02);
  tieShape.lineTo(.018, -.27); tieShape.lineTo(-.018, -.27); tieShape.lineTo(-.022, -.02); tieShape.closePath();
  const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: .014, bevelEnabled: false, curveSegments: 2 });
  tieGeo.translate(0, 0, -.007);
  put(inner, new THREE.Mesh(tieGeo, mat(tieCol)), 0, 1.40 + DY, .197);
  put(inner, box(.045, .042, .026, tieDark), 0, 1.495 + DY, .193);    // узел

  // ---- портфель ----
  // Лямки собраны из кусков, которые всегда снаружи объёма корпуса: «седло» на
  // плече, диагональная лямка по груди и задняя лямка от плеча до середины
  // корпуса портфеля — тогда портфель читается висящим, а не приклеенным сзади.
  for (const side of [-1, 1]) {
    const yoke = put(inner, rounded(.125, .06, .42, strapCol, .022), side * .245, 1.498 + DY, -.005);
    yoke.rotation.x = -.08; yoke.rotation.z = side * -.14;

    const chestStrap = put(inner, box(.055, .34, .018, strapCol), side * .222, 1.345 + DY, .185);
    chestStrap.rotation.z = side * -.35;

    const buckle = put(inner, box(.052, .045, .024, buckleCol), side * .164, 1.115 + DY, .19);
    buckle.rotation.z = side * -.35;

    const backStrap = put(inner, rounded(.065, .31, .045, strapCol, .02), side * .205, 1.35 + DY, -.205);
    backStrap.rotation.x = .16; backStrap.rotation.z = side * -.055;
  }
  put(inner, rounded(.30, .055, .05, strapCol, .02), 0, 1.495 + DY, -.225);  // ручка-петля сверху

  put(inner, rounded(.38, .45, .165, packCol, .045), 0, 1.27 + DY, -.265);    // корпус портфеля
  put(inner, rounded(.28, .18, .08, packDark, .03), 0, 1.20 + DY, -.332);   // передний (внешний) карман
  put(inner, box(.26, .014, .022, suitDark), 0, 1.275 + DY, -.372);         // молния кармана
  put(inner, box(.28, .014, .022, suitDark), 0, 1.38 + DY, -.352);          // молния основного отделения
  put(inner, cyl(.013, .013, .028, buckleCol, 8), .10, 1.275 + DY, -.372).rotation.x = Math.PI / 2;

  put(inner, rounded(.54, .18, .32, suitMat, .035), 0, .895, 0);      // таз: закрывает стык пиджака с бёдрами

  function leg(x) {
    const l = put(inner, new THREE.Group(), x, HIP, 0);
    put(l, rounded(.225, .30, .24, suitMat, .03), 0, -.145, 0);       // бедро (брюки)
    put(l, rounded(.205, .32, .225, suitMat, .028), 0, -.435, 0);     // голень, брюки до самой обуви
    put(l, box(.212, .026, .232, suitDark), 0, -.478, 0);             // манжет брюк над кромкой кроссовка
    // Кроссовок собран по образцу mel6-visual.js (толстая подошва + верх +
    // боковая полоса + язычок + шнуровка), но в палитре скина: белая подошва,
    // чёрный верх, тёмно-синие полоса и язычок. Низ подошвы держится на -.6355 —
    // от него посчитан GROUND_FIX, трогать его нельзя, иначе скин повиснет
    // над собственной тенью.
    put(l, rounded(.235, .058, .355, soleCol, .014), 0, -.6065, .055); // подошва
    put(l, rounded(.228, .115, .33, shoeCol, .028), 0, -.5525, .06);   // верх кроссовка
    put(l, box(.026, .045, .26, shoeNavy), Math.sign(x) * .108, -.562, .075); // боковая полоса
    // Язычок и шнуровка вынесены вперёд (z от .085): при меньшем z они тонули
    // бы в брючине — её полуглубина .1125, а нога входит в кроссовок глубоко.
    put(l, box(.13, .044, .12, shoeNavy), 0, -.503, .1);               // язычок
    // Шаг .034 при толщине .014: с более плотной раскладкой четыре шнурка
    // сливались в одну белую пластину на подъёме. Каждый следующий уже и выше —
    // шнуровка сходится к мыску, как на настоящем кроссовке.
    for (let i = 0; i < 4; i++) put(l, box(.118 - i * .007, .012, .014, laceCol), 0, -.494 + i * .008, .12 + i * .032);
    return l;
  }
  const legL = leg(-.135), legR = leg(.135);

  function arm(x) {
    const a = put(inner, new THREE.Group(), x, 1.44 + DY, 0);
    const side = Math.sign(x);
    const delt = put(a, sphere(1, suitMat, 12, 10), 0, -.035, 0); delt.scale.set(.1, .095, .1); // плечо, закрывает стык с пиджаком
    put(a, rounded(.17, .33, .19, suitMat, .022), 0, -.175, 0);       // рукав пиджака
    put(a, rounded(.155, .25, .175, suitMat, .02), 0, -.42, 0);       // предплечье
    put(a, rounded(.16, .03, .18, shirtCol, .012), 0, -.56, 0);       // манжета рубашки из-под рукава
    put(a, rounded(.125, .13, .14, skin, .022), 0, -.64, 0);          // кисть
    put(a, sphere(.028, skin), -side * .052, -.625, .034);            // большой палец
    return a;
  }
  const armL = arm(-.345), armR = arm(.345);
  const diary = put(armR, GFX.buildDiaryMesh(), 0, -.64, .14); diary.rotation.x = Math.PI / 2; diary.visible = false;

  // ---- голова ----
  const headG = put(inner, new THREE.Group(), 0, 1.79 + DY, 0);
  const skull = put(headG, sphere(1, skin, 24, 14), 0, .008, 0); skull.scale.set(.245, .29, .235);
  const jaw = put(headG, sphere(1, skin, 12, 8), 0, -.12, .028); jaw.scale.set(.17, .142, .175);
  // Волосы: сетка по эллипсоиду вокруг черепа с ПЕРЕМЕННОЙ линией низа — спереди
  // высокая (лоб открыт), на висках спускается к скуле, сзади уходит на затылок.
  // Один меш = один draw call. Толщина слоя переменная (.012 на макушке, .003 у
  // кромки), иначе край стоит «козырьком» в воздухе. UV обязательны: материал
  // текстурный, и bakeStatic склеивает такие детали только при наличии uv.
  const hairGeo = (() => {
    // Колонок AZ+1: последняя дублирует первую, но с u=1 — иначе замыкающий квад
    // прогоняет текстуру через весь атлас и на макушке виден шов.
    const AZ = 36, TH = 10, bx = .245, by = .29, bz = .235;
    const CN = (AZ + 1) * (TH + 1);
    const pos = new Float32Array(CN * 3), uvs = new Float32Array(CN * 2), idx = [];
    for (let i = 0; i <= AZ; i++) {
      const a = (i % AZ) / AZ * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // Клин виска вокруг азимута 60° (перед ухом) ломает ровную дугу кромки,
      // из-за которой причёска читалась бы шлемом.
      const da = (a < Math.PI ? a : Math.PI * 2 - a) - 1.05;
      const tMax = Math.PI * (.56 - .19 * ca + .012 * sa * sa + .09 * Math.exp(-(da / .26) * (da / .26)));
      for (let j = 0; j <= TH; j++) {
        const u = j / TH, off = .012 - .009 * u * u;
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
    // Шовные колонки лежат в одной точке, но нормали получили только со своей
    // стороны — усредняем, иначе по шву пойдёт полоса освещения.
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
    const ear = put(headG, sphere(1, skin, 8, 6), side * .248, -.022, 0); ear.scale.set(.048, .082, .042);
    put(headG, sphere(1, skinShade, 8, 6), side * .264, -.024, .025).scale.set(.017, .036, .014);
    put(headG, sphere(1, '#d3c3ad'), side * .086, -.014, .204).scale.set(.044, .020, .011);  // глазница
    put(headG, sphere(1, '#f4f0e6'), side * .086, -.014, .2135).scale.set(.038, .013, .009); // белок (прищур)
    put(headG, sphere(.011, '#6b7c86', 8, 6), side * .085, -.015, .2195).scale.y = .78;      // светлая радужка
    put(headG, sphere(.0055, '#141414', 8, 6), side * .085, -.015, .2255);
    // Брови светлые и низкие — на референсе они почти сливаются с кожей.
    const brow = put(headG, rounded(.066, .015, .013, '#8d6c42', .004), side * .083, .016, .2185); brow.rotation.z = side * -.09;
    put(headG, sphere(1, '#dfae8c'), side * .134, -.045, .152).scale.set(.042, .032, .018);  // скула
  }
  const nose = put(headG, sphere(1, '#dca987', 12, 9), 0, -.068, .219); nose.scale.set(.04, .036, .038);
  // Ухмылка: рот смещён вбок и наклонён — именно она делает лицо с референса
  // узнаваемым, симметричная полоска читалась бы нейтральной.
  // Рот — одна выдавленная дуга: линия губ идёт вверх к правому уголку, и
  // именно этот перекос даёт ухмылку с референса. Две прямые полоски, которые
  // были здесь раньше, читались как шрам.
  const smileShape = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(-.062, -.006);
    sh.quadraticCurveTo(0, -.034, .066, .03);      // нижний край линии губ
    sh.lineTo(.066, .044);
    sh.quadraticCurveTo(0, -.018, -.062, .008);    // верхний край
    sh.closePath();
    return sh;
  })();
  const smileGeo = new THREE.ExtrudeGeometry(smileShape, { depth: .012, bevelEnabled: false, curveSegments: 6 });
  put(headG, new THREE.Mesh(smileGeo, mat('#8c5f4c')), 0, -.135, .194);
    const chin = put(headG, sphere(1, skin), 0, -.19, .132); chin.scale.set(.066, .04, .038);

  // ---- шапочка с пропеллером ----
  // Купол — четыре цветных сектора полусферы (phiStart/phiLength). Материалы
  // одноцветные, поэтому bakeCharacter склеит их в ОДИН меш с вершинными
  // цветами: четыре панели не стоят четырёх draw call.
  const hat = put(headG, new THREE.Group(), 0, .082, 0);
  const panelCols = [hatBlue, hatRed, hatYellow, hatGreen];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.SphereGeometry(1, 7, 6, i * Math.PI / 2, Math.PI / 2, 0, Math.PI / 2);
    const p = put(hat, new THREE.Mesh(g, mat(panelCols[i])), 0, 0, 0);
    p.scale.set(.292, .252, .284);
  }
  put(hat, ring(.298, .095, hatBand, 18), 0, -.0, 0);          // чёрный околыш на уровне бровей
  put(hat, ring(.30, .014, '#050505', 18), 0, -.046, 0);       // кант по низу околыша
  // Пропеллер: втулка + три лопасти через 120°, каждая с небольшим наклоном —
  // на референсе он ровно такой.
  const prop = put(hat, new THREE.Group(), 0, .248, 0);
  put(prop, cyl(.016, .022, .05, propHub, 8), 0, .012, 0);
  put(prop, sphere(.028, propHub, 10, 8), 0, .042, 0);
  for (let i = 0; i < 3; i++) {
    const blade = put(prop, rounded(.20, .014, .05, propCol, .006), 0, .04, 0);
    blade.position.set(Math.cos(i * 2.094) * .085, .04, Math.sin(i * 2.094) * .085);
    blade.rotation.y = -i * 2.094; blade.rotation.z = .22;
  }

  const shadow = GFX.shadowDisc(root, .5, GFX.SHADOW_MAT_CHAR);
  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}
