import * as U from './utils.js';
import * as GFX from './graphics.js';
import * as SK from './skins.js';

// Магазин живёт отдельно от игровой логики: он только ставит уже существующего
// Мэла в уже существующий класс и рулит собственным UI.
const SHOP_Z = -7.4, CAM_Z = -2.95;

let deps = null, index = 0, modalOpen = false;

export function initShop(d) {
  deps = d;
  const on = (id, fn) => { const el = U.$(id); if (el) el.addEventListener('click', fn); };
  const act = fn => () => { if (U.adBusy || modalOpen) return; U.Sound.ensure(); U.Sound.click(); fn(); };
  on('shopBackBtn', act(() => deps.exitToMenu()));
  on('skinPrevBtn', act(() => cycle(-1)));
  on('skinNextBtn', act(() => cycle(1)));
  on('skinAction', act(() => action()));
  const mb = U.$('shopModalBtn'); if (mb) mb.addEventListener('click', () => { U.Sound.click(); closeModal(); });
  const mx = U.$('shopModalClose'); if (mx) mx.addEventListener('click', () => { U.Sound.click(); closeModal(); });
}

export function open() {
  index = Math.max(0, SK.SKINS.findIndex(s => s.id === SK.selectedId()));
  closeModal();
  deps.setPreviewSkin(SK.SKINS[index].id);
  const g = deps.getGrannyNode(); if (g) g.root.visible = false;
  U.screens('shop');
  refresh();
}

export function close() {
  deps.setPreviewSkin(SK.selectedId());
  const g = deps.getGrannyNode(); if (g) g.root.visible = true;
  closeModal();
}

function cycle(dir) {
  index = (index + dir + SK.SKINS.length) % SK.SKINS.length;
  deps.setPreviewSkin(SK.SKINS[index].id);
  refresh();
}

function action() {
  const s = SK.SKINS[index];
  if (SK.isOwned(s.id)) {
    if (SK.select(s.id)) { U.Sound.coin(); refresh(); }
    return;
  }
  if (U.save.currency < s.price) {
    showModal('err', 'НЕДОСТАТОЧНО ЧЕКУШЕК!', 'Для покупки нужно ' + s.price + ' чекушек. У тебя только ' + U.save.currency + '.', 'ПОНЯТНО');
    U.Sound.stumble();
    return;
  }
  if (SK.buy(s.id)) {
    SK.select(s.id);
    U.Sound.coin();
    refresh();
    showModal('ok', 'СКИН КУПЛЕН!', 'Теперь этот скин доступен в твоём гардеробе.', 'ОК');
  }
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
  const s = SK.SKINS[index], owned = SK.isOwned(s.id), selected = SK.selectedId() === s.id;
  if (U.UI.skinName) U.UI.skinName.textContent = s.name;
  if (U.UI.skinDesc) U.UI.skinDesc.textContent = s.desc;
  const btn = U.UI.skinAction;
  if (btn) {
    if (selected) { btn.textContent = '✓ ВЫБРАНО'; btn.dataset.state = 'selected'; }
    else if (owned) { btn.textContent = 'ВЫБРАТЬ'; btn.dataset.state = 'select'; }
    else if (U.save.currency >= s.price) { btn.textContent = 'КУПИТЬ'; btn.dataset.state = 'buy'; }
    else { btn.textContent = 'КУПИТЬ'; btn.dataset.state = 'locked'; }
  }
  const dots = U.UI.skinDots;
  if (dots) {
    if (dots.children.length !== SK.SKINS.length) { dots.innerHTML = ''; for (let i = 0; i < SK.SKINS.length; i++) dots.appendChild(document.createElement('i')); }
    for (let i = 0; i < dots.children.length; i++) dots.children[i].className = i === index ? 'on' : '';
  }
  renderPriceRow(s, owned);
}

function renderPriceRow(s, owned) {
  const row = U.UI.skinPrice; if (!row) return;
  row.innerHTML = '';
  if (s.price === 0) { row.dataset.state = 'free'; row.textContent = 'БЕСПЛАТНО'; return; }
  if (owned) { row.dataset.state = 'free'; row.textContent = 'КУПЛЕНО'; return; }
  row.dataset.state = U.save.currency >= s.price ? 'price' : 'locked';
  const img = document.createElement('img');
  img.src = (typeof ASSETS !== 'undefined' && ASSETS && ASSETS.bottle) ? ASSETS.bottle : '';
  row.appendChild(img);
  row.appendChild(document.createTextNode(' ' + s.price));
}

export function update(dt) {
  const n = deps.getPlayerNode(); if (!n) return;
  const now = performance.now();
  n.root.position.set(0, 0, SHOP_Z);
  n.root.rotation.set(0, Math.sin(now / 1600) * 0.22, 0);
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

  const portrait = window.innerHeight > window.innerWidth, fov = portrait ? 56 : 44;
  if (Math.abs(GFX.camera.fov - fov) > 0.3) { GFX.camera.fov = fov; GFX.camera.updateProjectionMatrix(); }
  GFX.camera.position.set(0, 1.45, CAM_Z);
  GFX.camera.lookAt(0, 0.75, SHOP_Z);
}
