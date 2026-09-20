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
//   один звук            →  assets/sounds/action.mp3
//   несколько вариантов  →  assets/sounds/action_1.mp3, action_2.mp3, action_3.mp3 …
//                           (нумерация строго с 1 и без пропусков;
//                            при каждом срабатывании берётся случайный вариант)
// Несколько игровых событий намеренно делят один и тот же ключ (и, значит, один и тот
// же пул файлов) — так реплики не дублируются на каждое действие по отдельности:
//   'action' → jump/flip/land/roll/lane (прыжок, сальто, приземление, перекат, смена ряда)
//   'hit'    → warn/death (предупреждение и смертельное столкновение)
// Полный список имён — в таблице SFX ниже и в разделе 2.1 aboutProject.md.
//
// МУЗЫКА — это два ПЛЕЙЛИСТА, а не два трека: 'menu' (меню, магазин, питомцы, экран
// смерти) и 'run' (интро, забег и пауза в забеге). Файлы ищутся сами:
//   один трек   →  assets/sounds/music_menu.mp3
//   плейлист    →  assets/sounds/music_menu_1.mp3, music_menu_2.mp3, music_menu_3.mp3 …
//                  (нумерация строго с 1 и без пропусков — как у вариантов SFX выше)
// Порядок внутри плейлиста — «колода»: треки тасуются и раздаются без повторов, пока не
// кончатся все, после чего колода тасуется заново (см. nextUrl). Доигравший трек передаёт
// эстафету следующему кроссфейдом внахлёст — тишины на стыке нет.
// Музыка грузится НЕ в память, а стримится через <audio>: трек на 2 минуты в виде
// AudioBuffer съел бы ~40 МБ RAM. Элементы подключены к тому же musicGain, поэтому
// кнопки mute / пауза / реклама работают как раньше.
// ───────────────────────────────────────────────────────────────────────────────

const DIR = 'assets/sounds/';
const EXT = '.mp3';
const MAX_VARIANTS = 12;  // предохранитель для зонда вариантов: дальше не ищем
const MAX_TRACKS = 12;    // предохранитель для зонда плейлиста: дальше не ищем
const FADE = 0.6;         // секунды кроссфейда при СМЕНЕ РАЗДЕЛА (меню ↔ забег)
const XFADE = 1.5;        // секунды кроссфейда МЕЖДУ ТРЕКАМИ внутри одного плейлиста
const PROBE_MS = 8000;    // сколько ждём ответа браузера при зонде музыкального файла

// Громкость запекается прямо в семпл ОДИН раз при декодировании (см. bake()),
// поэтому на каждое срабатывание создаётся ровно один узел — BufferSource, без GainNode.
// Крутить громкость конкретного звука нужно здесь: 1 — семпл как есть, 0.5 — вдвое тише.
// pitch — разброс скорости воспроизведения (±доля), чтобы повторы не звучали одинаково.
const SFX = {
  step:      { gain: 0.08, pitch: 0.35 },  // шаг при беге (см. footstep() в main.js)
  action:    { gain: 0.06, pitch: 0.05 },  // общий пул: прыжок/сальто/приземление/перекат/смена ряда
  hit:       { gain: 0.10, pitch: 0.02 },  // общий пул: предупреждение (warn) и смерть (death)
  growl:     { gain: 0.60, pitch: 0.03 },  // рык бабки (играет поверх hit)
  coin:      { gain: 0.08, pitch: 0.05 },  // сбор чекушки на бегу
  book:      { gain: 0.10, pitch: 0.02 },  // интро: Мэл хватает дневник со стола
  purchase:  { gain: 0.10, pitch: 0.03 },  // успешная покупка скина/питомца в магазине
  // Клик по кнопке — звук фиксированный: pitch 0 (скорость всегда 1.0), solo (см. ниже),
  // громкость в одном ряду с остальными слотами. Менять высоту/громкость клика можно ТОЛЬКО здесь.
  click:     { gain: 0.12, pitch: 0.00, solo: true },
  ui_denied: { gain: 0.10, pitch: 0.05 }      // в магазине не хватает чекушек
};
// Голос питомца: slot заводится автоматически для каждого питомца из pets.js,
// имя файла — pet_<id>.mp3 (или pet_<id>_1.mp3, pet_<id>_2.mp3 …).
for (const p of PETS) if (p.build) SFX['pet_' + p.id] = { gain: 0.50, pitch: 0.05 };

// Разделы музыки → базовое имя файла. Реальные имена собираются из него: либо base.mp3
// (один трек), либо base_1.mp3, base_2.mp3 … (плейлист) — см. probeList().
const MUSIC = { menu: 'music_menu', run: 'music_run' };
// Громкость ОТДЕЛЬНОГО трека — множитель к общей шине музыки (musicGain). Нужен, когда
// один трек сведён заметно громче или тише соседей по плейлисту: 1 — как есть, 0.7 — тише.
// Ключ — имя файла без расширения. Треков, которых тут нет, это не касается (множитель 1).
const MUSIC_GAIN = {
  // 'music_run_2': 0.8,
};

const buffers = new Map();  // key → AudioBuffer[]  — готовые к воспроизведению
const pending = new Map();  // key → ArrayBuffer[]  — скачаны, ждут появления AudioContext

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

// Плейлист раздела. ok: null — ещё зондируем, true — файлы есть, false — файлов нет
// (в этом случае играет синтезированный чиптюн из utils.js, как и раньше).
const lists = new Map();   // 'menu' | 'run' → { files, bag, last, ok }
// Два голоса-проигрывателя: пока один трек затухает, второй уже нарастает. Меньше двух
// нельзя — кроссфейд по определению требует двух одновременно звучащих источников;
// больше двух незачем — перекрытие всегда ровно одно.
const voices = [];         // { el, node, gain, list, url, stopT, fading }
let cur = null;            // голос, который сейчас «главный»
let wantTrack = null;      // какой раздел должен звучать: 'menu' | 'run' | null
let noWire = false;        // createMediaElementSource не завёлся — откат на чиптюн

function playlist(name) {
  let L = lists.get(name);
  if (!L) { L = { files: [], bag: [], last: null, ok: null }; lists.set(name, L); }
  return L;
}

// Проверка наличия файла без HEAD/Range-запросов: preload='metadata' тянет только
// заголовок mp3 (единицы килобайт), а дальше браузер сам говорит loadedmetadata или
// error. Так зонд не зависит от того, что умеет конкретный хостинг.
function probeFile(url) {
  return new Promise(resolve => {
    const el = new Audio();
    let done = false;
    const fin = v => {
      if (done) return;
      done = true;
      clearTimeout(tm);
      el.removeAttribute('src'); el.load();   // отпускаем сетевой запрос и сам элемент
      resolve(v);
    };
    const tm = setTimeout(() => fin(false), PROBE_MS);
    el.preload = 'metadata';
    el.addEventListener('loadedmetadata', () => fin(true));
    el.addEventListener('error', () => fin(false));
    el.src = url;
  });
}

// Сборка плейлиста: сперва файл без номера (один трек — как было раньше), иначе идём
// по _1, _2, … и останавливаемся на первом промахе. Количество треков нигде не
// объявляется: сколько файлов положили в папку, столько и играет.
async function probeList(name) {
  const base = MUSIC[name], L = playlist(name), files = [];
  if (await probeFile(DIR + base + EXT)) {
    files.push(base);
  } else {
    for (let i = 1; i <= MAX_TRACKS; i++) {
      const f = base + '_' + i;
      const ok = await probeFile(DIR + f + EXT);
      if (!ok) break;
      files.push(f);
    }
  }
  L.files = files;
  L.ok = files.length > 0;
  if (wantTrack === name) apply();
}

// Выдача треков без повторов: колода тасуется один раз на круг и раздаётся с конца.
// Когда опустела — тасуется заново, но так, чтобы новый круг не начался тем же треком,
// которым закончился предыдущий (иначе «без повторов» ломается ровно на стыке кругов).
function nextUrl(L) {
  if (!L.bag.length) {
    L.bag = L.files.slice();
    for (let i = L.bag.length - 1; i > 0; i--) {   // тасование Фишера—Йетса
      const j = (Math.random() * (i + 1)) | 0;
      const t = L.bag[i]; L.bag[i] = L.bag[j]; L.bag[j] = t;
    }
    const k = L.bag.length - 1;
    if (k > 0 && L.bag[k] === L.last) { L.bag[k] = L.bag[0]; L.bag[0] = L.last; }
  }
  L.last = L.bag.pop();
  return L.last;
}

function gainOf(url) { const g = MUSIC_GAIN[url]; return g === undefined ? 1 : g; }

function voice(i) {
  let v = voices[i];
  if (v) return v;
  v = { el: new Audio(), node: null, gain: null, list: null, url: null, stopT: 0, fading: false };
  v.el.preload = 'auto';
  // el.loop намеренно НЕ включаем: конец трека — это повод взять следующий из колоды.
  v.el.addEventListener('timeupdate', () => tick(v));
  // Страховка на случай, если хвост трека проскочил мимо tick() (короткий трек, лаг вкладки).
  v.el.addEventListener('ended', () => { if (v === cur && v.list === wantTrack) startTrack(v.list, 0.05); });
  voices[i] = v;
  return v;
}

function wire(v) {
  if (v.gain || !Sound.ctx || noWire) return;
  try {
    v.node = Sound.ctx.createMediaElementSource(v.el);
    v.gain = Sound.ctx.createGain();
    v.gain.gain.value = 0;
    v.node.connect(v.gain);
    v.gain.connect(Sound.musicGain);
  } catch (e) { noWire = true; }
}

function fade(v, to, dur) {
  const g = v.gain.gain, now = Sound.ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(to, now + dur);
}

// Увести голос в тишину и остановить элемент, когда затухание доиграет.
function hush(v, dur) {
  if (!v.gain || v.el.paused) return;
  fade(v, 0, dur);
  clearTimeout(v.stopT);
  v.stopT = setTimeout(() => v.el.pause(), dur * 1000 + 60);
}

// Мгновенно и без затухания: вкладку свернули, включили mute, началась реклама.
// currentTime не трогаем — при возврате трек продолжится с того же места.
function freeze() { for (const v of voices) if (v) { clearTimeout(v.stopT); v.el.pause(); } }

// Свободный голос — всегда тот, который сейчас не «главный».
function freeVoice() { const a = voice(0), b = voice(1); return cur === a ? b : a; }

// Запуск следующего трека раздела с кроссфейдом длиной dur секунд.
function startTrack(name, dur) {
  const v = freeVoice();
  wire(v);
  if (!v.gain) return;
  const prev = cur;
  cur = v;
  v.list = name;
  v.url = nextUrl(playlist(name));
  v.fading = false;
  clearTimeout(v.stopT);
  // Новый трек всегда нарастает с нуля: голос могли оставить с ненулевой громкостью
  // (например, его заморозили кнопкой mute на середине предыдущего трека).
  const now = Sound.ctx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setValueAtTime(0, now);
  v.el.src = DIR + v.url + EXT;
  const p = v.el.play();
  if (p && p.catch) p.catch(() => {});
  fade(v, gainOf(v.url), dur);
  if (prev && prev !== v) hush(prev, dur);
}

// timeupdate приходит ~4 раза в секунду — этого с запасом хватает, чтобы поймать хвост
// трека и начать кроссфейд за XFADE до его конца. Отдельный таймер тут не годится: он
// разъехался бы с реальным временем воспроизведения на паузе и при буферизации.
function tick(v) {
  if (v !== cur || v.fading || v.list !== wantTrack) return;
  if (!Sound.musicOn || Sound.paused) return;
  const d = v.el.duration;
  if (!(d > 0) || d - v.el.currentTime > XFADE) return;
  v.fading = true;
  startTrack(v.list, XFADE);
}

// Единственная точка, решающая что сейчас должно звучать. Вызывается на смену раздела,
// на появление AudioContext, на завершение зонда, на mute/unmute и на выход из паузы/рекламы.
function apply() {
  if (!Sound.ctx) return;
  if (!wantTrack) { for (const v of voices) if (v) hush(v, FADE); cur = null; return; }
  const L = playlist(wantTrack);
  if (L.ok === null) return;                    // ещё зондируем — доиграем в probeList()
  if (L.ok === false || noWire) {               // файлов нет — откат на чиптюн
    if (cur) { hush(cur, FADE); cur = null; }
    Sound.startSynthMusic();
    return;
  }
  Sound.stopSynthMusic();
  if (!Sound.musicOn || Sound.paused) { freeze(); return; }
  // Раздел не менялся — значит вернулись из паузы/рекламы/mute: продолжаем тот же трек
  // с того места, где встали, а не начинаем новый.
  if (cur && cur.list === wantTrack) {
    wire(cur);
    if (!cur.gain) return;
    clearTimeout(cur.stopT);
    if (cur.el.paused) { const p = cur.el.play(); if (p && p.catch) p.catch(() => {}); }
    fade(cur, gainOf(cur.url), FADE);
    return;
  }
  startTrack(wantTrack, FADE);   // раздел сменился — берём следующий трек его колоды
}

function loadMusic() { for (const name of Object.keys(MUSIC)) { playlist(name); probeList(name); } }

// ── публичный интерфейс (Sound.bank, см. utils.js) ─────────────────────────────

// Одноголосые ключи (cfg.solo): звучит максимум одна копия, новый запуск обрывает предыдущий.
// Нужно там, где одно нажатие может дёрнуть звук дважды (например, кнопка «ВЫБРАТЬ» в магазине:
// клик из обёртки act() плюс клик из самой ветки выбора) — вместо двух наложенных копий
// слышен ровно один звук. Заодно это гарантия, что клик всегда звучит одинаково.
const solo = new Map();  // key → BufferSource, который сейчас играет

const bank = {
  // true — семпл найден и отыгран (или намеренно заглушён), синтез-фолбэк не нужен.
  play(key) {
    const arr = buffers.get(key);
    if (!arr || !arr.length) return false;
    if (!Sound.sfxOn || !Sound.ctx || Sound.ctx.state !== 'running') return true;
    const cfg = SFX[key];
    const src = Sound.ctx.createBufferSource();
    // solo-ключ звучит ВСЕГДА одинаково: первый вариант файла, без выбора и без питча.
    src.buffer = (arr.length > 1 && !cfg.solo) ? arr[(Math.random() * arr.length) | 0] : arr[0];
    if (cfg.pitch && !cfg.solo) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * cfg.pitch;
    src.connect(Sound.sfxGain);
    if (cfg.solo) {
      const prev = solo.get(key);
      if (prev) { try { prev.stop(); } catch (e) {} }
      solo.set(key, src);
    }
    src.start();
    return true;
  },
  setMusic(name) { if (wantTrack === name) return; wantTrack = name; apply(); },
  attach() { drain(); apply(); },
  toggles() { if (Sound.musicOn) apply(); else freeze(); },
  pause() { freeze(); },
  resume() { apply(); }
};

export function initAudio() {
  Sound.bank = bank;
  loadAll();
  loadMusic();
  if (Sound.ctx) bank.attach();
}
