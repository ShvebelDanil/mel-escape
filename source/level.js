import * as U from './utils.js';
import * as ENT from './entities.js';
import { G, player } from './main.js';

// ─── физика действий ─────────────────────────────────────────────────────────────
// Всё, что ниже, выведено из реальной физики игрока в main.js, а не подобрано на глаз:
// прыжок доступен только с земли, подкат длится ROLL_TIME, прыжок отменяет подкат.
const JUMP_T = 2 * U.JUMP_V / U.GRAVITY;  // 0.643 c — полное время полёта
const LANE_T = 0.24;                      // смена полосы: damp(k=11) доезжает за ~0.21 c
const JJ = 0.83;                          // минимальный шаг между двумя разными прыжками (см. runFeasible)
const MIN_GAP_M = 4.0;                    // минимальный физический зазор между паттернами, м
const COIN_STEP = 1.7;
const ROUTE_MARGIN = 0.4;

// ─── кривые сложности ────────────────────────────────────────────────────────────
// prog — основная, совпадает с разгоном до MAX_SPEED (~1100 м). late — пологая добавка
// после неё: новых механик не даёт, только поджимает паузы, чтобы трасса не замирала
// на плато, как это было раньше (вся сложность кончалась на 1000 м, а скорость росла).
const PROG_DIST = 1100, LATE_DIST = 2000;
const TIER_DIFF = [0, 0.13, 0.32];

// ─── роли препятствий ────────────────────────────────────────────────────────────
const BLOCKERS = ['locker', 'door', 'tower', 'shelf', 'deskStack', 'chairTower', 'standBoard', 'cooler'];
const HOPPERS = ['desk', 'desk', 'cart', 'chairPile', 'vault', 'trayCart', 'lockerDown'];
const LOWS = ['sign', 'books', 'bags', 'bucket', 'pipe'];   // низкие: клиренс большой, годятся для частых прыжков
const SLIDERS = ['banner', 'board', 'ladder'];
// Типы, которые можно ставить ПРЯМО на маршрут: перепрыгиваются с большим запасом по времени.
const ONROUTE = ['books', 'bags', 'sign', 'bucket', 'pipe', 'lockerDown', 'mat'];
const FILLERS = [
  ['desk', 3], ['sign', 2.4], ['books', 2.4], ['bags', 2], ['cart', 1.6], ['banner', 1.4],
  ['bucket', 1.4], ['pipe', 1.2], ['chairPile', 1.2], ['mat', 1.2], ['trayCart', 1.2],
  ['vault', 1], ['lockerDown', 1.4], ['board', 1],
  ['locker', 2, 1], ['shelf', 1.5, 1], ['door', 1, 1], ['tower', 1, 1],
  ['deskStack', 1.2, 1], ['chairTower', 1.2, 1], ['standBoard', 1.2, 1], ['cooler', 1, 1]
];

const OTHER = [[1, 2], [0, 2], [0, 1]];     // константы, а не свежие массивы в кадре
const otherLanes = l => OTHER[l];
function adjLane(l) { return l === 0 ? 1 : l === 2 ? 1 : (Math.random() < 0.5 ? 0 : 2); }

// ─── билдер паттерна ─────────────────────────────────────────────────────────────
// Билдер один на всю игру, а записи в массивах переиспользуются по индексу: fillSpawns()
// вызывается из игрового цикла, поэтому аллокаций в нём быть не должно (правило проекта).
const obs = [], route = [], rewards = [], acts = [];
let nObs = 0, nRoute = 0, nRew = 0, nAct = 0;
const busy = [];

function pushAct(t, k, l) {                  // держим acts отсортированным по времени
  const a = acts[nAct] || (acts[nAct] = {});
  let i = nAct;
  while (i > 0 && acts[i - 1].t > t) { acts[i] = acts[i - 1]; i--; }
  acts[i] = a; a.t = t; a.k = k; a.l = l; nAct++; return a;
}
function dropAct(rec) {                      // откат одной добавленной мелочи (см. addFillers)
  for (let i = 0; i < nAct; i++) if (acts[i] === rec) { for (let j = i; j < nAct - 1; j++) acts[j] = acts[j + 1]; acts[nAct - 1] = rec; nAct--; return; }
}

const b = {
  v: 0, lane: 1, diff: 0, len: 0, exit: 1,
  reset(v, lane, diff) { b.v = v; b.lane = lane; b.diff = diff; b.len = 0; b.exit = lane; nObs = 0; nRoute = 0; nRew = 0; nAct = 0; },
  ob(type, l, time, rot) {
    const o = obs[nObs] || (obs[nObs] = {}); nObs++;
    o.t = type; o.x = U.LANES[l]; o.l = l; o.time = time; o.rot = rot;
    if (time > b.len) b.len = time;
  },
  row(type, l, t0, n, stepM, rot) { for (let i = 0; i < n; i++) b.ob(type, l, t0 + i * stepM / b.v, rot); return t0 + (n - 1) * stepM / b.v; },
  tail(t) { if (t > b.len) b.len = t; },
  line(l, t0, t1) { const r = route[nRoute] || (route[nRoute] = {}); nRoute++; r.l = l; r.t0 = t0; r.t1 = t1; },
  diag(l0, l1, t0, t1) { pushAct(t1, 2, l1); b.line(l0, t0, t1); if (Math.abs(l0 - l1) === 2) b.line(1, t0, t1); b.line(l1, t0, t1); },
  arc(l, time) { const a = pushAct(time, 0, l); b.line(l, time - JUMP_T / 2 - 0.1, time + JUMP_T / 2 + 0.1); return a; },
  low(l, time) { const a = pushAct(time, 1, l); b.line(l, time - 0.35, time + 0.35); return a; },
  lead(to, t) { if (to !== b.lane) b.diag(b.lane, to, Math.max(0, t - 0.5), t - 0.12); else b.line(b.lane, Math.max(0, t - 0.5), t - 0.12); },
  rew(k, l) { const r = rewards[nRew] || (rewards[nRew] = {}); nRew++; r.k = k; r.l = l; r.must = false; r.time = 0; r.t0 = 0; r.t1 = 0; r.y = 0.95; return r; },
  rArc(l, time, must) { const r = b.rew('arc', l); r.time = time; r.must = !!must; },
  rLow(l, time, must) { const r = b.rew('low', l); r.time = time; r.must = !!must; },
  rLine(l, t0, t1, y, must) { const r = b.rew('line', l); r.t0 = t0; r.t1 = t1; r.y = y || 0.95; r.must = !!must; },
  routeLanes(t, out) {
    out.length = 0; let carry = -1, carryT = -Infinity;
    for (let i = 0; i < nRoute; i++) {
      const r = route[i];
      if (t + ROUTE_MARGIN >= r.t0 && t - ROUTE_MARGIN <= r.t1) { if (out.indexOf(r.l) < 0) out.push(r.l); }
      else if (r.t1 < t && r.t1 >= carryT) { carryT = r.t1; carry = r.l; }
    }
    if (!out.length) out.push(carry < 0 ? b.lane : carry); return out;
  }
};

// ─── проверка проходимости ───────────────────────────────────────────────────────
// Раньше интервалы были захардкожены в каждом паттерне «на глаз». Теперь любая
// последовательность действий прогоняется через реальную физику: для прыжка считается
// окно взлёта по высоте препятствия (низкую мелочь можно брать куда чаще, чем парту),
// для подката — что он ещё длится в нужный момент.
//
// Моделируем не идеального робота, а живого игрока: он жмёт прыжок ПОЗДНО, у самого
// препятствия, поэтому приземление считается от позднего взлёта. И требуем, чтобы окно
// нажатия было не уже MIN_WIN — иначе связка формально проходима, а на деле пиксель-перфект.
// Побочный, но важный эффект: становится видно, где два препятствия закрываются ОДНИМ
// прыжком, — раньше такие места считались за два действия и завышали оценку плотности.
const MIN_WIN = 0.17;   // минимальное окно нажатия, ~10 кадров
const CLR = 0.06;       // запас по высоте над препятствием, м
const DZ_PAD = 0.015;   // временной запас: внутри паттерна время→z считается по скорости на его начале,
                        // а игрок за это время успевает разогнаться — набегает до ~20 мс расхождения
let _air = 0, _roll = 0, _lane = 0, _need = 0, _inputs = 0, _obH = 0, _obDz = 0;
// Препятствие под действием: его высота и ПОЛУШИРИНА ПО ВРЕМЕНИ. Вторая важна не меньше первой:
// проверять клиренс только в центре препятствия недостаточно — парта глубиной 0.9 м на 25 м/с
// занимает ±50 мс, и прыжок обязан проходить над ОБОИМИ её краями, а подкат — длиться на всём
// этом отрезке. Без этого связки получались «формально проходимыми», а на деле игрок цеплял край.
function obScan(l, t, overhead) {
  _obH = U.DESK_TOP_Y; _obDz = 0.05; let found = false;
  for (let i = 0; i < nObs; i++) {
    const o = obs[i]; if (o.l !== l || Math.abs(o.time - t) > 0.22) continue;
    const d = ENT.OB_DEFS[o.t];
    if (overhead ? d.y0 < 0.01 : d.y0 > 0.01) continue;
    const dz = (d.hz + U.HIT_Z) / b.v + DZ_PAD;
    if (!found) { _obH = d.y1; _obDz = dz; found = true; }
    else { if (d.y1 > _obH) _obH = d.y1; if (dz > _obDz) _obDz = dz; }
  }
}
const jumpY = dt => U.JUMP_V * dt - 0.5 * U.GRAVITY * dt * dt;
function runFeasible(air0, roll0, lane0, need0) {
  let air = air0, rol = roll0, lan = lane0, rolNeed = need0, inp = 0;
  let jTau = -1e9, rTau = -1e9;   // текущий прыжок и текущий подкат — чтобы видеть «покрытые» препятствия
  for (let i = 0; i < nAct; i++) {
    const a = acts[i];
    if (a.k === 2) { if (a.t < lan - 1e-6) return false; lan = a.t + LANE_T; inp++; continue; }
    if (a.k === 0) {
      obScan(a.l, a.t, false);
      const hc = Math.max(0, _obH - U.PLATFORM_TOL) + CLR, dz = _obDz;
      const t0 = a.t - dz - jTau, t1 = a.t + dz - jTau;
      if (t0 >= 0 && t1 <= JUMP_T && jumpY(t0) >= hc && jumpY(t1) >= hc) continue;  // уже перелетаем этим прыжком
      const D = U.JUMP_V * U.JUMP_V - 2 * U.GRAVITY * hc;
      if (D < 0) return false;                               // такую высоту прыжком не взять
      const sq = Math.sqrt(D);
      const tLate = (a.t - dz) - (U.JUMP_V - sq) / U.GRAVITY;                        // позже — не успеть подняться
      const tEarly = Math.max(air, rolNeed, (a.t + dz) - (U.JUMP_V + sq) / U.GRAVITY); // раньше — уже опустишься либо собьёшь нужный подкат
      if (tLate - tEarly < MIN_WIN) return false;            // окно нажатия слишком узкое
      jTau = tLate; air = tLate + JUMP_T; if (rol > tLate) rol = tLate;   // прыжок сбрасывает подкат
      inp++;
    } else {
      obScan(a.l, a.t, true);
      const dz = _obDz;
      if (a.t - dz >= rTau && a.t + dz <= rTau + U.ROLL_TIME) { if (a.t + dz > rolNeed) rolNeed = a.t + dz; continue; } // текущий подкат ещё накрывает
      const lo = air > rol ? air : rol;
      const tLate = a.t - dz, tEarly = Math.max(lo, a.t + dz - U.ROLL_TIME);
      if (tLate - tEarly < MIN_WIN) return false;            // нажать подкат вовремя не успеть
      const tau = (tEarly + tLate) * 0.5;   // середина окна: с краю подкат гаснет ровно на кромке препятствия
      rTau = tau; rol = tau + U.ROLL_TIME; rolNeed = a.t + dz; if (air < tau) air = tau;
      inp++;
    }
  }
  _air = air; _roll = rol; _lane = lan; _need = rolNeed; _inputs = inp; return true;
}

// ─── фон и активные филлеры ──────────────────────────────────────────────────────
let _kb = 1;
const fillerW = e => (e[2] ? e[1] * _kb : e[1]);
function pickFiller(dens) { _kb = 0.3 + 0.7 * dens; return U.weightedPick(FILLERS, fillerW)[0]; }
function laneFree(l, t, win) {
  for (let i = 0; i < nObs; i++) { const o = obs[i]; if (o.l === l && Math.abs(o.time - t) < win) return false; }
  return true;
}
function actFree(t, win) {
  for (let i = 0; i < nAct; i++) if (Math.abs(acts[i].t - t) < win) return false;
  return true;
}
// Главная причина, почему трасса раньше выглядела занятой, а игралась пустой: филлеры
// по построению ставились ТОЛЬКО мимо маршрута и никогда не требовали реакции. Теперь
// часть мелочи ложится прямо на маршрут и регистрируется как обязательный прыжок —
// но только если после этого вся последовательность всё ещё проходима.
function addFillers(a0, r0, l0, n0, dens, breather) {
  const pSide = U.lerp(0.32, 0.68, dens) * (breather ? 0.5 : 1);
  const pOn = U.lerp(0.15, 0.80, dens) * (breather ? 0 : 1);
  // Окна разведения — в метрах, а не в секундах: на 27 м/с «полсекунды» это 13 метров,
  // и старый предфильтр в секундах отбрасывал почти все честные места под мелочь.
  const winOn = Math.max(0.2, 5.0 / b.v), winSide = Math.max(0.18, 4.0 / b.v);
  const end = b.len - 0.05;
  for (let t = 0.3; t <= end; t += 0.42) {
    b.routeLanes(t, busy);
    for (let l = 0; l < 3; l++) {
      const onRoute = busy.indexOf(l) >= 0;
      if (onRoute) {
        if (busy.length !== 1 || Math.random() > pOn) continue;   // мимо: идёт смена полосы
        const tt = t + U.rand(-0.06, 0.06);
        if (!laneFree(l, tt, winOn) || !actFree(tt, 0.3)) continue;
        const keepLen = b.len, keepObs = nObs, keepRoute = nRoute;
        b.ob(U.pick(ONROUTE), l, tt); const rec = b.arc(l, tt);
        if (!runFeasible(a0, r0, l0, n0)) { dropAct(rec); nObs = keepObs; nRoute = keepRoute; b.len = keepLen; }
      } else {
        if (Math.random() > pSide) continue;
        const tt = t + U.rand(-0.08, 0.08);
        if (laneFree(l, tt, winSide)) b.ob(pickFiller(dens), l, tt);
      }
    }
  }
  runFeasible(a0, r0, l0, n0);   // финальное состояние игрока на конец паттерна
}

// ─── паттерны ────────────────────────────────────────────────────────────────────
const PATTERNS = [
  { id: 'hop', tier: 0, w: 3, build(b) { b.ob(U.pick(HOPPERS), b.lane, 0); b.arc(b.lane, 0); b.rArc(b.lane, 0); } },
  { id: 'slide', tier: 0, w: 3, build(b) { b.ob(U.pick(SLIDERS), b.lane, 0); b.low(b.lane, 0); b.rLow(b.lane, 0); } },
  { id: 'sidestep', tier: 0, w: 3, build(b) { const to = adjLane(b.lane); b.ob(U.pick(BLOCKERS), b.lane, 0.55); b.lead(to, 0.55); b.line(to, 0.43, 0.95); b.rLine(to, 0.6, 0.95); b.exit = to; } },
  { id: 'signs', tier: 0, w: 2, build(b) { const s = U.lerp(0.92, JJ, b.diff); b.ob('sign', b.lane, 0); b.ob(U.pick(LOWS), b.lane, s); b.arc(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s); } },
  { id: 'gate', tier: 0, w: 3, build(b) { const free = Math.random() < 0.6 ? adjLane(b.lane) : b.lane, type = U.pick(BLOCKERS); for (const l of otherLanes(free)) b.ob(type, l, 0.6); b.lead(free, 0.6); b.line(free, 0.48, 1.05); b.rLine(free, 0.65, 1.05); b.exit = free; } },
  { id: 'trapline', tier: 1, w: 3, build(b) { const n = b.diff > 0.55 ? 4 : 3, s = U.lerp(0.98, JJ, b.diff); for (let i = 0; i < n; i++) { const t = 0.3 + i * s; b.ob(U.pick(LOWS), b.lane, t); b.arc(b.lane, t); } b.rArc(b.lane, 0.3 + (n - 1) * s); } },

  { id: 'hophop', tier: 1, w: 3, build(b) { const s = U.lerp(0.95, JJ, b.diff); b.ob(U.pick(HOPPERS), b.lane, 0); b.ob(U.pick(HOPPERS), b.lane, s); b.arc(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s); } },
  { id: 'hopslide', tier: 1, w: 3, build(b) { const s = U.lerp(0.9, 0.76, b.diff); b.ob(U.pick(HOPPERS), b.lane, 0); b.ob(U.pick(SLIDERS), b.lane, s); b.arc(b.lane, 0); b.low(b.lane, s); b.rArc(b.lane, 0); } },
  { id: 'slidehop', tier: 1, w: 3, build(b) { const s = U.lerp(0.9, 0.78, b.diff); b.ob(U.pick(SLIDERS), b.lane, 0); b.ob(U.pick(HOPPERS), b.lane, s); b.low(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s); } },
  { id: 'deskrow', tier: 1, w: 2, build(b) { const rot = Math.random() < 0.5 ? Math.PI : 0; for (let l = 0; l < 3; l++) b.ob('desk', l, 0.5, rot); b.arc(b.lane, 0.5); b.rArc(b.lane, 0.5); } },
  { id: 'bannerrow', tier: 1, w: 2, build(b) { const t = U.pick(SLIDERS); for (let l = 0; l < 3; l++) b.ob(t, l, 0.5); b.low(b.lane, 0.5); b.rLow(b.lane, 0.5); } },
  { id: 'choice', tier: 1, w: 2, build(b) { const others = otherLanes(b.lane); b.ob(U.pick(HOPPERS), b.lane, 0.5); b.ob(U.pick(SLIDERS), others[0], 0.5); b.ob(U.pick(BLOCKERS), others[1], 0.5); b.arc(b.lane, 0.5); b.rArc(b.lane, 0.5); } },
  { id: 'weave', tier: 1, w: 3, build(b) { const steps = b.diff > 0.55 ? 3 : 2, s = U.lerp(1.05, JJ + 0.02, b.diff); let cur = b.lane; for (let i = 0; i < steps; i++) { const t = 0.55 + i * s, next = adjLane(cur); b.ob(U.pick(BLOCKERS), cur, t); b.diag(cur, next, t - 0.45, t - 0.12); const tEnd = i === steps - 1 ? t + 0.45 : t + s - 0.55; b.line(next, t - 0.12, tEnd); if (i === 0) { b.ob(U.pick(LOWS), next, t + s * 0.5); b.arc(next, t + s * 0.5); } if (i === steps - 1) b.rLine(next, t + 0.05, tEnd); cur = next; } b.exit = cur; } },
  { id: 'zigjump', tier: 1, w: 2, build(b) { const s = U.lerp(1.0, 0.85, b.diff), side = adjLane(b.lane); b.ob('desk', b.lane, 0); b.ob('desk', side, s); b.ob(U.pick(SLIDERS), b.lane, s); b.low(b.lane, s); b.ob('desk', b.lane, 2 * s); b.arc(b.lane, 0); b.line(b.lane, 0.3, 2 * s - 0.3); b.arc(b.lane, 2 * s); b.rArc(b.lane, 2 * s); } },
  { id: 'runway', tier: 1, w: 2, build(b) { const n = U.clamp(Math.round(b.v * 0.6 / 1.75), 3, 7); const tEnd = b.row('desk', b.lane, 0.15, n, 1.75, 0); b.arc(b.lane, 0.15); b.line(b.lane, 0.15, tEnd + 0.4); b.rLine(b.lane, 0.15, tEnd, U.DESK_TOP_Y + 0.95, true); const to = adjLane(b.lane); b.ob(U.pick(BLOCKERS), b.lane, tEnd + 0.95); b.diag(b.lane, to, tEnd + 0.45, tEnd + 0.8); b.line(to, tEnd + 0.8, tEnd + 1.3); b.tail(tEnd + 1.3); b.exit = to; } },
  { id: 'matwalk', tier: 1, w: 2, build(b) { const n = U.clamp(Math.round(b.v * 0.55 / 2.0), 3, 6); const tEnd = b.row('mat', b.lane, 0.2, n, 2.0); b.arc(b.lane, 0.2); b.line(b.lane, 0.2, tEnd + 0.4); b.rLine(b.lane, 0.25, tEnd, 1.75, true); const to = adjLane(b.lane); b.ob(U.pick(BLOCKERS), b.lane, tEnd + 0.95); b.diag(b.lane, to, tEnd + 0.45, tEnd + 0.8); b.line(to, tEnd + 0.8, tEnd + 1.3); b.tail(tEnd + 1.3); b.exit = to; } },
  { id: 'split', tier: 1, w: 2, build(b) { const side = b.lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : b.lane, type = U.pick(BLOCKERS); b.ob(type, 1, 0.6); b.ob(type, 1, 1.3); b.ob(U.pick(LOWS), side, 1.0); b.ob(U.pick(HOPPERS), 2 - side, 0.95); b.lead(side, 0.6); b.line(side, 0.48, 2.1); b.arc(side, 1.0); b.ob(U.pick(SLIDERS), side, 1.85); b.low(side, 1.85); b.rArc(side, 1.0); b.exit = side; } },
  // прыжок → смена полосы → подкат: связка, которой в наборе не было вообще
  { id: 'jumpslide', tier: 1, w: 3, build(b) { const to = adjLane(b.lane), s = U.lerp(0.95, 0.74, b.diff); b.ob(U.pick(HOPPERS), b.lane, 0); b.arc(b.lane, 0); b.ob(U.pick(BLOCKERS), b.lane, s + 0.5); b.diag(b.lane, to, 0.34, s); b.ob(U.pick(SLIDERS), to, s + 0.55); b.low(to, s + 0.55); b.rLow(to, s + 0.55); b.exit = to; } },
  // завал: несколько разных школьных объектов подряд в одной полосе
  { id: 'pileup', tier: 1, w: 3, build(b) { const to = adjLane(b.lane), n = b.diff > 0.5 ? 4 : 3, s = 0.45; b.ob(U.pick(BLOCKERS), b.lane, 0.65); b.ob(U.pick(HOPPERS), b.lane, 0.65 + s); b.ob(U.pick(BLOCKERS), b.lane, 0.65 + 2 * s); if (n > 3) b.ob(U.pick(LOWS), b.lane, 0.65 + 3 * s); b.lead(to, 0.65); b.line(to, 0.5, 0.65 + n * s + 0.5); b.ob(U.pick(LOWS), to, 0.65 + n * s * 0.45); b.arc(to, 0.65 + n * s * 0.45); b.ob(U.pick(HOPPERS), to, 0.65 + n * s + 0.45); b.arc(to, 0.65 + n * s + 0.45); b.rArc(to, 0.65 + n * s + 0.45); b.exit = to; } },

  { id: 'gauntlet', tier: 2, w: 3, build(b) { const s = U.lerp(0.95, 0.8, b.diff); let jump = Math.random() < 0.5, rewarded = false; for (let i = 0; i < 4; i++, jump = !jump) { if (jump) { b.ob(U.pick(HOPPERS), b.lane, i * s); b.arc(b.lane, i * s); if (!rewarded) { b.rArc(b.lane, i * s); rewarded = true; } } else { b.ob(U.pick(SLIDERS), b.lane, i * s); b.low(b.lane, i * s); } } } },
  { id: 'tunnel', tier: 2, w: 2, build(b) { const s = U.lerp(1.1, 0.9, b.diff), rot = Math.random() < 0.5 ? Math.PI : 0, sl = U.pick(SLIDERS); for (let l = 0; l < 3; l++) { b.ob(sl, l, 0.5); b.ob('desk', l, 0.5 + s, rot); } b.low(b.lane, 0.5); b.arc(b.lane, 0.5 + s); b.rArc(b.lane, 0.5 + s); } },
  { id: 'doublegate', tier: 2, w: 3, build(b) { const s = U.lerp(1.05, 0.82, b.diff); const f1 = adjLane(b.lane), f2 = adjLane(f1), type = U.pick(BLOCKERS); for (const l of otherLanes(f1)) b.ob(type, l, 0.6); for (const l of otherLanes(f2)) b.ob(type, l, 0.6 + s); b.lead(f1, 0.6); b.line(f1, 0.48, 0.6 + s - 0.45); b.ob(U.pick(LOWS), f1, 0.6 + s * 0.42); b.arc(f1, 0.6 + s * 0.42); b.diag(f1, f2, 0.6 + s - 0.45, 0.6 + s - 0.12); b.line(f2, 0.6 + s - 0.12, 0.6 + s + 0.45); b.rLine(f2, 0.6 + s + 0.05, 0.6 + s + 0.45); b.exit = f2; } },
  { id: 'hopgate', tier: 2, w: 2, build(b) { const s = U.lerp(1.0, 0.85, b.diff), type = U.pick(BLOCKERS); b.ob(U.pick(HOPPERS), b.lane, 0); b.arc(b.lane, 0); for (const l of otherLanes(b.lane)) b.ob(type, l, s); b.ob(U.pick(LOWS), b.lane, s + 0.5); b.arc(b.lane, s + 0.5); b.line(b.lane, 0.3, s + 0.9); b.rArc(b.lane, 0); } },
  { id: 'lanehop', tier: 2, w: 3, build(b) { const to = adjLane(b.lane), s = U.lerp(0.95, 0.8, b.diff); b.ob(U.pick(HOPPERS), b.lane, 0); b.ob(U.pick(BLOCKERS), b.lane, s); b.ob(U.pick(HOPPERS), to, s + 0.6); b.arc(b.lane, 0); b.diag(b.lane, to, 0.35, s - 0.2); b.arc(to, s + 0.6); b.rArc(to, s + 0.6); b.exit = to; } },
  { id: 'longgate', tier: 2, w: 2, build(b) { const free = Math.random() < 0.6 ? adjLane(b.lane) : b.lane, type = U.pick(BLOCKERS), s = 0.75; for (const l of otherLanes(free)) { b.ob(type, l, 0.6); b.ob(type, l, 0.6 + s); } b.ob(U.pick(LOWS), free, 0.6 + s * 0.5); b.lead(free, 0.6); b.ob(U.pick(LOWS), free, 0.6 + s + 0.55); b.line(free, 0.48, 0.6 + s + 0.95); b.arc(free, 0.6 + s * 0.5); b.arc(free, 0.6 + s + 0.55); b.rArc(free, 0.6 + s * 0.5); b.exit = free; } },
  { id: 'sprint', tier: 2, w: 3, build(b) { const s = U.lerp(0.98, JJ, b.diff); const seq = U.pick([['desk', 'sign', 'banner', 'cart', 'books'], ['books', 'board', 'desk', 'sign', 'banner'], ['trayCart', 'bags', 'desk', 'ladder', 'chairPile']]); let last = -1; for (let i = 0; i < seq.length; i++) { const t = i * s; b.ob(seq[i], b.lane, t); if (ENT.OB_DEFS[seq[i]].y0 > 0.01) b.low(b.lane, t); else { b.arc(b.lane, t); last = t; } } if (last >= 0) b.rArc(b.lane, last); } },
  // безопасная полоса последовательно уезжает через все три ряда
  { id: 'staircase', tier: 2, w: 3, build(b) { const s = U.lerp(0.98, JJ, b.diff), type = U.pick(BLOCKERS); const start = b.lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : b.lane, dir = start === 0 ? 1 : -1; let cur = start; for (let i = 0; i < 3; i++) { const t = 0.6 + i * s; for (const l of otherLanes(cur)) b.ob(type, l, t); if (i === 0) b.lead(cur, t); else b.diag(cur - dir, cur, t - 0.34, t - 0.1); b.line(cur, t - 0.1, t + (i === 2 ? 0.45 : s - 0.44)); if (i < 2) { b.ob(U.pick(LOWS), cur, t + s * 0.45); b.arc(cur, t + s * 0.45); cur += dir; } } b.rLine(cur, 0.6 + 2 * s + 0.05, 0.6 + 2 * s + 0.45); b.exit = cur; } },
  // прыжок в своей полосе → её тут же закрывают → уход вбок, и так три раза
  { id: 'crossfire', tier: 2, w: 3, build(b) { const s = U.lerp(1.0, JJ + 0.03, b.diff); let cur = b.lane; for (let i = 0; i < 3; i++) { const t = 0.35 + i * s, next = adjLane(cur); b.ob(U.pick(LOWS), cur, t); b.arc(cur, t); b.ob(U.pick(BLOCKERS), cur, t + s * 0.55); b.diag(cur, next, t + 0.22, t + s * 0.55 - 0.14); b.line(next, t + s * 0.55 - 0.14, t + s - 0.1); cur = next; } b.rLine(cur, 0.35 + 2 * s + 0.5, 0.35 + 2 * s + 0.95); b.tail(0.35 + 2 * s + 0.95); b.exit = cur; } },
  // подкат → смена полосы → подкат
  { id: 'ducklane', tier: 2, w: 2, build(b) { const to = adjLane(b.lane), s = U.lerp(1.15, 0.95, b.diff); b.ob(U.pick(SLIDERS), b.lane, 0.3); b.low(b.lane, 0.3); b.diag(b.lane, to, 0.55, 0.3 + s - 0.15); b.ob(U.pick(SLIDERS), to, 0.3 + s); b.low(to, 0.3 + s); b.rLow(to, 0.3 + s); b.exit = to; } },
  // две полосы забиты рядами парт, в третьей — подкат
  { id: 'corridor', tier: 2, w: 2, build(b) { const free = Math.random() < 0.6 ? adjLane(b.lane) : b.lane, type = U.pick(HOPPERS); const n = U.clamp(Math.round(b.v * 1.2 / 2.4), 4, 8); let tEnd = 0.6; for (const l of otherLanes(free)) tEnd = b.row(type, l, 0.6, n, 2.4); const t1 = 0.75, t2 = t1 + 0.95, tE = Math.max(tEnd, t2); b.ob(U.pick(SLIDERS), free, t1); b.low(free, t1); b.ob(U.pick(HOPPERS), free, t2); b.arc(free, t2); b.lead(free, 0.6); b.line(free, 0.45, tE + 0.4); b.rArc(free, t2); b.tail(tE + 0.4); b.exit = free; } }
];

export const Director = { lane: 1, count: 0, lastId: '', acts: 0, coinCd: 0, tAir: -1e9, tRoll: -1e9, tLane: -1e9, tNeed: -1e9 };
export function resetDirector() { for (const p of PATTERNS) p.last = -999; Object.assign(Director, { lane: 1, count: 0, lastId: '', acts: 0, coinCd: 0, tAir: -1e9, tRoll: -1e9, tLane: -1e9, tNeed: -1e9 }); }

function predictSpeed(dist) { return Math.min(U.MAX_SPEED, Math.sqrt(G.speed * G.speed + 2 * U.ACCEL * Math.max(0, dist))); }
function patternById(id) { for (const p of PATTERNS) if (p.id === id) return p; return PATTERNS[0]; }
// Сколько паттернов назад он встречался: давно не выпадавшим порог плотности снижается,
// иначе редкие «неторопливые» сцены (проезд по партам, туннель) исчезают из игры совсем.
const STALE = 26;
for (const p of PATTERNS) p.last = -999;

const poolP = [], poolW = [];
function choosePattern(prog, relax) {
  if (Director.count === 0) return patternById('hop');
  if (Director.count === 1) return patternById('slide');
  if (Director.count === 2) return patternById('sidestep');
  let n = 0, total = 0;
  for (const p of PATTERNS) {
    if (prog < TIER_DIFF[p.tier]) continue;
    if (!relax && p.id === Director.lastId) continue;
    let w = p.w * (1 + prog * p.tier * 0.9);
    if (p.tier === 0) w *= 1 - prog * 0.55;   // на скорости простые паттерны уступают место связкам
    poolP[n] = p; poolW[n] = w; total += w; n++;
  }
  if (!n) return patternById('hop');
  let r = Math.random() * total;
  for (let i = 0; i < n; i++) { r -= poolW[i]; if (r <= 0) return poolP[i]; }
  return poolP[n - 1];
}

// ─── бутылки ─────────────────────────────────────────────────────────────────────
// Позиция бутылки вынесена из спавна отдельно: тот же расчёт нужен ЗАРАНЕЕ, чтобы
// отбросить награду, которую перекрыли филлеры. Паттерн объявляет награды в build(),
// а филлеры досыпают препятствия уже после — и про награды ничего не знают.
const COIN_PAD_Z = ENT.COIN_PAD_Z, COIN_PAD_Y = ENT.COIN_PAD_Y;
let _cy = 0, _ct = 0;                         // позиция очередной бутылки: высота и время от начала паттерна
function rewCount(r, v) {
  if (r.k === 'arc') return 5;
  if (r.k === 'low') return 3;
  return U.clamp(Math.round((r.t1 - r.t0) * v / COIN_STEP), 1, 8) + 1;
}
function rewCoin(r, i, n, v) {
  if (r.k === 'arc') { const tt = i / 4 * JUMP_T; _ct = r.time - JUMP_T / 2 + tt; _cy = 0.95 + jumpY(tt); }
  else if (r.k === 'low') { _ct = r.time + (i - 1) * 0.2; _cy = 0.6; }
  else { _ct = r.t0 + (r.t1 - r.t0) * i / (n - 1); _cy = r.y; }
}
// Полосы разнесены на 2.3 м, самое широкое препятствие — 0.86 м, поэтому по X достаточно
// сравнить номер полосы. На крыше парты бутылка стоять может, внутри парты — нет.
function coinFree(r, v) {
  for (let i = 0; i < nObs; i++) {
    const o = obs[i]; if (o.l !== r.l) continue;
    const d = ENT.OB_DEFS[o.t];
    if (Math.abs(o.time - _ct) * v >= d.hz + COIN_PAD_Z) continue;
    if (_cy + COIN_PAD_Y > d.y0 && _cy - COIN_PAD_Y < d.y1) return false;
  }
  return true;
}
function rewBlocked(r, v) {
  const n = rewCount(r, v);
  for (let i = 0; i < n; i++) { rewCoin(r, i, n, v); if (!coinFree(r, v)) return true; }
  return false;
}
function spawnReward(r, z0, v) {
  const n = rewCount(r, v);
  for (let i = 0; i < n; i++) { rewCoin(r, i, n, v); if (coinFree(r, v)) ENT.spawnCoin(U.LANES[r.l], _cy, z0 + _ct * v); }
}
const gapRew = { k: 'line', l: 1, t0: 0, t1: 0, y: 0.95, must: false, time: 0 };

function sortObsByTime() {   // pending-очередь показа в entities.js рассчитывает на порядок по z
  for (let i = 1; i < nObs; i++) { const o = obs[i]; let j = i; while (j > 0 && obs[j - 1].time > o.time) { obs[j] = obs[j - 1]; j--; } obs[j] = o; }
}

export function fillSpawns() {
  while (G.nextZ < player.z + U.SPAWN_AHEAD) {
    const ahead = G.nextZ - player.z;
    const v = predictSpeed(ahead);
    const distAt = G.dist + ahead;
    const prog = U.clamp(distAt / PROG_DIST, 0, 1);
    const late = U.clamp((distAt - PROG_DIST) / LATE_DIST, 0, 1);

    // 1) паттерн: проходим сам по себе и достаточно плотный для текущей скорости.
    // Порог плотности — мягкий фильтр, а не запрет: первые попытки отсеивают вялые
    // паттерны, с третьей берём любой честный, так что разнообразие не схлопывается.
    const need = U.lerp(0.8, 1.4, prog);
    let p = null;
    for (let tries = 0; tries < 6; tries++) {
      const cand = choosePattern(prog, tries > 0);
      b.reset(v, Director.lane, prog); cand.build(b);
      if (!runFeasible(-1e9, -1e9, -1e9, -1e9)) continue;
      const bar = need * (Director.count - cand.last > STALE ? 0.7 : 1);
      if (tries >= 2 || _inputs / (b.len + 0.55) >= bar) { p = cand; break; }
    }
    if (!p) { p = patternById('hop'); b.reset(v, Director.lane, prog); p.build(b); runFeasible(-1e9, -1e9, -1e9, -1e9); }

    // 2) пауза до предыдущего паттерна. Раньше это была константа lerp(1.0,0.5,diff) плюс
    // «мёртвый хвост» 0.3 c — четверть забега уходила в пустоту. Теперь зазор назначается
    // по физике стыка: связка жмётся ровно настолько, насколько игрок физически успевает.
    const budget = U.lerp(7, 20, prog);
    const breather = Director.acts >= budget;
    let want;
    if (breather) { want = U.lerp(0.95, 0.62, prog); Director.acts = 0; }
    else if (Math.random() < U.lerp(0.30, 0.92, prog)) want = U.lerp(0.22, 0.10, prog);
    else want = U.lerp(0.66, 0.20, prog) * (1 - 0.3 * late);
    const minGap = MIN_GAP_M / v; if (want < minGap) want = minGap;
    let gap = want, ok = false;
    for (let i = 0; i < 16; i++) { if (runFeasible(Director.tAir - gap, Director.tRoll - gap, Director.tLane - gap, Director.tNeed - gap)) { ok = true; break; } gap += 0.07; }
    if (!ok) { gap += 0.5; runFeasible(-1e9, -1e9, -1e9, -1e9); }
    const a0 = Director.tAir - gap, r0 = Director.tRoll - gap, l0 = Director.tLane - gap, n0 = Director.tNeed - gap;

    // 3) фон и активные филлеры — уже поверх согласованного стыка
    b.line(b.exit, b.len, b.len + 2);
    if (Director.count >= 3) addFillers(a0, r0, l0, n0, U.clamp(prog * 1.15, 0, 1), breather);

    const z0 = G.nextZ + gap * v;
    sortObsByTime();
    for (let i = 0; i < nObs; i++) { const o = obs[i]; ENT.spawnObstacle(o.t, o.x, z0 + o.time * v, o.rot); }

    // 4) награда. Обязательная идёт всегда — она подсказывает маршрут, и отдельные
    // перекрытые бутылки из неё отсеются поштучно в spawnReward. Случайная берётся
    // только чистая: если все попытки заняты препятствиями, кулдаун остаётся
    // отрицательным и награда выпадет на следующем паттерне.
    let pick = null;
    for (let i = 0; i < nRew; i++) if (rewards[i].must) { pick = rewards[i]; break; }
    if (!pick && Director.coinCd <= 0 && nRew) {
      for (let k = 0; k < 4; k++) { const c = rewards[U.randi(0, nRew - 1)]; if (!rewBlocked(c, v)) { pick = c; break; } }
    }
    if (pick) { spawnReward(pick, z0, v); Director.coinCd = U.rand(1.6, 3.0); }
    else if (Director.coinCd <= 0 && gap >= 0.8) {
      gapRew.l = Director.lane; gapRew.t0 = -gap + 0.25; gapRew.t1 = -0.3;
      spawnReward(gapRew, z0, v); Director.coinCd = U.rand(1.6, 3.0);
    }
    Director.coinCd -= gap + b.len;

    G.nextZ = z0 + b.len * v;
    Director.tAir = _air - b.len; Director.tRoll = _roll - b.len; Director.tLane = _lane - b.len; Director.tNeed = _need - b.len;
    p.last = Director.count;
    Director.lane = b.exit; Director.lastId = p.id; Director.count++; Director.acts += _inputs;
  }
}
