/* ============================================================
   МЭЛ: ПОБЕГ ИЗ ШКОЛЫ — 3D раннер в стиле Subway Surfers
   Three.js r128 + Yandex Games SDK
   Оптимизированная сборка: батчинг статичной геометрии, кэш
   материалов/геометрий/DOM, FPS-независимое сглаживание,
   исправленные баги логики (см. комментарии «FIX:»).
   Режиссёр паттернов: интервалы задаются во времени и переводятся
   в метры по прогнозируемой скорости прибытия (см. «РЕЖИССЁР»).
   v2: маршрут игрока отделён от бутылок; поверх паттернов —
   «фоновый» слой препятствий в свободных полосах (плотность растёт
   с дистанцией); новые препятствия (стеллаж, тележка, табличка
   «мокрый пол») и паттерны; бутылки — только в наградных местах
   и с кулдауном; окна коридора переработаны.
   v2.1: компактизация без изменения поведения — общие хелперы
   put/limb/cyl/sph/tplane/shadowDisc для сборки мешей, единый
   осциллятор звука, weightedPick, hitsXZ, screens, syncToggleUI.
   ============================================================ */
(function () {
'use strict';

/* ---------- утилиты ---------- */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// FIX: экспоненциальное сглаживание, не зависящее от FPS (замена lerp(a, b, dt * k))
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const smooth = t => t * t * (3 - 2 * t);
/* взвешенный случайный выбор: weightOf(item) → вес (режиссёр паттернов и фоновый слой) */
function weightedPick(items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let r = Math.random() * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

/* кэш DOM-элементов (заполняется в init) — раньше getElementById дёргался в горячем цикле */
const UI = {};
const UI_IDS = ['loading', 'loadingText', 'menu', 'over', 'pause', 'hud', 'reviveBtn', 'skipIntroBtn',
  'flash', 'yell', 'bottleNum', 'score', 'hint', 'menuBest', 'menuBottles', 'overScore', 'overBottles',
  'overBest', 'newRecord', 'musicBtn', 'soundBtn', 'game'];
function cacheUI() { for (const id of UI_IDS) UI[id] = $(id); }
function replayCss(el) { if (!el) return; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function setYell(text) { if (!UI.yell) return; UI.yell.textContent = text; replayCss(UI.yell); }
function show(el, on) { if (el) el.classList.toggle('hidden', !on); }
/* показать только перечисленные экраны/элементы, остальные из SCREENS спрятать */
const SCREENS = ['menu', 'over', 'pause', 'hud', 'reviveBtn', 'skipIntroBtn'];
function screens(...ids) { for (const id of SCREENS) show(UI[id], ids.indexOf(id) >= 0); }

const LANES = [-2.3, 0, 2.3];
const SEG_LEN = 24, SEG_COUNT = 9;
const WALL_X = 4.6, WALL_H = 5.8;
const GRAVITY = 28, JUMP_V = 9;
const BASE_SPEED = 11, MAX_SPEED = 27, ACCEL = 0.24;
const SPAWN_AHEAD = 170, DESPAWN_BEHIND = 14;
const ROLL_TIME = 0.62;
// FIX: единые допуски хитбокса — раньше «пол» и «столкновение» считались с разными
// порогами, из-за чего на краю парты можно было погибнуть, приземляясь на неё.
// HIT_Z подогнан под реальную глубину тела Мэла (~0.22 вперёд), чтобы не «ловить» парту за полметра до неё.
const HIT_W = 0.34, HIT_Z = 0.36, PLATFORM_TOL = 0.28;
const FOG_NEAR = 34, FOG_FAR = 130, CAM_FAR = 150; // дальше конца тумана всё равно ничего не видно
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

/* ---------- сохранение / настройки ---------- */
const save = { best: 0, bottles: 0, music: 1, sound: 1 };
function readLocalSave() {
  try {
    const s = JSON.parse(localStorage.getItem('melEscapeSave') || 'null');
    if (s) { save.best = s.best | 0; save.bottles = s.bottles | 0; save.music = s.music !== 0 ? 1 : 0; save.sound = s.sound !== 0 ? 1 : 0; }
  } catch (e) {}
}
/* состояние звука и кнопок музыки/звука по сохранению (вызывается и до cacheUI, поэтому через $) */
function syncToggleUI() {
  Sound.musicOn = !!save.music; Sound.sfxOn = !!save.sound;
  const mb = $('musicBtn'), sb = $('soundBtn');
  if (mb) mb.style.opacity = save.music ? '1' : '0.4';
  if (sb) sb.textContent = save.sound ? '🔊' : '🔇';
}
let cloudTimer = null, cloudPending = false;
function cloudSave() {
  Sdk.getPlayer()
    .then(p => p.setData({ best: save.best, bottles: save.bottles, music: save.music, sound: save.sound }, false))
    .catch(() => {});
}
function persistSave() {
  try { localStorage.setItem('melEscapeSave', JSON.stringify(save)); } catch (e) {}
  if (!Sdk.ysdk) return;
  // облако: первый вызов сразу, дальше не чаще раза в 2.5 с (у Яндекса лимит на частоту setData)
  if (cloudTimer) { cloudPending = true; return; }
  cloudSave();
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    if (cloudPending) { cloudPending = false; persistSave(); }
  }, 2500);
}

/* ---------- Yandex Games SDK ---------- */
const Sdk = {
  ysdk: null, playerPromise: null,
  init() {
    return new Promise(res => {
      if (typeof window.YaGames === 'undefined') return res();
      try {
        window.YaGames.init().then(y => { Sdk.ysdk = y; res(); }).catch(() => res());
      } catch (e) { res(); }
    });
  },
  // FIX: объект игрока кэшируется — раньше getPlayer() создавался при каждом сохранении
  getPlayer() {
    if (!this.ysdk) return Promise.reject(new Error('no sdk'));
    if (!this.playerPromise) {
      try {
        this.playerPromise = this.ysdk.getPlayer({ scopes: false });
        this.playerPromise.catch(() => { Sdk.playerPromise = null; });
      } catch (e) { return Promise.reject(e); }
    }
    return this.playerPromise;
  },
  /* безопасный вызов ysdk.features.<Api>.<method>() — SDK может отсутствовать или быть урезанным */
  feature(api, method) { try { const f = Sdk.ysdk && Sdk.ysdk.features && Sdk.ysdk.features[api]; if (f) f[method](); } catch (e) {} },
  loadingReady() { Sdk.feature('LoadingAPI', 'ready'); },
  gameplayStart() { Sdk.feature('GameplayAPI', 'start'); },
  gameplayStop() { Sdk.feature('GameplayAPI', 'stop'); },
  loadCloud() {
    if (!this.ysdk) return Promise.resolve(false);
    return this.getPlayer()
      .then(p => p.getData(['best', 'bottles', 'music', 'sound']))
      .then(d => {
        if (d && typeof d.best === 'number') {
          save.best = Math.max(save.best, d.best | 0);
          save.bottles = Math.max(save.bottles, d.bottles | 0);
          if (typeof d.music === 'number') save.music = d.music ? 1 : 0;
          if (typeof d.sound === 'number') save.sound = d.sound ? 1 : 0;
        }
        return true;
      })
      .catch(() => false);
  }
};
/* промис с таймаутом: SDK/облако не должны вешать загрузку игры */
function withTimeout(p, ms) {
  return new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(); } }, ms);
    Promise.resolve(p).then(() => {}, () => {}).then(() => { if (!done) { done = true; clearTimeout(t); res(); } });
  });
}

let adBusy = false;
// FIX: первый межстраничный показ — не раньше чем через 75 с после старта (требование площадки),
// а рестарт/переход выполняются только ПОСЛЕ закрытия рекламы, а не параллельно с ней
let lastInterstitial = Date.now();
function maybeInterstitial(then) {
  const next = typeof then === 'function' ? then : () => {};
  const y = Sdk.ysdk;
  if (!y || !y.adv || adBusy || Date.now() - lastInterstitial < 75000) { next(); return; }
  lastInterstitial = Date.now();
  adBusy = true;
  let done = false, opened = false;
  const finish = () => { if (done) return; done = true; adBusy = false; Sound.resumeAll(); next(); };
  const guard = setTimeout(() => { if (!opened) finish(); }, 5000);
  try {
    y.adv.showFullscreenAdv({ callbacks: {
      onOpen: () => { opened = true; clearTimeout(guard); Sound.pauseAll(); },
      onClose: () => { clearTimeout(guard); finish(); },
      onError: () => { clearTimeout(guard); finish(); },
      onOffline: () => { clearTimeout(guard); finish(); }
    }});
  } catch (e) { clearTimeout(guard); finish(); }
}
function showRewarded(onReward, onFail) {
  const y = Sdk.ysdk;
  if (!y || !y.adv || adBusy) return onFail();
  adBusy = true;
  let got = false, done = false;
  const finish = () => { if (done) return; done = true; adBusy = false; Sound.resumeAll(); got ? onReward() : onFail(); };
  try {
    y.adv.showRewardedVideo({ callbacks: {
      onOpen: () => Sound.pauseAll(),
      onRewarded: () => { got = true; },
      onClose: finish,
      onError: finish
    }});
  } catch (e) { finish(); }
}

/* ---------- звук (WebAudio, всё синтезировано) ---------- */
const BASS_SEQ = [110, 0, 110, 0, 130.81, 0, 110, 0, 98, 0, 98, 0, 110, 0, 130.81, 0, 87.31, 0, 87.31, 0, 110, 0, 130.81, 0, 98, 0, 110, 0, 130.81, 0, 146.83, 0];
const LEAD_SEQ = [440, 0, 523.25, 0, 587.33, 523.25, 440, 0, 392, 0, 440, 0, 523.25, 0, 587.33, 0, 349.23, 0, 440, 0, 523.25, 440, 392, 0, 440, 523.25, 587.33, 0, 659.25, 587.33, 523.25, 0];
const STEP_DUR = 60 / 138 / 2;
const Sound = {
  ctx: null, master: null, musicGain: null, sfxGain: null, noiseBuf: null,
  musicOn: true, sfxOn: true, paused: false,
  step: 0, nextNote: 0, timer: null,
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) { try { this.ctx.resume(); } catch (e) {} }
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.5; this.sfxGain.connect(this.master);
      this.applyToggles();
      this.startMusic();
      return true;
    } catch (e) { return false; }
  },
  applyToggles() {
    if (!this.ctx) return;
    this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
    this.sfxGain.gain.value = this.sfxOn ? 0.5 : 0;
  },
  /* общий осциллятор с экспоненциальным затуханием (эффекты → sfxGain, музыка → musicGain) */
  osc(f0, f1, dur, type, vol, t, out) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  },
  tone(f0, f1, dur, type, vol, when) {
    if (!this.ctx || !this.sfxOn) return;
    this.osc(f0, f1, dur, type || 'sine', vol, when || this.ctx.currentTime, this.sfxGain);
  },
  // FIX: один общий буфер шума вместо генерации нового буфера при каждом звуке (аллокации в кадре)
  noise(dur, vol, freq) {
    if (!this.ctx || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.noiseBuf) {
      const n = ctx.sampleRate;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },
  jump() { this.tone(300, 640, 0.2, 'square', 0.12); },
  land() { this.noise(0.12, 0.1, 500); },
  roll() { this.noise(0.28, 0.14, 700); },
  coin() { const t = this.ctx ? this.ctx.currentTime : 0; this.tone(1318, 1318, 0.07, 'sine', 0.16, t); this.tone(1760, 1760, 0.12, 'sine', 0.16, t + 0.07); },
  lane() { this.noise(0.09, 0.06, 1400); },
  stumble() { this.tone(160, 90, 0.22, 'sawtooth', 0.2); this.noise(0.2, 0.14, 600); },
  crash() { this.noise(0.4, 0.3, 400); this.tone(180, 55, 0.5, 'sawtooth', 0.22); },
  growl() { const t = this.ctx ? this.ctx.currentTime : 0; this.tone(220, 90, 0.35, 'sawtooth', 0.14, t); this.tone(140, 70, 0.4, 'sawtooth', 0.12, t + 0.05); },
  click() { this.tone(650, 650, 0.05, 'sine', 0.1); },
  pauseAll() { this.paused = true; if (this.ctx) try { this.ctx.suspend(); } catch (e) {} },
  resumeAll() { this.paused = false; if (this.ctx) try { this.ctx.resume(); } catch (e) {} },
  /* музыка: бас + пентатоника + хэт */
  startMusic() {
    if (this.timer || !this.ctx) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 110);
  },
  mNote(f, t, dur, type, vol) { this.osc(f, 0, dur, type, vol, t, this.musicGain); },
  schedule() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.ctx.state !== 'running' || !this.musicOn) { this.nextNote = Math.max(this.nextNote, now + 0.05); return; }
    while (this.nextNote < now + 0.3) {
      const s = this.step % 32, t = this.nextNote;
      const bass = BASS_SEQ[s];
      if (bass) this.mNote(bass, t, 0.22, 'square', 0.5);
      const lead = LEAD_SEQ[s];
      if (lead && (s % 2 === 0)) this.mNote(lead, t, 0.16, 'triangle', 0.35);
      if (s % 2 === 1) this.mNote(6000, t, 0.03, 'square', 0.05); /* хэт-подобный тик */
      this.nextNote += STEP_DUR;
      this.step++;
    }
  }
};

/* ---------- three.js: базовая сцена и кэши ---------- */
let renderer, scene, camera;
let texMel, texGranny, texBottle;
let maxAniso = 1;
const matCache = {}, basicMatCache = {}, mapMatCache = new Map(), geoCache = {};
const cached = (store, key, make) => store[key] || (store[key] = make());
function M(color) { return cached(matCache, color, () => new THREE.MeshLambertMaterial({ color })); }
function MB(color) { return cached(basicMatCache, color, () => new THREE.MeshBasicMaterial({ color })); }
// FIX: материалы с текстурами тоже кэшируются — раньше на каждый юнит декора/препятствие создавался новый
function MT(tex) {
  let m = mapMatCache.get(tex);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: tex }); mapMatCache.set(tex, m); }
  return m;
}
function GBox(w, h, d) { return cached(geoCache, 'b' + w + '_' + h + '_' + d, () => new THREE.BoxGeometry(w, h, d)); }
function GPlane(w, h) { return cached(geoCache, 'p' + w + '_' + h, () => new THREE.PlaneGeometry(w, h)); }
function GCircle(r) { return cached(geoCache, 'c' + r, () => new THREE.CircleGeometry(r, 16)); }
function box(w, h, d, color) { return new THREE.Mesh(GBox(w, h, d), M(color)); }
const cyl = (rt, rb, h, n, color) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), M(color));
const sph = (r, ws, hs, color) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), M(color));
const tplane = (w, h, tex) => new THREE.Mesh(GPlane(w, h), MT(tex));
/* поставить меш в родителя в точке (x, y, z); возвращает меш — можно сразу задать поворот */
function put(parent, mesh, x, y, z) { mesh.position.set(x, y, z); parent.add(mesh); return mesh; }
/* конечность: группа-шарнир в (x, y), внутри — сегменты [w, h, d, цвет, py, pz?] */
function limb(parent, x, y, parts) {
  const g = new THREE.Group(); g.position.set(x, y, 0);
  for (const [w, h, d, c, py, pz] of parts) put(g, box(w, h, d, c), 0, py, pz || 0);
  parent.add(g); return g;
}
let SHADOW_MAT_CHAR, SHADOW_MAT_OBS;
/* круглая тень-«блин» на полу */
function shadowDisc(parent, r, mat) {
  const s = put(parent, new THREE.Mesh(GCircle(r), mat), 0, 0.02, 0);
  s.rotation.x = -Math.PI / 2; return s;
}
function canvasTex(w, h, fn, repeat, aniso) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (aniso) t.anisotropy = aniso;
  return t;
}

/* --- батчинг статичной геометрии ---
   Все однотонные Lambert/Basic-меши внутри группы сливаются в один меш с vertex colors.
   Результат визуально идентичен, но парта = 1 draw call вместо 12, сегмент коридора = 5 вместо ~14. */
let _bm, _bn, _bv, _binv, BAKE_MATS;
function initBakeHelpers() {
  _bm = new THREE.Matrix4(); _bn = new THREE.Matrix3(); _bv = new THREE.Vector3(); _binv = new THREE.Matrix4();
  BAKE_MATS = {
    L: new THREE.MeshLambertMaterial({ vertexColors: true }),
    B: new THREE.MeshBasicMaterial({ vertexColors: true })
  };
}
function bakeStatic(group) {
  group.updateMatrixWorld(true);
  _binv.copy(group.matrixWorld).invert();
  const buckets = { L: [], B: [] };
  group.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, g = o.geometry;
    if (!m || Array.isArray(m) || m.map || m.transparent || m.vertexColors) return;
    if (!g || !g.index || !g.attributes.position || !g.attributes.normal) return;
    if (m.isMeshLambertMaterial) buckets.L.push(o);
    else if (m.isMeshBasicMaterial) buckets.B.push(o);
  });
  for (const key in buckets) {
    const list = buckets[key];
    if (list.length < 2) continue;
    let vc = 0, ic = 0;
    for (const o of list) { vc += o.geometry.attributes.position.count; ic += o.geometry.index.count; }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    for (const o of list) {
      const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, ind = g.index;
      const c = o.material.color;
      _bm.multiplyMatrices(_binv, o.matrixWorld);
      _bn.getNormalMatrix(_bm);
      for (let i = 0; i < p.count; i++) {
        const k = (vo + i) * 3;
        _bv.fromBufferAttribute(p, i).applyMatrix4(_bm);
        pos[k] = _bv.x; pos[k + 1] = _bv.y; pos[k + 2] = _bv.z;
        _bv.fromBufferAttribute(n, i).applyMatrix3(_bn).normalize();
        nor[k] = _bv.x; nor[k + 1] = _bv.y; nor[k + 2] = _bv.z;
        col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      }
      for (let i = 0; i < ind.count; i++) idx[io + i] = ind.getX(i) + vo;
      vo += p.count; io += ind.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    for (const o of list) o.parent.remove(o);
    group.add(new THREE.Mesh(geo, BAKE_MATS[key]));
  }
  return group;
}
/* статичные потомки не пересчитывают локальную матрицу каждый кадр */
function freezeStatic(group) {
  group.traverse(o => { if (o !== group) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
  return group;
}
/* запечь + заморозить (все статичные сборки заканчиваются этой парой вызовов) */
function finalizeStatic(group) { return freezeStatic(bakeStatic(group)); }

/* ---------- загрузка текстур ---------- */
function makeBottleFallbackTex() {
  return canvasTex(64, 128, (g) => {
    g.clearRect(0, 0, 64, 128);
    g.fillStyle = '#3fa66b';
    g.beginPath(); g.moveTo(24, 10); g.lineTo(40, 10); g.lineTo(40, 34); g.quadraticCurveTo(52, 44, 52, 60);
    g.lineTo(52, 116); g.quadraticCurveTo(52, 124, 44, 124); g.lineTo(20, 124); g.quadraticCurveTo(12, 124, 12, 116);
    g.lineTo(12, 60); g.quadraticCurveTo(12, 44, 24, 34); g.closePath(); g.fill();
    g.fillStyle = '#f4f0dc'; g.fillRect(16, 66, 32, 30);
    g.fillStyle = '#c62828'; g.fillRect(22, 4, 20, 8);
  });
}
function loadTextures() {
  return new Promise(res => {
    const url = (typeof ASSETS !== 'undefined' && ASSETS && ASSETS.bottle) ? ASSETS.bottle : null;
    if (!url) { texBottle = makeBottleFallbackTex(); return res(); }
    new THREE.TextureLoader().load(url,
      tex => { tex.encoding = THREE.sRGBEncoding; texBottle = tex; res(); },
      undefined,
      () => { texBottle = makeBottleFallbackTex(); res(); });
  });
}

/* ---------- рисованные лица (по мотивам фото-референсов) ---------- */
// Мэл: короткая тёмно-каштановая стрижка с фейдом, прямые густые брови,
// миндалевидные серо-зелёные глаза, прямой нос, спокойный прищур
function makeMelFaceTex() {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#f0c19b'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(214,140,96,0.25)';
    g.fillRect(0, 0, 66, 512); g.fillRect(446, 0, 66, 512);
    for (const ex of [26, 486]) {
      g.fillStyle = '#e9b58d';
      g.beginPath(); g.ellipse(ex, 292, 26, 42, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c98d5f'; g.lineWidth = 7;
      g.beginPath(); g.ellipse(ex, 292, 12, 22, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#3d2a1a';
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(512, 0); g.lineTo(512, 118);
    g.quadraticCurveTo(470, 148, 420, 128);
    g.quadraticCurveTo(360, 102, 300, 126);
    g.quadraticCurveTo(256, 144, 212, 126);
    g.quadraticCurveTo(152, 102, 92, 128);
    g.quadraticCurveTo(42, 148, 0, 118);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(61,42,26,0.5)';
    g.fillRect(0, 0, 44, 300); g.fillRect(468, 0, 44, 300);
    g.strokeStyle = 'rgba(30,20,12,0.6)'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    for (const [x1, y1, x2, y2] of [[80, 40, 96, 96], [160, 24, 168, 84], [250, 18, 254, 80], [340, 24, 332, 84], [430, 40, 414, 96]]) {
      g.moveTo(x1, y1); g.lineTo(x2, y2);
    }
    g.stroke();
    g.strokeStyle = '#2e2013'; g.lineWidth = 22; g.lineCap = 'round';
    g.beginPath(); g.moveTo(140, 232); g.lineTo(238, 224); g.stroke();
    g.beginPath(); g.moveTo(372, 232); g.lineTo(274, 224); g.stroke();
    for (const cx of [188, 324]) {
      g.fillStyle = '#fbf7f2';
      g.beginPath(); g.ellipse(cx, 272, 42, 24, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#a8744d'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#69795a';
      g.beginPath(); g.arc(cx, 274, 17, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#14100c';
      g.beginPath(); g.arc(cx, 274, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(cx + 5, 268, 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a5236'; g.lineWidth = 5;
      g.beginPath(); g.arc(cx, 276, 43, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
    g.strokeStyle = 'rgba(180,116,72,0.85)'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(246, 288); g.quadraticCurveTo(242, 336, 250, 352); g.stroke();
    g.beginPath(); g.moveTo(268, 288); g.quadraticCurveTo(272, 336, 264, 352); g.stroke();
    g.strokeStyle = 'rgba(160,98,60,0.9)'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(240, 360); g.quadraticCurveTo(252, 372, 264, 366); g.quadraticCurveTo(272, 362, 272, 358); g.stroke();
    g.strokeStyle = '#9c5f43'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(206, 424); g.quadraticCurveTo(256, 434, 306, 424); g.stroke();
    g.strokeStyle = 'rgba(180,110,80,0.5)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(222, 448); g.quadraticCurveTo(256, 454, 290, 448); g.stroke();
    g.strokeStyle = 'rgba(200,130,88,0.5)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(216, 486); g.quadraticCurveTo(256, 496, 296, 486); g.stroke();
    g.fillStyle = 'rgba(224,130,92,0.18)';
    g.beginPath(); g.ellipse(96, 376, 34, 20, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(416, 376, 34, 20, 0, 0, Math.PI * 2); g.fill();
  });
}
// Бабка-учительница: сероватая кожа, белые глаза без зрачков, открытый рот с зубами, морщины
function makeGrannyFaceTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#a9abb2'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#e9e9e9'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(32, 10); g.quadraticCurveTo(52, 40, 42, 66);
    g.moveTo(92, 4); g.quadraticCurveTo(102, 26, 98, 48);
    g.moveTo(168, 4); g.quadraticCurveTo(158, 26, 164, 48);
    g.moveTo(224, 10); g.quadraticCurveTo(204, 40, 214, 66);
    g.stroke();
    g.strokeStyle = '#8b8d94'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(58, 62); g.quadraticCurveTo(128, 48, 198, 62); g.stroke();
    g.beginPath(); g.moveTo(64, 82); g.quadraticCurveTo(128, 70, 192, 82); g.stroke();
    g.fillStyle = '#dcdcdc';
    g.save(); g.translate(58, 114); g.rotate(0.30); g.fillRect(-28, -9, 56, 18); g.restore();
    g.save(); g.translate(198, 114); g.rotate(-0.30); g.fillRect(-28, -9, 56, 18); g.restore();
    for (const cx of [88, 168]) {
      g.fillStyle = '#f4f4f4';
      g.beginPath(); g.arc(cx, 148, 21, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7c7e85'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = 'rgba(170,70,70,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - 8, 140); g.lineTo(cx - 2, 148); g.stroke();
    }
    g.strokeStyle = '#8f9198'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(60, 170); g.quadraticCurveTo(72, 180, 86, 175); g.stroke();
    g.beginPath(); g.moveTo(196, 170); g.quadraticCurveTo(184, 180, 170, 175); g.stroke();
    g.strokeStyle = '#85878e'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(122, 152); g.quadraticCurveTo(112, 190, 128, 196);
    g.quadraticCurveTo(146, 200, 142, 186);
    g.stroke();
    g.strokeStyle = '#8f9198'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(96, 178); g.quadraticCurveTo(80, 206, 84, 228); g.stroke();
    g.beginPath(); g.moveTo(160, 178); g.quadraticCurveTo(176, 206, 172, 228); g.stroke();
    g.fillStyle = '#4b1414';
    g.beginPath();
    g.moveTo(84, 212);
    g.quadraticCurveTo(128, 200, 172, 212);
    g.quadraticCurveTo(178, 246, 128, 252);
    g.quadraticCurveTo(78, 246, 84, 212);
    g.closePath(); g.fill();
    g.strokeStyle = '#6e2a24'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#e6dca4';
    for (const [x, y, w, h] of [[92, 213, 15, 14], [112, 210, 14, 16], [132, 210, 14, 16], [152, 212, 14, 14]])
      g.fillRect(x, y, w, h);
    for (const [x, y, w, h] of [[104, 236, 13, 12], [126, 237, 13, 12], [148, 234, 12, 12]])
      g.fillRect(x, y, w, h);
    g.fillStyle = '#7c7e85';
    g.beginPath(); g.arc(158, 198, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#dcdcdc'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(156, 192); g.lineTo(152, 182); g.moveTo(162, 192); g.lineTo(166, 183); g.stroke();
  });
}

/* ---------- текстуры окружения ---------- */
let floorTex, wallTex, lockerTex, boardTex, windowTex, shelfTex, signTex, posterTexes = [], bannerTexes = [];
let LOCKER_MATS_FRONT, LOCKER_MATS_BACK, SHELF_MATS, SIGN_MATS_FRONT, SIGN_MATS_BACK;
function buildEnvTextures() {
  floorTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c9cfd5'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#b4bbc2';
    g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
    g.strokeStyle = '#98a1a9'; g.lineWidth = 6;
    g.strokeRect(0, 0, 256, 256);
    g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    g.fillStyle = 'rgba(90,100,110,0.25)';
    for (let i = 0; i < 26; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }, [3.7, 9.6], maxAniso);

  wallTex = canvasTex(128, 256, (g) => {
    g.fillStyle = '#f0ecd9'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#a9c98c'; g.fillRect(0, 148, 128, 92);
    g.fillStyle = '#6f9459'; g.fillRect(0, 144, 128, 7);
    g.fillStyle = '#5c4633'; g.fillRect(0, 240, 128, 16);
  }, [6, 1], maxAniso);

  lockerTex = canvasTex(256, 512, (g) => {
    g.fillStyle = '#7e8b99'; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2; i++) {
      const x = 4 + i * 126;
      g.fillStyle = '#8895a3'; g.fillRect(x, 6, 118, 496);
      g.strokeStyle = '#5d6873'; g.lineWidth = 4; g.strokeRect(x, 6, 118, 496);
      g.fillStyle = '#55606a';
      for (let v = 0; v < 3; v++) g.fillRect(x + 20, 30 + v * 16, 78, 7);
      g.fillStyle = '#f3c53d'; g.fillRect(x + 88, 250, 16, 34);
    }
  });

  boardTex = canvasTex(512, 256, (g) => {
    g.fillStyle = '#1e4034'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#f5f2e4'; g.lineWidth = 6;
    g.font = 'bold 56px Arial'; g.fillStyle = '#f5f2e4';
    g.fillText('2 × 2 = 5?', 90, 105);
    g.font = 'bold 40px Arial';
    g.fillText('диктант!! завтра', 70, 180);
    g.strokeStyle = 'rgba(245,242,228,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(40, 210); g.lineTo(460, 214); g.stroke();
  });

  // Окно коридора: три створки в одной панели — приглушённое небо, силуэты деревьев,
  // переплёты, блик и тень откоса. Освещается как стена (Lambert), поэтому не «светится».
  windowTex = canvasTex(512, 166, (g, w, h) => {
    g.fillStyle = '#e6e1d3'; g.fillRect(0, 0, w, h);
    const pw = w / 3;
    for (let i = 0; i < 3; i++) {
      const x0 = i * pw + 12, y0 = 10, ww = pw - 24, hh = h - 20;
      g.save();
      g.beginPath(); g.rect(x0, y0, ww, hh); g.clip();
      const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
      gr.addColorStop(0, '#93aec6'); gr.addColorStop(0.6, '#b6cbd9'); gr.addColorStop(1, '#c9d6cc');
      g.fillStyle = gr; g.fillRect(x0, y0, ww, hh);
      g.fillStyle = 'rgba(96,128,96,0.28)';
      g.beginPath(); g.ellipse(x0 + ww * 0.3, y0 + hh * 0.95, ww * 0.28, hh * 0.32, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x0 + ww * 0.75, y0 + hh * 1.0, ww * 0.3, hh * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0 + ww * 0.12, y0 + hh * 0.9); g.lineTo(x0 + ww * 0.48, y0 + hh * 0.1); g.stroke();
      g.fillStyle = '#dcd6c6';
      g.fillRect(x0 + ww / 2 - 3, y0, 6, hh);
      g.fillRect(x0, y0 + hh * 0.38 - 3, ww, 6);
      g.strokeStyle = 'rgba(50,60,70,0.35)'; g.lineWidth = 4; g.strokeRect(x0 + 2, y0 + 2, ww - 4, hh - 4);
      g.restore();
    }
    g.strokeStyle = '#cfc8b6'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  }, null, maxAniso);

  // Книжный стеллаж (препятствие-«стена»): четыре полки с корешками
  shelfTex = canvasTex(256, 512, (g) => {
    g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 256, 512);
    const cols = ['#b23a3a', '#2f5d8a', '#3f7a48', '#c98a2b', '#6a3d8a', '#d9d2bd', '#8a3b2f', '#2e7f8a'];
    for (let s = 0; s < 4; s++) {
      const y0 = 14 + s * 122;
      g.fillStyle = '#3a2716'; g.fillRect(12, y0, 232, 104);
      let x = 16;
      while (x < 236) {
        const bw = randi(12, 26), bh = randi(62, 94);
        if (x + bw > 240) break;
        g.fillStyle = pick(cols); g.fillRect(x, y0 + 104 - bh, bw, bh);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y0 + 104 - bh, 3, bh);
        x += bw + 2;
        if (Math.random() < 0.12) x += randi(10, 30);
      }
      g.fillStyle = '#8a5a33'; g.fillRect(8, y0 + 104, 240, 14);
    }
  });

  // Табличка «Осторожно, мокрый пол»
  signTex = canvasTex(128, 192, (g) => {
    g.fillStyle = '#f2c320'; g.fillRect(0, 0, 128, 192);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 184);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 19px Arial'; g.textAlign = 'center';
    g.fillText('ОСТОРОЖНО', 64, 38);
    g.beginPath(); g.arc(64, 70, 10, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(58, 82); g.lineTo(76, 108); g.lineTo(98, 100);
    g.moveTo(76, 108); g.lineTo(58, 130);
    g.moveTo(66, 92); g.lineTo(40, 88);
    g.stroke();
    g.font = 'bold 21px Arial';
    g.fillText('МОКРЫЙ', 64, 160); g.fillText('ПОЛ', 64, 182);
  });

  posterTexes = [
    ['#fff6dd', '#c62828', 'ДИКТАНТ', 'ЗАВТРА!'],
    ['#e3f2fd', '#1565c0', 'ОБЕД', 'В 13:00'],
    ['#fff1f1', '#6a1b9a', 'ПОБЕГ', 'ЗАПРЕЩЁН'],
    ['#e8f5e9', '#2e7d32', 'Субботник', 'в 9:00']
  ].map(([bg, fg, l1, l2]) => canvasTex(256, 352, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 256, 352);
    g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(10, 10, 236, 332);
    g.fillStyle = fg; g.font = 'bold 42px Arial'; g.textAlign = 'center';
    g.fillText(l1, 128, 120); g.fillText(l2, 128, 172);
    g.fillStyle = '#9e9e9e';
    for (let i = 0; i < 5; i++) g.fillRect(50, 210 + i * 22, 156 - (i % 3) * 40, 9);
  }));

  bannerTexes = [
    ['#e53935', '#ffffff', 'КОНТРОЛЬНАЯ', 'РАБОТА!'],
    ['#fdd835', '#b71c1c', 'НЕ БЕГАТЬ', 'ПО КОРИДОРАМ'],
    ['#43a047', '#ffffff', 'ЛИНЕЙКА', 'В 8:00']
  ].map(([bg, fg, l1, l2]) => canvasTex(512, 256, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    g.fillStyle = fg;
    for (let i = -2; i < 8; i++) { g.save(); g.translate(i * 80, 0); g.globalAlpha = 0.12; g.fillRect(0, 0, 40, 256); g.restore(); }
    g.globalAlpha = 1;
    g.font = 'bold 52px Arial'; g.textAlign = 'center';
    g.fillText(l1, 256, 108);
    g.font = 'bold 64px Arial';
    g.fillText(l2, 256, 190);
    g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(8, 8, 496, 240);
  }));

  // общие наборы материалов для шкафчиков (текстура на +z / на -z)
  LOCKER_MATS_FRONT = [M('#6d7986'), M('#6d7986'), M('#8a97a5'), M('#55606a'), MT(lockerTex), M('#6d7986')];
  LOCKER_MATS_BACK = [M('#6d7986'), M('#6d7986'), M('#8a97a5'), M('#55606a'), M('#6d7986'), MT(lockerTex)];
  // стеллаж: книги видны и спереди, и сзади (игрок смотрит на грань -z)
  SHELF_MATS = [M('#6b4a2e'), M('#6b4a2e'), M('#6b4a2e'), M('#4e3521'), MT(shelfTex), MT(shelfTex)];
  const Y = M('#e9bb1c');
  SIGN_MATS_FRONT = [Y, Y, Y, Y, MT(signTex), Y];
  SIGN_MATS_BACK = [Y, Y, Y, Y, Y, MT(signTex)];
}

/* ---------- коридор ---------- */
const segments = [];
/* Все настенные юниты строятся так, чтобы их ЗАДНЯЯ плоскость лежала в local z = 0,
   а local +z смотрел в коридор. Сам юнит ставится вплотную к стене (см. buildSegment). */
function buildDecorUnit(kind) {
  const g = new THREE.Group();
  if (kind === 'lockers') {
    put(g, new THREE.Mesh(GBox(3, 2.3, 0.5), LOCKER_MATS_FRONT), 0, 1.15, 0.25);
    put(g, box(3.1, 0.14, 0.6, '#4d5762'), 0, 0.07, 0.3);
  } else if (kind === 'door') {
    for (const jx of [-0.64, 0.64]) put(g, box(0.12, 2.5, 0.22, '#6d4c2f'), jx, 1.25, 0.11);
    put(g, box(1.4, 0.12, 0.22, '#6d4c2f'), 0, 2.44, 0.11);
    put(g, box(1.16, 2.38, 0.06, '#8a5a33'), 0, 1.19, 0.16);
    put(g, box(0.42, 0.62, 0.03, '#cfe6ee'), 0, 1.78, 0.195);
    put(g, sph(0.05, 8, 8, '#e0b83e'), 0.42, 1.18, 0.21);
  } else if (kind === 'windows') {
    // FIX: раньше стекло было ярко-голубым и неосвещённым (MeshBasic) — три «светящихся» прямоугольника
    // на стене. Теперь одна освещённая панель с тремя створками, рама, подоконник с цветком;
    // окно поднято над зелёной панелью стены, как в настоящем школьном коридоре.
    put(g, box(5.2, 1.86, 0.1, '#e6e1d3'), 0, 3.48, 0.05);
    put(g, tplane(5.0, 1.62, windowTex), 0, 3.5, 0.105);
    put(g, box(5.4, 0.1, 0.3, '#d9d3c2'), 0, 2.6, 0.15);
    put(g, cyl(0.12, 0.09, 0.22, 8, '#b7643a'), 1.7, 2.76, 0.15);
    put(g, sph(0.17, 8, 6, '#4f8a4b'), 1.7, 2.98, 0.15);
  } else if (kind === 'poster') {
    put(g, box(1.2, 1.6, 0.05, '#5d4634'), 0, 2.15, 0.025);
    put(g, tplane(1.05, 1.45, pick(posterTexes)), 0, 2.15, 0.055);
  } else if (kind === 'board') {
    put(g, box(2.9, 1.55, 0.08, '#5d4634'), 0, 2.35, 0.04);
    put(g, tplane(2.7, 1.35, boardTex), 0, 2.35, 0.085);
    put(g, box(2.8, 0.07, 0.14, '#5d4634'), 0, 1.55, 0.1);
  } else if (kind === 'extinguisher') {
    put(g, box(0.34, 0.8, 0.2, '#b0451f'), 0, 1.25, 0.1);
    put(g, cyl(0.13, 0.13, 0.42, 10, '#c62828'), 0, 1.15, 0.33);
    put(g, cyl(0.04, 0.04, 0.12, 6, '#37474f'), 0, 1.42, 0.33);
  }
  return finalizeStatic(g);
}
const DECOR_KINDS = ['lockers', 'door', 'windows', 'poster', 'board', 'extinguisher'];
/* minLocalZ — не ставить декор ближе этой локальной z (нужно для сегмента, в котором стоит класс) */
function randomizeSegmentDecor(seg, minLocalZ) {
  const lo = Math.max(-SEG_LEN / 2 + 3, minLocalZ == null ? -Infinity : minLocalZ);
  const hi = SEG_LEN / 2 - 3;
  for (const sideKey of ['L', 'R']) {
    const units = seg.userData.decor[sideKey];
    for (let i = 0; i < units.length; i++) units[i].visible = false;
    // перемешиваем индексы — гарантированно уникальные объекты на стене
    // FIX: длина берётся из DECOR_KINDS, а не захардкожена
    const indices = units.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = randi(0, i);
      const temp = indices[i]; indices[i] = indices[j]; indices[j] = temp;
    }
    // FIX: два юнита ставим в непересекающиеся зоны [lo,-3] и [3,hi] — раньше широкие окна могли налезать на шкафчики
    const n = (lo <= -3 && randi(1, 2) === 2) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const u = units[indices[i]];
      u.visible = true;
      if (n === 1) u.position.z = rand(lo, hi);
      else if (i === 0) u.position.z = rand(lo, -3);
      else u.position.z = rand(3, hi);
      u.updateMatrix();
    }
  }
}
function buildSegment(i) {
  const g = new THREE.Group();
  g.position.z = i * SEG_LEN;

  const floor = tplane(9.4, SEG_LEN, floorTex);
  floor.rotation.x = -Math.PI / 2; g.add(floor);

  const ceil = put(g, new THREE.Mesh(GPlane(9.4, SEG_LEN), M('#e3e7ea')), 0, WALL_H, 0);
  ceil.rotation.x = Math.PI / 2;

  for (const lampZ of [-SEG_LEN / 4, SEG_LEN / 4]) {
    put(g, new THREE.Mesh(GBox(2, 0.1, 0.6), MB('#fff3c4')), 0, WALL_H - 0.06, lampZ);
    put(g, new THREE.Mesh(GBox(1.7, 0.06, 0.42), MB('#fdf6dd')), 0, WALL_H - 0.13, lampZ);
  }

  const mkWall = (x, ry) => {
    const w = tplane(SEG_LEN, WALL_H, wallTex);
    w.rotation.y = ry; put(g, w, x, WALL_H / 2, 0);
    put(g, box(0.14, 0.4, SEG_LEN, '#55402f'), x + (x < 0 ? 0.1 : -0.1), 0.2, 0);
  };
  mkWall(-WALL_X, Math.PI / 2);
  mkWall(WALL_X, -Math.PI / 2);

  // статичная часть сегмента запекается ДО добавления декора (декор переключает видимость)
  finalizeStatic(g);

  const decor = { L: [], R: [] };
  for (const sideKey of ['L', 'R']) {
    // юнит ставится вплотную к стене (0.01 — защита от z-fighting задней грани с плоскостью стены)
    const sx = sideKey === 'L' ? -WALL_X + 0.01 : WALL_X - 0.01;
    const ry = sideKey === 'L' ? Math.PI / 2 : -Math.PI / 2;
    for (const kind of DECOR_KINDS) {
      const u = put(g, buildDecorUnit(kind), sx, 0, 0);
      u.rotation.y = ry;
      u.visible = false;
      u.matrixAutoUpdate = false;
      u.updateMatrix();
      decor[sideKey].push(u);
    }
  }
  g.userData.decor = decor;
  randomizeSegmentDecor(g, i === 0 ? CLASS_Z0 + 3 : undefined);
  return g;
}

/* ---------- персонаж: Мэл ---------- */
function buildMel() {
  const root = new THREE.Group();
  const pivot = put(root, new THREE.Group(), 0, 0.92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -0.92, 0);

  const SKIN = '#f0c19b', HAIR = '#3d2a1a', BLAZER = '#2c3a6b', PANTS = '#23262e', SHOE = '#17181c';

  put(inner, box(0.62, 0.58, 0.34, BLAZER), 0, 1.24, 0);            // торс
  put(inner, box(0.18, 0.24, 0.03, '#f5f5f2'), 0, 1.36, 0.18);      // рубашка
  put(inner, box(0.64, 0.09, 0.36, '#17181c'), 0, 0.96, 0);         // ремень

  const legParts = [[0.21, 0.62, 0.24, PANTS, -0.34], [0.23, 0.13, 0.34, SHOE, -0.68, 0.05]];
  const legL = limb(inner, -0.15, 0.92, legParts), legR = limb(inner, 0.15, 0.92, legParts);
  const armParts = [[0.16, 0.5, 0.18, BLAZER, -0.22], [0.13, 0.14, 0.14, SKIN, -0.52]];
  const armL = limb(inner, -0.39, 1.46, armParts), armR = limb(inner, 0.39, 1.46, armParts);

  const diary = put(armR, buildDiaryMesh(), 0, -0.64, 0.14);
  diary.rotation.x = Math.PI / 2;
  diary.visible = false;

  const headG = put(inner, new THREE.Group(), 0, 1.78, 0);
  const faceMat = new THREE.MeshLambertMaterial({ map: texMel });
  const hairMat = M(HAIR);
  headG.add(new THREE.Mesh(GBox(0.54, 0.56, 0.52), [hairMat, hairMat, hairMat, M(SKIN), faceMat, hairMat]));
  put(headG, box(0.58, 0.14, 0.56, HAIR), 0, 0.28, 0);
  put(headG, box(0.58, 0.34, 0.12, HAIR), 0, 0.1, -0.24);

  // рюкзак
  put(inner, box(0.48, 0.54, 0.22, '#d23f2e'), 0, 1.24, -0.3);
  put(inner, box(0.32, 0.22, 0.08, '#a52a1d'), 0, 1.06, -0.44);
  for (const sx of [-0.2, 0.2]) put(inner, box(0.09, 0.5, 0.04, '#7a1f16'), sx, 1.3, -0.16);

  const shadow = shadowDisc(root, 0.52, SHADOW_MAT_CHAR);

  return { root, pivot, inner, legL, legR, armL, armR, headG, shadow, diary };
}

/* ---------- дневник и учительский стол (интро-сцена) ---------- */
function buildDiaryMesh() {
  if (!buildDiaryMesh.tex) {
    buildDiaryMesh.tex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#1d5c3f'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#d9b64a'; g.lineWidth = 6; g.strokeRect(8, 8, 112, 112);
      g.fillStyle = '#d9b64a'; g.font = 'bold 26px Arial'; g.textAlign = 'center';
      g.fillText('ДНЕВНИК', 64, 58);
      g.font = 'bold 18px Arial'; g.fillText('МЭЛА', 64, 86);
    });
    buildDiaryMesh.mats = [M('#14523a'), M('#14523a'), M('#14523a'), M('#f4f0dc'), MT(buildDiaryMesh.tex), M('#14523a')];
  }
  return new THREE.Mesh(GBox(0.3, 0.07, 0.4), buildDiaryMesh.mats);
}
function buildTeacherDesk() {
  const g = new THREE.Group();
  put(g, box(2.0, 0.1, 1.0, '#8a5a33'), 0, 1.02, 0);
  put(g, box(1.4, 0.02, 0.66, '#2e6b46'), 0, 1.08, 0);
  for (const dx of [-0.72, 0.72]) {
    put(g, box(0.5, 0.92, 0.85, '#7a4e2b'), dx, 0.48, 0);
    put(g, box(0.34, 0.05, 0.05, '#e0b83e'), dx, 0.62, 0.45);
    put(g, box(0.34, 0.05, 0.05, '#e0b83e'), dx, 0.34, 0.45);
  }
  put(g, box(0.42, 0.05, 0.3, '#a02020'), -0.34, 1.1, 0.08).rotation.y = 0.3; // классный журнал
  const diary = put(g, buildDiaryMesh(), 0.34, 1.13, 0.02);
  diary.rotation.set(-Math.PI / 2, 0, 0.2);
  return { group: g, diary };
}
/* Класс живёт внутри нулевого сегмента коридора (z от -11.8 до -2.6): доска на торцевой стене,
   парты, учительский стол и перегородка с широким дверным проёмом в коридор.
   FIX: раньше класс дублировал пол/потолок коридора (z-fighting потолка), табличка «ВЫХОД» висела
   в воздухе, а настенный декор коридора генерировался прямо внутри класса. */
const CLASS_Z0 = -2.6, CLASS_Z1 = -11.8;
const DOOR_HALF = 2.6, DOOR_TOP = 4.6, PART_T = 0.2;
const GRANNY_INTRO_X = -1.75;
function buildClassroom() {
  const g = new THREE.Group();

  // торцевая стена с доской
  put(g, tplane(WALL_X * 2 + 0.4, WALL_H, wallTex), 0, WALL_H / 2, CLASS_Z1);
  put(g, box(5.0, 2.6, 0.12, '#5d4634'), 0, 2.7, CLASS_Z1 + 0.06);
  put(g, tplane(4.7, 2.3, boardTex), 0, 2.7, CLASS_Z1 + 0.14);
  put(g, box(5.0, 0.08, 0.18, '#5d4634'), 0, 1.38, CLASS_Z1 + 0.2);

  // перегородка класс/коридор с проёмом (цвета повторяют текстуру стены)
  const sideW = WALL_X - DOOR_HALF;
  for (const s of [-1, 1]) {
    const px = s * (DOOR_HALF + sideW / 2);
    put(g, box(sideW, WALL_H, PART_T, '#f0ecd9'), px, WALL_H / 2, CLASS_Z0);
    put(g, box(sideW, 2.09, PART_T + 0.02, '#a9c98c'), px, 0.36 + 2.09 / 2, CLASS_Z0);
    put(g, box(sideW, 0.16, PART_T + 0.03, '#6f9459'), px, 2.45, CLASS_Z0);
    put(g, box(sideW, 0.36, PART_T + 0.04, '#5c4633'), px, 0.18, CLASS_Z0);
    put(g, box(0.14, DOOR_TOP, PART_T + 0.06, '#6d4c2f'), s * (DOOR_HALF + 0.07), DOOR_TOP / 2, CLASS_Z0);
  }
  put(g, box(DOOR_HALF * 2 + 0.28, WALL_H - DOOR_TOP, PART_T, '#f0ecd9'), 0, (WALL_H + DOOR_TOP) / 2, CLASS_Z0);
  put(g, box(DOOR_HALF * 2 + 0.28, 0.14, PART_T + 0.06, '#6d4c2f'), 0, DOOR_TOP + 0.07, CLASS_Z0);

  // табличка «ВЫХОД» над проёмом, смотрит внутрь класса
  const sign = put(g, new THREE.Mesh(GPlane(1.3, 0.45), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 96, (c) => {
      c.fillStyle = '#2e7d32'; c.fillRect(0, 0, 256, 96);
      c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(6, 6, 244, 84);
      c.fillStyle = '#ffffff'; c.font = 'bold 52px Arial'; c.textAlign = 'center';
      c.fillText('ВЫХОД', 128, 66);
    })
  })), 0, DOOR_TOP + 0.5, CLASS_Z0 - PART_T / 2 - 0.01);
  sign.rotation.y = Math.PI;

  // парты: вынесены к стенам, чтобы учительница в интро пробегала между ними, а не сквозь
  for (const dx of [-3.2, 3.2]) {
    for (const dz of [-4.9, -7.3]) {
      const d = put(g, buildDeskMesh(), dx, 0, dz);
      d.scale.setScalar(0.92);
      d.rotation.y = Math.PI;
    }
  }
  const td = buildTeacherDesk();
  put(g, td.group, 0, 0, -9.7);

  finalizeStatic(g);
  return { group: g, diary: td.diary };
}

/* ---------- персонаж: учительница ---------- */
function buildGranny() {
  const root = new THREE.Group();
  const inner = new THREE.Group(); root.add(inner);
  const DRESS = '#566273', SKIN = '#a9abb2', HAIR = '#ececec';

  put(inner, cyl(0.38, 0.68, 1.2, 12, DRESS), 0, 0.6, 0);          // юбка
  put(inner, box(0.6, 0.44, 0.34, DRESS), 0, 1.38, 0);             // торс
  put(inner, box(0.5, 0.1, 0.36, '#f2efe4'), 0, 1.56, 0);          // воротник

  const armParts = [[0.16, 0.52, 0.18, DRESS, -0.22], [0.14, 0.15, 0.14, SKIN, -0.54]];
  const armL = limb(inner, -0.38, 1.5, armParts), armR = limb(inner, 0.38, 1.5, armParts);

  put(armR, cyl(0.035, 0.035, 1.05, 8, '#c89b5a'), 0, -0.6, 0.25).rotation.x = Math.PI / 3.2; // указка

  const headG = put(inner, new THREE.Group(), 0, 1.86, 0);
  const faceMat = new THREE.MeshLambertMaterial({ map: texGranny });
  headG.add(new THREE.Mesh(GBox(0.58, 0.6, 0.56), [M(SKIN), M(SKIN), M(HAIR), M(SKIN), faceMat, M(HAIR)]));
  put(headG, box(0.62, 0.12, 0.6, HAIR), 0, 0.3, 0);
  put(headG, sph(0.17, 10, 10, HAIR), 0, 0.3, -0.28);              // пучок

  for (const fx of [-0.18, 0.18]) put(inner, box(0.2, 0.14, 0.32, '#2e2e33'), fx, 0.07, 0.05);

  const shadow = shadowDisc(root, 0.6, SHADOW_MAT_CHAR);

  root.scale.setScalar(1.1);
  return { root, inner, armL, armR, headG, shadow };
}

/* ---------- препятствия ---------- */
const DESK_TOP_Y = 1.045; // верх столешницы: 1.0 + 0.09 / 2 (объявлено ДО OB_DEFS — иначе TDZ)
/* Хитбоксы совпадают с реальными габаритами мешей:
   парта — крышка 1.5 × 0.78 + стул сзади (футпринт по z ≈ -0.88..0.64), шкаф 1.5 × 0.75, дверь-рама 1.48 × подставки 0.9,
   стеллаж 1.5 × 0.7, тележка 1.0 × 0.9 (верх ровно 1.0), табличка 0.56 × 0.5 (верх 0.8).
   FIX: у парты y1 был 1.30 при высоте столешницы 1.045 — Мэл «стоял» на 25 см выше крышки. */
const OB_DEFS = {
  desk:   { hw: 0.72, hz: 0.90, y0: 0,    y1: DESK_TOP_Y, platform: true },
  // башня = та же парта + стул сверху: футпринт как у парты, верх спинки стула ≈ 2.2 — с пола не перепрыгнуть
  tower:  { hw: 0.72, hz: 0.90, y0: 0,    y1: 2.20, platform: true },
  banner: { hw: 1.02, hz: 0.18, y0: 1.05, y1: 2.95, platform: false }, // под ним пролезаем (низ полотна 1.3)
  locker: { hw: 0.72, hz: 0.40, y0: 0,    y1: 2.70, platform: true },
  door:   { hw: 0.74, hz: 0.30, y0: 0,    y1: 2.55, platform: false },
  shelf:  { hw: 0.72, hz: 0.36, y0: 0,    y1: 2.40, platform: true },  // книжный стеллаж — стена
  cart:   { hw: 0.50, hz: 0.50, y0: 0,    y1: 1.00, platform: true },  // тележка уборщицы — как парта, но короче
  sign:   { hw: 0.30, hz: 0.28, y0: 0,    y1: 0.82, platform: false }  // «мокрый пол» — низкая, перепрыгнуть/обойти
};
/* Стул: центр сиденья в local (0,0), ножки стоят на y=0, верх спинки y=1.15 */
function buildChairMesh() {
  const g = new THREE.Group();
  put(g, box(0.6, 0.08, 0.52, '#b98450'), 0, 0.52, 0);
  put(g, box(0.6, 0.6, 0.07, '#b98450'), 0, 0.85, -0.24);
  for (const [lx, lz] of [[-0.22, 0.12], [0.22, 0.12], [-0.22, -0.12], [0.22, -0.12]])
    put(g, box(0.05, 0.52, 0.05, '#3c4148'), lx, 0.26, lz);
  return g;
}
function buildDeskMesh() {
  const g = new THREE.Group();
  put(g, box(1.5, 0.09, 0.78, '#a9713c'), 0, 1.0, 0.25);
  put(g, box(0.7, 0.06, 0.7, '#8a5a30'), -0.3, 1.06, 0.25);
  for (const [lx, lz] of [[-0.62, -0.02], [0.62, -0.02], [-0.62, 0.55], [0.62, 0.55]])
    put(g, box(0.07, 1.0, 0.07, '#3c4148'), lx, 0.5, lz - 0.05);
  put(g, buildChairMesh(), 0, 0, -0.62);
  return g;
}
/* Тележка уборщицы: плоский верх ровно на y = 1.0 (на неё можно запрыгнуть) */
function buildCartMesh() {
  const g = new THREE.Group();
  put(g, box(1.0, 0.5, 0.9, '#8d98a4'), 0, 0.75, 0);
  put(g, box(1.04, 0.05, 0.94, '#5a636e'), 0, 0.96, 0);
  put(g, box(0.96, 0.04, 0.86, '#6b7580'), 0, 0.22, 0);
  for (const [px, pz] of [[-0.46, -0.41], [0.46, -0.41], [-0.46, 0.41], [0.46, 0.41]]) {
    put(g, box(0.05, 0.5, 0.05, '#5a636e'), px, 0.25, pz);
    put(g, box(0.1, 0.1, 0.1, '#2a2d33'), px, 0.05, pz);
  }
  put(g, cyl(0.15, 0.12, 0.26, 8, '#e0b83e'), 0.2, 0.37, 0.1);   // ведро
  put(g, box(0.34, 0.24, 0.34, '#3b3f47'), -0.24, 0.36, -0.1);   // мешок
  return g;
}
function buildObstacle(type) {
  const g = new THREE.Group();
  const def = OB_DEFS[type];
  if (type === 'desk') {
    g.add(buildDeskMesh());
  } else if (type === 'tower') {
    // Парта + стул, поставленный ножками ровно на столешницу.
    g.add(buildDeskMesh());
    put(g, buildChairMesh(), 0.3, DESK_TOP_Y, 0.25); // x=0.3 — ножки стоят на ровной части крышки, мимо выступа-откидушки
  } else if (type === 'banner') {
    // FIX: раньше единственная подставка стояла по центру, а стойки по краям «висели» в воздухе
    for (const px of [-0.95, 0.95]) {
      put(g, cyl(0.055, 0.055, 2.95, 8, '#5a636e'), px, 1.47, 0);
      put(g, box(0.42, 0.07, 0.8, '#5a636e'), px, 0.035, 0);
    }
    put(g, new THREE.Mesh(GBox(2.0, 1.1, 0.09), MT(pick(bannerTexes))), 0, 1.85, 0);
    put(g, box(2.1, 0.06, 0.06, '#3f4750'), 0, 2.43, 0);
  } else if (type === 'locker') {
    put(g, new THREE.Mesh(GBox(1.5, 2.7, 0.75), LOCKER_MATS_BACK), 0, 1.35, 0);
    put(g, box(1.56, 0.12, 0.8, '#4d5762'), 0, 0.06, 0);
  } else if (type === 'shelf') {
    put(g, new THREE.Mesh(GBox(1.5, 2.4, 0.7), SHELF_MATS), 0, 1.2, 0);
    put(g, box(1.56, 0.1, 0.76, '#4e3521'), 0, 0.05, 0);
    put(g, box(1.56, 0.06, 0.76, '#4e3521'), 0, 2.43, 0);
  } else if (type === 'cart') {
    g.add(buildCartMesh());
  } else if (type === 'sign') {
    // А-образная табличка: две наклонные створки, текст обращён к игроку (грань -z) и назад (+z)
    put(g, new THREE.Mesh(GBox(0.56, 0.84, 0.04), SIGN_MATS_BACK), 0, 0.4, -0.13).rotation.x = 0.3;
    put(g, new THREE.Mesh(GBox(0.56, 0.84, 0.04), SIGN_MATS_FRONT), 0, 0.4, 0.13).rotation.x = -0.3;
    put(g, box(0.58, 0.05, 0.08, '#c9a020'), 0, 0.8, 0);
  } else if (type === 'door') {
    // FIX: дверь-«стенд»: полотно в раме на двух устойчивых подставках вдоль движения с раскосами.
    // Раньше под тонким полотном торчали «колёса» спереди и сзади, выглядевшие как повёрнутые на 90° ножки.
    for (const s of [-1, 1]) {
      put(g, box(0.12, 2.5, 0.16, '#6d4c2f'), s * 0.66, 1.25, 0);
      put(g, box(0.16, 0.08, 0.9, '#4e3521'), s * 0.66, 0.04, 0);
      for (const dz of [-1, 1]) put(g, box(0.06, 0.58, 0.06, '#4e3521'), s * 0.66, 0.29, dz * 0.175).rotation.x = dz * 0.65;
    }
    put(g, box(1.48, 0.14, 0.16, '#6d4c2f'), 0, 2.43, 0);
    put(g, box(1.2, 2.32, 0.07, '#8a5a33'), 0, 1.2, 0);
    put(g, box(0.46, 0.62, 0.03, '#cfe6ee'), 0, 1.85, -0.045);
    put(g, box(0.5, 0.14, 0.02, '#e8e2c8'), 0, 1.42, -0.045);
    put(g, sph(0.06, 8, 8, '#e0b83e'), 0.42, 1.15, -0.08);
  }
  shadowDisc(g, def.hw + 0.25, SHADOW_MAT_OBS);
  return finalizeStatic(g);
}
const obstaclePool = { desk: [], tower: [], banner: [], locker: [], door: [], shelf: [], cart: [], sign: [] };
const activeObstacles = [];
/* rot — необязательный явный поворот (ряд парт должен смотреть в одну сторону) */
function spawnObstacle(type, x, z, rot) {
  let g = obstaclePool[type].pop();
  if (!g) g = buildObstacle(type);
  g.position.set(x, 0, z);
  if (rot !== undefined) g.rotation.y = rot;
  else if (type === 'desk' || type === 'tower') g.rotation.y = Math.random() < 0.5 ? Math.PI : 0;
  else g.rotation.y = 0;
  scene.add(g);
  // хитбокс (hw, hz, y0, y1, platform) копируется из OB_DEFS
  activeObstacles.push(Object.assign({ t: type, x, z, group: g, stumbled: false }, OB_DEFS[type]));
}
function releaseObstacle(i) {
  const o = activeObstacles[i];
  scene.remove(o.group);
  obstaclePool[o.t].push(o.group);
  activeObstacles.splice(i, 1);
}
function clearObstacles(fromZ, toZ) {
  for (let i = activeObstacles.length - 1; i >= 0; i--) {
    const o = activeObstacles[i];
    if (o.z > fromZ && o.z < toZ) releaseObstacle(i);
  }
}

/* ---------- бутылки (валюта) ---------- */
const coinPool = [], activeCoins = [];
let coinMat = null;
function spawnCoin(x, y, z) {
  let s = coinPool.pop();
  if (!s) {
    if (!coinMat) {
      coinMat = new THREE.SpriteMaterial({ map: texBottle, transparent: true, alphaTest: 0.15 });
      if ('fog' in coinMat) coinMat.fog = true; // бутылки растворяются в тумане, а не выскакивают у горизонта
    }
    s = new THREE.Sprite(coinMat);
    s.scale.set(0.62, 1.4, 1);
  }
  s.position.set(x, y, z);
  s.userData.phase = Math.random() * Math.PI * 2;
  s.visible = true;
  scene.add(s);
  activeCoins.push({ sprite: s, x, y, z });
}
function releaseCoin(i) {
  const c = activeCoins[i];
  scene.remove(c.sprite);
  coinPool.push(c.sprite);
  activeCoins.splice(i, 1);
}

/* ---------- частицы ---------- */
const particles = [];
function initParticles() {
  const geo = GPlane(0.24, 0.24);
  for (let i = 0; i < 20; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m);
    particles.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
}
function burst(x, y, z, color, n, force) {
  let used = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.mesh.material.color.set(color);
    p.mesh.position.set(x + rand(-0.2, 0.2), y + rand(0, 0.3), z + rand(-0.2, 0.2));
    p.mesh.visible = true;
    p.life = 0.45;
    const a = rand(0, Math.PI * 2);
    p.vx = Math.cos(a) * force; p.vz = Math.sin(a) * force; p.vy = rand(1.5, 3.2);
    if (++used >= n) break;
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 6 * dt;
    const k = p.life / 0.45;
    p.mesh.material.opacity = k;
    p.mesh.scale.setScalar(0.6 + (1 - k) * 1.4);
    p.mesh.quaternion.copy(camera.quaternion);
  }
}

/* ============================================================
   РЕЖИССЁР ПАТТЕРНОВ
   ------------------------------------------------------------
   Принципы:
   • Все интервалы внутри паттерна заданы в СЕКУНДАХ полёта и переводятся в метры
     по скорости, которую игрок будет иметь, ДОБЕЖАВ до паттерна (v² = v0² + 2·a·d).
   • Окна физики (все инвариантны к скорости):
       прыжок: в воздухе JUMP_T = 0.643 с, выше порога парты (0.77) — с 0.10 по 0.54 с;
       подкат: 0.62 с; смена полосы: ~0.27 с.
   • МАРШРУТ. Каждый паттерн описывает не только препятствия, но и маршрут — где
     игрок ожидаемо находится в каждый момент (line/diag/arc/low/lead). Маршрут
     используется двумя слоями:
       — ФОН (addFillers): в полосах, не занятых маршрутом (с запасом ±0.4 с) и без
         собственных препятствий паттерна, добавляются одиночные препятствия.
         Их плотность растёт с дистанцией (DENSITY_DIST). Маршрутная полоса всегда
         остаётся проходимой, поэтому непроходимых ситуаций не возникает, но картинка
         на высокой скорости становится плотной, а ошибка полосы стоит жизни.
       — БУТЫЛКИ: маршрут больше не рисуется бутылками. Паттерн объявляет несколько
         «наградных» мест (арка над партой, под баннером, поверх ряда парт, проход в
         воротах), режиссёр выбирает одно и только если прошёл кулдаун 3.5–7 с —
         бутылки редкие и всегда стоят там, где есть за что наградить.
   • Ярусы сложности открываются по дистанции; веса смещаются к тяжёлым паттернам;
     один и тот же паттерн не повторяется подряд; после серии тяжёлых — передышка.
   ============================================================ */
const JUMP_T = 2 * JUMP_V / GRAVITY;   // время в воздухе, с
const COIN_STEP = 1.7;                 // шаг бутылок в дорожке, м
const TIER_DIFF = [0, 0.2, 0.5];       // сложность, с которой открывается ярус
const DIFF_DIST = 1000;                // метров до максимальной сложности паттернов
const DENSITY_DIST = 1500;             // метров до максимальной плотности фона
const ROUTE_MARGIN = 0.4;              // с — запас вокруг маршрута, куда фон не ставится
const BLOCKERS = ['locker', 'locker', 'door', 'tower', 'shelf']; // непроходимые «стены» одной полосы
const HOPPERS = ['desk', 'desk', 'cart'];                        // то, через что прыгают
/* фон: [тип, вес, isBlock] — веса «стен» (isBlock) дополнительно умножаются на kb в pickFiller */
const FILLERS = [
  ['desk', 3], ['sign', 2.5], ['cart', 2], ['banner', 1.5],             // проходимые
  ['locker', 2, 1], ['shelf', 1.5, 1], ['door', 1, 1], ['tower', 1, 1]  // «стены»
];

function adjLane(l) { return l === 0 ? 1 : l === 2 ? 1 : (Math.random() < 0.5 ? 0 : 2); }
function otherLanes(l) { return l === 0 ? [1, 2] : l === 1 ? [0, 2] : [0, 1]; }

/* Конструктор паттерна: время → координаты выполняет fillSpawns, здесь только логика */
function makeBuilder(v, lane, diff) {
  const b = {
    v, lane, diff, obs: [], route: [], rewards: [], len: 0, exit: lane,
    ob(type, l, time, rot) {
      b.obs.push({ t: type, x: LANES[l], l, time, rot });
      b.len = Math.max(b.len, time + 0.3); // хвост: глубина препятствия
    },
    // ряд одинаковых препятствий вплотную (шаг в МЕТРАХ); возвращает время последнего
    row(type, l, t0, n, stepM, rot) {
      for (let i = 0; i < n; i++) b.ob(type, l, t0 + i * stepM / v, rot);
      return t0 + (n - 1) * stepM / v;
    },
    tail(t) { b.len = Math.max(b.len, t); },
    /* --- маршрут: где ожидаемо находится игрок (резерв полос, бутылок не создаёт) --- */
    line(l, t0, t1) { b.route.push({ l, t0, t1 }); },
    diag(l0, l1, t0, t1) {
      b.route.push({ l: l0, t0, t1 });
      if (Math.abs(l0 - l1) === 2) b.route.push({ l: 1, t0, t1 });
      b.route.push({ l: l1, t0, t1 }); // полоса назначения — последней: после t1 она становится текущей
    },
    arc(l, time) { b.line(l, time - JUMP_T / 2 - 0.1, time + JUMP_T / 2 + 0.1); },
    low(l, time) { b.line(l, time - 0.35, time + 0.35); },
    // подводка от полосы потока к целевой полосе перед моментом t (t ≥ 0.5)
    lead(to, t) {
      if (to !== b.lane) b.diag(b.lane, to, Math.max(0, t - 0.5), t - 0.12);
      else b.line(b.lane, Math.max(0, t - 0.5), t - 0.12);
    },
    /* --- наградные места для бутылок (режиссёр выберет одно или ничего) --- */
    rArc(l, time, must) { b.rewards.push({ k: 'arc', l, time, must: !!must }); },
    rLow(l, time, must) { b.rewards.push({ k: 'low', l, time, must: !!must }); },
    rLine(l, t0, t1, y, must) { b.rewards.push({ k: 'line', l, t0, t1, y: y || 0.95, must: !!must }); },
    /* полосы, занятые маршрутом в момент t (с запасом); если маршрут «молчит» — текущая полоса */
    routeLanes(t, out) {
      out.length = 0;
      let carry = -1, carryT = -Infinity;
      for (const r of b.route) {
        if (t + ROUTE_MARGIN >= r.t0 && t - ROUTE_MARGIN <= r.t1) { if (out.indexOf(r.l) < 0) out.push(r.l); }
        else if (r.t1 < t && r.t1 >= carryT) { carryT = r.t1; carry = r.l; }
      }
      if (!out.length) out.push(carry < 0 ? b.lane : carry);
      return out;
    }
  };
  return b;
}

/* Фоновый слой: одиночные препятствия в полосах, свободных от маршрута и от препятствий паттерна.
   Гарантии: маршрутная полоса не трогается; в одной полосе между любыми двумя объектами ≥ 0.6 с
   (≥ 6.6 м даже на стартовой скорости, футпринт самого длинного объекта 1.8 м). */
function pickFiller(density) {
  const kb = 0.35 + 0.65 * density; // доля «стен» растёт с плотностью
  return weightedPick(FILLERS, e => e[2] ? e[1] * kb : e[1])[0];
}
function addFillers(b, density, breather) {
  if (density <= 0) return;
  let p = lerp(0.18, 0.55, density);
  if (breather) p *= 0.5;
  const end = b.len - 0.05, busy = [];
  for (let t = 0.25; t <= end; t += 0.8) {
    b.routeLanes(t, busy);
    for (let l = 0; l < 3; l++) {
      if (busy.indexOf(l) >= 0 || Math.random() > p) continue;
      const tt = t + rand(-0.08, 0.08);
      let clash = false;
      for (const o of b.obs) if (o.l === l && Math.abs(o.time - tt) < 0.6) { clash = true; break; }
      if (clash) continue;
      b.obs.push({ t: pickFiller(density), x: LANES[l], l, time: tt });
    }
  }
}

const PATTERNS = [
  /* ---- ярус 0: одиночные действия ---- */
  { id: 'hop', tier: 0, w: 3, heat: 1, build(b) {
    b.ob(pick(HOPPERS), b.lane, 0); b.arc(b.lane, 0); b.rArc(b.lane, 0);
  } },
  { id: 'slide', tier: 0, w: 3, heat: 1, build(b) {
    b.ob('banner', b.lane, 0); b.low(b.lane, 0); b.rLow(b.lane, 0);
  } },
  { id: 'sidestep', tier: 0, w: 3, heat: 1, build(b) {
    const to = adjLane(b.lane);
    b.ob(pick(BLOCKERS), b.lane, 0.55);
    b.lead(to, 0.55); b.line(to, 0.43, 0.95);
    b.rLine(to, 0.6, 0.95);
    b.exit = to;
  } },
  { id: 'signs', tier: 0, w: 2, heat: 1, build(b) { // две таблички «мокрый пол»: перепрыгнуть или обойти
    const s = lerp(0.85, 0.72, b.diff);
    b.ob('sign', b.lane, 0); b.ob('sign', b.lane, s);
    b.arc(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s);
  } },
  { id: 'river', tier: 0, w: 2, heat: 0, build(b) { // передышка: дорожка бутылок с плавной сменой полосы
    const to = adjLane(b.lane);
    b.line(b.lane, 0, 0.65); b.diag(b.lane, to, 0.65, 1.0); b.line(to, 1.0, 1.8);
    b.rLine(to, 1.1, 1.8, 0.95, true);
    b.tail(1.8); b.exit = to;
  } },
  { id: 'gate', tier: 0, w: 3, heat: 2, build(b) { // стена из двух блоков, один проход
    const free = Math.random() < 0.6 ? adjLane(b.lane) : b.lane;
    const type = pick(BLOCKERS);
    for (const l of otherLanes(free)) b.ob(type, l, 0.6);
    b.lead(free, 0.6); b.line(free, 0.48, 1.05);
    b.rLine(free, 0.65, 1.05);
    b.exit = free;
  } },

  /* ---- ярус 1: связки из двух действий ---- */
  { id: 'hophop', tier: 1, w: 3, heat: 2, build(b) {
    const s = lerp(0.92, 0.8, b.diff);
    b.ob(pick(HOPPERS), b.lane, 0); b.ob(pick(HOPPERS), b.lane, s);
    b.arc(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s);
  } },
  { id: 'hopslide', tier: 1, w: 3, heat: 2, build(b) {
    const s = lerp(0.9, 0.76, b.diff);
    b.ob(pick(HOPPERS), b.lane, 0); b.ob('banner', b.lane, s);
    b.arc(b.lane, 0); b.low(b.lane, s); b.rArc(b.lane, 0);
  } },
  { id: 'slidehop', tier: 1, w: 3, heat: 2, build(b) {
    const s = lerp(0.9, 0.78, b.diff);
    b.ob('banner', b.lane, 0); b.ob(pick(HOPPERS), b.lane, s);
    b.low(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s);
  } },
  { id: 'deskrow', tier: 1, w: 2, heat: 2, build(b) { // ряд парт во всю ширину — прыгать обязательно
    const rot = Math.random() < 0.5 ? Math.PI : 0;
    for (let l = 0; l < 3; l++) b.ob('desk', l, 0.5, rot);
    b.arc(b.lane, 0.5); b.rArc(b.lane, 0.5);
  } },
  { id: 'bannerrow', tier: 1, w: 2, heat: 2, build(b) { // ряд баннеров — подкат обязателен
    for (let l = 0; l < 3; l++) b.ob('banner', l, 0.5);
    b.low(b.lane, 0.5); b.rLow(b.lane, 0.5);
  } },
  { id: 'choice', tier: 1, w: 2, heat: 2, build(b) { // три полосы: прыжок / подкат / стена — выбор за игроком
    const others = otherLanes(b.lane);
    if (Math.random() < 0.5) others.reverse();
    b.ob(pick(HOPPERS), b.lane, 0.5);
    b.ob('banner', others[0], 0.5);
    b.ob(pick(BLOCKERS), others[1], 0.5);
    b.arc(b.lane, 0.5); b.rArc(b.lane, 0.5);
  } },
  { id: 'weave', tier: 1, w: 3, heat: 2, build(b) { // слалом: блок в текущей полосе → шаг в соседнюю → снова блок
    const steps = b.diff > 0.55 ? 3 : 2, s = lerp(1.1, 0.8, b.diff);
    let cur = b.lane;
    for (let i = 0; i < steps; i++) {
      const t = 0.55 + i * s, next = adjLane(cur);
      b.ob(pick(BLOCKERS), cur, t);
      b.diag(cur, next, t - 0.45, t - 0.12);
      const tEnd = i === steps - 1 ? t + 0.45 : t + s - 0.55;
      b.line(next, t - 0.12, tEnd);
      if (i === steps - 1) b.rLine(next, t + 0.05, tEnd);
      cur = next;
    }
    b.exit = cur;
  } },
  { id: 'zigjump', tier: 1, w: 2, heat: 2, build(b) { // парта, парта в соседней, снова парта: два прыжка или объезд
    const s = lerp(1.0, 0.85, b.diff), side = adjLane(b.lane);
    b.ob('desk', b.lane, 0); b.ob('desk', side, s); b.ob('desk', b.lane, 2 * s);
    b.arc(b.lane, 0); b.line(b.lane, 0.3, 2 * s - 0.3); b.arc(b.lane, 2 * s);
    b.rArc(b.lane, 2 * s);
  } },
  { id: 'runway', tier: 1, w: 2, heat: 2, build(b) { // ряд парт вплотную: на малой скорости бежим по крышкам, на большой — перелетаем
    const n = clamp(Math.round(b.v * 0.6 / 1.75), 3, 7);
    const tEnd = b.row('desk', b.lane, 0.15, n, 1.75, 0);
    b.arc(b.lane, 0.15); b.line(b.lane, 0.15, tEnd + 0.4);
    b.rLine(b.lane, 0.15, tEnd, DESK_TOP_Y + 0.95, true);
    b.tail(tEnd + 0.4);
  } },
  { id: 'split', tier: 1, w: 2, heat: 2, build(b) { // середина перекрыта надолго, по бокам — табличка и парта
    const side = b.lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : b.lane;
    const type = pick(BLOCKERS);
    b.ob(type, 1, 0.6); b.ob(type, 1, 1.3);
    b.ob('sign', side, 1.0); b.ob(pick(HOPPERS), 2 - side, 0.95);
    b.lead(side, 0.6); b.line(side, 0.48, 1.6); b.arc(side, 1.0);
    b.rArc(side, 1.0);
    b.exit = side;
  } },

  /* ---- ярус 2: серии ---- */
  { id: 'gauntlet', tier: 2, w: 3, heat: 3, build(b) { // прыжок-подкат-прыжок-подкат в одной полосе
    const s = lerp(0.95, 0.8, b.diff);
    let jump = Math.random() < 0.5, rewarded = false;
    for (let i = 0; i < 4; i++, jump = !jump) {
      if (jump) {
        b.ob(pick(HOPPERS), b.lane, i * s); b.arc(b.lane, i * s);
        if (!rewarded) { b.rArc(b.lane, i * s); rewarded = true; }
      } else { b.ob('banner', b.lane, i * s); b.low(b.lane, i * s); }
    }
  } },
  { id: 'tunnel', tier: 2, w: 2, heat: 3, build(b) { // ряд баннеров, затем ряд парт: подкат → прыжок всем строем
    const s = lerp(1.1, 0.9, b.diff), rot = Math.random() < 0.5 ? Math.PI : 0;
    for (let l = 0; l < 3; l++) { b.ob('banner', l, 0.5); b.ob('desk', l, 0.5 + s, rot); }
    b.low(b.lane, 0.5); b.arc(b.lane, 0.5 + s); b.rArc(b.lane, 0.5 + s);
  } },
  { id: 'doublegate', tier: 2, w: 3, heat: 3, build(b) { // две стены подряд с проходами в соседних полосах
    const s = lerp(1.15, 0.85, b.diff);
    const f1 = adjLane(b.lane), f2 = adjLane(f1), type = pick(BLOCKERS);
    for (const l of otherLanes(f1)) b.ob(type, l, 0.6);
    for (const l of otherLanes(f2)) b.ob(type, l, 0.6 + s);
    b.lead(f1, 0.6); b.line(f1, 0.48, 0.6 + s - 0.45);
    b.diag(f1, f2, 0.6 + s - 0.45, 0.6 + s - 0.12); b.line(f2, 0.6 + s - 0.12, 0.6 + s + 0.45);
    b.rLine(f2, 0.6 + s + 0.05, 0.6 + s + 0.45);
    b.exit = f2;
  } },
  { id: 'hopgate', tier: 2, w: 2, heat: 3, build(b) { // прыжок через парту прямо в проход между шкафами
    const s = lerp(1.0, 0.85, b.diff), type = pick(BLOCKERS);
    b.ob(pick(HOPPERS), b.lane, 0); b.arc(b.lane, 0);
    for (const l of otherLanes(b.lane)) b.ob(type, l, s);
    b.line(b.lane, 0.3, s + 0.4);
    b.rArc(b.lane, 0);
  } },
  { id: 'lanehop', tier: 2, w: 3, heat: 3, build(b) { // прыжок → в воздухе смена полосы (за партой стена) → ещё прыжок
    const to = adjLane(b.lane), s = lerp(0.95, 0.8, b.diff);
    b.ob(pick(HOPPERS), b.lane, 0); b.ob(pick(BLOCKERS), b.lane, s); b.ob(pick(HOPPERS), to, s + 0.55);
    b.arc(b.lane, 0); b.diag(b.lane, to, 0.35, s - 0.2); b.arc(to, s + 0.55);
    b.rArc(to, s + 0.55);
    b.exit = to;
  } },
  { id: 'longgate', tier: 2, w: 2, heat: 3, build(b) { // длинный коридор из стен, внутри — табличка
    const free = Math.random() < 0.6 ? adjLane(b.lane) : b.lane, type = pick(BLOCKERS), s = 0.75;
    for (const l of otherLanes(free)) { b.ob(type, l, 0.6); b.ob(type, l, 0.6 + s); }
    b.ob('sign', free, 0.6 + s * 0.5);
    b.lead(free, 0.6); b.line(free, 0.48, 0.6 + s + 0.4); b.arc(free, 0.6 + s * 0.5);
    b.rArc(free, 0.6 + s * 0.5);
    b.exit = free;
  } },
  { id: 'sprint', tier: 2, w: 3, heat: 3, build(b) { // пять быстрых действий подряд в одной полосе
    const s = lerp(0.95, 0.8, b.diff);
    const seq = pick([
      ['desk', 'sign', 'banner', 'cart', 'sign'],
      ['sign', 'banner', 'desk', 'sign', 'banner'],
      ['cart', 'sign', 'desk', 'banner', 'desk']
    ]);
    let last = -1;
    for (let i = 0; i < seq.length; i++) {
      const t = i * s;
      b.ob(seq[i], b.lane, t);
      if (seq[i] === 'banner') b.low(b.lane, t);
      else { b.arc(b.lane, t); last = t; }
    }
    if (last >= 0) b.rArc(b.lane, last);
  } }
];

const DIRECTOR0 = { lane: 1, count: 0, lastId: '', heat: 0, coinCd: 0 };
const Director = Object.assign({}, DIRECTOR0);
function resetDirector() { Object.assign(Director, DIRECTOR0); }
/* скорость, с которой игрок добежит до точки в dist метрах впереди (равноускоренное движение) */
function predictSpeed(dist) {
  return Math.min(MAX_SPEED, Math.sqrt(G.speed * G.speed + 2 * ACCEL * Math.max(0, dist)));
}
function patternById(id) { for (const p of PATTERNS) if (p.id === id) return p; return PATTERNS[0]; }
function choosePattern(diff) {
  // обучающая тройка в начале каждого забега: прыжок → подкат → объезд
  if (Director.count === 0) return patternById('hop');
  if (Director.count === 1) return patternById('slide');
  if (Director.count === 2) return patternById('sidestep');
  const breather = Director.heat >= lerp(3, 6, diff);
  const pool = [];
  for (const p of PATTERNS) {
    if (p.id === Director.lastId || diff < TIER_DIFF[p.tier]) continue;
    if (breather && p.heat > 1) continue;
    let w = p.w * (1 + diff * p.tier * 0.9);
    if (p.tier === 0 && p.heat > 0) w *= 1 - diff * 0.55;
    pool.push({ p, w });
  }
  if (!pool.length) return patternById('river');
  return weightedPick(pool, e => e.w).p;
}

/* ---------- состояние игры ---------- */
const G = {
  state: 'loading', // loading | menu | intro | run | paused | over
  speed: BASE_SPEED, dist: 0, runTime: 0, bottles: 0, bankedBottles: 0,
  nextZ: 0, camBlend: 0, shake: 0,
  overT: 0, overShown: false, reviveUsed: false,
  hintT: 0
};
const player = {
  node: null, lane: 1, x: 0, y: 0, z: 0, vy: 0, grounded: true,
  groundY: 0,
  rolling: 0, invuln: 0, runPhase: 0, squash: 0
};
const granny = {
  node: null, zOff: -9.2, targetZOff: -9.2, closeT: 0, phase: 0, catchMode: false
};
let deskScene = null;
const intro = { t: 0, faceY: Math.PI, grab: false, alert: false, hop: false, turn: false, runStartZ: 0 };
const YELLS = ['СТОЙ, ХУЛИГАН!', 'ПОПАЛСЯ!', 'БЕГЛЕЦ!', 'В КЛАСС ВЕРНИСЬ!', 'А Я ПРЕДУПРЕЖДАЛА!', 'ДОМОЙ!'];

/* ---------- действия игрока ---------- */
function move(dir) {
  if (G.state !== 'run') return;
  const nl = clamp(player.lane + dir, 0, 2);
  if (nl !== player.lane) {
    player.lane = nl;
    Sound.lane();
  }
}
function jump() {
  if (G.state !== 'run') return;
  if (player.grounded) {
    player.vy = JUMP_V;
    player.grounded = false;
    player.rolling = 0;
    player.node.pivot.rotation.x = 0;
    Sound.jump();
  }
}
function roll() {
  if (G.state !== 'run') return;
  if (player.grounded && player.rolling <= 0) {
    player.rolling = ROLL_TIME;
    Sound.roll();
    burst(player.x, player.groundY + 0.1, player.z, '#b8a58c', 4, 1.6);
  } else if (!player.grounded) {
    player.vy = Math.min(player.vy, -4);
    player.rolling = ROLL_TIME;
  }
}
function nearestLane(x) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < 3; i++) { const d = Math.abs(x - LANES[i]); if (d < bd) { bd = d; best = i; } }
  return best;
}

/* ---------- спавн ---------- */
function spawnReward(r, z0, v) {
  if (r.k === 'arc') {
    // арка по реальной параболе прыжка, апекс над центром препятствия
    for (let i = 0; i < 5; i++) {
      const tt = i / 4 * JUMP_T;
      spawnCoin(LANES[r.l], 0.95 + JUMP_V * tt - 0.5 * GRAVITY * tt * tt, z0 + (r.time - JUMP_T / 2 + tt) * v);
    }
  } else if (r.k === 'low') {
    for (let i = -1; i <= 1; i++) spawnCoin(LANES[r.l], 0.6, z0 + (r.time + i * 0.2) * v);
  } else {
    const n = clamp(Math.round((r.t1 - r.t0) * v / COIN_STEP), 1, 8);
    for (let i = 0; i <= n; i++) spawnCoin(LANES[r.l], r.y, z0 + (r.t0 + (r.t1 - r.t0) * i / n) * v);
  }
}
function fillSpawns() {
  while (G.nextZ < player.z + SPAWN_AHEAD) {
    const ahead = G.nextZ - player.z;
    const v = predictSpeed(ahead);                          // скорость в момент прибытия
    const distAt = G.dist + ahead;
    const diff = clamp(distAt / DIFF_DIST, 0, 1);           // сложность в момент прибытия
    const density = clamp((distAt - 140) / DENSITY_DIST, 0, 1);
    const p = choosePattern(diff);
    const b = makeBuilder(v, Director.lane, diff);
    p.build(b);
    // после последнего маршрутного события игрок остаётся в полосе выхода
    b.route.push({ l: b.exit, t0: b.len, t1: b.len + 2 });
    if (Director.count >= 3) addFillers(b, density, p.heat <= 1);

    const z0 = G.nextZ;
    for (const o of b.obs) spawnObstacle(o.t, o.x, z0 + o.time * v, o.rot);

    // пауза на реакцию перед следующим паттерном (после тяжёлой серии — длиннее)
    const gap = lerp(1.0, 0.5, diff) + (p.heat >= 3 ? 0.25 : 0);
    const span = b.len + gap;

    // бутылки: одно наградное место на паттерн и только по кулдауну
    let must = null;
    for (const r of b.rewards) if (r.must) { must = r; break; }
    if (must || (Director.coinCd <= 0 && b.rewards.length)) {
      spawnReward(must || pick(b.rewards), z0, v);
      Director.coinCd = rand(3.5, 7);
    } else if (Director.coinCd <= 0 && gap >= 0.9 && Math.random() < 0.3) {
      spawnReward({ k: 'line', l: b.exit, t0: b.len + 0.25, t1: b.len + gap - 0.45, y: 0.95 }, z0, v);
      Director.coinCd = rand(3.5, 7);
    }
    Director.coinCd -= span;

    G.nextZ = z0 + span * v;
    Director.lane = b.exit;
    Director.lastId = p.id;
    Director.count++;
    Director.heat = p.heat <= 1 ? 0 : Director.heat + p.heat;
  }
}

/* ---------- столкновения ---------- */
/* пересечение хитбокса игрока с препятствием по горизонтали (общее для столкновений и «пола») */
const hitsXZ = o => Math.abs(player.z - o.z) <= o.hz + HIT_Z && Math.abs(player.x - o.x) <= o.hw + HIT_W;
function updateCollisions() {
  const rolling = player.rolling > 0;
  const py1 = player.y + (rolling ? 0.80 : 1.86);
  for (let i = activeObstacles.length - 1; i >= 0; i--) {
    const o = activeObstacles[i];
    if (o.z < player.z - DESPAWN_BEHIND) { releaseObstacle(i); continue; }
    if (!hitsXZ(o)) continue;

    // запрыгнули сверху — пропускаем (тот же допуск, что и у getGroundY)
    if (player.y >= o.y1 - PLATFORM_TOL) continue;
    // проскользнули снизу (подкат)
    if (py1 <= o.y0 + 0.04) continue;

    if (player.invuln > 0 || o.stumbled) continue;

    const ox = (o.hw + HIT_W) - Math.abs(player.x - o.x);
    const changing = Math.abs(player.x - LANES[player.lane]) > 0.6;
    if (ox < 0.5 && changing) stumble(o);
    else caught();
    return;
  }
}
function getGroundY() {
  let currentGround = 0;
  for (const o of activeObstacles) {
    if (!o.platform || !hitsXZ(o)) continue;
    if (player.y >= o.y1 - PLATFORM_TOL) currentGround = Math.max(currentGround, o.y1);
  }
  return currentGround;
}
function stumble(o) {
  if (granny.closeT > 1.2) { caught(); return; }
  o.stumbled = true;
  const movingPlusX = LANES[player.lane] > player.x;
  let nl = nearestLane(player.x);
  if (Math.abs(LANES[nl] - o.x) < o.hw + 0.35) nl = clamp(nl + (movingPlusX ? -1 : 1), 0, 2);
  player.lane = nl;
  player.invuln = 1.4;
  G.speed = Math.max(BASE_SPEED * 0.85, G.speed * 0.55);
  granny.closeT = 5;
  granny.targetZOff = -2.7;
  G.shake = Math.max(G.shake, 0.45);
  Sound.stumble(); Sound.growl();
  replayCss(UI.flash);
  setYell(pick(YELLS));
  burst(player.x, player.y + 1, player.z, '#ffd94a', 5, 2.2);
}
function caught() {
  G.state = 'over';
  G.overT = 0; G.overShown = false;
  granny.catchMode = true;
  granny.targetZOff = -0.85;
  G.shake = 0.8;
  Sound.crash(); Sound.growl();
  replayCss(UI.flash);
  burst(player.x, player.y + 1.2, player.z, '#b0451f', 8, 3);
  Sdk.gameplayStop();
  const m = Math.floor(G.dist);
  const isRecord = m > save.best;
  if (isRecord) save.best = m;
  // FIX: после возрождения бутылки начислялись повторно — теперь зачисляем только новые
  save.bottles += G.bottles - G.bankedBottles;
  G.bankedBottles = G.bottles;
  persistSave();
  if (UI.over) UI.over.dataset.record = isRecord ? '1' : '0';
}

/* ---------- показ экранов ---------- */
function updateMenuStats() {
  if (UI.menuBest) UI.menuBest.textContent = save.best;
  if (UI.menuBottles) UI.menuBottles.textContent = save.bottles;
}
function showMenu() {
  setupMenuScene();
  screens('menu');
  updateMenuStats();
  Sdk.gameplayStop();
}
/* дневник в руке Мэла (true) или на учительском столе (false) */
function diaryTaken(on) { deskScene.diary.visible = !on; player.node.diary.visible = on; }
/* сброс позы Мэла (после поимки/рестарта): вертикально, без крена, видимый */
function resetPose() {
  const n = player.node;
  n.pivot.rotation.x = 0;
  n.inner.rotation.set(0, 0, 0);
  n.root.rotation.set(0, 0, 0);
  n.inner.visible = true;
}
function resetRun() {
  for (let i = activeObstacles.length - 1; i >= 0; i--) releaseObstacle(i);
  for (let i = activeCoins.length - 1; i >= 0; i--) releaseCoin(i);
  segments.forEach((seg, i) => { seg.position.z = i * SEG_LEN; randomizeSegmentDecor(seg, i === 0 ? CLASS_Z0 + 3 : undefined); });
  player.lane = 1; player.x = 0; player.y = 0; player.vy = 0; player.z = 0; player.groundY = 0;
  player.grounded = true; player.rolling = 0; player.invuln = 0; player.squash = 0;
  resetPose();
  player.node.inner.scale.set(1, 1, 1);
  player.node.inner.position.y = -0.92;
  G.speed = BASE_SPEED; G.dist = 0; G.runTime = 0; G.bottles = 0; G.bankedBottles = 0;
  G.nextZ = 42; G.reviveUsed = false; G.overShown = false; G.shake = 0;
  granny.closeT = 0; granny.catchMode = false;
  if (UI.bottleNum) UI.bottleNum.textContent = '0';
  updateScoreHud(true);
  resetDirector();
  fillSpawns();
}
/* Сцена меню = класс: бабка за столом у доски, Мэл у входа */
function setupMenuScene() {
  resetRun();
  G.state = 'menu';
  G.camBlend = 0;
  camSnap = true; // FIX: камера не «пролетает» через весь коридор назад после проигрыша
  player.z = -4.6;
  player.node.root.rotation.y = Math.PI; // сразу лицом к доске, без разворота на глазах у игрока
  diaryTaken(false);
  granny.zOff = -9.2; granny.targetZOff = -9.2;
  granny.node.root.position.set(0, 0, -10.7);
  granny.node.root.rotation.y = 0;
  intro.t = 0; intro.grab = false; intro.alert = false; intro.hop = false; intro.turn = false; intro.faceY = Math.PI;
}
/* Интро: Мэл крадёт дневник с учительского стола и убегает в коридор */
function startIntro() {
  G.state = 'intro';
  G.camBlend = 0;
  intro.t = 0;
  intro.runStartZ = 0;
  screens('skipIntroBtn');
  Sound.ensure();
}
function beginRun() {
  G.state = 'run';
  intro.runStartZ = player.z;
  G.camBlend = 1;
  G.speed = BASE_SPEED;
  granny.zOff = granny.node.root.position.z - player.z;
  granny.targetZOff = -9.2;
  show(UI.skipIntroBtn, false); show(UI.hud, true);
  G.hintT = 3.2;
  if (UI.hint) UI.hint.classList.add('on');
  Sound.ensure();
  Sdk.gameplayStart();
}
function skipIntro() {
  player.z = -0.4; player.y = 0; player.vy = 0; player.grounded = true;
  intro.faceY = 0; intro.turn = true; intro.grab = true; intro.alert = true;
  diaryTaken(true);
  granny.node.root.position.set(GRANNY_INTRO_X, 0, -3.2);
  beginRun();
}
/* Быстрый рестарт без интро (после проигрыша/паузы) */
function quickRestart() {
  resetRun();
  player.z = 0;
  diaryTaken(true);
  granny.zOff = -4.5; granny.targetZOff = -9.2;
  granny.node.root.position.set(0, 0, -4.5);
  G.state = 'run';
  G.camBlend = 1;
  camSnap = true;
  screens('hud');
  G.hintT = 0; if (UI.hint) UI.hint.classList.remove('on');
  Sound.ensure();
  Sdk.gameplayStart();
}
function updateIntro(dt) {
  intro.t += dt;
  const t = intro.t;
  const n = player.node;
  if (t < 1.1) {
    player.z = lerp(-4.6, -8.3, smooth(clamp(t / 1.1, 0, 1)));
    player.runPhase += dt * 6.5;
    const s = Math.sin(player.runPhase);
    n.legL.rotation.x = s * 0.55; n.legR.rotation.x = -s * 0.55;
    n.armL.rotation.x = -s * 0.4;
    n.armR.rotation.x = damp(n.armR.rotation.x, -0.7, 4, dt);
    n.inner.position.y = -0.92 + Math.abs(Math.cos(player.runPhase)) * 0.03;
  } else if (t < 2.0) {
    n.legL.rotation.x = damp(n.legL.rotation.x, 0, 8, dt);
    n.legR.rotation.x = damp(n.legR.rotation.x, 0, 8, dt);
    n.armR.rotation.x = damp(n.armR.rotation.x, t < 1.45 ? -1.55 : -2.4, 6, dt);
    if (!intro.grab && t >= 1.3) {
      intro.grab = true;
      diaryTaken(true);
      Sound.coin();
    }
  } else {
    if (!intro.turn) { intro.turn = true; intro.faceY = 0; }
    if (!intro.hop && player.grounded) {
      player.vy = 4.4; player.grounded = false; intro.hop = true;
      Sound.jump();
    }
    player.z += 8 * dt;
    n.armR.rotation.x = damp(n.armR.rotation.x, -0.6, 5, dt);
    // FIX: Мэл бежит к выходу с анимацией ног, а не «скользит» с прямыми ногами
    player.runPhase += dt * 12;
    const s = Math.sin(player.runPhase);
    n.legL.rotation.x = s; n.legR.rotation.x = -s;
    n.armL.rotation.x = -s * 0.8;
    n.inner.position.y = -0.92 + (player.grounded ? Math.abs(Math.cos(player.runPhase)) * 0.06 : 0.02);
  }
  if (!player.grounded) {
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) { player.y = 0; player.vy = 0; player.grounded = true; player.squash = 0.18; }
  }
  if (!intro.alert && t >= 1.6) {
    intro.alert = true;
    setYell('МОЙ ДНЕВНИК!!!');
    Sound.growl();
  }
  const gn = granny.node;
  if (intro.alert) {
    gn.armL.rotation.x = damp(gn.armL.rotation.x, -2.4, 6, dt);
    gn.armR.rotation.x = damp(gn.armR.rotation.x, -2.7 + Math.sin(t * 18) * 0.25, 6, dt);
    gn.headG.rotation.x = damp(gn.headG.rotation.x, -0.12, 6, dt);
    gn.inner.position.y = Math.abs(Math.sin(t * 10)) * 0.1;
    gn.root.position.x = damp(gn.root.position.x, GRANNY_INTRO_X, 2.5, dt);
    if (t >= 2.0) gn.root.position.z += 8.2 * dt;
  } else {
    gn.armL.rotation.x = damp(gn.armL.rotation.x, -1.25, 4, dt);
    gn.armR.rotation.x = damp(gn.armR.rotation.x, -1.45, 4, dt);
    gn.headG.rotation.x = damp(gn.headG.rotation.x, 0.42, 3, dt);
    gn.inner.position.y = -0.04;
  }
  if (t >= 3.0) beginRun();
}
function pauseRun() {
  if (G.state !== 'run') return;
  G.state = 'paused';
  show(UI.pause, true);
  Sound.pauseAll();
  Sdk.gameplayStop();
}
function resumeRun() {
  if (G.state !== 'paused') return;
  G.state = 'run';
  show(UI.pause, false);
  Sound.resumeAll();
  Sdk.gameplayStart();
}
function showOverScreen() {
  G.overShown = true;
  const m = Math.floor(G.dist);
  if (UI.overScore) UI.overScore.textContent = m;
  if (UI.overBottles) UI.overBottles.textContent = G.bottles;
  if (UI.overBest) UI.overBest.textContent = save.best;
  show(UI.newRecord, UI.over && UI.over.dataset.record === '1');
  screens('over');
  show(UI.reviveBtn, !G.reviveUsed && !!Sdk.ysdk);
}
function revive() {
  G.reviveUsed = true;
  screens('hud');
  G.state = 'run';
  // FIX: зона очистки зависит от скорости — на 27 м/с 50 м это меньше двух секунд
  clearObstacles(player.z - 6, player.z + Math.max(50, G.speed * 2.6));
  player.invuln = 2.8;
  player.rolling = 0;
  // FIX: сброс «падающей» позы после поимки — раньше Мэл так и бежал наклонённым до конца забега
  resetPose();
  G.speed = Math.max(BASE_SPEED, G.speed * 0.7);
  granny.closeT = 0; granny.catchMode = false; granny.targetZOff = -9.2;
  G.shake = 0.3;
  Sdk.gameplayStart();
}

/* ---------- HUD ---------- */
let lastScore = -1;
function updateScoreHud(force) {
  const m = Math.floor(G.dist);
  if (m !== lastScore || force) {
    lastScore = m;
    if (UI.score) UI.score.innerHTML = m + ' <small>м</small>';
  }
}

/* ---------- камера ---------- */
let camPos, camLook, smPos, smLook, tmpA, tmpB, tmpC, tmpD;
let camInit = false, camSnap = false;
function updateIntroCamera(dt) {
  const t = intro.t;
  let cx, cy, cz, lx, ly, lz;
  if (t < 1.6) {
    const p = smooth(clamp(t / 1.6, 0, 1));
    cx = lerp(4.6, 3.6, p); cy = lerp(2.7, 2.2, p); cz = lerp(-4.4, -5.4, p);
    lx = 0; ly = 1.3; lz = -8.0;
  } else {
    const pz = player.z;
    const runDist = Math.max(0, pz - intro.runStartZ);
    const rise = smooth(clamp((runDist - 10) / 8, 0, 1));
    cx = player.x * 0.5;
    cy = 2.2 + rise * 1.6 + clamp((pz + 3) * 0.35, 0, 1.1);
    cz = pz - 3.5;
    lx = player.x * 0.7; ly = 1.35; lz = pz + 6;
  }
  const f = 1 - Math.exp(-9 * dt);
  camPos.lerp(tmpA.set(cx, cy, cz), f);
  camLook.lerp(tmpB.set(lx, ly, lz), f);
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  // держим сглаженную беговую камеру синхронной — переход интро → бег получается без рывка
  smPos.copy(camPos); smLook.copy(camLook); camInit = true;
}
function updateCamera(dt) {
  const px = player.x, pz = player.z;
  const spN = clamp((G.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
  tmpA.set(px * 0.5, 4.35 + spN * 0.25, pz - 6.9 - spN * 1.1);
  tmpB.set(px * 0.72, 1.55, pz + 8.5);
  if (G.state === 'over' && G.overT > 0.05) {
    const k = smooth(clamp(G.overT / 0.9, 0, 1));
    tmpA.set(px + 3.2, 2.3, pz - 1.6);
    tmpB.set(px, 1.25, pz);
    G.camBlend = 1;
    camPos.lerp(tmpA, k);
    camLook.lerp(tmpB, k);
  } else {
    tmpC.set(3.3, 2.0, pz + 1.6);
    tmpD.set(-0.3, 1.25, pz - 2.2);
    const b = smooth(clamp(G.camBlend, 0, 1));
    camPos.lerpVectors(tmpC, tmpA, b);
    camLook.lerpVectors(tmpD, tmpB, b);
  }
  if (!camInit || camSnap) {
    smPos.copy(camPos); smLook.copy(camLook); camInit = true; camSnap = false;
  } else {
    const f = 1 - Math.exp(-10 * dt);
    smPos.lerp(camPos, f); smLook.lerp(camLook, f);
  }
  camera.position.copy(smPos);
  camera.lookAt(smLook);
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt * 1.6);
    const s = G.shake * G.shake * 0.35;
    camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s);
  }
  const portrait = window.innerHeight > window.innerWidth;
  const fov = (portrait ? 68 : 58) + spN * 6;
  if (Math.abs(camera.fov - fov) > 0.3) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

/* ---------- анимация персонажей ---------- */
function animatePlayer(dt) {
  const n = player.node;
  n.root.position.set(player.x, player.y, player.z);
  const faceTarget = (G.state === 'run' || G.state === 'over' || G.state === 'paused') ? 0 : intro.faceY;
  n.root.rotation.y = damp(n.root.rotation.y, faceTarget, 6, dt);

  // FIX: тень остаётся на полу/столешнице, а не летит вместе с персонажем при прыжке
  const h = Math.max(0, player.y - player.groundY);
  n.shadow.position.y = player.groundY - player.y + 0.02;
  n.shadow.scale.setScalar(clamp(1 - h * 0.32, 0.4, 1));

  if (G.state === 'menu') {
    n.legL.rotation.x = damp(n.legL.rotation.x, -0.06, 8, dt);
    n.legR.rotation.x = damp(n.legR.rotation.x, 0.06, 8, dt);
    n.armL.rotation.x = damp(n.armL.rotation.x, -0.18, 8, dt);
    n.armR.rotation.x = damp(n.armR.rotation.x, -0.14, 8, dt);
    n.inner.position.y = -0.92 + Math.sin(performance.now() / 500) * 0.02;
    n.pivot.rotation.x = 0;
    return;
  }
  if (G.state === 'intro') return;

  const running = G.state === 'run' && player.grounded && player.rolling <= 0;
  if (running) {
    player.runPhase += dt * (6 + G.speed * 0.55);
    const s = Math.sin(player.runPhase);
    n.legL.rotation.x = s * 1.05;
    n.legR.rotation.x = -s * 1.05;
    n.armL.rotation.x = -s * 0.85;
    n.armR.rotation.x = s * 0.85;
    n.inner.position.y = -0.92 + Math.abs(Math.cos(player.runPhase)) * 0.07;
    n.inner.rotation.z = 0;
  } else if (!player.grounded) {
    player.runPhase += dt * 4;
    n.legL.rotation.x = damp(n.legL.rotation.x, -1.15, 10, dt);
    n.legR.rotation.x = damp(n.legR.rotation.x, 0.45, 10, dt);
    n.armL.rotation.x = damp(n.armL.rotation.x, -2.4, 8, dt);
    n.armR.rotation.x = damp(n.armR.rotation.x, -2.4, 8, dt);
  }
  if (player.rolling > 0) {
    player.rolling -= dt;
    const k = 1 - clamp(player.rolling / ROLL_TIME, 0, 1);
    n.pivot.rotation.x = -Math.PI * 2 * k;
    if (player.rolling <= 0) { player.rolling = 0; n.pivot.rotation.x = 0; }
  } else if (player.grounded) {
    n.pivot.rotation.x = 0;
  }
  if (player.squash > 0) {
    player.squash -= dt;
    const k = clamp(player.squash / 0.18, 0, 1);
    n.inner.scale.y = 1 - 0.22 * Math.sin(k * Math.PI);
    if (player.squash <= 0) n.inner.scale.y = 1;
  }
  if (G.state !== 'over') {
    // FIX: наклон корпуса В СТОРОНУ движения (камера смотрит вдоль +z, поэтому +x — это экранное «влево»)
    const laneX = LANES[player.lane];
    n.root.rotation.z = clamp(-(laneX - player.x) * 0.14, -0.3, 0.3);
  }
  n.inner.visible = player.invuln > 0 ? (Math.floor(performance.now() / 90) % 2 === 0) : true;
}
function animateGranny(dt) {
  const n = granny.node;
  granny.zOff = damp(granny.zOff, granny.targetZOff, 2.4, dt);
  if (G.state === 'menu' || G.state === 'intro') {
    n.armL.rotation.x = damp(n.armL.rotation.x, -1.3, 4, dt);
    n.armR.rotation.x = damp(n.armR.rotation.x, -1.7, 4, dt);
    n.inner.position.y = -0.04;
    n.headG.rotation.x = 0;
    return;
  }
  if (G.state === 'over') {
    n.root.position.x = damp(n.root.position.x, player.x, 3, dt);
    n.root.position.z = damp(n.root.position.z, player.z - 0.85, 5, dt);
  } else {
    n.root.position.x = damp(n.root.position.x, player.x, 2, dt);
    n.root.position.z = player.z + granny.zOff;
  }
  n.root.rotation.y = 0;
  granny.phase += dt * (G.state === 'over' ? 4 : 7 + G.speed * 0.5);
  const s = Math.sin(granny.phase);
  if (granny.catchMode) {
    n.armL.rotation.x = damp(n.armL.rotation.x, -2.5, 6, dt);
    n.armR.rotation.x = damp(n.armR.rotation.x, -2.7, 6, dt);
    n.headG.rotation.x = 0.15;
    n.inner.position.y = Math.abs(Math.cos(granny.phase)) * 0.06;
  } else {
    n.armL.rotation.x = -s * 0.7;
    n.armR.rotation.x = -1.9 + Math.sin(granny.phase * 0.7) * 0.35;
    n.headG.rotation.x = 0;
    n.inner.position.y = Math.abs(Math.cos(granny.phase)) * 0.1;
    n.inner.rotation.z = s * 0.04;
  }
}

/* ---------- основной цикл ---------- */
let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = clamp((t - lastT) / 1000, 0, 0.05);
  lastT = t;
  if (G.state === 'loading') return;
  // FIX: на паузе мир полностью замирает (раньше таймеры подката/учительницы продолжали тикать)
  if (G.state === 'paused') { renderer.render(scene, camera); return; }

  if (G.state === 'run') {
    G.speed = Math.min(MAX_SPEED, G.speed + ACCEL * dt);
    G.runTime += dt;
    G.dist += G.speed * dt;
    player.z += G.speed * dt;

    player.x = damp(player.x, LANES[player.lane], 11, dt);

    // гравитация и пол (земля или крышка парты)
    player.groundY = getGroundY();
    if (player.y > player.groundY || player.vy > 0) {
      player.grounded = false;
      player.vy -= GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y <= player.groundY && player.vy < 0) {
        player.y = player.groundY;
        player.vy = 0;
        player.grounded = true;
        player.squash = 0.18;
        Sound.land();
        burst(player.x, player.groundY + 0.08, player.z, '#c9c2b4', 3, 1.4);
      }
    } else {
      player.y = player.groundY;
      player.grounded = true;
    }
    if (player.invuln > 0) player.invuln -= dt;
    if (granny.closeT > 0) {
      granny.closeT -= dt;
      if (granny.closeT <= 0) granny.targetZOff = -9.2;
    }

    // бутылки
    const pcy = player.y + 0.95;
    for (let i = activeCoins.length - 1; i >= 0; i--) {
      const c = activeCoins[i];
      if (c.z < player.z - DESPAWN_BEHIND) { releaseCoin(i); continue; }
      if (Math.abs(player.z - c.z) < 0.95 && Math.abs(player.x - c.x) < 0.8 && Math.abs(pcy - c.y) < 1.2) {
        G.bottles++;
        if (UI.bottleNum) UI.bottleNum.textContent = G.bottles;
        Sound.coin();
        burst(c.x, c.y, c.z, '#ffe36e', 3, 1.8);
        releaseCoin(i);
      }
    }

    updateCollisions();
    fillSpawns();
    updateScoreHud();

    // FIX: сегмент переставляется вперёд, как только его дальний край ушёл за камеру
    // (раньше ждали лишние ~40 м, и запас коридора впереди был меньше)
    for (const seg of segments) {
      if (seg.position.z + SEG_LEN / 2 < player.z - 16) {
        seg.position.z += SEG_LEN * SEG_COUNT;
        randomizeSegmentDecor(seg);
      }
    }
    const bobT = t / 300;
    for (const c of activeCoins) {
      c.sprite.position.y = c.y + Math.sin(bobT + c.sprite.userData.phase) * 0.09;
    }

    if (G.hintT > 0) {
      G.hintT -= dt;
      if (G.hintT <= 0 && UI.hint) UI.hint.classList.remove('on');
    }
    G.camBlend = Math.min(1, G.camBlend + dt * 1.6);

  } else if (G.state === 'over') {
    G.overT += dt;
    G.speed = Math.max(0, G.speed - 30 * dt);
    player.z += G.speed * dt;
    // FIX: если поймали в прыжке — Мэл опускается на пол, а не зависает в воздухе
    if (player.y > player.groundY) {
      player.vy -= GRAVITY * dt;
      player.y = Math.max(player.groundY, player.y + player.vy * dt);
      if (player.y <= player.groundY) { player.vy = 0; player.grounded = true; }
    }
    player.node.root.rotation.z = Math.sin(G.overT * 9) * 0.16 * Math.max(0, 1 - G.overT);
    player.node.inner.rotation.x = damp(player.node.inner.rotation.x, -0.35, 4, dt);
    if (G.overT > 1.15 && !G.overShown) showOverScreen();
  } else if (G.state === 'menu') {
    G.camBlend = Math.max(0, G.camBlend - dt * 1.6);
  } else if (G.state === 'intro') {
    updateIntro(dt);
  }

  animatePlayer(dt);
  if (G.state !== 'intro') animateGranny(dt);
  updateParticles(dt);
  if (G.state === 'intro') updateIntroCamera(dt);
  else updateCamera(dt);
  renderer.render(scene, camera);
}

/* ---------- ввод ---------- */
function bindInput() {
  window.addEventListener('pointerdown', () => Sound.ensure());
  window.addEventListener('keydown', (e) => {
    const c = e.code;
    if (c === 'Space' || c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight') e.preventDefault();
    if (e.repeat || adBusy) return;
    if (G.state === 'intro') { if (!e.ctrlKey && !e.metaKey && !e.altKey) skipIntro(); return; }
    switch (c) {
      case 'ArrowLeft': case 'KeyA': move(1); break;   // камера смотрит вдоль +z: экранное «влево» = +x
      case 'ArrowRight': case 'KeyD': move(-1); break;
      case 'ArrowUp': case 'KeyW': case 'Space': jump(); break;
      case 'ArrowDown': case 'KeyS': roll(); break;
      case 'Escape': case 'KeyP':
        if (G.state === 'run') pauseRun();
        else if (G.state === 'paused') resumeRun();
        break;
      case 'Enter':
        if (G.state === 'menu') startIntro();
        else if (G.state === 'over' && G.overShown) maybeInterstitial(quickRestart);
        break;
    }
  });

  const gameEl = UI.game;
  if (gameEl) {
    gameEl.style.touchAction = 'none';
    let ts = null;
    gameEl.addEventListener('pointerdown', (e) => {
      Sound.ensure();
      if (adBusy) return;
      if (G.state === 'intro') { skipIntro(); return; }
      if (G.state !== 'run') return;
      ts = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), used: false };
      try { gameEl.setPointerCapture(e.pointerId); } catch (err) {}
    });
    gameEl.addEventListener('pointermove', (e) => {
      if (!ts || ts.used || e.pointerId !== ts.id || G.state !== 'run') return;
      const dx = e.clientX - ts.x, dy = e.clientY - ts.y;
      if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
      ts.used = true;
      // FIX: свайп вправо по экрану = движение вправо по экрану (то есть в -x), как и стрелка →
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? -1 : 1);
      else if (dy < 0) jump();
      else roll();
    });
    gameEl.addEventListener('pointerup', (e) => {
      if (!ts || e.pointerId !== ts.id) return;
      if (!ts.used && G.state === 'run' && performance.now() - ts.t < 260) jump();
      ts = null;
    });
    gameEl.addEventListener('pointercancel', (e) => { if (ts && e.pointerId === ts.id) ts = null; });
  }
  window.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.state === 'intro') skipIntro();
      if (G.state === 'run') pauseRun();
    }
  });

  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (adBusy) return; Sound.ensure(); Sound.click(); fn(); };
  on('playBtn', act(() => { if (G.state === 'menu') startIntro(); }));
  on('skipIntroBtn', act(() => { if (G.state === 'intro') skipIntro(); }));
  on('pauseBtn', act(() => pauseRun()));
  on('resumeBtn', act(() => resumeRun()));
  on('restartBtn', act(() => {
    if (G.state !== 'paused') return;
    show(UI.pause, false); Sound.resumeAll(); maybeInterstitial(quickRestart);
  }));
  on('pauseMenuBtn', act(() => {
    if (G.state !== 'paused') return;
    Sound.resumeAll(); show(UI.pause, false); maybeInterstitial(showMenu);
  }));
  on('againBtn', act(() => { if (G.state === 'over' && G.overShown) maybeInterstitial(quickRestart); }));
  on('overMenuBtn', act(() => { if (G.state === 'over' && G.overShown) maybeInterstitial(showMenu); }));
  on('reviveBtn', act(() => {
    if (G.state !== 'over' || G.reviveUsed) return;
    show(UI.reviveBtn, false);
    showRewarded(revive, () => { if (G.state === 'over') show(UI.reviveBtn, true); });
  }));
  // переключатели: меняем сохранение → синхронизируем Sound и кнопки → сохраняем
  const toggle = key => () => { save[key] = save[key] ? 0 : 1; syncToggleUI(); Sound.applyToggles(); persistSave(); Sound.click(); };
  on('musicBtn', toggle('music'));
  on('soundBtn', toggle('sound'));
}

/* ---------- resize ---------- */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ---------- запуск ---------- */
let initStarted = false;
function init() {
  if (initStarted) return;
  initStarted = true;
  cacheUI();

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // на мобильных ограничиваем DPR 1.5 — при MSAA это даёт заметный прирост FPS без потери читаемости
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x9fb2c0);
  UI.game.appendChild(renderer.domElement);
  maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy() || 1);

  initBakeHelpers();
  camPos = new THREE.Vector3(); camLook = new THREE.Vector3();
  smPos = new THREE.Vector3(); smLook = new THREE.Vector3();
  tmpA = new THREE.Vector3(); tmpB = new THREE.Vector3(); tmpC = new THREE.Vector3(); tmpD = new THREE.Vector3();
  SHADOW_MAT_CHAR = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });
  SHADOW_MAT_OBS = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fb2c0, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, CAM_FAR);
  onResize();
  window.addEventListener('resize', onResize);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x77808c, 0.95));
  const dir = new THREE.DirectionalLight(0xfff0d6, 0.65);
  dir.position.set(3, 10, 4);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xd6e4ff, 0.3);
  dir2.position.set(-4, 6, -6);
  scene.add(dir2);

  texMel = makeMelFaceTex();
  texGranny = makeGrannyFaceTex();
  if (!texBottle) texBottle = makeBottleFallbackTex();
  buildEnvTextures();
  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = buildSegment(i);
    segments.push(seg);
    scene.add(seg);
  }

  player.node = buildMel();
  scene.add(player.node.root);
  granny.node = buildGranny();
  scene.add(granny.node.root);

  deskScene = buildClassroom();
  scene.add(deskScene.group);

  initParticles();

  const bottleUrl = (typeof ASSETS !== 'undefined' && ASSETS && ASSETS.bottle) ? ASSETS.bottle : null;
  if (bottleUrl) {
    for (const id of ['bottleIcon', 'menuBottleIcon', 'overBottleIcon']) {
      const im = $(id); if (im) im.src = bottleUrl;
    }
  }
  if (UI.hint) UI.hint.innerHTML = '<span>⬅️➡️ полосы</span><span>⬆️ прыжок</span><span>⬇️ подкат</span>';

  bindInput();
  setupMenuScene();

  requestAnimationFrame(loop);

  const t0 = performance.now();
  setTimeout(() => {
    show(UI.loading, false);
    showMenu();
    Sdk.loadingReady();
  }, Math.max(0, 500 - (performance.now() - t0)));
}

readLocalSave();
syncToggleUI();

function boot() {
  if (typeof THREE === 'undefined') {
    const lt = $('loadingText'); if (lt) lt.textContent = 'Ошибка: не загружен three.js';
    return;
  }
  // SDK и облако ограничены по времени — игра не должна зависать на загрузке из-за сети
  Promise.all([loadTextures(), withTimeout(Sdk.init(), 8000)])
    .then(() => withTimeout(Sdk.loadCloud(), 5000))
    .then(() => { syncToggleUI(); init(); })
    .catch(err => {
      console.error(err);
      try { init(); } catch (e) { console.error(e); const lt = $('loadingText'); if (lt) lt.textContent = 'Ошибка загрузки :('; }
    });
}
boot();

})();
