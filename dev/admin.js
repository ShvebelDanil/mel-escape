// Админ-панель для отладки. Грузится ТОЛЬКО через dev/index.html, в релиз не попадает.
// Игра о панели не знает: модули ES загружаются один раз на URL, поэтому здесь мы получаем
// те же самые объекты (G, player, PWR.active, U.save), что и игра, и работаем с ними напрямую.
// Показать/скрыть — клавиша ` (Ё). Код дев-панели на аллокации не экономит — в релизе его нет.
import * as U from '../source/utils.js';
import * as PWR from '../source/powerups.js';
import { G, player } from '../source/main.js';

const SPAWN_AHEAD = 25;   // на сколько метров впереди Мэла ставить пикап

const box = document.createElement('div');
box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(10,14,22,.85);color:#dfe8f5;'
  + 'font:12px/1.4 monospace;padding:8px;border-radius:6px;user-select:none;min-width:210px';
document.body.appendChild(box);

const info = document.createElement('pre');
info.style.cssText = 'margin:0 0 6px';
box.appendChild(info);

function button(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = 'font:12px monospace;margin:2px;padding:2px 6px;cursor:pointer';
  // blur — чтобы Space/Enter потом не «нажимали» кнопку повторно, а шли в игру
  b.onclick = () => { onClick(b); b.blur(); };
  return b;
}

// Строка на каждый паверап: спавн пикапа впереди + уровень прокачки (клик — следующий уровень по кругу)
for (const t of PWR.TYPES) {
  const row = document.createElement('div');
  row.appendChild(button('spawn ' + t.id, () => {
    if (G.state !== 'run') return;
    PWR.place(t, U.LANES[player.lane], PWR.PU_Y, player.z + SPAWN_AHEAD);
  }));
  const lvl = button('', (b) => {
    U.save.powerupLvl[t.id] = PWR.levelOf(t) % PWR.LEVEL_MAX + 1;
    U.persistSave();
    b.textContent = 'lvl ' + PWR.levelOf(t);
  });
  lvl.textContent = 'lvl ' + PWR.levelOf(t);
  row.appendChild(lvl);
  box.appendChild(row);
}

setInterval(() => {
  if (box.style.display === 'none') return;
  const a = PWR.active;
  info.textContent = `state ${G.state}  dist ${G.dist.toFixed(0)}  v ${G.speed.toFixed(1)}\n`
    + `magnet ${a.magnet.toFixed(1)}  boots ${a.boots.toFixed(1)}\n`
    + `double ${a.double.toFixed(1)}  shield ${a.shield.toFixed(1)} ×${PWR.shield.charges}`;
}, 200);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') box.style.display = box.style.display === 'none' ? '' : 'none';
});
