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
export const UI_IDS = ['loading', 'loadingText', 'menu', 'over', 'pause', 'hud', 'reviveBtn', 'reviveCost', 'reviveCostIcon', 'skipIntroBtn',
  'flash', 'yell', 'bottleNum', 'score', 'comboText', 'menuBest', 'menuBottles', 'overScore', 'overBottles',
  'newRecord', 'musicVol', 'soundVol', 'game',
  'shop', 'menuCurrency', 'shopCurrency', 'skinName', 'skinDesc', 'skinPrice',
  'skinAction', 'skinAdBtn', 'skinDots', 'shopModal', 'shopModalTitle', 'shopModalText', 'shopModalBtn',
  'shopTabSkins', 'shopTabPets',
  'settingsModal', 'questsModal', 'questsList', 'secretQuest', 'questToasts',
  'curAddBtn', 'adRewardModal', 'adRewardTitle', 'adRewardText', 'adRewardBtn',
  'rouletteModal', 'rouletteCurrency', 'rouletteCurIcon', 'rouletteAllIn', 'rouletteBetVal', 'rouletteBetIcon',
  'rouletteBetInc', 'rouletteBetDec', 'rouletteChanceSlider', 'rouletteSpinBtn', 'rouletteHint',
  'rouletteWheelDisc', 'rouletteWheelWater', 'rouletteWheelChance', 'rouletteWheelArrow',
  'rouletteResult', 'rouletteResultTitle', 'rouletteResultBody', 'rouletteResultIcon', 'rouletteResultAmount', 'rouletteResultText'];
export function cacheUI() { for (const id of UI_IDS) UI[id] = $(id); }
export function replayCss(el) { if (!el) return; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
export function setYell(text) { if (!UI.yell) return; UI.yell.textContent = text; replayCss(UI.yell); }
export function show(el, on) { if (el) el.classList.toggle('hidden', !on); }
export const SCREENS = ['menu', 'over', 'pause', 'hud', 'reviveBtn', 'skipIntroBtn', 'shop'];
export function screens(...ids) { for (const id of SCREENS) show(UI[id], ids.indexOf(id) >= 0); }

export const LANES = [-2.3, 0, 2.3];
// 8 сегментов по 24 м покрывают минимум 152 м впереди игрока — с запасом перекрывают
// дальнюю плоскость камеры (133 м от игрока). Девятый сегмент рисовался целиком за туманом.
export const SEG_LEN = 24, SEG_COUNT = 8;
export const WALL_X = 4.6, WALL_H = 5.8;
export const GRAVITY = 28, JUMP_V = 9;
export const BASE_SPEED = 11, MAX_SPEED = 27, ACCEL = 0.24;
export const SPAWN_AHEAD = 170, DESPAWN_BEHIND = 14;
export const ROLL_TIME = 0.62;
export const HIT_W = 0.34, HIT_Z = 0.36, PLATFORM_TOL = 0.28;
export const FOG_NEAR = 34, FOG_FAR = 130, CAM_FAR = 140; // дальше FOG_FAR туман уже полностью глухой — рисовать там нечего
export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
export const CLASS_Z0 = -2.6, CLASS_Z1 = -11.8;
export const DOOR_HALF = 2.6, DOOR_TOP = 4.6, PART_T = 0.2;
export const GRANNY_INTRO_X = -1.75;
export const DESK_TOP_Y = 1.045;

// totalDist/runs/miniGames/questsDone обслуживают систему заданий (source/quests.js):
// накопленная за все забеги дистанция, число доведённых до конца забегов, число сыгранных
// мини-игр (инкрементируется в source/roulette.js на каждую прокрутку рулетки) и id уже выданных заданий.
// musicVol/soundVol — громкость в процентах (0..100). 0 == полностью выключено, отдельного
// флага вкл/выкл больше нет: ползунок на нуле и есть «выключено» (см. syncAudioUI).
export const save = { best: 0, bottles: 0, currency: 0, ownedSkins: [], selectedSkin: '', ownedPets: [], selectedPet: '', musicVol: 100, soundVol: 100, totalDist: 0, runs: 0, miniGames: 0, questsDone: [], adProgress: {} };
const cleanStrList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
// adProgress: сколько роликов уже просмотрено за конкретный скин/питомца («skin:punk» -> 2).
// Обычный объект, а не Map: он как есть уходит в JSON и в облако Яндекса.
function cleanCounts(v) {
  const out = {};
  if (v && typeof v === 'object') for (const k in v) { const n = v[k] | 0; if (typeof k === 'string' && n > 0) out[k] = n; }
  return out;
}
// Громкость из сейва. Старые сейвы (локальные и облачные) хранили только тумблер music/sound = 0|1 —
// переводим его в проценты: было включено → 100 %, было выключено → 0 %.
function readVol(v, legacy) {
  if (typeof v === 'number') return clamp(v | 0, 0, 100);
  if (typeof legacy === 'number') return legacy ? 100 : 0;
  return 100;
}
export function readLocalSave() {
  try {
    const s = JSON.parse(localStorage.getItem('melEscapeSave') || 'null');
    if (s) {
      save.best = s.best | 0; save.bottles = s.bottles | 0; save.musicVol = readVol(s.musicVol, s.music); save.soundVol = readVol(s.soundVol, s.sound);
      save.currency = s.currency | 0; save.ownedSkins = cleanStrList(s.ownedSkins); save.selectedSkin = typeof s.selectedSkin === 'string' ? s.selectedSkin : '';
      save.ownedPets = cleanStrList(s.ownedPets); save.selectedPet = typeof s.selectedPet === 'string' ? s.selectedPet : '';
      save.totalDist = s.totalDist | 0; save.runs = s.runs | 0; save.miniGames = s.miniGames | 0; save.questsDone = cleanStrList(s.questsDone); save.adProgress = cleanCounts(s.adProgress);
    }
  } catch (e) {}
}
// Одна пара ползунков (#musicVol/#soundVol) обслуживает и меню, и паузу: окно настроек
// у них общее. Вызывать после любой правки save.musicVol/save.soundVol.
export function syncAudioUI() {
  Sound.musicVol = save.musicVol / 100; Sound.sfxVol = save.soundVol / 100;
  // musicOn/sfxOn остаются как раньше — ими гейтится синтез и стрим музыки, просто
  // теперь это производная от громкости, а не отдельный флаг.
  Sound.musicOn = save.musicVol > 0; Sound.sfxOn = save.soundVol > 0;
  syncVolRow('musicVol', save.musicVol); syncVolRow('soundVol', save.soundVol);
}
function syncVolRow(id, v) {
  const el = $(id); if (!el) return;
  if ((el.value | 0) !== v) el.value = v;
  el.style.setProperty('--p', v + '%');  // заливка трека до бегунка, см. .vol-slider в index.html
  const row = el.closest('.vol-row'); if (!row) return;
  row.querySelector('.vol-val').textContent = v + '%';
  // Иконка слева — индикатор и кнопка mute: на нуле перечёркивается (см. .vol-ico.off в index.html).
  row.querySelector('.vol-ico').classList.toggle('off', v === 0);
}

let cloudTimer = null, cloudPending = false;
export function cloudSave() {
  Sdk.getPlayer().then(p => p.setData({ best: save.best, bottles: save.bottles, musicVol: save.musicVol, soundVol: save.soundVol, currency: save.currency, ownedSkins: save.ownedSkins, selectedSkin: save.selectedSkin, ownedPets: save.ownedPets, selectedPet: save.selectedPet, totalDist: save.totalDist, runs: save.runs, miniGames: save.miniGames, questsDone: save.questsDone, adProgress: save.adProgress }, false)).catch(() => {});
}
export function persistSave() {
  try { localStorage.setItem('melEscapeSave', JSON.stringify(save)); } catch (e) {}
  if (!Sdk.ysdk) return;
  if (cloudTimer) { cloudPending = true; return; }
  cloudSave();
  cloudTimer = setTimeout(() => { cloudTimer = null; if (cloudPending) { cloudPending = false; persistSave(); } }, 2500);
}
// Немедленная запись в обход дебаунса — для ухода со вкладки и закрытия игры. Без неё прогресс
// последних 2.5 секунд (купленный скин, добитое задание) оставался только в localStorage и терялся
// при заходе с другого устройства. cloudPending здесь и есть признак «есть незаписанное»:
// если его нет, данные уже в облаке и лишний setData только тратит лимит запросов Яндекса.
export function flushSave() {
  if (!Sdk.ysdk || !cloudPending) return;
  cloudPending = false;
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
  cloudSave();
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
    return this.getPlayer().then(p => p.getData(['best', 'bottles', 'music', 'sound', 'musicVol', 'soundVol', 'currency', 'ownedSkins', 'selectedSkin', 'ownedPets', 'selectedPet', 'totalDist', 'runs', 'miniGames', 'questsDone', 'adProgress'])).then(d => {
      if (d && typeof d.best === 'number') {
        save.best = Math.max(save.best, d.best | 0); save.bottles = Math.max(save.bottles, d.bottles | 0);
        // Только если в облаке эти поля вообще есть: иначе пустая облачная запись
        // затирала бы локально выставленную громкость дефолтными 100 %.
        if (typeof d.musicVol === 'number' || typeof d.music === 'number') save.musicVol = readVol(d.musicVol, d.music);
        if (typeof d.soundVol === 'number' || typeof d.sound === 'number') save.soundVol = readVol(d.soundVol, d.sound);
      }
      if (d) {
        if (typeof d.currency === 'number') save.currency = Math.max(save.currency, d.currency | 0);
        for (const id of cleanStrList(d.ownedSkins)) if (save.ownedSkins.indexOf(id) < 0) save.ownedSkins.push(id);
        if (typeof d.selectedSkin === 'string' && d.selectedSkin) save.selectedSkin = d.selectedSkin;
        for (const id of cleanStrList(d.ownedPets)) if (save.ownedPets.indexOf(id) < 0) save.ownedPets.push(id);
        if (typeof d.selectedPet === 'string' && d.selectedPet) save.selectedPet = d.selectedPet;
        // Прогресс заданий мёржим как и остальное — берём максимум/объединение,
        // иначе переход между устройствами обнулял бы уже выполненное.
        if (typeof d.totalDist === 'number') save.totalDist = Math.max(save.totalDist, d.totalDist | 0);
        if (typeof d.runs === 'number') save.runs = Math.max(save.runs, d.runs | 0);
        if (typeof d.miniGames === 'number') save.miniGames = Math.max(save.miniGames, d.miniGames | 0);
        for (const id of cleanStrList(d.questsDone)) if (save.questsDone.indexOf(id) < 0) save.questsDone.push(id);
        // Просмотренные за вещь ролики мёржим по каждому ключу отдельно: на другом
        // устройстве могли досмотреть больше, терять это нечестно.
        const cloudAds = cleanCounts(d.adProgress);
        for (const k in cloudAds) if (cloudAds[k] > (save.adProgress[k] | 0)) save.adProgress[k] = cloudAds[k];
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
// Пауза между межстраничными роликами. Яндекс требует минимум 60 секунд, берём с запасом.
const INTERSTITIAL_GAP = 75000;
// Пауза после НЕсостоявшегося показа (нет заполнения, оффлайн). Ждать полные 75 секунд из-за
// рекламы, которой не было, незачем, но и дёргать SDK на каждой смерти не стоит.
const INTERSTITIAL_RETRY = 20000;
// Одна метка на всю рекламу: отсчёт идёт от ЛЮБОГО показанного ролика, включая rewarded из
// магазина и меню. Иначе связка «посмотрел ролик за чекушки → вышел → умер» выдавала
// межстраничную сразу поверх только что закрытой награды.
let nextInterstitialAt = Date.now() + INTERSTITIAL_GAP;
export function adWasShown() { nextInterstitialAt = Date.now() + INTERSTITIAL_GAP; }

export function maybeInterstitial(then) {
  const next = typeof then === 'function' ? then : () => {};
  const y = Sdk.ysdk;
  if (!y || !y.adv || adBusy || Date.now() < nextInterstitialAt) { next(); return; }
  adBusy = true; let done = false, opened = false;
  // shown приходит из onClose(wasShown). Раньше кулдаун ставился ДО показа, поэтому
  // несостоявшийся ролик съедал полторы минуты честного показа.
  const finish = shown => {
    if (done) return; done = true; adBusy = false;
    nextInterstitialAt = Date.now() + (shown ? INTERSTITIAL_GAP : INTERSTITIAL_RETRY);
    Sound.resumeAll(); next();
  };
  const guard = setTimeout(() => { if (!opened) finish(false); }, 5000);
  try {
    y.adv.showFullscreenAdv({ callbacks: {
      onOpen: () => { opened = true; clearTimeout(guard); Sound.pauseAll(); },
      // wasShown может не прийти вовсе — тогда считаем, что показ был (строгое !== false).
      onClose: wasShown => { clearTimeout(guard); finish(wasShown !== false); },
      onError: () => { clearTimeout(guard); finish(false); }, onOffline: () => { clearTimeout(guard); finish(false); }
    }});
  } catch (e) { clearTimeout(guard); finish(false); }
}
export function showRewarded(onReward, onFail) {
  const y = Sdk.ysdk;
  if (!y || !y.adv || adBusy) return onFail();
  adBusy = true; let got = false, done = false;
  const finish = () => { if (done) return; done = true; adBusy = false; Sound.resumeAll(); got ? onReward() : onFail(); };
  try {
    y.adv.showRewardedVideo({ callbacks: {
      // adWasShown именно в onOpen: отодвигаем межстраничную только когда ролик реально открылся.
      onOpen: () => { adWasShown(); Sound.pauseAll(); }, onRewarded: () => { got = true; }, onClose: finish, onError: finish
    }});
  } catch (e) { finish(); }
}

const BASS_SEQ = [110, 0, 110, 0, 130.81, 0, 110, 0, 98, 0, 98, 0, 110, 0, 130.81, 0, 87.31, 0, 87.31, 0, 110, 0, 130.81, 0, 98, 0, 110, 0, 130.81, 0, 146.83, 0];
const LEAD_SEQ = [440, 0, 523.25, 0, 587.33, 523.25, 440, 0, 392, 0, 440, 0, 523.25, 0, 587.33, 0, 349.23, 0, 440, 0, 523.25, 440, 392, 0, 440, 523.25, 587.33, 0, 659.25, 587.33, 523.25, 0];
const STEP_DUR = 60 / 138 / 2;
// Упреждение планирования синтезированных звуков, секунды. Это и есть лекарство от «звук вдруг стал тихим»:
// ctx.currentTime — время УЖЕ посчитанного аудио-блока. Если ставить события огибающей ровно на
// currentTime, то при любой задержке главного потока часть огибающей оказывается в прошлом и не
// воспроизводится вовсе: звук стартует с середины затухания и слышится резко тише (а если задержка
// больше длительности звука — не слышится совсем). Клик по кнопке срабатывал чаще всего, потому что
// сам тянет за собой сборку модели и компиляцию шейдеров в том же кадре. 20 мс вперёд гарантируют, что
// огибающая целиком лежит в будущем; на слух такая задержка незаметна.
const SFX_LEAD = 0.02;
const CLICK_F = 650;   // частота синтезированного клика, Гц — фиксирована, разброса нет
const CLICK_V = 0.10;  // его громкость — тоже фиксирована
// Базовый уровень микса — громкость шины при ползунке на 100 %. Общий баланс музыки
// и эффектов правится ТОЛЬКО здесь, положение ползунков на него множится (см. applyVolume).
const MUSIC_BASE = 0.16, SFX_BASE = 0.5;
export const Sound = {
  ctx: null, master: null, musicGain: null, sfxGain: null, clickVoice: null, noiseBuf: null, musicOn: true, sfxOn: true, musicVol: 1, sfxVol: 1, bankMusicOn: null, paused: false, step: 0, nextNote: 0, timer: null,
  // Банк семплов из assets/sounds/ (source/audio.js). Пока он null — играет только синтез ниже.
  bank: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.paused) { try { this.ctx.resume(); } catch (e) {} } return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = MUSIC_BASE; this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = SFX_BASE; this.sfxGain.connect(this.master);
      this.applyVolume();
      // Банк сам решит, что играть: файл music_*.mp3 или синтезированный чиптюн.
      if (this.bank) this.bank.attach(); else this.startSynthMusic();
      return true;
    } catch (e) { return false; }
  },
  // Громкость шин = базовый уровень микса × положение ползунка. Ползунок на 100 % даёт
  // ровно ту громкость, что была в игре до появления настройки.
  applyVolume() {
    if (!this.ctx) return;
    this.musicGain.gain.value = MUSIC_BASE * this.musicVol;
    this.sfxGain.gain.value = SFX_BASE * this.sfxVol;
    // Банк дёргаем ТОЛЬКО когда музыка реально включилась/выключилась: bank.toggles() ведёт
    // к apply() с кроссфейдом трека, а вызывать его на каждое движение ползунка незачем —
    // сама громкость уже задана строкой выше, через musicGain.
    if (this.bank && this.musicOn !== this.bankMusicOn) { this.bankMusicOn = this.musicOn; this.bank.toggles(); }
  },
  osc(f0, f1, dur, type, vol, t, out) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  },
  // Единая точка отсчёта для всего синтеза: всегда чуть ВПЕРЁД от текущего времени (см. SFX_LEAD).
  sfxTime() { return this.ctx.currentTime + SFX_LEAD; },
  tone(f0, f1, dur, type, vol, when) { if (!this.ctx || !this.sfxOn) return; this.osc(f0, f1, dur, type || 'sine', vol, when || this.sfxTime(), this.sfxGain); },
  noise(dur, vol, freq) {
    if (!this.ctx || !this.sfxOn) return; const ctx = this.ctx, t = this.sfxTime();
    if (!this.noiseBuf) { const n = ctx.sampleRate, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf; }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900; const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },
  // Каждый игровой звук сперва ищет свой семпл в банке (assets/sounds/<key>.mp3),
  // и только если файла нет — играет старый синтезированный вариант.
  sfx(key) { return this.bank ? this.bank.play(key) : false; },
  // jump/flip/land/roll/lane делят один и тот же ключ банка ('action') — по просьбе:
  // один общий пул из нескольких файлов на все пять действий, а не отдельный звук на каждое.
  // Синтезированный fallback у каждого действия остаётся СВОИМ — он звучит только пока
  // семплов нет вовсе, и разнообразие синтеза здесь ни при чём.
  jump() { if (this.sfx('action')) return; this.tone(300, 640, 0.2, 'square', 0.12); },
  land() { if (this.sfx('action')) return; this.noise(0.12, 0.1, 500); },
  roll() { if (this.sfx('action')) return; this.noise(0.28, 0.14, 700); },
  flip() { if (this.sfx('action')) return; this.noise(0.26, 0.09, 1800); this.tone(420, 900, 0.22, 'triangle', 0.09); },
  // интро-сцена со столом училки: свой ключ банка, чтобы не делить звук с чекушкой.
  // Пока файла assets/sounds/book.mp3 нет — играет шорох страниц (синтез).
  book() { if (this.sfx('book')) return; this.noise(0.18, 0.12, 2600); this.tone(520, 380, 0.14, 'triangle', 0.07); },
  coin() { if (this.sfx('coin')) return; const t = this.ctx ? this.sfxTime() : 0; this.tone(1318, 1318, 0.07, 'sine', 0.16, t); this.tone(1760, 1760, 0.12, 'sine', 0.16, t + 0.07); },
  lane() { if (this.sfx('action')) return; this.noise(0.09, 0.06, 1400); },
  // Поднятый паверап (source/powerups.js). Свой ключ банка — assets/sounds/powerup.mp3;
  // пока файла нет, играет восходящее трезвучие: слышно, что это НЕ обычная чекушка.
  powerup() {
    if (this.sfx('powerup')) return; const t = this.ctx ? this.sfxTime() : 0;
    this.tone(660, 660, 0.09, 'square', 0.13, t); this.tone(880, 880, 0.09, 'square', 0.13, t + 0.07);
    this.tone(1320, 1760, 0.22, 'triangle', 0.14, t + 0.14);
  },
  // warn/death тоже делят один ключ ('hit') — та же логика общего пула.
  stumble() { if (this.sfx('hit')) return; this.tone(160, 90, 0.22, 'sawtooth', 0.2); this.noise(0.2, 0.14, 600); },
  crash() { if (this.sfx('hit')) return; this.noise(0.4, 0.3, 400); this.tone(180, 55, 0.5, 'sawtooth', 0.22); },
  growl() { if (this.sfx('growl')) return; const t = this.ctx ? this.sfxTime() : 0; this.tone(220, 90, 0.35, 'sawtooth', 0.14, t); this.tone(140, 70, 0.4, 'sawtooth', 0.12, t + 0.05); },
  // Клик по кнопке. Строго одноголосый и полностью детерминированный: одна и та же нота, одна
  // и та же громкость, никакого разброса. Правится только константами здесь: CLICK_F / CLICK_V.
  // Огибающая строится от sfxTime(), а не от currentTime — именно отсюда брались «провалы»
  // громкости на подтормаживающем кадре (см. SFX_LEAD).
  click() {
    if (this.sfx('click')) return;
    if (!this.ctx || !this.sfxOn) return;
    const t = this.sfxTime();
    if (this.clickVoice) { try { this.clickVoice.stop(t); } catch (e) {} }
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(CLICK_F, t);
    g.gain.setValueAtTime(CLICK_V, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.07);
    this.clickVoice = o;
  },
  // Fallback — СВОЙ синтез, а не делегирование в stumble(): та теперь сама проверяет
  // общий банк-ключ 'hit', и если у тебя уже есть hit.mp3 (для столкновений), но ещё нет
  // ui_denied.mp3, магазин при нехватке чекушек играл бы чужой звук столкновения.
  denied() { if (this.sfx('ui_denied')) return; this.tone(160, 90, 0.22, 'sawtooth', 0.2); this.noise(0.2, 0.14, 600); },
  // Успешная покупка в магазине. Своего синтеза нет — за неимением purchase.mp3 звучит
  // звук монеты (coin.mp3, а нет и его — синтезированный «дзынь»), это уместный дефолт.
  purchase() { if (this.sfx('purchase')) return; this.coin(); },
  // Шаг и голос питомца существуют только как семплы — без файла просто молчат.
  footstep() { this.sfx('step'); },
  petVoice(id) { this.sfx('pet_' + id); },
  setMusic(name) { if (this.bank) this.bank.setMusic(name); },
  pauseAll() { this.paused = true; if (this.bank) this.bank.pause(); if (this.ctx) try { this.ctx.suspend(); } catch (e) {} },
  resumeAll() { this.paused = false; if (this.ctx) try { this.ctx.resume(); } catch (e) {} if (this.bank) this.bank.resume(); },
  startSynthMusic() { if (this.timer || !this.ctx) return; this.nextNote = this.ctx.currentTime + 0.1; this.step = 0; this.timer = setInterval(() => this.schedule(), 110); },
  stopSynthMusic() { if (!this.timer) return; clearInterval(this.timer); this.timer = null; },
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