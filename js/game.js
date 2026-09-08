/* ============================================================
   МЭЛ: ПОБЕГ ИЗ ШКОЛЫ — 3D раннер в стиле Subway Surfers
   Three.js r128 + Yandex Games SDK
   ============================================================ */
(function () {
'use strict';

/* ---------- утилиты ---------- */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const LANES = [-2.3, 0, 2.3];
const SEG_LEN = 24, SEG_COUNT = 9;
const WALL_X = 4.6, WALL_H = 5.8;
const GRAVITY = 28, JUMP_V = 9;
const BASE_SPEED = 11, MAX_SPEED = 27, ACCEL = 0.24;
const SPAWN_AHEAD = 170, DESPAWN_BEHIND = 14;
const ROLL_TIME = 0.62;

/* ---------- сохранение / настройки ---------- */
const save = { best: 0, bottles: 0, music: 1, sound: 1 };
function readLocalSave() {
  try {
    const s = JSON.parse(localStorage.getItem('melEscapeSave') || 'null');
    if (s) { save.best = s.best | 0; save.bottles = s.bottles | 0; save.music = s.music !== 0 ? 1 : 0; save.sound = s.sound !== 0 ? 1 : 0; }
  } catch (e) {}
}
function persistSave() {
  try { localStorage.setItem('melEscapeSave', JSON.stringify(save)); } catch (e) {}
  const y = Sdk.ysdk;
  if (y) { try { y.getPlayer({ scopes: false }).then(p => p.setData({ best: save.best, bottles: save.bottles, music: save.music, sound: save.sound }, false)).catch(() => {}); } catch (e) {} }
}

/* ---------- Yandex Games SDK ---------- */
const Sdk = {
  ysdk: null,
  init() {
    return new Promise(res => {
      if (typeof window.YaGames === 'undefined') return res();
      try {
        window.YaGames.init().then(y => { Sdk.ysdk = y; res(); }).catch(() => res());
      } catch (e) { res(); }
    });
  },
  loadingReady() { try { Sdk.ysdk && Sdk.ysdk.features && Sdk.ysdk.features.LoadingAPI && Sdk.ysdk.features.LoadingAPI.ready(); } catch (e) {} },
  gameplayStart() { try { Sdk.ysdk && Sdk.ysdk.features && Sdk.ysdk.features.GameplayAPI && Sdk.ysdk.features.GameplayAPI.start(); } catch (e) {} },
  gameplayStop() { try { Sdk.ysdk && Sdk.ysdk.features && Sdk.ysdk.features.GameplayAPI && Sdk.ysdk.features.GameplayAPI.stop(); } catch (e) {} },
  loadCloud() {
    return new Promise(res => {
      const y = Sdk.ysdk;
      if (!y) return res(false);
      try {
        y.getPlayer({ scopes: false }).then(p => {
          p.getData(['best', 'bottles', 'music', 'sound']).then(d => {
            if (d && typeof d.best === 'number') {
              save.best = Math.max(save.best, d.best | 0);
              save.bottles = Math.max(save.bottles, d.bottles | 0);
              if (typeof d.music === 'number') save.music = d.music;
              if (typeof d.sound === 'number') save.sound = d.sound;
            }
            res(true);
          }).catch(() => res(false));
        }).catch(() => res(false));
      } catch (e) { res(false); }
    });
  }
};
let lastInterstitial = 0, deathCount = 0;
function maybeInterstitial() {
  const y = Sdk.ysdk;
  if (!y || !y.adv) return;
  const now = Date.now();
  if (now - lastInterstitial < 75000) return;
  lastInterstitial = now;
  try {
    y.adv.showFullscreenAdv({ callbacks: {
      onOpen: () => Sound.pauseAll(),
      onClose: () => Sound.resumeAll(),
      onError: () => {}
    }});
  } catch (e) {}
}
function showRewarded(onReward, onFail) {
  const y = Sdk.ysdk;
  if (!y || !y.adv) return onFail();
  let got = false;
  try {
    y.adv.showRewardedVideo({ callbacks: {
      onOpen: () => Sound.pauseAll(),
      onRewarded: () => { got = true; },
      onClose: () => { Sound.resumeAll(); got ? onReward() : onFail(); },
      onError: () => { Sound.resumeAll(); onFail(); }
    }});
  } catch (e) { onFail(); }
}

/* ---------- звук (WebAudio, всё синтезировано) ---------- */
const Sound = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  musicOn: true, sfxOn: true, paused: false,
  step: 0, nextNote: 0, timer: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
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
  tone(f0, f1, dur, type, vol, when) {
    if (!this.ctx || !this.sfxOn) return;
    const t = (when || this.ctx.currentTime);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
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
  mNote(f, t, dur, type, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.musicOn) { this.nextNote = Math.max(this.nextNote, this.ctx ? this.ctx.currentTime + 0.05 : 0); return; }
    const stepDur = 60 / 138 / 2;
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      const s = this.step % 32, t = this.nextNote;
      const bass = [110,0,110,0,130.81,0,110,0, 98,0,98,0,110,0,130.81,0, 87.31,0,87.31,0,110,0,130.81,0, 98,0,110,0,130.81,0,146.83,0][s];
      if (bass) this.mNote(bass, t, 0.22, 'square', 0.5);
      const lead = [440,0,523.25,0,587.33,523.25,440,0, 392,0,440,0,523.25,0,587.33,0, 349.23,0,440,0,523.25,440,392,0, 440,523.25,587.33,0,659.25,587.33,523.25,0][s];
      if (lead && (s % 2 === 0)) this.mNote(lead, t, 0.16, 'triangle', 0.35);
      if (s % 2 === 1) { /* хэт-подобный тик */ this.mNote(6000, t, 0.03, 'square', 0.05); }
      this.nextNote += stepDur;
      this.step++;
    }
  }
};

/* ---------- three.js: базовая сцена ---------- */
let renderer, scene, camera;
let texMel, texGranny, texBottle;
const matCache = {};
function M(color) {
  if (!matCache[color]) matCache[color] = new THREE.MeshLambertMaterial({ color });
  return matCache[color];
}
const geoCache = {};
function GBox(w, h, d) {
  const key = `${w}_${h}_${d}`;
  if (!geoCache[key]) geoCache[key] = new THREE.BoxGeometry(w, h, d);
  return geoCache[key];
}

// Заменяем старую функцию box на оптимизированную:
function box(w, h, d, color) { 
  return new THREE.Mesh(GBox(w, h, d), M(color)); 
}
function canvasTex(w, h, fn, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function loadTextures() {
  return new Promise(res => {
    const L = new THREE.LoadingManager(res);
    const T = new THREE.TextureLoader(L);
    texBottle = T.load(ASSETS.bottle);
    texBottle.encoding = THREE.sRGBEncoding;
    texBottle.transparent = true;
    texMel = makeMelFaceTex();
    texGranny = makeGrannyFaceTex();
  });
}

/* ---------- рисованные лица (по мотивам фото-референсов) ---------- */
// Мэл: по референсу — короткая тёмно-каштановая стрижка с фейдом, прямые густые брови,
// миндалевидные серо-зелёные глаза, прямой нос, спокойный прищур
function makeMelFaceTex() {
  return canvasTex(512, 512, (g) => {
    // кожа + лёгкое затемнение по краям лица
    g.fillStyle = '#f0c19b'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(214,140,96,0.25)';
    g.fillRect(0, 0, 66, 512); g.fillRect(446, 0, 66, 512);
    // уши
    for (const ex of [26, 486]) {
      g.fillStyle = '#e9b58d';
      g.beginPath(); g.ellipse(ex, 292, 26, 42, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c98d5f'; g.lineWidth = 7;
      g.beginPath(); g.ellipse(ex, 292, 12, 22, 0, 0, Math.PI * 2); g.stroke();
    }
    // волосы — короткая стрижка, линия роста ровная
    g.fillStyle = '#3d2a1a';
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(512, 0); g.lineTo(512, 118);
    g.quadraticCurveTo(470, 148, 420, 128);
    g.quadraticCurveTo(360, 102, 300, 126);
    g.quadraticCurveTo(256, 144, 212, 126);
    g.quadraticCurveTo(152, 102, 92, 128);
    g.quadraticCurveTo(42, 148, 0, 118);
    g.closePath(); g.fill();
    // височный фейд
    g.fillStyle = 'rgba(61,42,26,0.5)';
    g.fillRect(0, 0, 44, 300); g.fillRect(468, 0, 44, 300);
    // текстура волос — короткие штрихи
    g.strokeStyle = 'rgba(30,20,12,0.6)'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    for (const [x1, y1, x2, y2] of [[80, 40, 96, 96], [160, 24, 168, 84], [250, 18, 254, 80], [340, 24, 332, 84], [430, 40, 414, 96]]) {
      g.moveTo(x1, y1); g.lineTo(x2, y2);
    }
    g.stroke();
    // брови — прямые, густые, слегка нахмурены
    g.strokeStyle = '#2e2013'; g.lineWidth = 22; g.lineCap = 'round';
    g.beginPath(); g.moveTo(140, 232); g.lineTo(238, 224); g.stroke();
    g.beginPath(); g.moveTo(372, 232); g.lineTo(274, 224); g.stroke();
    // глаза — миндалевидные, серо-зелёная радужка
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
      // складка верхнего века
      g.strokeStyle = '#7a5236'; g.lineWidth = 5;
      g.beginPath(); g.arc(cx, 276, 43, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
    // нос — прямой, с ноздрями
    g.strokeStyle = 'rgba(180,116,72,0.85)'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(246, 288); g.quadraticCurveTo(242, 336, 250, 352); g.stroke();
    g.beginPath(); g.moveTo(268, 288); g.quadraticCurveTo(272, 336, 264, 352); g.stroke();
    g.strokeStyle = 'rgba(160,98,60,0.9)'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(240, 360); g.quadraticCurveTo(252, 372, 264, 366); g.quadraticCurveTo(272, 362, 272, 358); g.stroke();
    // рот — спокойный, тонкие губы
    g.strokeStyle = '#9c5f43'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(206, 424); g.quadraticCurveTo(256, 434, 306, 424); g.stroke();
    g.strokeStyle = 'rgba(180,110,80,0.5)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(222, 448); g.quadraticCurveTo(256, 454, 290, 448); g.stroke();
    // тень под подбородком
    g.strokeStyle = 'rgba(200,130,88,0.5)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(216, 486); g.quadraticCurveTo(256, 496, 296, 486); g.stroke();
    // лёгкий румянец
    g.fillStyle = 'rgba(224,130,92,0.18)';
    g.beginPath(); g.ellipse(96, 376, 34, 20, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(416, 376, 34, 20, 0, 0, Math.PI * 2); g.fill();
  });
}
// Бабка-учительница: сероватая кожа, белые глаза без зрачков, открытый рот с зубами, морщины
function makeGrannyFaceTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#a9abb2'; g.fillRect(0, 0, 256, 256);
    // редкие седые пряди
    g.strokeStyle = '#e9e9e9'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(32, 10); g.quadraticCurveTo(52, 40, 42, 66);
    g.moveTo(92, 4); g.quadraticCurveTo(102, 26, 98, 48);
    g.moveTo(168, 4); g.quadraticCurveTo(158, 26, 164, 48);
    g.moveTo(224, 10); g.quadraticCurveTo(204, 40, 214, 66);
    g.stroke();
    // морщины на лбу
    g.strokeStyle = '#8b8d94'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(58, 62); g.quadraticCurveTo(128, 48, 198, 62); g.stroke();
    g.beginPath(); g.moveTo(64, 82); g.quadraticCurveTo(128, 70, 192, 82); g.stroke();
    // брови — седые кустистые, злые
    g.fillStyle = '#dcdcdc';
    g.save(); g.translate(58, 114); g.rotate(0.30); g.fillRect(-28, -9, 56, 18); g.restore();
    g.save(); g.translate(198, 114); g.rotate(-0.30); g.fillRect(-28, -9, 56, 18); g.restore();
    // глаза — белые, без зрачков
    for (const cx of [88, 168]) {
      g.fillStyle = '#f4f4f4';
      g.beginPath(); g.arc(cx, 148, 21, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7c7e85'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = 'rgba(170,70,70,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - 8, 140); g.lineTo(cx - 2, 148); g.stroke();
    }
    // морщины под глазами
    g.strokeStyle = '#8f9198'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(60, 170); g.quadraticCurveTo(72, 180, 86, 175); g.stroke();
    g.beginPath(); g.moveTo(196, 170); g.quadraticCurveTo(184, 180, 170, 175); g.stroke();
    // нос — крючковатый
    g.strokeStyle = '#85878e'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(122, 152); g.quadraticCurveTo(112, 190, 128, 196);
    g.quadraticCurveTo(146, 200, 142, 186);
    g.stroke();
    // носогубные складки
    g.strokeStyle = '#8f9198'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(96, 178); g.quadraticCurveTo(80, 206, 84, 228); g.stroke();
    g.beginPath(); g.moveTo(160, 178); g.quadraticCurveTo(176, 206, 172, 228); g.stroke();
    // рот — широко открыт, кричит
    g.fillStyle = '#4b1414';
    g.beginPath();
    g.moveTo(84, 212);
    g.quadraticCurveTo(128, 200, 172, 212);
    g.quadraticCurveTo(178, 246, 128, 252);
    g.quadraticCurveTo(78, 246, 84, 212);
    g.closePath(); g.fill();
    g.strokeStyle = '#6e2a24'; g.lineWidth = 4; g.stroke();
    // жёлтые неровные зубы (один выпал)
    g.fillStyle = '#e6dca4';
    for (const [x, y, w, h] of [[92, 213, 15, 14], [112, 210, 14, 16], [132, 210, 14, 16], [152, 212, 14, 14]])
      g.fillRect(x, y, w, h);
    for (const [x, y, w, h] of [[104, 236, 13, 12], [126, 237, 13, 12], [148, 234, 12, 12]])
      g.fillRect(x, y, w, h);
    // бородавка с волосками
    g.fillStyle = '#7c7e85';
    g.beginPath(); g.arc(158, 198, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#dcdcdc'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(156, 192); g.lineTo(152, 182); g.moveTo(162, 192); g.lineTo(166, 183); g.stroke();
  });
}

/* ---------- текстуры окружения ---------- */
let floorTex, wallTex, lockerTex, boardTex, posterTexes = [], bannerTexes = [];
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
  }, [3.7, 9.6]);

  wallTex = canvasTex(128, 256, (g) => {
    g.fillStyle = '#f0ecd9'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#a9c98c'; g.fillRect(0, 148, 128, 92);
    g.fillStyle = '#6f9459'; g.fillRect(0, 144, 128, 7);
    g.fillStyle = '#5c4633'; g.fillRect(0, 240, 128, 16);
  }, [6, 1]);

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
    for (let i = -2; i < 8; i++) { g.save(); g.translate(i * 80, 0); g.rotate(0); g.globalAlpha = 0.12; g.fillRect(0, 0, 40, 256); g.restore(); }
    g.globalAlpha = 1;
    g.font = 'bold 52px Arial'; g.textAlign = 'center';
    g.fillText(l1, 256, 108);
    g.font = 'bold 64px Arial';
    g.fillText(l2, 256, 190);
    g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(8, 8, 496, 240);
  }));
}

/* ---------- коридор ---------- */
const segments = [];
function buildDecorUnit(kind) {
  const g = new THREE.Group();
  if (kind === 'lockers') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 2.3, 0.5),
      [M('#6d7986'), M('#6d7986'), M('#8a97a5'), M('#55606a'),
       new THREE.MeshLambertMaterial({ map: lockerTex }), M('#6d7986')]);
    m.position.y = 1.15; g.add(m);
    const base = box(3.1, 0.14, 0.6, '#4d5762'); base.position.y = 0.07; g.add(base);
  } else if (kind === 'door') {
    const fr = box(1.4, 2.5, 0.16, '#6d4c2f'); fr.position.y = 1.25; g.add(fr);
    const d = box(1.16, 2.3, 0.1, '#8a5a33'); d.position.set(0, 1.2, 0.06); g.add(d);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.04), M('#cfe6ee'));
    w.position.set(0, 1.78, 0.13); g.add(w);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), M('#e0b83e'));
    h.position.set(0.42, 1.18, 0.13); g.add(h);
  } else if (kind === 'windows') {
    for (let i = -1; i <= 1; i++) {
      const fr = box(1.5, 1.8, 0.12, '#f2efe4'); fr.position.set(i * 1.75, 2.6, 0); g.add(fr);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(1.28, 1.58, 0.06), new THREE.MeshBasicMaterial({ color: '#cfe8f2' }));
      gl.position.set(i * 1.75, 2.6, 0.05); g.add(gl);
      const bar = box(1.34, 0.07, 0.07, '#f2efe4'); bar.position.set(i * 1.75, 2.6, 0.08); g.add(bar);
    }
  } else if (kind === 'poster') {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.45), new THREE.MeshLambertMaterial({ map: pick(posterTexes) }));
    p.position.set(0, 2.15, 0.06); g.add(p);
    const fr = box(1.2, 1.6, 0.05, '#5d4634'); fr.position.set(0, 2.15, 0); g.add(fr);
  } else if (kind === 'board') {
    const fr = box(2.9, 1.55, 0.08, '#5d4634'); fr.position.set(0, 2.35, 0); g.add(fr);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.35), new THREE.MeshLambertMaterial({ map: boardTex }));
    b.position.set(0, 2.35, 0.06); g.add(b);
    const tray = box(2.8, 0.07, 0.12, '#5d4634'); tray.position.set(0, 1.55, 0.1); g.add(tray);
  } else if (kind === 'extinguisher') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10), M('#c62828'));
    b.position.set(0, 1.15, 0); g.add(b);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6), M('#37474f'));
    t.position.set(0, 1.42, 0); g.add(t);
    const br = box(0.34, 0.8, 0.2, '#b0451f'); br.position.set(0, 1.4, -0.12); g.add(br);
  }
  return g;
}
const DECOR_KINDS = ['lockers', 'door', 'windows', 'poster', 'board', 'extinguisher'];
function randomizeSegmentDecor(seg) {
  for (const sideKey of ['L', 'R']) {
    const units = seg.userData.decor[sideKey];
    
    // 1. Скрываем всё перед новой генерацией
    units.forEach(u => { u.visible = false; });
    
    // 2. Создаем массив индексов [0, 1, 2, 3, 4, 5] и перемешиваем его,
    // чтобы гарантированно выбрать УНИКАЛЬНЫЕ объекты (а не одну и ту же доску дважды)
    const indices = [0, 1, 2, 3, 4, 5];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = randi(0, i);
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }

    // Решаем, сколько объектов будет на этой стене (1 или 2)
    const n = randi(1, 2);
    
    for (let i = 0; i < n; i++) {
      const u = units[indices[i]]; // Берем уникальный объект
      u.visible = true;
      
      // 3. Распределяем по безопасным зонам (Z-координатам), чтобы избежать наложения
      if (n === 1) {
        // Если объект один — спавним где угодно, отступив от краев сегмента
        u.position.z = rand(-SEG_LEN / 2 + 3, SEG_LEN / 2 - 3);
      } else {
        // Если объектов два — делим стену пополам
        if (i === 0) {
          // Первый объект строго в первой половине (z от -9 до -2)
          u.position.z = rand(-SEG_LEN / 2 + 3, -2);
        } else {
          // Второй объект строго во второй половине (z от +2 до +9)
          u.position.z = rand(2, SEG_LEN / 2 - 3);
        }
      }
    }
  }
}
function buildSegment(i) {
  const g = new THREE.Group();
  g.position.z = i * SEG_LEN;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9.4, SEG_LEN), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; g.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(9.4, SEG_LEN), M('#e3e7ea'));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H; g.add(ceil);

  for (const lampZ of [-SEG_LEN / 4, SEG_LEN / 4]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.6), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
    lamp.position.set(0, WALL_H - 0.06, lampZ); g.add(lamp);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.42), new THREE.MeshBasicMaterial({ color: '#fdf6dd' }));
    beam.position.set(0, WALL_H - 0.13, lampZ); g.add(beam);
  }

  const mkWall = (x, ry) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(SEG_LEN, WALL_H), new THREE.MeshLambertMaterial({ map: wallTex }));
    w.rotation.y = ry; w.position.set(x, WALL_H / 2, 0); g.add(w);
    const sk = box(0.14, 0.4, SEG_LEN, '#55402f');
    sk.position.set(x + (x < 0 ? 0.1 : -0.1), 0.2, 0); g.add(sk);
  };
  mkWall(-WALL_X, Math.PI / 2);
  mkWall(WALL_X, -Math.PI / 2);

  const decor = { L: [], R: [] };
  for (const sideKey of ['L', 'R']) {
    const sx = sideKey === 'L' ? -WALL_X + 0.45 : WALL_X - 0.45;
    const ry = sideKey === 'L' ? Math.PI / 2 : -Math.PI / 2;
    for (const kind of DECOR_KINDS) {
      const u = buildDecorUnit(kind);
      u.rotation.y = ry;
      u.position.set(sx, 0, 0);
      u.visible = false;
      g.add(u);
      decor[sideKey].push(u);
    }
  }
  g.userData.decor = decor;
  randomizeSegmentDecor(g);
  return g;
}

/* ---------- персонаж: Мэл ---------- */
function buildMel() {
  const root = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.y = 0.92; root.add(pivot);
  const inner = new THREE.Group(); inner.position.y = -0.92; pivot.add(inner);

  const SKIN = '#f0c19b', HAIR = '#3d2a1a', BLAZER = '#2c3a6b', PANTS = '#23262e', SHOE = '#17181c';

  const torso = box(0.62, 0.58, 0.34, BLAZER); torso.position.y = 1.24; inner.add(torso);
  const shirt = box(0.18, 0.24, 0.03, '#f5f5f2'); shirt.position.set(0, 1.36, 0.18); inner.add(shirt);
  const belt = box(0.64, 0.09, 0.36, '#17181c'); belt.position.y = 0.96; inner.add(belt);

  const mkLeg = (x) => {
    const leg = new THREE.Group(); leg.position.set(x, 0.92, 0);
    const m = box(0.21, 0.62, 0.24, PANTS); m.position.y = -0.34; leg.add(m);
    const sh = box(0.23, 0.13, 0.34, SHOE); sh.position.set(0, -0.68, 0.05); leg.add(sh);
    inner.add(leg); return leg;
  };
  const legL = mkLeg(-0.15), legR = mkLeg(0.15);

  const mkArm = (x) => {
    const arm = new THREE.Group(); arm.position.set(x, 1.46, 0);
    const s = box(0.16, 0.5, 0.18, BLAZER); s.position.y = -0.22; arm.add(s);
    const h = box(0.13, 0.14, 0.14, SKIN); h.position.y = -0.52; arm.add(h);
    inner.add(arm); return arm;
  };
  const armL = mkArm(-0.39), armR = mkArm(0.39);

  // дневник в правой руке (появляется после кражи в интро)
  const diary = buildDiaryMesh();
  diary.position.set(0, -0.64, 0.14);
  diary.rotation.x = Math.PI / 2;
  diary.visible = false;
  armR.add(diary);

  const headG = new THREE.Group(); headG.position.y = 1.78; inner.add(headG);
  const faceMat = new THREE.MeshLambertMaterial({ map: texMel });
  const hairMat = M(HAIR);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.52),
    [hairMat, hairMat, hairMat, M(SKIN), faceMat, hairMat]);
  headG.add(head);
  const cap = box(0.58, 0.14, 0.56, HAIR); cap.position.y = 0.28; headG.add(cap);
  const capB = box(0.58, 0.34, 0.12, HAIR); capB.position.set(0, 0.1, -0.24); headG.add(capB);

  const bp = box(0.48, 0.54, 0.22, '#d23f2e'); bp.position.set(0, 1.24, -0.3); inner.add(bp);
  const bpP = box(0.32, 0.22, 0.08, '#a52a1d'); bpP.position.set(0, 1.06, -0.44); inner.add(bpP);
  for (const sx of [-0.2, 0.2]) {
    const st = box(0.09, 0.5, 0.04, '#7a1f16'); st.position.set(sx, 1.3, -0.16); inner.add(st);
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.52, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow);

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
  }
  return new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.4),
    [M('#14523a'), M('#14523a'), M('#14523a'), M('#f4f0dc'),
     new THREE.MeshLambertMaterial({ map: buildDiaryMesh.tex }), M('#14523a')]);
}
function buildTeacherDesk() {
  const g = new THREE.Group();
  const top = box(2.0, 0.1, 1.0, '#8a5a33'); top.position.y = 1.02; g.add(top);
  const cloth = box(1.4, 0.02, 0.66, '#2e6b46'); cloth.position.set(0, 1.08, 0); g.add(cloth);
  for (const dx of [-0.72, 0.72]) {
    const dr = box(0.5, 0.92, 0.85, '#7a4e2b'); dr.position.set(dx, 0.48, 0); g.add(dr);
    const h1 = box(0.34, 0.05, 0.05, '#e0b83e'); h1.position.set(dx, 0.62, 0.45); g.add(h1);
    const h2 = box(0.34, 0.05, 0.05, '#e0b83e'); h2.position.set(dx, 0.34, 0.45); g.add(h2);
  }
  // журнал с оценками
  const j = box(0.42, 0.05, 0.3, '#a02020'); j.position.set(-0.34, 1.1, 0.08); j.rotation.y = 0.3; g.add(j);
  // дневник на столе
  const diary = buildDiaryMesh();
  diary.position.set(0.34, 1.13, 0.02); diary.rotation.x = -Math.PI / 2; diary.rotation.z = 0.2;
  g.add(diary);
  return { group: g, diary };
}
/* Класс: широкий кабинет (шире коридора) с доской, партами, учительским столом и дверью в коридор */
const CLASS_HALF_W = 7.0, CLASS_Z0 = -2.6, CLASS_Z1 = -11.8;
function buildClassroom() {
  const g = new THREE.Group();
  const W = CLASS_HALF_W * 2, D = CLASS_Z0 - CLASS_Z1;
  const cz = (CLASS_Z0 + CLASS_Z1) / 2;
  // пол, потолок, боковые стены класса (шире коридора — камере есть где развернуться)
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: floorTex }));
  fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.005, cz); g.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M('#e3e7ea'));
  ce.rotation.x = Math.PI / 2; ce.position.set(0, WALL_H, cz); g.add(ce);
  for (const lampZ of [cz - D / 4, cz + D / 4]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.6), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
    lamp.position.set(0, WALL_H - 0.06, lampZ); g.add(lamp);
  }
  for (const sx of [-CLASS_HALF_W, CLASS_HALF_W]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(D, WALL_H), new THREE.MeshLambertMaterial({ map: wallTex }));
    w.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
    w.position.set(sx, WALL_H / 2, cz); g.add(w);
    const sk = box(0.14, 0.4, D, '#55402f');
    sk.position.set(sx + (sx < 0 ? 0.1 : -0.1), 0.2, cz); g.add(sk);
  }
  // задняя стена класса
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, WALL_H), new THREE.MeshLambertMaterial({ map: wallTex }));
  back.position.set(0, WALL_H / 2, CLASS_Z1); g.add(back);
  // доска в раме
  const frame = box(5.0, 2.6, 0.12, '#5d4634'); frame.position.set(0, 2.7, CLASS_Z1 + 0.06); g.add(frame);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 2.3), new THREE.MeshLambertMaterial({ map: boardTex }));
  board.position.set(0, 2.7, CLASS_Z1 + 0.14); g.add(board);
  const tray = box(5.0, 0.08, 0.18, '#5d4634'); tray.position.set(0, 1.38, CLASS_Z1 + 0.2); g.add(tray);
  // передняя стена полностью убрана: дверь и дверной проём остаются открытыми, без деревянной рамки

  // табличка «ВЫХОД»
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.45), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 96, (c) => {
      c.fillStyle = '#2e7d32'; c.fillRect(0, 0, 256, 96);
      c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(6, 6, 244, 84);
      c.fillStyle = '#ffffff'; c.font = 'bold 52px Arial'; c.textAlign = 'center';
      c.fillText('ВЫХОД', 128, 66);
    })
  }));
  sign.position.set(0, 3.55, CLASS_Z0 + 0.2); g.add(sign);
  // парты учеников: 2 колонны × 2 ряда, лицом к доске
  for (const dx of [-2.3, 2.3]) {
    for (const dz of [-4.9, -7.3]) {
      const d = buildDeskMesh();
      d.scale.setScalar(0.92);
      d.rotation.y = Math.PI;
      d.position.set(dx, 0, dz);
      g.add(d);
    }
  }
  // учительский стол перед доской
  const td = buildTeacherDesk();
  td.group.position.set(0, 0, -9.7);
  g.add(td.group);
  return { group: g, diary: td.diary };
}

/* ---------- персонаж: учительница ---------- */
function buildGranny() {
  const root = new THREE.Group();
  const inner = new THREE.Group(); root.add(inner);
  const DRESS = '#566273', SKIN = '#a9abb2', HAIR = '#ececec';

  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.68, 1.2, 12), M(DRESS));
  dress.position.y = 0.6; inner.add(dress);
  const torso = box(0.6, 0.44, 0.34, DRESS); torso.position.y = 1.38; inner.add(torso);
  const collar = box(0.5, 0.1, 0.36, '#f2efe4'); collar.position.y = 1.56; inner.add(collar);

  const mkArm = (x) => {
    const arm = new THREE.Group(); arm.position.set(x, 1.5, 0);
    const s = box(0.16, 0.52, 0.18, DRESS); s.position.y = -0.22; arm.add(s);
    const h = box(0.14, 0.15, 0.14, SKIN); h.position.y = -0.54; arm.add(h);
    inner.add(arm); return arm;
  };
  const armL = mkArm(-0.38), armR = mkArm(0.38);

  const pointer = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8), M('#c89b5a'));
  pointer.position.set(0, -0.6, 0.25); pointer.rotation.x = Math.PI / 3.2; armR.add(pointer);

  const headG = new THREE.Group(); headG.position.y = 1.86; inner.add(headG);
  const faceMat = new THREE.MeshLambertMaterial({ map: texGranny });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.6, 0.56),
    [M(SKIN), M(SKIN), M(HAIR), M(SKIN), faceMat, M(HAIR)]);
  headG.add(head);
  const cap = box(0.62, 0.12, 0.6, HAIR); cap.position.y = 0.3; headG.add(cap);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), M(HAIR));
  bun.position.set(0, 0.3, -0.28); headG.add(bun);

  for (const fx of [-0.18, 0.18]) {
    const f = box(0.2, 0.14, 0.32, '#2e2e33'); f.position.set(fx, 0.07, 0.05); inner.add(f);
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow);

  root.scale.setScalar(1.1);
  return { root, inner, armL, armR, headG, shadow };
}

/* ---------- препятствия ---------- */
const OB_DEFS = {
  desk:   { hw: 0.80, hz: 1.00, y0: 0,    y1: 1.30, platform: true },
  tower:  { hw: 0.80, hz: 0.55, y0: 0,    y1: 2.25, platform: true },
  banner: { hw: 1.05, hz: 0.16, y0: 0.90, y1: 2.90, platform: false }, // Под ним пролезаем
  locker: { hw: 0.80, hz: 0.40, y0: 0,    y1: 2.70, platform: true },
  door:   { hw: 0.60, hz: 0.18, y0: 0,    y1: 2.40, platform: false }
};
function buildDeskMesh() {
  const g = new THREE.Group();
  const top = box(1.5, 0.09, 0.78, '#a9713c'); top.position.set(0, 1.0, 0.25); g.add(top);
  const lid = box(0.7, 0.06, 0.7, '#8a5a30'); lid.position.set(-0.3, 1.06, 0.25); g.add(lid);
  for (const [lx, lz] of [[-0.62, -0.02], [0.62, -0.02], [-0.62, 0.55], [0.62, 0.55]]) {
    const l = box(0.07, 1.0, 0.07, '#3c4148'); l.position.set(lx, 0.5, lz - 0.05); g.add(l);
  }
  const seat = box(0.6, 0.08, 0.52, '#b98450'); seat.position.set(0, 0.52, -0.62); g.add(seat);
  const back = box(0.6, 0.6, 0.07, '#b98450'); back.position.set(0, 0.85, -0.86); g.add(back);
  for (const [lx, lz] of [[-0.22, -0.5], [0.22, -0.5], [-0.22, -0.74], [0.22, -0.74]]) {
    const l = box(0.05, 0.52, 0.05, '#3c4148'); l.position.set(lx, 0.26, lz); g.add(l);
  }
  return g;
}
function buildObstacle(type) {
  const g = new THREE.Group();
  const def = OB_DEFS[type];
  if (type === 'desk') {
    const d = buildDeskMesh(); g.add(d);
  } else if (type === 'tower') {
    const d1 = buildDeskMesh(); g.add(d1);
    const d2 = buildDeskMesh(); d2.rotation.x = Math.PI; d2.position.y = 2.05; g.add(d2);
    const ch = box(0.6, 0.08, 0.52, '#b98450'); ch.position.set(0, 2.16, 0); g.add(ch);
  } else if (type === 'banner') {
    for (const px of [-0.95, 0.95]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.95, 8), M('#5a636e'));
      post.position.set(px, 1.47, 0); g.add(post);
    }
    const plane = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 0.09),
      new THREE.MeshLambertMaterial({ map: pick(bannerTexes) }));
    plane.position.y = 1.85; g.add(plane);
    const foot1 = box(0.5, 0.07, 0.9, '#5a636e'); foot1.position.y = 0.035; g.add(foot1);
  } else if (type === 'locker') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.7, 0.75),
      [M('#6d7986'), M('#6d7986'), M('#8a97a5'), M('#55606a'),
       M('#6d7986'), new THREE.MeshLambertMaterial({ map: lockerTex })]);
    m.position.y = 1.35; g.add(m);
  } else if (type === 'door') {
    const p = box(1.15, 2.32, 0.09, '#8a5a33'); p.position.y = 1.34; g.add(p);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.62, 0.04), M('#cfe6ee'));
    w.position.set(0, 1.95, -0.06); g.add(w);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), M('#e0b83e'));
    h.position.set(0.42, 1.3, -0.08); g.add(h);
    for (const wz of [-0.28, 0.28]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 10), M('#17181c'));
      wh.rotation.z = Math.PI / 2; wh.position.set(0, 0.12, wz); g.add(wh);
    }
  }
  const sh = new THREE.Mesh(new THREE.CircleGeometry(def.hw + 0.25, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; g.add(sh);
  return g;
}
const obstaclePool = { desk: [], tower: [], banner: [], locker: [], door: [] };
const activeObstacles = [];
function spawnObstacle(type, x, z) {
  let g = obstaclePool[type].pop();
  if (!g) g = buildObstacle(type);
  g.position.set(x, 0, z);
  if (type === 'desk' || type === 'tower') g.rotation.y = Math.random() < 0.5 ? Math.PI : 0;
  else g.rotation.y = 0;
  scene.add(g);
  const def = OB_DEFS[type];
  activeObstacles.push({ t: type, x, z, hw: def.hw, hz: def.hz, y0: def.y0, y1: def.y1, group: g, stumbled: false });
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
function spawnCoin(x, y, z) {
  let s = coinPool.pop();
  if (!s) {
    const sm = new THREE.SpriteMaterial({ map: texBottle, transparent: true, alphaTest: 0.15 });
    s = new THREE.Sprite(sm);
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
  for (let i = 0; i < 20; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0 }));
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

/* ---------- паттерны препятствий ---------- */
function shuffledLanes() {
  const a = [0, 1, 2];
  for (let i = 2; i > 0; i--) { const j = randi(0, i); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function coinLine(lane, dz, n, step, y) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ lane, dz: dz + i * (step || 1.8), y: y || 0.95 });
  return out;
}
function coinArc(lane, dzc) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    out.push({ lane, dz: dzz(dzc, k), y: 0.95 + Math.sin(k * Math.PI) * 1.3 });
  }
  return out;
  function dzz(c, k) { return c - 5.4 + k * 10.8; }
}
const PATTERNS = [
  function pDesk() { const l = randi(0, 2); return { len: 16, obs: [{ t: 'desk', lane: l, dz: 7 }], coins: coinArc(l, 7) }; },
  function pLockers2() {
    const ls = shuffledLanes();
    return { len: 18, obs: [{ t: 'locker', lane: ls[0], dz: 8 }, { t: 'locker', lane: ls[1], dz: 8 }], coins: coinLine(ls[2], 4, 7) };
  },
  function pBanners() {
    return { len: 17, obs: [{ t: 'banner', lane: 0, dz: 8 }, { t: 'banner', lane: 1, dz: 8 }, { t: 'banner', lane: 2, dz: 8 }], coins: coinLine(1, 5.5, 5, 1.6, 0.55) };
  },
  function pStagger() {
    const ls = shuffledLanes();
    return {
      len: 24, obs: [
        { t: 'desk', lane: ls[0], dz: 6 },
        { t: 'banner', lane: ls[1], dz: 12 },
        { t: 'tower', lane: ls[2], dz: 18 }
      ], coins: coinArc(ls[0], 6).concat(coinLine(ls[1], 9, 4))
    };
  },
  function pZigzag() {
    const ls = shuffledLanes();
    return {
      len: 28, obs: [
        { t: 'desk', lane: ls[0], dz: 6 },
        { t: 'desk', lane: ls[1], dz: 13 },
        { t: 'desk', lane: ls[2], dz: 20 }
      ], coins: coinArc(ls[0], 6).concat(coinArc(ls[1], 13))
    };
  },
  function pCorridor() {
    const ls = shuffledLanes();
    return {
      len: 20, obs: [
        { t: 'locker', lane: ls[0], dz: 9 }, { t: 'locker', lane: ls[0], dz: 11.5 },
        { t: 'tower', lane: ls[2], dz: 9 }
      ], coins: coinLine(ls[1], 5, 7)
    };
  },
  function pForcedRoll() {
    const ls = shuffledLanes();
    return {
      len: 20, diff: 1, obs: [
        { t: 'tower', lane: ls[0], dz: 9 }, { t: 'tower', lane: ls[1], dz: 9 },
        { t: 'banner', lane: ls[2], dz: 9 }
      ], coins: coinLine(ls[2], 5.5, 5, 1.6, 0.55)
    };
  },
  function pDoubleJump() {
    const l = randi(0, 2);
    return { len: 26, obs: [{ t: 'desk', lane: l, dz: 6 }, { t: 'desk', lane: l, dz: 18 }], coins: coinArc(l, 6).concat(coinArc(l, 15)) };
  },
  function pDoorDesk() {
    const ls = shuffledLanes();
    return {
      len: 20, obs: [
        { t: 'door', lane: ls[0], dz: 8 },
        { t: 'desk', lane: ls[1], dz: 12 }
      ], coins: coinArc(ls[1], 12).concat(coinLine(ls[2], 5, 4))
    };
  },
  function pCoinsOnly() {
    const l = randi(0, 2);
    return { len: 16, obs: [], coins: coinLine(l, 4, 8) };
  }
];

/* ---------- состояние игры ---------- */
const G = {
  state: 'loading', // loading | menu | intro | run | paused | over
  speed: BASE_SPEED, dist: 0, runTime: 0, bottles: 0,
  nextZ: 0, camBlend: 0, shake: 0,
  overT: 0, overShown: false, reviveUsed: false,
  hintT: 0
};
const player = {
  node: null, lane: 1, x: 0, y: 0, z: 0, vy: 0, grounded: true,
  groundY: 0, // ТЕКУЩАЯ ВЫСОТА ПОЛА ПОД ИГРОКОМ
  rolling: 0, invuln: 0, runPhase: 0, squash: 0
};
const granny = {
  node: null, zOff: -9.2, targetZOff: -9.2, closeT: 0, phase: 0, catchMode: false
};
let deskScene = null; // { group, diary } — учительский стол для меню/интро
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
    burst(player.x, 0.1, player.z, '#b8a58c', 4, 1.6);
  } else if (!player.grounded) {
    player.vy = Math.min(player.vy, -4); // быстрое приземление в подкат
    player.rolling = ROLL_TIME;
  }
}
function nearestLane(x) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < 3; i++) { const d = Math.abs(x - LANES[i]); if (d < bd) { bd = d; best = i; } }
  return best;
}

/* ---------- спавн ---------- */
function fillSpawns() {
  while (G.nextZ < player.z + SPAWN_AHEAD) {
    const speedDiff = clamp((G.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
    const timeDiff = clamp(G.runTime / 16, 0, 1); // резкий рост после 16 сек бега
    const diff = clamp(speedDiff * 0.5 + timeDiff * 1.1, 0, 1);

    let pat;
    let tries = 0;
    // Подбираем паттерн (избегаем сложных паттернов на низких скоростях)
    do { pat = pick(PATTERNS)(); tries++; } while (pat.diff && diff < 0.25 && tries < 8);

    const z0 = G.nextZ;

    // --- ДИНАМИЧЕСКОЕ МАСШТАБИРОВАНИЕ ---
    // Коэффициент ускорения: 1.0 на старте, растет до ~2.45 на макс. скорости
    const speedRatio = G.speed / BASE_SPEED;

    // 1. Спавним препятствия (растягиваем расстояние внутри паттерна)
    for (const o of pat.obs) {
      // Умножаем локальную координату Z (dz) на коэффициент скорости
      spawnObstacle(o.t, LANES[o.lane], z0 + (o.dz * speedRatio));
    }

    // 2. Спавним монетки-бутылки (аналогично растягиваем арки и линии)
    for (const c of pat.coins) {
      spawnCoin(LANES[c.lane], c.y, z0 + (c.dz * speedRatio));
    }

    // 3. Растягиваем общую длину самого паттерна
    const scaledLen = pat.len * speedRatio;

    // --- УСЛОЖНЕНИЕ СО ВРЕМЕНЕМ БЕГА ---
    // Чем дольше и быстрее бежишь, тем короче безопасный промежуток между паттернами,
    // поэтому препятствия появляются чаще и улучшается ощущение нарастающей сложности.
    const safeTimeGap = lerp(1.0, 0.22, Math.pow(diff, 2.0));
    const gapDistance = safeTimeGap * G.speed * (1.08 - diff * 0.12);

    // Устанавливаем точку для генерации следующего куска
    G.nextZ = z0 + scaledLen + gapDistance;
  }
}

/* ---------- столкновения ---------- */
function updateCollisions(dt) {
  for (let i = activeObstacles.length - 1; i >= 0; i--) {
    const o = activeObstacles[i];
    if (o.z < player.z - DESPAWN_BEHIND) { releaseObstacle(i); continue; }
    
    const dz = Math.abs(player.z - o.z);
    if (dz > o.hz + 0.45) continue;
    const dx = Math.abs(player.x - o.x);
    if (dx > o.hw + 0.34) continue;
    
    const rolling = player.rolling > 0;
    const py0 = player.y + (rolling ? 0.06 : 0.08); // Низ игрока
    const py1 = player.y + (rolling ? 0.80 : 1.86); // Верх игрока
    
    // --- НОВОЕ: СПАСЕНИЕ НА КРЫШЕ ---
    // Если низ игрока выше верха препятствия (минус маленькая погрешность),
    // значит мы напрыгнули на него! Пропускаем смерть.
    if (py0 >= o.y1 - 0.2) continue; 
    
    // Спасение при подкате (как у тебя и было)
    if (py1 <= o.y0 + 0.04) continue;
    
    if (player.invuln > 0 || o.stumbled) continue;
    
    const ox = (o.hw + 0.34) - dx;
    const changing = Math.abs(player.x - LANES[player.lane]) > 0.6;
    if (ox < 0.5 && changing) stumble(o);
    else caught();
    return;
  }
}
function getGroundY() {
  let currentGround = 0;
  for (let i = 0; i < activeObstacles.length; i++) {
    const o = activeObstacles[i];
    const def = OB_DEFS[o.t];
    if (!def.platform) continue; // Прыгать можно только на платформы

    // Проверяем, находимся ли мы над объектом (по X и Z)
    // Чуть уменьшаем хитбокс по краям, чтобы игрок падал, если стоит на самом краешке
    if (Math.abs(player.z - o.z) > o.hz + 0.25) continue;
    if (Math.abs(player.x - o.x) > o.hw + 0.25) continue;

    // Если ноги игрока находятся ВЫШЕ или ПОЧТИ НА УРОВНЕ крыши объекта
    if (player.y >= o.y1 - 0.25) {
      currentGround = Math.max(currentGround, o.y1);
    }
  }
  return currentGround;
}
function stumble(o) {
  if (granny.closeT > 1.2) { caught(); return; }
  o.stumbled = true;
  // отскок назад — на полосу, с которой прибежал
  const movingRight = LANES[player.lane] > player.x;
  let nl = nearestLane(player.x);
  if (Math.abs(LANES[nl] - o.x) < o.hw + 0.35) nl = clamp(nl + (movingRight ? -1 : 1), 0, 2);
  player.lane = nl;
  player.invuln = 1.4;
  G.speed = Math.max(BASE_SPEED * 0.85, G.speed * 0.55);
  granny.closeT = 5;
  granny.targetZOff = -2.7;
  G.shake = Math.max(G.shake, 0.45);
  Sound.stumble(); Sound.growl();
  const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  const y = $('yell'); y.textContent = pick(YELLS);
  y.classList.remove('on'); void y.offsetWidth; y.classList.add('on');
  burst(player.x, 1, player.z, '#ffd94a', 5, 2.2);
}
function caught() {
  G.state = 'over';
  G.overT = 0; G.overShown = false;
  granny.catchMode = true;
  granny.targetZOff = -0.85;
  G.shake = 0.8;
  Sound.crash(); Sound.growl();
  const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  burst(player.x, 1.2, player.z, '#b0451f', 8, 3);
  Sdk.gameplayStop();
  const m = Math.floor(G.dist);
  const isRecord = m > save.best;
  if (isRecord) save.best = m;
  save.bottles += G.bottles;
  deathCount++;
  persistSave();
  $('over').dataset.record = isRecord ? '1' : '0';
}

/* ---------- показ экранов ---------- */
function show(el, on) { el.classList.toggle('hidden', !on); }
function updateMenuStats() {
  $('menuBest').textContent = save.best;
  $('menuBottles').textContent = save.bottles;
}
function showMenu() {
  setupMenuScene();
  show($('menu'), true); show($('over'), false); show($('pause'), false); show($('hud'), false);
  show($('reviveBtn'), false); show($('skipIntroBtn'), false);
  updateMenuStats();
  Sdk.gameplayStop();
}
function resetRun() {
  for (let i = activeObstacles.length - 1; i >= 0; i--) releaseObstacle(i);
  for (let i = activeCoins.length - 1; i >= 0; i--) releaseCoin(i);
  // вернуть сегменты коридора на исходные позиции
  segments.forEach((seg, i) => { seg.position.z = i * SEG_LEN; randomizeSegmentDecor(seg); });
  player.lane = 1; player.x = 0; player.y = 0; player.vy = 0; player.z = 0;
  player.grounded = true; player.rolling = 0; player.invuln = 0; player.squash = 0;
  player.node.pivot.rotation.x = 0;
  player.node.inner.scale.set(1, 1, 1);
  player.node.root.rotation.set(0, 0, 0);
  player.node.inner.rotation.set(0, 0, 0);
  G.speed = BASE_SPEED; G.dist = 0; G.runTime = 0; G.bottles = 0;
  G.nextZ = 46; G.reviveUsed = false; G.overShown = false;
  granny.closeT = 0; granny.catchMode = false;
  $('bottleNum').textContent = '0';
  updateScoreHud(true);
  fillSpawns();
}
/* Сцена меню = класс: бабка за столом у доски, Мэл у входа */
function setupMenuScene() {
  resetRun();
  G.state = 'menu';
  G.camBlend = 0;
  player.z = -4.6;
  deskScene.diary.visible = true;
  player.node.diary.visible = false;
  granny.zOff = -9.2; granny.targetZOff = -9.2;
  granny.node.root.position.set(0, 0, -10.5);
  intro.t = 0; intro.grab = false; intro.alert = false; intro.hop = false; intro.turn = false;
  intro.faceY = Math.PI;
}
/* Интро: Мэл крадёт дневник с учительского стола в кабинете и убегает в коридор */
function startIntro() {
  G.state = 'intro';
  G.camBlend = 0;
  intro.t = 0;
  show($('menu'), false); show($('over'), false); show($('pause'), false); show($('hud'), false);
  show($('skipIntroBtn'), true);
  Sound.ensure();
}
function beginRun() {
  G.state = 'run';
  intro.runStartZ = player.z;
  G.camBlend = 1;
  G.speed = BASE_SPEED;
  granny.zOff = granny.node.root.position.z - player.z;
  granny.targetZOff = -9.2;
  show($('skipIntroBtn'), false);
  show($('hud'), true);
  G.hintT = 3.2;
  $('hint').classList.add('on');
  Sound.ensure();
  Sdk.gameplayStart();
}
function skipIntro() {
  player.z = -0.4; player.y = 0; player.vy = 0; player.grounded = true;
  intro.faceY = 0; intro.turn = true; intro.grab = true; intro.alert = true;
  deskScene.diary.visible = false;
  player.node.diary.visible = true;
  granny.node.root.position.set(-1.7, 0, -3.2);
  beginRun();
}
/* Быстрый рестарт без интро (после проигрыша/паузы) */
function quickRestart() {
  resetRun();
  player.z = 0;
  deskScene.diary.visible = false;
  player.node.diary.visible = true;
  granny.zOff = -4.5; granny.targetZOff = -9.2;
  granny.node.root.position.set(0, 0, -4.5);
  G.state = 'run';
  G.camBlend = 1;
  show($('menu'), false); show($('over'), false); show($('pause'), false); show($('skipIntroBtn'), false);
  show($('hud'), true);
  G.hintT = 0; $('hint').classList.remove('on');
  Sound.ensure();
  Sdk.gameplayStart();
}
function updateIntro(dt) {
  intro.t += dt;
  const t = intro.t;
  const n = player.node;
  if (t < 1.1) {
    // крадётся по проходу между партами к учительскому столу
    player.z = lerp(-4.6, -8.3, smooth(clamp(t / 1.1, 0, 1)));
    player.runPhase += dt * 6.5;
    const s = Math.sin(player.runPhase);
    n.legL.rotation.x = s * 0.55; n.legR.rotation.x = -s * 0.55;
    n.armL.rotation.x = -s * 0.4;
    n.armR.rotation.x = lerp(n.armR.rotation.x, -0.7, dt * 4);
    n.inner.position.y = -0.92 + Math.abs(Math.cos(player.runPhase)) * 0.03;
  } else if (t < 2.0) {
    // тянется через стол, хватает дневник и поднимает его
    n.legL.rotation.x = lerp(n.legL.rotation.x, 0, dt * 8);
    n.legR.rotation.x = lerp(n.legR.rotation.x, 0, dt * 8);
    n.armR.rotation.x = lerp(n.armR.rotation.x, t < 1.45 ? -1.55 : -2.4, dt * 6);
    if (!intro.grab && t >= 1.3) {
      intro.grab = true;
      deskScene.diary.visible = false;
      player.node.diary.visible = true;
      Sound.coin();
    }
  } else {
    // разворот — и бежать к двери в коридор!
    if (!intro.turn) { intro.turn = true; intro.faceY = 0; }
    if (!intro.hop && player.grounded) {
      player.vy = 4.4; player.grounded = false; intro.hop = true;
      Sound.jump();
    }
    player.z += 8 * dt;
    n.armR.rotation.x = lerp(n.armR.rotation.x, -0.6, dt * 5);
  }
  if (!player.grounded) {
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) { player.y = 0; player.vy = 0; player.grounded = true; player.squash = 0.18; }
  }
  if (!intro.alert && t >= 1.6) {
    intro.alert = true;
    const y = $('yell'); y.textContent = 'МОЙ ДНЕВНИК!!!';
    y.classList.remove('on'); void y.offsetWidth; y.classList.add('on');
    Sound.growl();
  }
  // бабка: до срабатывания — уткнулась в журнал, после — вскакивает и гонится
  const gn = granny.node;
  if (intro.alert) {
    gn.armL.rotation.x = lerp(gn.armL.rotation.x, -2.4, dt * 6);
    gn.armR.rotation.x = lerp(gn.armR.rotation.x, -2.7 + Math.sin(t * 18) * 0.25, dt * 6);
    gn.headG.rotation.x = lerp(gn.headG.rotation.x, -0.12, dt * 6);
    gn.inner.position.y = Math.abs(Math.sin(t * 10)) * 0.1;
    gn.root.position.x = lerp(gn.root.position.x, -1.7, dt * 2.5); // обегает стол
    if (t >= 2.0) gn.root.position.z += 8.2 * dt; // гонится вслед
  } else {
    gn.armL.rotation.x = lerp(gn.armL.rotation.x, -1.25, dt * 4);
    gn.armR.rotation.x = lerp(gn.armR.rotation.x, -1.45, dt * 4);
    gn.headG.rotation.x = lerp(gn.headG.rotation.x, 0.42, dt * 3);
    gn.inner.position.y = -0.04;
  }
  if (t >= 3.0) beginRun();
}
function pauseRun() {
  if (G.state !== 'run') return;
  G.state = 'paused';
  show($('pause'), true);
  Sound.pauseAll();
  Sdk.gameplayStop();
}
function resumeRun() {
  if (G.state !== 'paused') return;
  G.state = 'run';
  show($('pause'), false);
  Sound.resumeAll();
  Sdk.gameplayStart();
}
function showOverScreen() {
  G.overShown = true;
  const m = Math.floor(G.dist);
  $('overScore').textContent = m;
  $('overBottles').textContent = G.bottles;
  $('overBest').textContent = save.best;
  show($('newRecord'), $('over').dataset.record === '1');
  show($('reviveBtn'), !G.reviveUsed && !!Sdk.ysdk);
  show($('over'), true);
  show($('hud'), false);
}
function revive() {
  G.reviveUsed = true;
  show($('over'), false); show($('hud'), true);
  G.state = 'run';
  clearObstacles(player.z - 6, player.z + 50);
  player.invuln = 2.8;
  player.rolling = 0;
  player.node.pivot.rotation.x = 0;
  G.speed = Math.max(BASE_SPEED, G.speed * 0.7);
  granny.closeT = 0; granny.catchMode = false; granny.targetZOff = -9.2;
  G.shake = 0.3;
  Sdk.gameplayStart();
}

/* ---------- HUD ---------- */
let lastScoreText = '';
function updateScoreHud(force) {
  const m = Math.floor(G.dist);
  const t = m + ' ';
  if (t !== lastScoreText || force) {
    lastScoreText = t;
    $('score').innerHTML = m + ' <small>м</small>';
  }
}

/* ---------- камера ---------- */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
function smooth(t) { return t * t * (3 - 2 * t); }
function updateIntroCamera() {
  const t = intro.t;
  let cx, cy, cz, lx, ly, lz;
  if (t < 1.6) {
    // общий план класса: бабка за столом у доски, Мэл крадётся по проходу
    const p = smooth(clamp(t / 1.6, 0, 1));
    cx = lerp(4.6, 3.6, p); cy = lerp(2.7, 2.2, p); cz = lerp(-4.4, -5.4, p);
    lx = 0; ly = 1.3; lz = -8.0;
  } else {
    // погоня: камера держит низкий ракурс до тех пор, пока игрок не пробежит 10 метров
    // после начала бега, и только потом начинает плавно отдаляться по Y
    const pz = player.z;
    const runDist = Math.max(0, pz - intro.runStartZ);
    const rise = smooth(clamp((runDist - 10) / 8, 0, 1));
    cx = player.x * 0.5;
    cy = 2.2 + rise * 1.6 + clamp((pz + 3) * 0.35, 0, 1.1);
    cz = pz - 3.5;
    lx = player.x * 0.7; ly = 1.35; lz = pz + 6;
  }
  camPos.lerpVectors(camPos, tmpA.set(cx, cy, cz), 0.14);
  camLook.lerpVectors(camLook, tmpB.set(lx, ly, lz), 0.14);
  camera.position.copy(camPos); camera.lookAt(camLook);
  camera.fov = 60; camera.updateProjectionMatrix();
}
function updateCamera(dt) {
  const px = player.x, pz = player.z;
  const spN = clamp((G.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
  // игровая камера
  tmpA.set(px * 0.5, 4.35 + spN * 0.25, pz - 6.9 - spN * 1.1);
  tmpB.set(px * 0.72, 1.55, pz + 8.5);
  // камера меню (класс: Мэл на переднем плане, за ним стол и бабка)
  tmpC.set(3.3, 2.0, pz + 1.6);
  tmpD.set(-0.3, 1.25, pz - 2.2);
  // камера проигрыша
  if (G.state === 'over' && G.overT > 0.05) {
    const k = smooth(clamp(G.overT / 0.9, 0, 1));
    tmpA.set(px + 3.2, 2.3, pz - 1.6);
    tmpB.set(px, 1.25, pz);
    tmpC.copy(tmpA); tmpD.copy(tmpB);
    G.camBlend = 1;
    camPos.lerpVectors(camPos.lengthSq() === 0 ? tmpA : camPos, tmpA, k);
    camLook.lerpVectors(camLook.lengthSq() === 0 ? tmpB : camLook, tmpB, k);
  } else {
    const b = smooth(clamp(G.camBlend, 0, 1));
    camPos.lerpVectors(tmpC, tmpA, b);
    camLook.lerpVectors(tmpD, tmpB, b);
  }
  // плавное следование камеры (мягкий переход после интро/меню)
  const runDistance = G.state === 'run' ? Math.max(0, player.z - intro.runStartZ) : 0;
  const cameraRelease = G.state === 'run' ? clamp((runDistance - 10) / 10, 0, 1) : 1;
  // До 10 м после старта бега держим камеру ближе к игроку, чтобы не задевать перегородку.
  // После этого начинаем постепенно отдалять её назад и вперед по направлению движения.
  tmpA.z += cameraRelease * 2.8;
  tmpB.z += cameraRelease * 2.4;
  if (!updateCamera.sp) { updateCamera.sp = camPos.clone(); updateCamera.sl = camLook.clone(); }
  updateCamera.sp.lerp(camPos, Math.min(1, dt * 10));
  updateCamera.sl.lerp(camLook, Math.min(1, dt * 10));
  camera.position.copy(updateCamera.sp);
  camera.lookAt(updateCamera.sl);
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
  n.root.rotation.y = lerp(n.root.rotation.y, faceTarget, dt * 6);

  if (G.state === 'menu') {
    const bob = Math.sin(performance.now() / 900);
    n.legL.rotation.x = lerp(n.legL.rotation.x, -0.06, dt * 8);
    n.legR.rotation.x = lerp(n.legR.rotation.x, 0.06, dt * 8);
    n.armL.rotation.x = lerp(n.armL.rotation.x, -0.18, dt * 8);
    n.armR.rotation.x = lerp(n.armR.rotation.x, -0.14, dt * 8);
    n.inner.position.y = -0.92 + Math.sin(performance.now() / 500) * 0.02;
    n.pivot.rotation.x = 0;
    n.shadow.scale.setScalar(1);
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
    n.legL.rotation.x = lerp(n.legL.rotation.x, -1.15, dt * 10);
    n.legR.rotation.x = lerp(n.legR.rotation.x, 0.45, dt * 10);
    n.armL.rotation.x = lerp(n.armL.rotation.x, -2.4, dt * 8);
    n.armR.rotation.x = lerp(n.armR.rotation.x, -2.4, dt * 8);
  }
  if (player.rolling > 0) {
    player.rolling -= dt;
    const k = 1 - clamp(player.rolling / ROLL_TIME, 0, 1);
    n.pivot.rotation.x = -Math.PI * 2 * k;
    if (player.rolling <= 0) n.pivot.rotation.x = 0;
  } else if (player.grounded) {
    n.pivot.rotation.x = 0;
  }
  if (player.squash > 0) {
    player.squash -= dt;
    const k = clamp(player.squash / 0.18, 0, 1);
    n.inner.scale.y = 1 - 0.22 * Math.sin(k * Math.PI);
    if (player.squash <= 0) n.inner.scale.y = 1;
  }
  // наклон при смене полосы (не в момент поимки — там своё пошатывание)
  if (G.state !== 'over') {
    const laneX = LANES[player.lane];
    n.root.rotation.z = clamp((laneX - player.x) * 0.14, -0.3, 0.3);
  }
  // мигание при неуязвимости
  if (player.invuln > 0) n.inner.visible = Math.floor(performance.now() / 90) % 2 === 0;
  else n.inner.visible = true;
  // тень
  const sh = clamp(1 - player.y * 0.32, 0.4, 1);
  n.shadow.scale.setScalar(sh);
  n.shadow.position.y = 0.02 - player.y * 0.0;
}
function animateGranny(dt) {
  const n = granny.node;
  granny.zOff = lerp(granny.zOff, granny.targetZOff, dt * 2.4);
  if (G.state === 'menu' || G.state === 'intro') {
    n.armL.rotation.x = lerp(n.armL.rotation.x, -1.3, dt * 4);
    n.armR.rotation.x = lerp(n.armR.rotation.x, -1.7, dt * 4);
    n.inner.position.y = -0.04;
    n.headG.rotation.x = 0;
    return;
  }
  if (G.state === 'over') {
    n.root.position.x = lerp(n.root.position.x, player.x, dt * 3);
    n.root.position.z = lerp(n.root.position.z, player.z - 0.85, dt * 5);
  } else {
    n.root.position.x = lerp(n.root.position.x, player.x, dt * 2);
    n.root.position.z = player.z + granny.zOff;
  }
  n.root.rotation.y = 0;
  granny.phase += dt * (G.state === 'over' ? 4 : 7 + G.speed * 0.5);
  const s = Math.sin(granny.phase);
  if (granny.catchMode) {
    n.armL.rotation.x = lerp(n.armL.rotation.x, -2.5, dt * 6);
    n.armR.rotation.x = lerp(n.armR.rotation.x, -2.7, dt * 6);
    n.headG.rotation.x = 0.15;
    n.inner.position.y = Math.abs(Math.cos(granny.phase)) * 0.06;
  } else {
    n.armL.rotation.x = -s * 0.7;
    n.armR.rotation.x = -1.9 + Math.sin(granny.phase * 0.7) * 0.35; // палка поднята
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

  if (G.state === 'run') {
    G.speed = Math.min(MAX_SPEED, G.speed + ACCEL * dt);
    G.runTime += dt;
    G.dist += G.speed * dt;
    player.z += G.speed * dt;

    // смена полосы
    const laneX = LANES[player.lane];
    player.x += (laneX - player.x) * Math.min(1, dt * 11);

    // прыжок
    // --- НОВАЯ ГРАВИТАЦИЯ И ПРОВЕРКА ПОЛА ---
    player.groundY = getGroundY(); // Узнаем, где сейчас пол (0 или крыша парты)

    // Если мы в воздухе ИЛИ пол ушел из под ног (сбежали с парты)
    if (player.y > player.groundY || player.vy > 0) {
      player.grounded = false;
      player.vy -= GRAVITY * dt;
      player.y += player.vy * dt;
      
      // Проверка приземления на ТЕКУЩИЙ пол
      if (player.y <= player.groundY && player.vy < 0) {
        player.y = player.groundY; 
        player.vy = 0; 
        player.grounded = true;
        player.squash = 0.18;
        Sound.land();
        burst(player.x, player.groundY + 0.08, player.z, '#c9c2b4', 3, 1.4);
      }
    } else {
      // Игрок бежит ровно по поверхности (земле или парте)
      player.y = player.groundY;
      player.grounded = true;
    }
    if (player.invuln > 0) player.invuln -= dt;
    if (granny.closeT > 0) {
      granny.closeT -= dt;
      if (granny.closeT <= 0) granny.targetZOff = -9.2;
    }

    // бутылки
    for (let i = activeCoins.length - 1; i >= 0; i--) {
      const c = activeCoins[i];
      if (c.z < player.z - DESPAWN_BEHIND) { releaseCoin(i); continue; }
      const dz = Math.abs(player.z - c.z);
      if (dz < 0.95) {
        const dx = Math.abs(player.x - c.x);
        const dy = Math.abs((player.y + 0.95) - c.y);
        if (dx < 0.8 && dy < 1.2) {
          G.bottles++;
          $('bottleNum').textContent = G.bottles;
          Sound.coin();
          burst(c.x, c.y, c.z, '#ffe36e', 3, 1.8);
          releaseCoin(i);
        }
      }
    }

    updateCollisions(dt);
    fillSpawns();
    updateScoreHud();

    // сегменты коридора
    for (const seg of segments) {
      if (seg.position.z + SEG_LEN < player.z - 30) {
        seg.position.z += SEG_LEN * SEG_COUNT;
        randomizeSegmentDecor(seg);
      }
    }
    // bottles bob
    for (const c of activeCoins) {
      c.sprite.position.y = c.y + Math.sin(t / 300 + c.sprite.userData.phase) * 0.09;
    }

    if (G.hintT > 0) {
      G.hintT -= dt;
      if (G.hintT <= 0) $('hint').classList.remove('on');
    }
    G.camBlend = Math.min(1, G.camBlend + dt * 1.6);
  } else if (G.state === 'over') {
    G.overT += dt;
    G.speed = Math.max(0, G.speed - 30 * dt);
    player.z += G.speed * dt;
    // пошатывание
    player.node.root.rotation.z = Math.sin(G.overT * 9) * 0.16 * Math.max(0, 1 - G.overT);
    player.node.inner.rotation.x = lerp(player.node.inner.rotation.x, -0.35, dt * 4);
    if (G.overT > 1.15 && !G.overShown) showOverScreen();
  } else if (G.state === 'menu') {
    G.camBlend = Math.max(0, G.camBlend - dt * 1.6);
  } else if (G.state === 'intro') {
    updateIntro(dt);
  }

  animatePlayer(dt);
  if (G.state !== 'intro') animateGranny(dt);
  updateParticles(dt);
  if (G.state === 'intro') updateIntroCamera();
  else updateCamera(dt);
  renderer.render(scene, camera);
}

/* ---------- ввод ---------- */
function bindInput() {
  window.addEventListener('pointerdown', () => Sound.ensure());
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (G.state === 'intro') { skipIntro(); return; }
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': move(1); break;
      case 'ArrowRight': case 'KeyD': move(-1); break;
      case 'ArrowUp': case 'KeyW': case 'Space': jump(); e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': roll(); break;
      case 'Escape': case 'KeyP':
        if (G.state === 'run') pauseRun();
        else if (G.state === 'paused') resumeRun();
        break;
      case 'Enter':
        if (G.state === 'menu') startIntro();
        else if (G.state === 'over' && G.overShown) { maybeInterstitial(); quickRestart(); }
        break;
    }
  });

  const gameEl = $('game');
  let ts = null;
  gameEl.addEventListener('pointerdown', (e) => {
    Sound.ensure();
    if (G.state === 'intro') { skipIntro(); return; }
    if (G.state !== 'run') return;
    ts = { x: e.clientX, y: e.clientY, t: performance.now(), used: false };
  });
  gameEl.addEventListener('pointermove', (e) => {
    if (!ts || ts.used || G.state !== 'run') return;
    const dx = e.clientX - ts.x, dy = e.clientY - ts.y;
    if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
    ts.used = true;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy < 0) jump();
    else roll();
  });
  gameEl.addEventListener('pointerup', (e) => {
    if (!ts) return;
    if (!ts.used && G.state === 'run' && performance.now() - ts.t < 260) jump();
    ts = null;
  });
  window.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.state === 'intro') skipIntro();
      if (G.state === 'run') pauseRun();
    }
  });

  // кнопки
  $('playBtn').addEventListener('click', () => { Sound.ensure(); Sound.click(); startIntro(); });
  $('skipIntroBtn').addEventListener('click', () => { Sound.click(); if (G.state === 'intro') skipIntro(); });
  $('pauseBtn').addEventListener('click', () => { Sound.click(); pauseRun(); });
  $('resumeBtn').addEventListener('click', () => { Sound.click(); resumeRun(); });
  $('restartBtn').addEventListener('click', () => { Sound.click(); show($('pause'), false); Sound.resumeAll(); maybeInterstitial(); quickRestart(); });
  $('pauseMenuBtn').addEventListener('click', () => { Sound.click(); Sound.resumeAll(); show($('pause'), false); maybeInterstitial(); showMenu(); });
  $('againBtn').addEventListener('click', () => { Sound.click(); maybeInterstitial(); quickRestart(); });
  $('overMenuBtn').addEventListener('click', () => { Sound.click(); maybeInterstitial(); showMenu(); });
  $('reviveBtn').addEventListener('click', () => {
    Sound.click();
    show($('reviveBtn'), false);
    showRewarded(() => revive(), () => { show($('reviveBtn'), true); });
  });
  $('musicBtn').addEventListener('click', () => {
    save.music = save.music ? 0 : 1;
    Sound.musicOn = !!save.music; Sound.applyToggles(); persistSave();
    $('musicBtn').style.opacity = save.music ? '1' : '0.4';
    Sound.click();
  });
  $('soundBtn').addEventListener('click', () => {
    save.sound = save.sound ? 0 : 1;
    Sound.sfxOn = !!save.sound; Sound.applyToggles(); persistSave();
    $('soundBtn').textContent = save.sound ? '🔊' : '🔇';
    Sound.click();
  });
}

/* ----------resize ---------- */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ---------- запуск ---------- */
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x9fb2c0);
  $('game').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fb2c0, 34, 130);

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  onResize();
  window.addEventListener('resize', onResize);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x77808c, 0.95));
  const dir = new THREE.DirectionalLight(0xfff0d6, 0.65);
  dir.position.set(3, 10, 4);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xd6e4ff, 0.3);
  dir2.position.set(-4, 6, -6);
  scene.add(dir2);

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

  // иконка бутылки в UI
  for (const id of ['bottleIcon', 'menuBottleIcon', 'overBottleIcon']) {
    const im = $(id); if (im) im.src = ASSETS.bottle;
  }
  $('hint').innerHTML = '<span>⬅️➡️ полосы</span><span>⬆️ прыжок</span><span>⬇️ подкат</span>';

  bindInput();
  setupMenuScene();

  requestAnimationFrame(loop);

  const t0 = performance.now();
  setTimeout(() => {
    show($('loading'), false);
    showMenu();
    Sdk.loadingReady();
  }, Math.max(0, 500 - (performance.now() - t0)));
  
}

readLocalSave();
Sound.musicOn = !!save.music;
Sound.sfxOn = !!save.sound;

Promise.all([loadTextures(), Sdk.init()])
  .then(() => Sdk.loadCloud())
  .then(() => {
    Sound.musicOn = !!save.music;
    Sound.sfxOn = !!save.sound;
    $('musicBtn').style.opacity = save.music ? '1' : '0.4';
    $('soundBtn').textContent = save.sound ? '🔊' : '🔇';
    init();
  })
  .catch(err => {
    console.error(err);
    try { init(); } catch (e) { console.error(e); $('loadingText').textContent = 'Ошибка загрузки :('; }
  });

})();
