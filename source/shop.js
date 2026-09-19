import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as SK from './skins.js';
import * as PT from './pets.js';
import * as QST from './quests.js';
import * as TEX from './textures.js';
import * as ADR from './adreward.js';

// Магазин живёт отдельно от игровой логики: он только ставит уже существующего
// Мэла (и питомца) в уже существующий класс и рулит собственным UI.
const SHOP_Z = -7.4, CAM_Z = -2.95;

let deps = null, mode = 'skins', index = 0, modalOpen = false;
let dragActive = false, dragX = 0, previewYaw = 0, adPending = false;

// Ключ прогресса роликов в сейве: id скина и питомца могут совпасть, поэтому префикс.
const adKey = (m, id) => (m === 'pets' ? 'pet:' : 'skin:') + id;
const adSeen = key => U.save.adProgress[key] | 0;
// Вещь можно взять за рекламу, если она вообще продаётся: бесплатное и секретное мимо.
const adBuyable = (s, owned, locked) => !owned && !locked && !s.secret && s.price > 0;

function cat() {
  return mode === 'pets'
    // при перелистывании питомца даём послушать его голос (assets/sounds/pet_<id>.mp3)
    ? { list: PT.PETS, isOwned: PT.isOwned, selectedId: PT.selectedId, buy: PT.buy, grant: PT.grant, select: PT.select, preview: id => { deps.setPreviewPet(id); U.Sound.petVoice(id); } }
    // закрытый секретный скин показываем чёрным силуэтом — по нему не понять, что внутри
    : { list: SK.SKINS, isOwned: SK.isOwned, selectedId: SK.selectedId, buy: SK.buy, grant: SK.grant, select: SK.select, preview: id => deps.setPreviewSkin(id, SK.isLocked(id)) };
}

export function initShop(d) {
  deps = d;
  const on = (id, fn) => { const el = U.$(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (U.adBusy || modalOpen) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  on('shopBackBtn', act(() => deps.exitToMenu()));
  on('shopTabSkins', act(() => setMode('skins')));
  on('shopTabPets', act(() => setMode('pets')));
  on('skinPrevBtn', act(() => cycle(-1)));
  on('skinNextBtn', act(() => cycle(1)));
  on('skinAction', act(() => action()));
  on('skinAdBtn', act(() => watchForItem()));
  // Точки-индикаторы кликабельны: делегируем клик с контейнера, чтобы не
  // навешивать слушатель на каждую точку при каждом refresh().
  const dots = U.$('skinDots');
  if (dots) dots.addEventListener('click', e => {
    const i = Array.prototype.indexOf.call(dots.children, e.target);
    if (i < 0) return;
    act(() => goTo(i))();
  });
  const mb = U.$('shopModalBtn'); if (mb) mb.addEventListener('click', () => { U.Sound.click(); closeModal(); });
  const mx = U.$('shopModalClose'); if (mx) mx.addEventListener('click', () => { U.Sound.click(); closeModal(); });
  const surface = window;
  if (surface) {
    surface.addEventListener('pointerdown', e => { dragActive = true; dragX = e.clientX; });
    surface.addEventListener('pointermove', e => {
      if (!dragActive) return;
      previewYaw += (e.clientX - dragX) * 0.012;
      dragX = e.clientX;
    });
    surface.addEventListener('pointerup', () => { dragActive = false; });
    surface.addEventListener('pointercancel', () => { dragActive = false; });
  }
}

export function open(initialMode) {
  mode = initialMode === 'pets' ? 'pets' : 'skins';
  const c = cat();
  index = Math.max(0, c.list.findIndex(s => s.id === c.selectedId()));
  previewYaw = 0;
  closeModal();
  deps.setPreviewSkin(SK.selectedId());
  deps.setPreviewPet(PT.selectedId());
  const g = deps.getGrannyNode(); if (g) g.root.visible = false;
  U.screens('shop');
  refresh();
}

export function close() {
  deps.setPreviewSkin(SK.selectedId());
  deps.setPreviewPet(PT.selectedId());
  const p = deps.getPlayerNode(); if (p) p.root.visible = true;
  const g = deps.getGrannyNode(); if (g) g.root.visible = true;
  closeModal();
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  const c = cat();
  index = Math.max(0, c.list.findIndex(s => s.id === c.selectedId()));
  c.preview(c.list[index].id);
  refresh();
}

function cycle(dir) {
  const c = cat();
  index = (index + dir + c.list.length) % c.list.length;
  c.preview(c.list[index].id);
  refresh();
}

// Переход сразу к нужному элементу списка (клик по точке-индикатору).
function goTo(i) {
  const c = cat();
  if (i === index || i < 0 || i >= c.list.length) return;
  index = i;
  c.preview(c.list[index].id);
  refresh();
}

function action() {
  const c = cat(), s = c.list[index];
  const noun = mode === 'pets' ? 'питомца' : 'скина';
  // Секретный скин не продаётся: объясняем, что его открывают задания.
  if (mode === 'skins' && SK.isLocked(s.id)) {
    showModal('err', 'СКИН ЗАКРЫТ!', 'Этот скин нельзя купить — он выдаётся за все задания. Выполнено ' + QST.doneCount() + ' из ' + QST.QUESTS.length + '.', 'ПОНЯТНО');
    U.Sound.denied();
    return;
  }
  if (c.isOwned(s.id)) {
    // Смена уже купленного скина/питомца — не покупка и не сбор монеты, обычный клик UI.
    // Свой Sound.click() тут не нужен: кнопка обёрнута в act(), он уже прозвучал.
    if (c.select(s.id)) refresh();
    return;
  }
  if (U.save.currency < s.price) {
    showModal('err', 'НЕДОСТАТОЧНО ЧЕКУШЕК!', 'Для покупки ' + noun + ' нужно ещё ' + (s.price - U.save.currency) + ' чекушек.', 'ПОНЯТНО');
    U.Sound.denied();
    return;
  }
  if (c.buy(s.id)) {
    // Куплено за чекушки — недосмотренные ролики за эту же вещь больше не нужны.
    delete U.save.adProgress[adKey(mode, s.id)];
    U.persistSave();
    c.select(s.id);
    U.Sound.purchase();
    refresh();
    showModal('ok', 'ПОКУПКА СОВЕРШЕНА!', mode === 'pets' ? 'Питомец теперь доступен для выбора.' : 'Теперь этот скин доступен в твоём гардеробе.', 'ОК');
  }
}

// Второй путь к вещи: досмотреть N роликов. N = цена / награда за ролик в меню,
// см. ADR.adsFor — при правке цены или AD_REWARD число пересчитывается само.
function watchForItem() {
  if (adPending) return;
  const c = cat(), s = c.list[index];
  const owned = c.isOwned(s.id), locked = mode === 'skins' && SK.isLocked(s.id);
  if (!adBuyable(s, owned, locked)) return;
  const key = adKey(mode, s.id), need = ADR.adsFor(s.price);
  adPending = true;
  renderAdBtn(s, owned, locked);
  ADR.watchAd(
    () => {
      adPending = false;
      const seen = adSeen(key) + 1;
      if (seen < need) {
        // Промежуточный просмотр: молча обновляем счётчик на кнопке, окно не дёргаем.
        // Звука тут намеренно нет: purchase() — звук получения вещи, а вещь ещё не получена.
        U.save.adProgress[key] = seen;
        U.persistSave();
        refresh();
        return;
      }
      // Набрали норму: прогресс в сейве больше не нужен.
      delete U.save.adProgress[key];
      c.grant(s.id);          // grant сам пишет сейв
      c.select(s.id);
      U.Sound.purchase();
      refresh();
      showModal('ok', 'ОТКРЫТО ЗА РЕКЛАМУ!', mode === 'pets' ? 'Питомец теперь доступен для выбора.' : 'Теперь этот скин доступен в твоём гардеробе.', 'ОК');
    },
    () => {
      adPending = false;
      refresh();
      showModal('err', 'РЕКЛАМА НЕ ПОКАЗАНА', 'Ролик не был досмотрен до конца или реклама сейчас недоступна. Попробуй ещё раз.', 'ПОНЯТНО');
    }
  );
}

function renderAdBtn(s, owned, locked) {
  const b = U.UI.skinAdBtn; if (!b) return;
  const can = adBuyable(s, owned, locked);
  U.show(b, can);
  if (!can) return;
  const need = ADR.adsFor(s.price), seen = Math.min(adSeen(adKey(mode, s.id)), need);
  b.textContent = adPending ? 'ЗАГРУЗКА…' : 'ЗА РЕКЛАМУ ' + seen + '/' + need;
  b.dataset.busy = adPending ? '1' : '0';
}

function showModal(kind, title, text, btn) {
  modalOpen = true;
  const m = U.UI.shopModal; if (!m) return;
  m.dataset.kind = kind;
  if (U.UI.shopModalTitle) U.UI.shopModalTitle.textContent = title;
  if (U.UI.shopModalText) U.UI.shopModalText.textContent = text;
  if (U.UI.shopModalBtn) U.UI.shopModalBtn.textContent = btn;
  U.show(m, true);
}
function closeModal() { modalOpen = false; U.show(U.UI.shopModal, false); }

export function refreshCurrency() {
  const v = U.save.currency;
  if (U.UI.menuCurrency) U.UI.menuCurrency.textContent = v;
  if (U.UI.shopCurrency) U.UI.shopCurrency.textContent = v;
}

function refresh() {
  refreshCurrency();
  const c = cat(), s = c.list[index], owned = c.isOwned(s.id), selected = c.selectedId() === s.id;
  const locked = mode === 'skins' && SK.isLocked(s.id);
  if (U.UI.shopTabSkins) U.UI.shopTabSkins.dataset.active = mode === 'skins' ? '1' : '0';
  if (U.UI.shopTabPets) U.UI.shopTabPets.dataset.active = mode === 'pets' ? '1' : '0';
  if (U.UI.skinName) U.UI.skinName.textContent = locked ? '???' : s.name;
  if (U.UI.skinDesc) U.UI.skinDesc.textContent = locked ? 'Секретный скин. Выполни все задания, чтобы открыть его.' : s.desc;
  const btn = U.UI.skinAction;
  if (btn) {
    if (locked) { btn.textContent = 'ЗАКРЫТО'; btn.dataset.state = 'locked'; }
    else if (selected) { btn.textContent = '✓ ВЫБРАНО'; btn.dataset.state = 'selected'; }
    else if (owned) { btn.textContent = 'ВЫБРАТЬ'; btn.dataset.state = 'select'; }
    else if (U.save.currency >= s.price) { btn.textContent = 'КУПИТЬ'; btn.dataset.state = 'buy'; }
    else { btn.textContent = 'КУПИТЬ'; btn.dataset.state = 'locked'; }
  }
  const dots = U.UI.skinDots;
  if (dots) {
    if (dots.children.length !== c.list.length) { dots.innerHTML = ''; for (let i = 0; i < c.list.length; i++) dots.appendChild(document.createElement('i')); }
    for (let i = 0; i < dots.children.length; i++) dots.children[i].className = i === index ? 'on' : '';
  }
  renderPriceRow(s, owned, locked);
  renderAdBtn(s, owned, locked);
}

function renderPriceRow(s, owned, locked) {
  const row = U.UI.skinPrice; if (!row) return;
  row.innerHTML = '';
  // У закрытого секретного скина вместо цены — прогресс по заданиям.
  if (locked) { row.dataset.state = 'locked'; row.textContent = 'ЗАДАНИЯ ' + QST.doneCount() + ' / ' + QST.QUESTS.length; return; }
  if (s.secret) { row.dataset.state = 'free'; row.textContent = 'ОТКРЫТ ЗА ЗАДАНИЯ'; return; }
  if (s.price === 0) { row.dataset.state = 'free'; row.textContent = 'БЕСПЛАТНО'; return; }
  if (owned) { row.dataset.state = 'free'; row.textContent = 'КУПЛЕНО'; return; }
  row.dataset.state = U.save.currency >= s.price ? 'price' : 'locked';
  const img = document.createElement('img');
  img.src = TEX.url('bottle');
  row.appendChild(img);
  row.appendChild(document.createTextNode(' ' + s.price));
}

export function update(dt) {
  const n = deps.getPlayerNode(); if (!n) return;
  const now = performance.now();
  n.root.visible = mode === 'skins';
  n.root.position.set(0, 0, SHOP_Z);
  n.root.rotation.set(0, previewYaw + (dragActive ? 0 : Math.sin(now / 1600) * 0.22), 0);
  n.pivot.rotation.x = 0;
  n.inner.rotation.set(0, 0, 0);
  n.inner.scale.set(1, 1, 1);
  n.inner.visible = true;
  n.legL.rotation.x = U.damp(n.legL.rotation.x, -0.06, 8, dt);
  n.legR.rotation.x = U.damp(n.legR.rotation.x, 0.06, 8, dt);
  n.armL.rotation.x = U.damp(n.armL.rotation.x, -0.18, 8, dt);
  n.armR.rotation.x = U.damp(n.armR.rotation.x, -0.14, 8, dt);
  n.inner.position.y = -0.92 + Math.sin(now / 500) * 0.02;
  n.shadow.position.y = 0.02;
  n.shadow.scale.setScalar(1);

  const pn = deps.getPetNode();
  if (pn) {
    pn.root.visible = mode === 'pets';
    pn.root.position.set(0, 0, SHOP_Z);
    pn.root.scale.setScalar(1.7);
    pn.root.rotation.y = previewYaw + (dragActive ? 0 : Math.sin(now / 1600) * 0.22);
    pn.bob.position.y = Math.sin(now / 450) * 0.03;
    pn.tailPivot.rotation.y = Math.sin(now / 300) * 0.35;
    pn.shadow.position.y = 0.02;
  }

  const portrait = window.innerHeight > window.innerWidth, fov = portrait ? 56 : 44;
  if (Math.abs(GFX.camera.fov - fov) > 0.3) { GFX.camera.fov = fov; GFX.camera.updateProjectionMatrix(); }
  GFX.camera.position.set(0, 1.45, CAM_Z);
  GFX.camera.lookAt(0, 0.75, SHOP_Z);
}
