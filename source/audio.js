import { Sound } from './utils.js';
import { PETS } from './pets.js';

// ───────────────────────────────────────────────────────────────────────────────
// БАНК СЕМПЛОВ — надстройка над процедурным синтезом из utils.js.
//
// Правило одно: если файл лежит в assets/sounds/ — играет он, если файла нет —
// играет старый синтезированный звук. Игра работает при любом составе папки,
// звуки можно добавлять по одному.
//
// КАК НАЗЫВАТЬ ФАЙЛЫ (расширение всегда .mp3):
//   один звук            →  assets/sounds/jump.mp3
//   несколько вариантов  →  assets/sounds/jump_1.mp3, jump_2.mp3, jump_3.mp3 …
//                           (нумерация строго с 1 и без пропусков;
//                            при каждом срабатывании берётся случайный вариант)
// Полный список имён — в таблице SFX ниже и в разделе 7 aboutProject.md.
//
// МУЗЫКА (music_menu.mp3 / music_run.mp3) грузится НЕ в память, а стримится через
// <audio> — трек на 2 минуты в виде AudioBuffer съел бы ~40 МБ RAM. Элемент
// подключён к тому же musicGain, поэтому кнопки mute/пауза/реклама работают как раньше.
// ───────────────────────────────────────────────────────────────────────────────

const DIR = 'assets/sounds/';
const EXT = '.mp3';
const MAX_VARIANTS = 12;  // предохранитель для зонда вариантов: дальше не ищем
const FADE = 0.6;         // секунды кроссфейда между музыкальными треками

// Громкость запекается прямо в семпл ОДИН раз при декодировании (см. bake()),
// поэтому на каждое срабатывание создаётся ровно один узел — BufferSource, без GainNode.
// Крутить громкость конкретного звука нужно здесь: 1 — семпл как есть, 0.5 — вдвое тише.
// pitch — разброс скорости воспроизведения (±доля), чтобы повторы не звучали одинаково.
const SFX = {
  step:      { gain: 0.35, pitch: 0.07 },  // шаг при беге (см. footstep() в main.js)
  jump:      { gain: 0.55, pitch: 0.05 },  // прыжок
  flip:      { gain: 0.55, pitch: 0.05 },  // сальто (особый прыжок с платформы/через препятствие)
  land:      { gain: 0.40, pitch: 0.06 },  // приземление
  roll:      { gain: 0.55, pitch: 0.05 },  // перекат
  lane:      { gain: 0.45, pitch: 0.05 },  // переход в соседний ряд
  coin:      { gain: 0.50, pitch: 0.04 },  // сбор чекушки
  warn:      { gain: 0.70, pitch: 0.02 },  // задел препятствие — предупреждение
  death:     { gain: 0.80, pitch: 0 },     // столкновение насмерть
  growl:     { gain: 0.60, pitch: 0.03 },  // рык бабки (играет поверх warn/death)
  click:     { gain: 0.40, pitch: 0 },     // клик по кнопке
  ui_denied: { gain: 0.50, pitch: 0 }      // в магазине не хватает чекушек
};
// Голос питомца: slot заводится автоматически для каждого питомца из pets.js,
// имя файла — pet_<id>.mp3 (или pet_<id>_1.mp3, pet_<id>_2.mp3 …).
for (const p of PETS) if (p.build) SFX['pet_' + p.id] = { gain: 0.50, pitch: 0.05 };

const MUSIC = { menu: 'music_menu', run: 'music_run' };

const buffers = new Map();  // key → AudioBuffer[]  — готовые к воспроизведению
const pending = new Map();  // key → ArrayBuffer[]  — скачаны, ждут появления AudioContext
const tracks = new Map();   // name → { el, src, gain, ok, stopT }
let wantTrack = null;

// ── загрузка ───────────────────────────────────────────────────────────────────

function fetchBytes(url) {
  return fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
}

// Сначала пробуем файл без суффикса (один звук — один запрос, без 404).
// Если его нет — идём по вариантам _1, _2, … и останавливаемся на первом промахе.
// Так количество вариантов нигде не объявляется: сколько файлов положили, столько и играет.
async function loadKey(key) {
  const single = await fetchBytes(DIR + key + EXT);
  if (single) return [single];
  const list = [];
  for (let i = 1; i <= MAX_VARIANTS; i++) {
    const b = await fetchBytes(DIR + key + '_' + i + EXT);
    if (!b) break;
    list.push(b);
  }
  return list;
}

function loadAll() {
  for (const key of Object.keys(SFX)) {
    loadKey(key).then(list => {
      if (!list.length) return;
      pending.set(key, list);
      drain();
    });
  }
}

// Умножаем семпл на нужную громкость один раз — дальше воспроизведение бесплатно.
function bake(buf, g) {
  if (g === 1) return;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

// decodeAudioData «съедает» ArrayBuffer, поэтому декодируем ровно один раз.
function drain() {
  if (!Sound.ctx) return;
  for (const [key, list] of pending) {
    const cfg = SFX[key];
    for (const bytes of list) {
      Sound.ctx.decodeAudioData(bytes, buf => {
        bake(buf, cfg.gain);
        let arr = buffers.get(key);
        if (!arr) { arr = []; buffers.set(key, arr); }
        arr.push(buf);
      }, () => {});
    }
  }
  pending.clear();
}

// ── музыка ─────────────────────────────────────────────────────────────────────

// ok: null — ещё грузится, true — файл есть, false — файла нет (играет чиптюн из utils.js)
function track(name) {
  let t = tracks.get(name);
  if (t) return t;
  t = { el: new Audio(), src: null, gain: null, ok: null, stopT: 0 };
  t.el.loop = true;
  t.el.preload = 'auto';
  t.el.addEventListener('canplay', () => { if (t.ok === null) { t.ok = true; if (wantTrack === name) apply(); } });
  t.el.addEventListener('error', () => { if (t.ok !== true) { t.ok = false; if (wantTrack === name) apply(); } });
  t.el.src = DIR + MUSIC[name] + EXT;
  tracks.set(name, t);
  return t;
}

function wire(t) {
  if (t.gain || !Sound.ctx) return;
  try {
    t.src = Sound.ctx.createMediaElementSource(t.el);
    t.gain = Sound.ctx.createGain();
    t.gain.gain.value = 0;
    t.src.connect(t.gain);
    t.gain.connect(Sound.musicGain);
  } catch (e) { t.ok = false; }
}

function fade(t, to) {
  const g = t.gain.gain, now = Sound.ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(to, now + FADE);
}

// Единственная точка, решающая что сейчас должно звучать. Вызывается на смену трека,
// на появление AudioContext, на mute/unmute и на выход из паузы/рекламы.
function apply() {
  if (!Sound.ctx) return;
  for (const [name, t] of tracks) {
    if (name === wantTrack || !t.gain || t.el.paused) continue;
    fade(t, 0);
    clearTimeout(t.stopT);
    t.stopT = setTimeout(() => { t.el.pause(); t.el.currentTime = 0; }, FADE * 1000 + 60);
  }
  if (!wantTrack) return;
  const t = track(wantTrack);
  if (t.ok === false) { Sound.startSynthMusic(); return; }  // файла нет — откат на чиптюн
  if (t.ok === null) return;                                // ещё грузится, доиграем в canplay
  Sound.stopSynthMusic();
  if (!Sound.musicOn || Sound.paused) return;
  wire(t);
  if (!t.gain) return;
  clearTimeout(t.stopT);
  const p = t.el.play();
  if (p && p.catch) p.catch(() => {});
  fade(t, 1);
}

// ── публичный интерфейс (Sound.bank, см. utils.js) ─────────────────────────────

const bank = {
  // true — семпл найден и отыгран (или намеренно заглушён), синтез-фолбэк не нужен.
  play(key) {
    const arr = buffers.get(key);
    if (!arr || !arr.length) return false;
    if (!Sound.sfxOn || !Sound.ctx || Sound.ctx.state !== 'running') return true;
    const src = Sound.ctx.createBufferSource();
    src.buffer = arr.length > 1 ? arr[(Math.random() * arr.length) | 0] : arr[0];
    const pitch = SFX[key].pitch;
    if (pitch) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitch;
    src.connect(Sound.sfxGain);
    src.start();
    return true;
  },
  setMusic(name) { if (wantTrack === name) return; wantTrack = name; apply(); },
  attach() { drain(); apply(); },
  toggles() { if (Sound.musicOn) apply(); else for (const t of tracks.values()) t.el.pause(); },
  pause() { for (const t of tracks.values()) t.el.pause(); },
  resume() { apply(); }
};

export function initAudio() {
  Sound.bank = bank;
  loadAll();
  if (Sound.ctx) bank.attach();
}
