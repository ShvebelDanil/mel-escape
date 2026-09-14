// Визуальная модель скина «Тёмный друн» по концепту: чёрный пуховик с двумя
// острыми «ушами» на капюшоне, глянцевые чёрные штаны, тяжёлые ботинки.
// Контракт возвращаемой ноды идентичен остальным mel*-visual.js:
//   {root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary}
//
// Бюджет draw call (после GFX.bakeCharacter): inner 1 + headG 1 + armL/armR по 1 +
// legL/legR по 2 (однотонный ботинок + текстурная штанина) + тень = 9.
// Стёжка пуховика сделана ГЕОМЕТРИЕЙ, а не текстурой: одноцветные детали
// склеиваются в один меш бесплатно, а текстурный материал стоил бы ещё 3 вызова.
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };

  const pivot = put(root, new THREE.Group(), 0, .92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);

  // --- Палитра ---
  // ВАЖНО: three.js r128 здесь без color management — цвет материала кладётся в
  // шейдер как есть, БЕЗ перевода sRGB→linear, а кадр на выходе кодируется в sRGB.
  // Тёмные значения из-за этого взлетают примерно вчетверо: #131318 даёт на экране
  // ~#4a4a52, то есть обычный серый. Поэтому «чёрный» здесь набран заведомо более
  // низкими числами, чем выглядит в редакторе (текстуры этим не страдают — их
  // encoding=sRGB декодируется корректно, из-за чего винил штанов и так чёрный).
  const puffBase = '#0d0d12';
  const puffSeam = '#050508';
  const hoodLine = '#040406';
  const cuffCol = '#070709';
  const vinylCol = '#121216';
  const vinylFold = '#0a0a0f';
  const bootCol = '#080809';
  const bootDark = '#040405';
  const soleCol = '#0d0d10';
  const metal = '#9b9ba4';
  const metalDim = '#6e6e77';
  const skin = '#dcb193';
  const skinShade = '#bd8d72';
  const skinDark = '#9a6c55';
  const hairCol = '#331a0c';
  const hairDark = '#1f0f06';

  const mats = {};
  const mat = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));

  // --- Глянцевая ткань штанов (единственная текстура модели) ---
  // Детерминированный PRNG (xorshift32): складки «мокрого» винила должны быть
  // хаотичными, но одинаковыми у всех игроков и между перезапусками.
  function vinylMaterial() {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = vinylCol; g.fillRect(0, 0, S, S);

    let s = 0x9e3779b9;
    const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const rnd = (a, b) => a + rand() * (b - a);

    // Широкие мягкие «лужицы» отражения — крупная форма блика.
    for (let i = 0; i < 22; i++) {
      const x = rnd(0, S), y = rnd(0, S), r = rnd(18, 54);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(96,98,112,' + rnd(.10, .20).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(96,98,112,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Острые рёбра заломов — светлые дуги поверх лужиц.
    g.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const x = rnd(0, S), y = rnd(0, S);
      g.strokeStyle = 'rgba(150,152,168,' + rnd(.10, .26).toFixed(3) + ')';
      g.lineWidth = rnd(.8, 2.4);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + rnd(-40, 40), y + rnd(-34, 34), x + rnd(-70, 70), y + rnd(-60, 60));
      g.stroke();
    }
    // Тёмные «карманы» в глубине складок — чтобы блик читался как объём.
    for (let i = 0; i < 26; i++) {
      const x = rnd(0, S), y = rnd(0, S);
      g.strokeStyle = 'rgba(0,0,0,' + rnd(.18, .38).toFixed(3) + ')';
      g.lineWidth = rnd(1.2, 3.4);
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + rnd(-30, 30), y + rnd(-26, 26), x + rnd(-56, 56), y + rnd(-48, 48));
      g.stroke();
    }

    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.3, 1.6); t.anisotropy = 4;
    return new THREE.MeshLambertMaterial({ map: t });
  }
  const vinylMat = vinylMaterial();

  // --- Геометрические помощники ---
  // Крупный радиус скругления превращает коробку в «подушку» — основа пуховика.
  function rounded(w, h, d, c, r = .025) {
    const s = new THREE.Shape();
    const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r,
      bevelSegments: 2, steps: 1, curveSegments: 2
    });
    g.translate(0, 0, -d / 2 + r);
    return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
  }
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
  const sphere = (r, c, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(c));
  const cyl = (rt, rb, h, c, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));
  // Плоский диск лицом в +Z: радужка/зрачок выходят чёткими кругами, а не шарами.
  const discZ = (r, c, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .008, seg), mat(c));
    m.rotation.x = Math.PI / 2;
    return m;
  };
  // Секция пуховика: подушка базового тона + тёмный шов — два меша вместо
  // текстурной стёжки. Два правила, выведенные из промахов:
  //   1) шов уже подушки (w*.985) — иначе торс превращается в стопку плит;
  //   2) шов поднят на радиус скругления, а не стоит на самом краю секции: у края
  //      подушка сужена на 2r, и полоса торчала бы за силуэт тонкими «плавниками».
  // Светлого блика по верху секции нет намеренно — на чёрном он читался как
  // полосатая обшивка, а форму подушки и так лепит Ламберт по скруглению.
  function puff(y, w, h, d, z = 0) {
    const r = Math.min(h, d) * .22;
    put(inner, rounded(w, h, d, puffBase, r), 0, y, z);
    put(inner, box(w * .985, .020, d * .95, puffSeam), 0, y - h * .5 + r, z);
  }

  // ============================ ТОРС: ПУХОВИК ============================
  // Три крупные секции с горизонтальными швами — как на концепте (грудь, живот,
  // бедро), самая широкая средняя; книзу куртка слегка забирается.
  // Ширины почти равны намеренно: заметная разница давала ступенчатый контур
  // вместо мягкой «бочки» пуховика.
  puff(1.45, .72, .20, .45);
  puff(1.22, .75, .26, .48);
  puff(.96, .72, .26, .45);
  // Резинка по низу куртки.
  put(inner, rounded(.685, .08, .42, cuffCol, .028), 0, .818, 0);

  // Молния: один непрерывный рельеф по центру, чуть выступает над животом.
  put(inner, box(.028, .70, .024, puffSeam), 0, 1.20, .242);
  put(inner, box(.013, .68, .018, metalDim), 0, 1.20, .251);
  put(inner, box(.024, .052, .020, metal), 0, 1.28, .257); // собачка
  put(inner, box(.012, .042, .012, metal), 0, 1.240, .261); // язычок

  // Косые карманы на нижней секции.
  for (const side of [-1, 1]) {
    const p = put(inner, box(.145, .018, .018, puffSeam), side * .25, 1.00, .228);
    p.rotation.z = side * .30;
  }

  // ============================ КАПЮШОН ============================
  // Капюшон закреплён на `inner`, а не на `headG`: настоящий капюшон не
  // поворачивается вместе с головой, и так он не утяжеляет анимационный узел.
  // Голова свободно «сидит» внутри рамки из валиков.
  const hoodPut = (o, x, y, z) => put(inner, o, x, y, z);

  hoodPut(rounded(.60, .54, .32, puffBase, .10), 0, 1.87, -.19);             // затылочная скорлупа
  hoodPut(rounded(.50, .19, .42, puffBase, .075), 0, 2.085, -.02);           // валик над лбом
  hoodPut(rounded(.50, .17, .34, puffBase, .075), 0, 1.565, -.03);           // валик под подбородком
  for (const side of [-1, 1]) {
    hoodPut(rounded(.145, .55, .44, puffBase, .06), side * .30, 1.83, .02);  // боковые валики у щёк
    hoodPut(box(.032, .49, .34, hoodLine), side * .233, 1.83, .04);          // тёмная кромка изнутри — глубина
  }
  // Горизонтальная стёжка капюшона.
  for (const y of [1.99, 1.70]) hoodPut(box(.575, .018, .38, puffSeam), 0, y, -.05);

  // «Уши»: три подушки, каждая меньше и сильнее отклонена наружу — так пик
  // получается стёганым и слегка изогнутым, как набитая ткань на концепте.
  // Верхняя точка ~2.43 — вровень с ирокезом скина «Панк», чтобы силуэт
  // не вылезал за кадр магазина и за верх экрана в забеге.
  for (const side of [-1, 1]) {
    const l1 = hoodPut(rounded(.215, .16, .27, puffBase, .055), side * .125, 2.125, -.01);
    l1.rotation.z = side * -.06;
    hoodPut(box(.155, .014, .205, puffSeam), side * .135, 2.198, -.018);

    const l2 = hoodPut(rounded(.17, .14, .225, puffBase, .048), side * .152, 2.242, -.02);
    l2.rotation.z = side * -.13;
    hoodPut(box(.12, .013, .165, puffSeam), side * .167, 2.305, -.028);

    const l3 = hoodPut(rounded(.125, .115, .175, puffBase, .038), side * .181, 2.332, -.032);
    l3.rotation.z = side * -.21;

    const l4 = hoodPut(rounded(.08, .085, .115, puffBase, .028), side * .208, 2.395, -.042);
    l4.rotation.z = side * -.30;
  }

  // Шея — почти полностью скрыта валиком, но закрывает щель при наклоне головы.
  put(inner, cyl(.086, .098, .16, skin, 10), 0, 1.60, 0);

  // ============================ ГОЛОВА ============================
  const headG = put(inner, new THREE.Group(), 0, 1.83, 0);

  const skull = put(headG, sphere(1, skin, 18, 14), 0, .02, 0);
  skull.scale.set(.285, .322, .292);
  const jaw = put(headG, sphere(1, skin, 12, 10), 0, -.118, .024);
  jaw.scale.set(.225, .172, .214);

  // Волосы: шапочка по черепу + короткая рваная чёлка на лбу (капюшон закрывает
  // затылок и виски, поэтому дальше детализировать нечего).
  const scalp = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * .40), mat(hairCol));
  scalp.scale.set(.291, .328, .298);
  put(headG, scalp, 0, .022, -.004);
  // Чёлка одним косым куском плюс два виска: набор мелких блоков на лбу читался
  // как россыпь светлых точек, а не как волосы.
  const bang = put(headG, rounded(.345, .075, .10, hairCol, .03), 0, .152, .222);
  bang.rotation.z = .10; bang.rotation.x = -.26;
  for (const side of [-1, 1]) {
    const tuft = put(headG, rounded(.10, .115, .105, hairDark, .032), side * .188, .122, .178);
    tuft.rotation.z = side * .42;
  }

  // Уши прижаты капюшоном — только намёк на хрящ у кромки.
  for (const side of [-1, 1]) {
    const ear = put(headG, sphere(1, skin, 10, 8), side * .263, -.015, .005);
    ear.scale.set(.046, .080, .042);
    put(headG, sphere(1, skinShade, 8, 6), side * .275, -.018, .028).scale.set(.018, .036, .015);
  }

  // --- Глаза ---
  // ez=.272 — поверхность черепа на этой высоте лежит примерно на z=.278, так что
  // сборка сидит вровень и не тонет в голове (проверено по эллипсоиду .285/.322/.292).
  for (const side of [-1, 1]) {
    const ex = side * .091, ey = .042, ez = .272;

    const socket = put(headG, sphere(1, skinShade, 10, 8), ex, ey - .006, ez - .016);
    socket.scale.set(.078, .050, .022);
    // Мешки под глазами — характерная усталость с концепта.
    const bag = put(headG, sphere(1, skinDark, 8, 6), ex, ey - .040, ez - .010);
    bag.scale.set(.060, .018, .016);

    const eye = put(headG, sphere(1, '#f3eee4', 10, 8), ex, ey, ez);
    eye.scale.set(.052, .030, .022);

    put(headG, discZ(.023, '#6b6f68'), ex, ey, ez + .019);                       // радужка
    put(headG, discZ(.010, '#0a0b0a'), ex, ey, ez + .021);                       // зрачок
    put(headG, discZ(.004, '#ffffff'), ex - .008, ey + .008, ez + .022);         // блик

    // Тяжёлое верхнее веко приспускает взгляд — на концепте он именно такой.
    const lid = put(headG, rounded(.068, .020, .026, skinShade, .006), ex, ey + .022, ez - .002);
    lid.rotation.z = side * .04;
    put(headG, rounded(.058, .007, .020, skin, .003), ex, ey - .020, ez - .004); // нижнее веко

    // Брови сведены к центру — недовольный, «дедпановый» взгляд.
    const brow = put(headG, rounded(.086, .015, .020, hairDark, .005), ex, ey + .060, ez - .006);
    brow.rotation.z = side * .12;
  }

  // --- Нос ---
  put(headG, rounded(.027, .080, .024, skin, .010), 0, .026, .256);
  const noseTip = put(headG, sphere(1, skin, 10, 8), 0, -.030, .270);
  noseTip.scale.set(.039, .031, .035);
  for (const side of [-1, 1]) {
    put(headG, sphere(1, skin, 8, 6), side * .030, -.044, .260).scale.set(.021, .018, .022);
    put(headG, sphere(1, skinDark, 6, 6), side * .027, -.057, .264).scale.set(.010, .007, .008);
  }

  // --- Рот: ровная, чуть опущенная линия ---
  const mouthY = -.122;
  put(headG, rounded(.072, .017, .022, skinShade, .008), 0, mouthY + .010, .254);
  put(headG, rounded(.066, .020, .024, skin, .009), 0, mouthY - .012, .256);
  put(headG, rounded(.062, .005, .018, '#7d5548', .002), 0, mouthY, .259);
  for (const side of [-1, 1]) {
    put(headG, sphere(1, skinShade, 6, 6), side * .041, mouthY + .002, .250).scale.set(.008, .010, .010);
  }

  // Подбородок вынесен вперёд, чтобы читался над валиком капюшона.
  const chin = put(headG, sphere(1, skin, 10, 8), 0, -.203, .160);
  chin.scale.set(.100, .058, .060);
  // Лёгкая щетина по челюсти.
  for (const side of [-1, 1]) {
    const st = put(headG, sphere(1, skinShade, 8, 6), side * .156, -.150, .146);
    st.scale.set(.062, .052, .054);
  }

  // ============================ РУКИ ============================
  function arm(x) {
    const a = put(inner, new THREE.Group(), x, 1.50, 0);
    const side = Math.sign(x);

    // Рукав из трёх сужающихся секций со швами — та же стёжка, что на торсе.
    const seg = (y, w, h, d) => {
      const r = Math.min(h, d) * .22;
      put(a, rounded(w, h, d, puffBase, r), 0, y, 0);
      put(a, box(w * .985, .018, d * .96, puffSeam), 0, y - h * .5 + r, 0);
    };
    put(a, rounded(.255, .20, .275, puffBase, .075), 0, .015, 0); // шарик плеча
    seg(-.14, .24, .20, .26);
    seg(-.35, .215, .20, .235);
    seg(-.545, .19, .18, .21);
    // Тёмное ребро по внешнему краю рукава: лепит цилиндр руки там, где ровный
    // свет сцены не даёт собственной тени (внутренний край скрыт корпусом).
    put(a, rounded(.04, .60, .20, puffSeam, .015), side * .098, -.31, 0);

    put(a, rounded(.155, .07, .17, cuffCol, .022), 0, -.662, 0); // манжета
    for (let i = 0; i < 3; i++) put(a, box(.158, .009, .173, '#0d0d12'), 0, -.684 + i * .021, 0);

    // Кисть.
    put(a, rounded(.15, .155, .15, skin, .024), 0, -.768, 0);
    for (let i = -1; i <= 1; i++) put(a, sphere(.024, skinShade, 6, 5), i * .044, -.766, .077);
    put(a, sphere(.043, skin, 8, 6), -side * .07, -.742, .042);

    return a;
  }
  const armL = arm(-.425);
  const armR = arm(.425);

  // Дневник в правой руке (появляется только на сдаче) — как у прочих скинов.
  const diary = put(armR, GFX.buildDiaryMesh(), 0, -.797, .115);
  diary.rotation.x = Math.PI / 2;
  diary.visible = false;

  // ============================ НОГИ ============================
  function leg(x) {
    const l = put(inner, new THREE.Group(), x, .92, 0);
    const side = Math.sign(x);

    // Широкая глянцевая штанина + напуск на ботинок.
    put(l, rounded(.315, .70, .32, vinylMat, .05), 0, -.38, 0);
    put(l, rounded(.33, .155, .335, vinylMat, .06), 0, -.735, .01);
    // Заломы: тонкие рёбра, ловящие свет на сгибе — ровно тот эффект, что даёт
    // глянцевая плащёвка на концепте (на почти чёрной текстуре темнее уже некуда).
    for (const yy of [-.21, -.45, -.61]) {
      const cr = put(l, box(.306, .011, .311, vinylFold), 0, yy, .004);
      cr.rotation.z = side * .05;
    }

    // Тяжёлый ботинок.
    const bY = -.845;
    put(l, rounded(.255, .13, .275, bootCol, .03), 0, bY + .055, -.015);     // голенище
    put(l, rounded(.27, .11, .44, bootCol, .035), 0, bY, .06);               // подъём
    put(l, rounded(.26, .085, .18, bootDark, .035), 0, bY - .012, .205);     // мыс
    put(l, box(.28, .045, .46, soleCol), 0, bY - .058, .06);                 // подошва
    put(l, box(.285, .020, .467, '#020203'), 0, bY - .086, .06);             // рант
    for (let i = 0; i < 5; i++) put(l, box(.275, .011, .016, '#050507'), 0, bY - .090, -.115 + i * .09);
    put(l, box(.245, .055, .11, '#030304'), 0, bY - .075, -.10);             // каблук

    // Шнуровка.
    for (let i = 0; i < 4; i++) {
      const z = .175 - i * .04, y = bY + .050 - i * .013;
      put(l, box(.108, .012, .016, '#15151a'), 0, y, z);
      put(l, sphere(.010, metalDim, 6, 4), -.053, y, z);
      put(l, sphere(.010, metalDim, 6, 4), .053, y, z);
    }
    put(l, box(.040, .016, .09, '#0a0a0e'), side * .140, bY + .022, .03);    // язычок сбоку

    return l;
  }
  const legL = leg(-.165);
  const legR = leg(.165);

  const shadow = GFX.shadowDisc(root, .62, GFX.SHADOW_MAT_CHAR);

  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}
