// Единая система растровых текстур игры (файлы, а не base64).
//
// Почему так, а не через `window.ASSETS` с data:URL:
//  • base64 весит на ~33% больше самого PNG и лежит внутри .js — браузер обязан распарсить
//    его синхронно ДО старта игры и не может закешировать отдельно от кода;
//  • обычный файл качается параллельно, кешируется браузером/CDN Яндекс.Игр и декодируется
//    вне главного потока (img.decode), т.е. не даёт фризов на загрузке;
//  • один и тот же файл переиспользуют и WebGL, и DOM-иконки (<img src>) — загрузка ровно одна.
//
// Загрузка идёт через HTMLImageElement, а не fetch+createImageBitmap, намеренно:
// Image работает и по file:// (игру можно открыть двойным кликом), и в старых WebView,
// а опции createImageBitmap (imageOrientation) поддержаны не везде — при их игнорировании
// текстура переворачивается вверх ногами. img.decode() даёт тот же выигрыш по фризам.

const DIR = 'assets/textures/';

// 2×2 lossy+alpha WebP: проверяем ровно тот декодер, которым закодированы наши текстуры.
const WEBP_PROBE = 'data:image/webp;base64,UklGRlgAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAf39/fwBWUDggLAAAAJABAJ0BKgIAAgACwEwloAJ0ugADmAD+7kMf7mxzi3BX/20P/1of/rQ/6UAA';

// Основное место, где описаны файловые текстуры игры (ключ → настройки).
// file   — имя без расширения в assets/textures/ (рядом лежат .webp и .png-фолбэк)
// repeat — [x, y] включает RepeatWrapping (для тайлов пола/стен)
// mips   — false для UI/крупных плоских картинок, которые не уходят вдаль (экономит ~33% VRAM)
// aniso  — false, если текстуру не видно под острым углом (спрайты-биллборды)
// Исключение — постеры: они НЕ прописываются сюда руками, а находятся сами через
// discoverSeries('poster') (poster1, poster2, … в assets/textures/) и дописываются в этот
// объект в рантайме.
export const MANIFEST = {
  bottle: { file: 'bottle', mips: true, aniso: false },
};

let ext = '.png';            // выбирается один раз в detectFormat()
let renderer = null, maxAniso = 1;
const entries = new Map();   // key -> { tex, def, promise }
let placeholder = null;      // 1×1 прозрачный пиксель: показывается, пока картинка летит по сети

function placeholderImage() {
  if (!placeholder) { placeholder = document.createElement('canvas'); placeholder.width = placeholder.height = 1; }
  return placeholder;
}

// Проверка поддержки WebP. Синхронный canvas.toDataURL('image/webp') врёт на Safari
// (он умеет ДЕкодировать webp с 14-й версии, но не кодировать), поэтому пробуем декодировать.
export function detectFormat() {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { ext = im.width > 0 ? '.webp' : '.png'; res(ext); };
    im.onerror = () => { ext = '.png'; res(ext); };
    im.src = WEBP_PROBE;
  });
}

// Путь к файлу текстуры — годится и для DOM-иконок: <img src={url('bottle')}>.
export function url(key) {
  const def = MANIFEST[key];
  return def ? DIR + def.file + ext : '';
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('texture load failed: ' + src));
    img.src = src;
    // decode() просит браузер раскодировать картинку в фоновом потоке заранее, иначе декодирование
    // случится в момент заливки в GPU и даст микрофриз. Загрузку на него НЕ завязываем: в headless
    // и в фоновых вкладках этот промис умеет не разрешаться никогда — кто первый (onload или decode),
    // тот и резолвит, повторный res() игнорируется.
    if (img.decode) img.decode().then(() => res(img), () => {});
  });
}

function configure(tex, def) {
  tex.encoding = THREE.sRGBEncoding;
  if (def.mips === false) { tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; }
  if (def.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(def.repeat[0], def.repeat[1]); }
  tex.anisotropy = def.aniso === false ? 1 : maxAniso;
  return tex;
}

function entry(key) {
  let e = entries.get(key);
  if (e) return e;
  const def = MANIFEST[key];
  if (!def) { console.warn('Нет такой текстуры в MANIFEST:', key); return null; }
  const tex = configure(new THREE.Texture(placeholderImage()), def);
  tex.name = key; tex.needsUpdate = true;
  e = { tex, def, promise: null };
  entries.set(key, e);
  e.promise = loadImage(DIR + def.file + ext)
    // если .webp внезапно нет на сервере — тихо доезжаем на .png
    .catch(err => (ext === '.webp' ? loadImage(DIR + def.file + '.png') : Promise.reject(err)))
    .then(img => {
      tex.image = img; tex.needsUpdate = true;
      // Заливаем в GPU сразу, пока висит загрузочный экран, а не в первом кадре с этой текстурой.
      if (renderer && renderer.initTexture) renderer.initTexture(tex);
      return tex;
    })
    .catch(err => { console.warn(err); return tex; });  // остаёмся на прозрачной заглушке, игра не падает
  return e;
}

// Текстура доступна синхронно: сначала прозрачная заглушка, картинка подменяется по готовности.
// Материал пересоздавать не нужно — объект THREE.Texture тот же самый.
export function get(key) { const e = entry(key); return e && e.tex; }

// Дождаться реальную картинку (для того, что обязано быть на экране в первом кадре).
export function load(key) { const e = entry(key); return e ? e.promise : Promise.resolve(null); }
export function preload(keys) { return Promise.all(keys.map(load)); }

// Пронумерованная серия файлов, объявленных не в MANIFEST, а просто по имени: poster1, poster2, …
// (как варианты звука в audio.js) — перебор до первого промаха, нумерация с 1, без пропусков.
// Возвращает промис со списком найденных ключей; каждый найденный сразу доступен через get(key).
export function discoverSeries(prefix, max = 24) {
  const found = [];
  const step = (i) => {
    if (i > max) return found;
    const file = prefix + i;
    return loadImage(DIR + file + ext)
      .catch(err => (ext === '.webp' ? loadImage(DIR + file + '.png') : Promise.reject(err)))
      .then(img => {
        const key = file, def = MANIFEST[key] || (MANIFEST[key] = { file });
        const tex = configure(new THREE.Texture(img), def);
        tex.name = key; tex.needsUpdate = true;
        if (renderer && renderer.initTexture) renderer.initTexture(tex);
        entries.set(key, { tex, def, promise: Promise.resolve(tex) });
        found.push(key);
        return step(i + 1);
      }, () => found);
  };
  return Promise.resolve(step(1));
}

// Вызывается из initGraphics: до этого момента рендерера ещё нет и анизотропию спросить не у кого.
export function attachRenderer(r, aniso) {
  renderer = r; maxAniso = aniso || 1;
  for (const e of entries.values()) {
    if (e.def.aniso !== false && e.tex.anisotropy !== maxAniso) { e.tex.anisotropy = maxAniso; e.tex.needsUpdate = true; }
    if (renderer.initTexture && e.tex.image !== placeholder) renderer.initTexture(e.tex);
  }
}

// Выгрузить текстуру из VRAM (пригодится, когда наборов картинок станет много).
export function dispose(key) {
  const e = entries.get(key);
  if (!e) return;
  e.tex.dispose(); entries.delete(key);
}
