export const $ = id => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const smooth = t => t * t * (3 - 2 * t);
export function weightedPick(items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let r = Math.random() * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

export const UI = {};
export const UI_IDS = ['loading', 'loadingText', 'menu', 'over', 'pause', 'hud', 'reviveBtn', 'skipIntroBtn',
  'flash', 'yell', 'bottleNum', 'score', 'hint', 'menuBest', 'menuBottles', 'overScore', 'overBottles',
  'overBest', 'newRecord', 'musicBtn', 'soundBtn', 'game',
  'shop', 'menuCurrency', 'shopCurrency', 'skinName', 'skinDesc', 'skinPrice',
  'skinAction', 'skinDots', 'shopModal', 'shopModalTitle', 'shopModalText', 'shopModalBtn',
  'shopTabSkins', 'shopTabPets'];
export function cacheUI() { for (const id of UI_IDS) UI[id] = $(id); }
export function replayCss(el) { if (!el) return; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
export function setYell(text) { if (!UI.yell) return; UI.yell.textContent = text; replayCss(UI.yell); }
export function show(el, on) { if (el) el.classList.toggle('hidden', !on); }
export const SCREENS = ['menu', 'over', 'pause', 'hud', 'reviveBtn', 'skipIntroBtn', 'shop'];
export function screens(...ids) { for (const id of SCREENS) show(UI[id], ids.indexOf(id) >= 0); }

export const LANES = [-2.3, 0, 2.3];
export const SEG_LEN = 24, SEG_COUNT = 9;
export const WALL_X = 4.6, WALL_H = 5.8;
export const GRAVITY = 28, JUMP_V = 9;
export const BASE_SPEED = 11, MAX_SPEED = 27, ACCEL = 0.24;
export const SPAWN_AHEAD = 170, DESPAWN_BEHIND = 14;
export const ROLL_TIME = 0.62;
export const HIT_W = 0.34, HIT_Z = 0.36, PLATFORM_TOL = 0.28;
export const FOG_NEAR = 34, FOG_FAR = 130, CAM_FAR = 150;
export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
export const CLASS_Z0 = -2.6, CLASS_Z1 = -11.8;
export const DOOR_HALF = 2.6, DOOR_TOP = 4.6, PART_T = 0.2;
export const GRANNY_INTRO_X = -1.75;
export const DESK_TOP_Y = 1.045;

export const save = { best: 0, bottles: 0, currency: 0, ownedSkins: [], selectedSkin: '', ownedPets: [], selectedPet: '', music: 1, sound: 1 };
const cleanStrList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
export function readLocalSave() {
  try {
    const s = JSON.parse(localStorage.getItem('melEscapeSave') || 'null');
    if (s) {
      save.best = s.best | 0; save.bottles = s.bottles | 0; save.music = s.music !== 0 ? 1 : 0; save.sound = s.sound !== 0 ? 1 : 0;
      save.currency = s.currency | 0; save.ownedSkins = cleanStrList(s.ownedSkins); save.selectedSkin = typeof s.selectedSkin === 'string' ? s.selectedSkin : '';
      save.ownedPets = cleanStrList(s.ownedPets); save.selectedPet = typeof s.selectedPet === 'string' ? s.selectedPet : '';
    }
  } catch (e) {}
}
export function syncToggleUI() {
  Sound.musicOn = !!save.music; Sound.sfxOn = !!save.sound;
  const mb = $('musicBtn'), sb = $('soundBtn');
  if (mb) mb.style.opacity = save.music ? '1' : '0.4';
  if (sb) sb.textContent = save.sound ? '🔊' : '🔇';
}
let cloudTimer = null, cloudPending = false;
export function cloudSave() {
  Sdk.getPlayer().then(p => p.setData({ best: save.best, bottles: save.bottles, music: save.music, sound: save.sound, currency: save.currency, ownedSkins: save.ownedSkins, selectedSkin: save.selectedSkin, ownedPets: save.ownedPets, selectedPet: save.selectedPet }, false)).catch(() => {});
}
export function persistSave() {
  try { localStorage.setItem('melEscapeSave', JSON.stringify(save)); } catch (e) {}
  if (!Sdk.ysdk) return;
  if (cloudTimer) { cloudPending = true; return; }
  cloudSave();
  cloudTimer = setTimeout(() => { cloudTimer = null; if (cloudPending) { cloudPending = false; persistSave(); } }, 2500);
}

export const Sdk = {
  ysdk: null, playerPromise: null,
  init() {
    return new Promise(res => {
      if (typeof window.YaGames === 'undefined') return res();
      try { window.YaGames.init().then(y => { Sdk.ysdk = y; res(); }).catch(() => res()); } catch (e) { res(); }
    });
  },
  getPlayer() {
    if (!this.ysdk) return Promise.reject(new Error('no sdk'));
    if (!this.playerPromise) {
      try { this.playerPromise = this.ysdk.getPlayer({ scopes: false }); this.playerPromise.catch(() => { Sdk.playerPromise = null; }); } catch (e) { return Promise.reject(e); }
    }
    return this.playerPromise;
  },
  feature(api, method) { try { const f = Sdk.ysdk && Sdk.ysdk.features && Sdk.ysdk.features[api]; if (f) f[method](); } catch (e) {} },
  loadingReady() { Sdk.feature('LoadingAPI', 'ready'); },
  gameplayStart() { Sdk.feature('GameplayAPI', 'start'); },
  gameplayStop() { Sdk.feature('GameplayAPI', 'stop'); },
  loadCloud() {
    if (!this.ysdk) return Promise.resolve(false);
    return this.getPlayer().then(p => p.getData(['best', 'bottles', 'music', 'sound', 'currency', 'ownedSkins', 'selectedSkin', 'ownedPets', 'selectedPet'])).then(d => {
      if (d && typeof d.best === 'number') {
        save.best = Math.max(save.best, d.best | 0); save.bottles = Math.max(save.bottles, d.bottles | 0);
        if (typeof d.music === 'number') save.music = d.music ? 1 : 0;
        if (typeof d.sound === 'number') save.sound = d.sound ? 1 : 0;
      }
      if (d) {
        if (typeof d.currency === 'number') save.currency = Math.max(save.currency, d.currency | 0);
        for (const id of cleanStrList(d.ownedSkins)) if (save.ownedSkins.indexOf(id) < 0) save.ownedSkins.push(id);
        if (typeof d.selectedSkin === 'string' && d.selectedSkin) save.selectedSkin = d.selectedSkin;
        for (const id of cleanStrList(d.ownedPets)) if (save.ownedPets.indexOf(id) < 0) save.ownedPets.push(id);
        if (typeof d.selectedPet === 'string' && d.selectedPet) save.selectedPet = d.selectedPet;
      }
      return true;
    }).catch(() => false);
  }
};
export function withTimeout(p, ms) {
  return new Promise(res => {
    let done = false; const t = setTimeout(() => { if (!done) { done = true; res(); } }, ms);
    Promise.resolve(p).then(() => {}, () => {}).then(() => { if (!done) { done = true; clearTimeout(t); res(); } });
  });
}

export let adBusy = false;
export function setAdBusy(v) { adBusy = v; }
let lastInterstitial = Date.now();
export function maybeInterstitial(then) {
  const next = typeof then === 'function' ? then : () => {};
  const y = Sdk.ysdk;
  if (!y || !y.adv || adBusy || Date.now() - lastInterstitial < 75000) { next(); return; }
  lastInterstitial = Date.now(); adBusy = true; let done = false, opened = false;
  const finish = () => { if (done) return; done = true; adBusy = false; Sound.resumeAll(); next(); };
  const guard = setTimeout(() => { if (!opened) finish(); }, 5000);
  try {
    y.adv.showFullscreenAdv({ callbacks: {
      onOpen: () => { opened = true; clearTimeout(guard); Sound.pauseAll(); },
      onClose: () => { clearTimeout(guard); finish(); }, onError: () => { clearTimeout(guard); finish(); }, onOffline: () => { clearTimeout(guard); finish(); }
    }});
  } catch (e) { clearTimeout(guard); finish(); }
}
export function showRewarded(onReward, onFail) {
  const y = Sdk.ysdk;
  if (!y || !y.adv || adBusy) return onFail();
  adBusy = true; let got = false, done = false;
  const finish = () => { if (done) return; done = true; adBusy = false; Sound.resumeAll(); got ? onReward() : onFail(); };
  try {
    y.adv.showRewardedVideo({ callbacks: {
      onOpen: () => Sound.pauseAll(), onRewarded: () => { got = true; }, onClose: finish, onError: finish
    }});
  } catch (e) { finish(); }
}

const BASS_SEQ = [110, 0, 110, 0, 130.81, 0, 110, 0, 98, 0, 98, 0, 110, 0, 130.81, 0, 87.31, 0, 87.31, 0, 110, 0, 130.81, 0, 98, 0, 110, 0, 130.81, 0, 146.83, 0];
const LEAD_SEQ = [440, 0, 523.25, 0, 587.33, 523.25, 440, 0, 392, 0, 440, 0, 523.25, 0, 587.33, 0, 349.23, 0, 440, 0, 523.25, 440, 392, 0, 440, 523.25, 587.33, 0, 659.25, 587.33, 523.25, 0];
const STEP_DUR = 60 / 138 / 2;
export const Sound = {
  ctx: null, master: null, musicGain: null, sfxGain: null, noiseBuf: null, musicOn: true, sfxOn: true, paused: false, step: 0, nextNote: 0, timer: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.paused) { try { this.ctx.resume(); } catch (e) {} } return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.5; this.sfxGain.connect(this.master);
      this.applyToggles(); this.startMusic(); return true;
    } catch (e) { return false; }
  },
  applyToggles() { if (!this.ctx) return; this.musicGain.gain.value = this.musicOn ? 0.16 : 0; this.sfxGain.gain.value = this.sfxOn ? 0.5 : 0; },
  osc(f0, f1, dur, type, vol, t, out) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  },
  tone(f0, f1, dur, type, vol, when) { if (!this.ctx || !this.sfxOn) return; this.osc(f0, f1, dur, type || 'sine', vol, when || this.ctx.currentTime, this.sfxGain); },
  noise(dur, vol, freq) {
    if (!this.ctx || !this.sfxOn) return; const ctx = this.ctx, t = ctx.currentTime;
    if (!this.noiseBuf) { const n = ctx.sampleRate, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf; }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900; const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },
  jump() { this.tone(300, 640, 0.2, 'square', 0.12); }, land() { this.noise(0.12, 0.1, 500); }, roll() { this.noise(0.28, 0.14, 700); },
  coin() { const t = this.ctx ? this.ctx.currentTime : 0; this.tone(1318, 1318, 0.07, 'sine', 0.16, t); this.tone(1760, 1760, 0.12, 'sine', 0.16, t + 0.07); },
  lane() { this.noise(0.09, 0.06, 1400); }, stumble() { this.tone(160, 90, 0.22, 'sawtooth', 0.2); this.noise(0.2, 0.14, 600); },
  crash() { this.noise(0.4, 0.3, 400); this.tone(180, 55, 0.5, 'sawtooth', 0.22); },
  growl() { const t = this.ctx ? this.ctx.currentTime : 0; this.tone(220, 90, 0.35, 'sawtooth', 0.14, t); this.tone(140, 70, 0.4, 'sawtooth', 0.12, t + 0.05); },
  click() { this.tone(650, 650, 0.05, 'sine', 0.1); }, pauseAll() { this.paused = true; if (this.ctx) try { this.ctx.suspend(); } catch (e) {} }, resumeAll() { this.paused = false; if (this.ctx) try { this.ctx.resume(); } catch (e) {} },
  startMusic() { if (this.timer || !this.ctx) return; this.nextNote = this.ctx.currentTime + 0.1; this.step = 0; this.timer = setInterval(() => this.schedule(), 110); },
  mNote(f, t, dur, type, vol) { this.osc(f, 0, dur, type, vol, t, this.musicGain); },
  schedule() {
    if (!this.ctx) return; const now = this.ctx.currentTime;
    if (this.ctx.state !== 'running' || !this.musicOn) { this.nextNote = Math.max(this.nextNote, now + 0.05); return; }
    while (this.nextNote < now + 0.3) {
      const s = this.step % 32, t = this.nextNote; const bass = BASS_SEQ[s]; if (bass) this.mNote(bass, t, 0.22, 'square', 0.5);
      const lead = LEAD_SEQ[s]; if (lead && (s % 2 === 0)) this.mNote(lead, t, 0.16, 'triangle', 0.35);
      if (s % 2 === 1) this.mNote(6000, t, 0.03, 'square', 0.05);
      this.nextNote += STEP_DUR; this.step++;
    }
  }
};