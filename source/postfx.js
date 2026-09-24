// Пост-обработка уровня High: свечение (bloom), цветокоррекция и виньетка.
// Рассчитано на мобильные GPU, поэтому всё тяжёлое идёт в уменьшенном разрешении:
//   1) сцена → rtScene (полный размер; в WebGL2 — с MSAA, он и заменяет сглаживание холста);
//   2) ТОЛЬКО светящиеся объекты (слой BLOOM_LAYER: лампы, окна, пузырики, свечение паверапов и щита, искры) →
//      rtG в 1/2 разрешения. Свечение от порога яркости всей картинки здесь не годится: пол и
//      стены в игре и так почти белые, и вся сцена «поплыла» бы в молочном тумане.
//      Перед ними в rtG пишется ТОЛЬКО глубина заслонителей (слой OCCL_LAYER: персонажи, препятствия,
//      декор стен) — иначе пузырик за спиной Мэла светился бы сквозь него;
//   3) rtG ужимается в 1/4 честным усреднением 4×4 (с порогом яркости) → размытие в 1/4 и ещё одно,
//      широкое, в 1/8 разрешения;
//   4) финальный проход на экран: сцена + свечение + цвет + виньетка + дизеринг.
// Почему не сразу 1/4: тонкая дальняя лампа в 1/4 разрешения то попадает в пиксель, то нет —
// свечение мигало на бегу. В 1/2 с усреднением 4×4 её вклад меняется плавно. Дальние светящиеся
// объекты к тому же гаснут «чёрным туманом» (GLOW_FOG_*) — у самых тонких свечения нет вовсе.
// Итого поверх обычного кадра: два лёгких прохода по части сцены и 7 проходов-квадов,
// из которых в полном разрешении только последний.
//
// Цвет: rtScene хранит УЖЕ sRGB-кодированную картинку (texture.encoding = sRGB — three кодирует
// выход материалов так же, как для экрана), а шейдеры ниже читают её как есть и пишут как есть.
// Поэтому при нулевых эффектах результат совпадает с обычным рендером на экран бит-в-бит.

export const BLOOM_LAYER = 1, OCCL_LAYER = 2;

// ===== Ручки настройки вида (подбираются на глаз, на логику не влияют) =====
export const BLOOM_THRESH = 0.7;    // ниже этой яркости светящийся объект не светится (graphics.js: BLOOM_ONLY-меши)
const GLOW_FOG_NEAR = 18, GLOW_FOG_FAR = 55;   // на этих дистанциях свечение гаснет (в проходе свечения туман — чёрный)
const BLOOM_NEAR = 0.85;     // сила узкого ореола (1/4 разрешения)
const BLOOM_WIDE = 0.6;      // сила широкого ореола (1/8 разрешения)
const SATURATION = 1.1;      // насыщенность
const CONTRAST = 1.06;       // контраст
const VIGNETTE = 0.3;        // затемнение углов
const TINT_LO = [0.97, 0.99, 1.03];  // тени — чуть в холод
const TINT_HI = [1.03, 1.0, 0.95];   // света — чуть в тепло

let active = false, gl2 = false;
let rtScene = null, rtG = null, rtA = null, rtB = null, rtC = null, rtD = null;
let quadScene, quadCam, quad, blurMat, downMat, compMat, occlMat;
let _size, _clr, _fogC;
let w = 0, h = 0;

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// Разделимый гаусс 9 тапов через 5 выборок с билинейной интерполяцией (веса — классические).
const BLUR_FRAG = `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
vec3 tap(vec2 p) { return texture2D(tSrc, p).rgb; }
void main() {
  vec2 o1 = uDir * 1.3846153846, o2 = uDir * 3.2307692308;
  vec3 c = tap(vUv) * 0.2270270270;
  c += (tap(vUv + o1) + tap(vUv - o1)) * 0.3162162162;
  c += (tap(vUv + o2) + tap(vUv - o2)) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
// Уменьшение вдвое: ровное среднее блока 4×4 текселей источника. uThresh > 0 только при первом уменьшении.
const DOWN_FRAG = `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
// Порог — у КАЖДОГО исходного текселя (16 выборок точно в центры 4×4), а не у среднего: тонкий дальний
// плафон занимает долю пикселя, и порог от среднего на одной дистанции то включал его свечение, то гасил.
vec3 th(vec2 o) { return max(texture2D(tSrc, vUv + uTexel * o).rgb - uThresh, 0.0); }
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) c += th(vec2(float(i) - 1.5, float(j) - 1.5));
  gl_FragColor = vec4(c / (16.0 * (1.0 - uThresh)), 1.0);
}`;
// Свечение смешивается «экраном» (screen), а не простым сложением: яркое не выбивается в плоский белый.
// Дизеринг в конце убирает полосы на плавных градиентах после цветокоррекции (8 бит на канал).
const COMP_FRAG = `
uniform sampler2D tScene, tBloom1, tBloom2;
uniform float uB1, uB2, uSat, uContrast, uVig; uniform vec3 uTintLo, uTintHi; varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = min(texture2D(tBloom1, vUv).rgb * uB1 + texture2D(tBloom2, vUv).rgb * uB2, 1.0);
  c = 1.0 - (1.0 - c) * (1.0 - b);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c *= mix(uTintLo, uTintHi, smoothstep(0.1, 0.9, l));
  c *= 1.0 - uVig * smoothstep(0.3, 0.8, distance(vUv, vec2(0.5)));
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

function shader(frag, uniforms) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
}
function initOnce() {
  if (quadScene) return;
  _size = new THREE.Vector2(); _clr = new THREE.Color(); _fogC = new THREE.Color();
  // Один треугольник, перекрывающий экран, дешевле квадрата из двух (нет шва по диагонали).
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  blurMat = shader(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  downMat = shader(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0 } });
  occlMat = new THREE.MeshBasicMaterial({ colorWrite: false });   // заслонители: только глубина
  compMat = shader(COMP_FRAG, {
    tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
    uB1: { value: BLOOM_NEAR }, uB2: { value: BLOOM_WIDE }, uSat: { value: SATURATION }, uContrast: { value: CONTRAST }, uVig: { value: VIGNETTE },
    uTintLo: { value: new THREE.Vector3(...TINT_LO) }, uTintHi: { value: new THREE.Vector3(...TINT_HI) }
  });
  quad = new THREE.Mesh(geo, compMat); quad.frustumCulled = false;
  quadScene = new THREE.Scene(); quadScene.add(quad);
  quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

const small = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false };
function createTargets(renderer) {
  gl2 = !!renderer.capabilities.isWebGL2;
  rtScene = gl2
    ? new THREE.WebGLMultisampleRenderTarget(1, 1, { format: THREE.RGBAFormat, stencilBuffer: false })
    : new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false });
  // rtG принимает сам проход светящихся объектов, поэтому ему нужен буфер глубины
  rtG = new THREE.WebGLRenderTarget(1, 1, { ...small, depthBuffer: true });
  rtA = new THREE.WebGLRenderTarget(1, 1, small);
  rtB = new THREE.WebGLRenderTarget(1, 1, small);
  rtC = new THREE.WebGLRenderTarget(1, 1, small);
  rtD = new THREE.WebGLRenderTarget(1, 1, small);
  // sRGB у ВСЕХ буферов, не только у rtScene: в r128 кодировка выхода входит в ключ шейдера, и
  // материалы ламп/пузыриков, которые рисуются и в rtScene, и в rtA, иначе каждый кадр менялись бы
  // между двумя программами. Наши шейдеры-квады кодировку не применяют — для них это просто метка.
  for (const rt of [rtScene, rtG, rtA, rtB, rtC, rtD]) { rt.texture.encoding = THREE.sRGBEncoding; rt.texture.generateMipmaps = false; }
  w = 0; h = 0;
}
function disposeTargets() {
  for (const rt of [rtScene, rtG, rtA, rtB, rtC, rtD]) if (rt) rt.dispose();
  rtScene = rtG = rtA = rtB = rtC = rtD = null;
}

// Сглаживание в High делает rtScene — только если браузер дал WebGL2.
export const hasMSAA = () => active && gl2;
export const isActive = () => active;

export function setEnabled(on, renderer) {
  if (on === active) return;
  active = on;
  if (on) { initOnce(); createTargets(renderer); }
  else disposeTargets();          // видеопамять под буферы нужна только в High
}

// Размер буферов следует за холстом, включая шаги адаптивного разрешения (GFX.tuneResolution) —
// поэтому сверяемся каждый кадр, а не подписываемся на resize.
function syncSize(renderer) {
  renderer.getDrawingBufferSize(_size);
  if (_size.x === w && _size.y === h) return;
  w = _size.x; h = _size.y;
  const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
  const w4 = Math.max(1, w >> 2), h4 = Math.max(1, h >> 2), w8 = Math.max(1, w >> 3), h8 = Math.max(1, h >> 3);
  rtScene.setSize(w, h); rtG.setSize(w2, h2); rtA.setSize(w4, h4); rtB.setSize(w4, h4); rtC.setSize(w8, h8); rtD.setSize(w8, h8);
}

// uniformsNeedUpdate обязателен: r128 перезаливает uniform'ы ShaderMaterial только при СМЕНЕ материала,
// а blurMat идёт два прохода подряд (H → V) — без флага второй взял бы текстуру и направление первого.
function pass(renderer, mat, target) { quad.material = mat; mat.uniformsNeedUpdate = true; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
function blur(renderer, src, tmp) {
  const u = blurMat.uniforms;
  u.tSrc.value = src.texture; u.uDir.value.set(1 / src.width, 0); pass(renderer, blurMat, tmp);
  u.tSrc.value = tmp.texture; u.uDir.value.set(0, 1 / src.height); pass(renderer, blurMat, src);
}
function down(renderer, src, dst, thresh) {
  const u = downMat.uniforms;
  u.tSrc.value = src.texture; u.uTexel.value.set(1 / src.width, 1 / src.height); u.uThresh.value = thresh; pass(renderer, downMat, dst);
}

export function render(renderer, scene, camera) {
  syncSize(renderer);
  // 1) основной кадр (здесь же один раз обновляется теневая карта)
  renderer.setRenderTarget(rtScene);
  renderer.render(scene, camera);

  // 2) светящиеся объекты. Тени и матрицы сцены в этом кадре уже посчитаны — второй раз не нужно.
  // Свет включён во все слои (GFX.lightLayers) — набор источников в каждом проходе один и тот же,
  // иначе three в каждом проходе заново перебирал бы шейдеры всех освещённых материалов.
  const sm = renderer.shadowMap, autoSm = sm.autoUpdate, autoScene = scene.autoUpdate, mask = camera.layers.mask;
  const fog = scene.fog, fogN = fog.near, fogF = fog.far, autoClr = renderer.autoClear;
  renderer.getClearColor(_clr); const clrA = renderer.getClearAlpha(); _fogC.copy(fog.color);
  sm.autoUpdate = false; scene.autoUpdate = false;
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(rtG);
  // 2а) заслонители — только глубина (очистка цвета и глубины идёт здесь же, через autoClear)
  camera.layers.set(OCCL_LAYER); scene.overrideMaterial = occlMat;
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  // 2б) светящиеся объекты поверх этой глубины, в чёрном тумане. Uniform'ы тумана three перезаливает
  // в каждом render() (номер текущего материала сбрасывается в конце вызова), так что подмена безопасна.
  camera.layers.set(BLOOM_LAYER); renderer.autoClear = false;
  fog.color.setRGB(0, 0, 0); fog.near = GLOW_FOG_NEAR; fog.far = GLOW_FOG_FAR;
  renderer.render(scene, camera);
  fog.color.copy(_fogC); fog.near = fogN; fog.far = fogF;
  renderer.autoClear = autoClr; camera.layers.mask = mask;
  renderer.setClearColor(_clr, clrA);
  sm.autoUpdate = autoSm; scene.autoUpdate = autoScene;

  // 3) 1/2 → 1/4 с порогом, узкий ореол в 1/4, широкий — в 1/8
  down(renderer, rtG, rtA, BLOOM_THRESH);
  blur(renderer, rtA, rtB);
  down(renderer, rtA, rtC, 0);
  blur(renderer, rtC, rtD);

  // 4) на экран
  const u = compMat.uniforms;
  u.tScene.value = rtScene.texture; u.tBloom1.value = rtA.texture; u.tBloom2.value = rtC.texture;
  pass(renderer, compMat, null);
}
