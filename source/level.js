import * as U from './utils.js';
import * as ENT from './entities.js';
import { G, player } from './main.js';

const JUMP_T = 2 * U.JUMP_V / U.GRAVITY;
const COIN_STEP = 1.7;
const TIER_DIFF = [0, 0.2, 0.5];
const DIFF_DIST = 1000;
const DENSITY_DIST = 1500;
const ROUTE_MARGIN = 0.4;
const BLOCKERS = ['locker', 'locker', 'door', 'tower', 'shelf'];
const HOPPERS = ['desk', 'desk', 'cart'];
const FILLERS = [['desk', 3], ['sign', 2.5], ['cart', 2], ['banner', 1.5], ['locker', 2, 1], ['shelf', 1.5, 1], ['door', 1, 1], ['tower', 1, 1]];

function adjLane(l) { return l === 0 ? 1 : l === 2 ? 1 : (Math.random() < 0.5 ? 0 : 2); }
function otherLanes(l) { return l === 0 ? [1, 2] : l === 1 ? [0, 2] : [0, 1]; }

function makeBuilder(v, lane, diff) {
  const b = {
    v, lane, diff, obs: [], route: [], rewards: [], len: 0, exit: lane,
    ob(type, l, time, rot) { b.obs.push({ t: type, x: U.LANES[l], l, time, rot }); b.len = Math.max(b.len, time + 0.3); },
    row(type, l, t0, n, stepM, rot) { for (let i = 0; i < n; i++) b.ob(type, l, t0 + i * stepM / v, rot); return t0 + (n - 1) * stepM / v; },
    tail(t) { b.len = Math.max(b.len, t); },
    line(l, t0, t1) { b.route.push({ l, t0, t1 }); },
    diag(l0, l1, t0, t1) { b.route.push({ l: l0, t0, t1 }); if (Math.abs(l0 - l1) === 2) b.route.push({ l: 1, t0, t1 }); b.route.push({ l: l1, t0, t1 }); },
    arc(l, time) { b.line(l, time - JUMP_T / 2 - 0.1, time + JUMP_T / 2 + 0.1); },
    low(l, time) { b.line(l, time - 0.35, time + 0.35); },
    lead(to, t) { if (to !== b.lane) b.diag(b.lane, to, Math.max(0, t - 0.5), t - 0.12); else b.line(b.lane, Math.max(0, t - 0.5), t - 0.12); },
    rArc(l, time, must) { b.rewards.push({ k: 'arc', l, time, must: !!must }); },
    rLow(l, time, must) { b.rewards.push({ k: 'low', l, time, must: !!must }); },
    rLine(l, t0, t1, y, must) { b.rewards.push({ k: 'line', l, t0, t1, y: y || 0.95, must: !!must }); },
    routeLanes(t, out) {
      out.length = 0; let carry = -1, carryT = -Infinity;
      for (const r of b.route) { if (t + ROUTE_MARGIN >= r.t0 && t - ROUTE_MARGIN <= r.t1) { if (out.indexOf(r.l) < 0) out.push(r.l); } else if (r.t1 < t && r.t1 >= carryT) { carryT = r.t1; carry = r.l; } }
      if (!out.length) out.push(carry < 0 ? b.lane : carry); return out;
    }
  };
  return b;
}

function pickFiller(density) { const kb = 0.35 + 0.65 * density; return U.weightedPick(FILLERS, e => e[2] ? e[1] * kb : e[1])[0]; }
function addFillers(b, density, breather) {
  if (density <= 0) return;
  let p = U.lerp(0.18, 0.55, density); if (breather) p *= 0.5;
  const end = b.len - 0.05, busy = [];
  for (let t = 0.25; t <= end; t += 0.8) {
    b.routeLanes(t, busy);
    for (let l = 0; l < 3; l++) {
      if (busy.indexOf(l) >= 0 || Math.random() > p) continue;
      const tt = t + U.rand(-0.08, 0.08); let clash = false;
      for (const o of b.obs) if (o.l === l && Math.abs(o.time - tt) < 0.6) { clash = true; break; }
      if (clash) continue;
      b.obs.push({ t: pickFiller(density), x: U.LANES[l], l, time: tt });
    }
  }
}

const PATTERNS = [
  { id: 'hop', tier: 0, w: 3, heat: 1, build(b) { b.ob(U.pick(HOPPERS), b.lane, 0); b.arc(b.lane, 0); b.rArc(b.lane, 0); } },
  { id: 'slide', tier: 0, w: 3, heat: 1, build(b) { b.ob('banner', b.lane, 0); b.low(b.lane, 0); b.rLow(b.lane, 0); } },
  { id: 'sidestep', tier: 0, w: 3, heat: 1, build(b) { const to = adjLane(b.lane); b.ob(U.pick(BLOCKERS), b.lane, 0.55); b.lead(to, 0.55); b.line(to, 0.43, 0.95); b.rLine(to, 0.6, 0.95); b.exit = to; } },
  { id: 'signs', tier: 0, w: 2, heat: 1, build(b) { const s = U.lerp(0.85, 0.72, b.diff); b.ob('sign', b.lane, 0); b.ob('sign', b.lane, s); b.arc(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s); } },
  { id: 'river', tier: 0, w: 2, heat: 0, build(b) { const to = adjLane(b.lane); b.line(b.lane, 0, 0.65); b.diag(b.lane, to, 0.65, 1.0); b.line(to, 1.0, 1.8); b.rLine(to, 1.1, 1.8, 0.95, true); b.tail(1.8); b.exit = to; } },
  { id: 'gate', tier: 0, w: 3, heat: 2, build(b) { const free = Math.random() < 0.6 ? adjLane(b.lane) : b.lane, type = U.pick(BLOCKERS); for (const l of otherLanes(free)) b.ob(type, l, 0.6); b.lead(free, 0.6); b.line(free, 0.48, 1.05); b.rLine(free, 0.65, 1.05); b.exit = free; } },
  { id: 'hophop', tier: 1, w: 3, heat: 2, build(b) { const s = U.lerp(0.92, 0.8, b.diff); b.ob(U.pick(HOPPERS), b.lane, 0); b.ob(U.pick(HOPPERS), b.lane, s); b.arc(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s); } },
  { id: 'hopslide', tier: 1, w: 3, heat: 2, build(b) { const s = U.lerp(0.9, 0.76, b.diff); b.ob(U.pick(HOPPERS), b.lane, 0); b.ob('banner', b.lane, s); b.arc(b.lane, 0); b.low(b.lane, s); b.rArc(b.lane, 0); } },
  { id: 'slidehop', tier: 1, w: 3, heat: 2, build(b) { const s = U.lerp(0.9, 0.78, b.diff); b.ob('banner', b.lane, 0); b.ob(U.pick(HOPPERS), b.lane, s); b.low(b.lane, 0); b.arc(b.lane, s); b.rArc(b.lane, s); } },
  { id: 'deskrow', tier: 1, w: 2, heat: 2, build(b) { const rot = Math.random() < 0.5 ? Math.PI : 0; for (let l = 0; l < 3; l++) b.ob('desk', l, 0.5, rot); b.arc(b.lane, 0.5); b.rArc(b.lane, 0.5); } },
  { id: 'bannerrow', tier: 1, w: 2, heat: 2, build(b) { for (let l = 0; l < 3; l++) b.ob('banner', l, 0.5); b.low(b.lane, 0.5); b.rLow(b.lane, 0.5); } },
  { id: 'choice', tier: 1, w: 2, heat: 2, build(b) { const others = otherLanes(b.lane); if (Math.random() < 0.5) others.reverse(); b.ob(U.pick(HOPPERS), b.lane, 0.5); b.ob('banner', others[0], 0.5); b.ob(U.pick(BLOCKERS), others[1], 0.5); b.arc(b.lane, 0.5); b.rArc(b.lane, 0.5); } },
  { id: 'weave', tier: 1, w: 3, heat: 2, build(b) { const steps = b.diff > 0.55 ? 3 : 2, s = U.lerp(1.1, 0.8, b.diff); let cur = b.lane; for (let i = 0; i < steps; i++) { const t = 0.55 + i * s, next = adjLane(cur); b.ob(U.pick(BLOCKERS), cur, t); b.diag(cur, next, t - 0.45, t - 0.12); const tEnd = i === steps - 1 ? t + 0.45 : t + s - 0.55; b.line(next, t - 0.12, tEnd); if (i === steps - 1) b.rLine(next, t + 0.05, tEnd); cur = next; } b.exit = cur; } },
  { id: 'zigjump', tier: 1, w: 2, heat: 2, build(b) { const s = U.lerp(1.0, 0.85, b.diff), side = adjLane(b.lane); b.ob('desk', b.lane, 0); b.ob('desk', side, s); b.ob('desk', b.lane, 2 * s); b.arc(b.lane, 0); b.line(b.lane, 0.3, 2 * s - 0.3); b.arc(b.lane, 2 * s); b.rArc(b.lane, 2 * s); } },
  { id: 'runway', tier: 1, w: 2, heat: 2, build(b) { const n = U.clamp(Math.round(b.v * 0.6 / 1.75), 3, 7); const tEnd = b.row('desk', b.lane, 0.15, n, 1.75, 0); b.arc(b.lane, 0.15); b.line(b.lane, 0.15, tEnd + 0.4); b.rLine(b.lane, 0.15, tEnd, U.DESK_TOP_Y + 0.95, true); b.tail(tEnd + 0.4); } },
  { id: 'split', tier: 1, w: 2, heat: 2, build(b) { const side = b.lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : b.lane, type = U.pick(BLOCKERS); b.ob(type, 1, 0.6); b.ob(type, 1, 1.3); b.ob('sign', side, 1.0); b.ob(U.pick(HOPPERS), 2 - side, 0.95); b.lead(side, 0.6); b.line(side, 0.48, 1.6); b.arc(side, 1.0); b.rArc(side, 1.0); b.exit = side; } },
  { id: 'gauntlet', tier: 2, w: 3, heat: 3, build(b) { const s = U.lerp(0.95, 0.8, b.diff); let jump = Math.random() < 0.5, rewarded = false; for (let i = 0; i < 4; i++, jump = !jump) { if (jump) { b.ob(U.pick(HOPPERS), b.lane, i * s); b.arc(b.lane, i * s); if (!rewarded) { b.rArc(b.lane, i * s); rewarded = true; } } else { b.ob('banner', b.lane, i * s); b.low(b.lane, i * s); } } } },
  { id: 'tunnel', tier: 2, w: 2, heat: 3, build(b) { const s = U.lerp(1.1, 0.9, b.diff), rot = Math.random() < 0.5 ? Math.PI : 0; for (let l = 0; l < 3; l++) { b.ob('banner', l, 0.5); b.ob('desk', l, 0.5 + s, rot); } b.low(b.lane, 0.5); b.arc(b.lane, 0.5 + s); b.rArc(b.lane, 0.5 + s); } },
  { id: 'doublegate', tier: 2, w: 3, heat: 3, build(b) { const s = U.lerp(1.15, 0.85, b.diff); const f1 = adjLane(b.lane), f2 = adjLane(f1), type = U.pick(BLOCKERS); for (const l of otherLanes(f1)) b.ob(type, l, 0.6); for (const l of otherLanes(f2)) b.ob(type, l, 0.6 + s); b.lead(f1, 0.6); b.line(f1, 0.48, 0.6 + s - 0.45); b.diag(f1, f2, 0.6 + s - 0.45, 0.6 + s - 0.12); b.line(f2, 0.6 + s - 0.12, 0.6 + s + 0.45); b.rLine(f2, 0.6 + s + 0.05, 0.6 + s + 0.45); b.exit = f2; } },
  { id: 'hopgate', tier: 2, w: 2, heat: 3, build(b) { const s = U.lerp(1.0, 0.85, b.diff), type = U.pick(BLOCKERS); b.ob(U.pick(HOPPERS), b.lane, 0); b.arc(b.lane, 0); for (const l of otherLanes(b.lane)) b.ob(type, l, s); b.line(b.lane, 0.3, s + 0.4); b.rArc(b.lane, 0); } },
  { id: 'lanehop', tier: 2, w: 3, heat: 3, build(b) { const to = adjLane(b.lane), s = U.lerp(0.95, 0.8, b.diff); b.ob(U.pick(HOPPERS), b.lane, 0); b.ob(U.pick(BLOCKERS), b.lane, s); b.ob(U.pick(HOPPERS), to, s + 0.55); b.arc(b.lane, 0); b.diag(b.lane, to, 0.35, s - 0.2); b.arc(to, s + 0.55); b.rArc(to, s + 0.55); b.exit = to; } },
  { id: 'longgate', tier: 2, w: 2, heat: 3, build(b) { const free = Math.random() < 0.6 ? adjLane(b.lane) : b.lane, type = U.pick(BLOCKERS), s = 0.75; for (const l of otherLanes(free)) { b.ob(type, l, 0.6); b.ob(type, l, 0.6 + s); } b.ob('sign', free, 0.6 + s * 0.5); b.lead(free, 0.6); b.line(free, 0.48, 0.6 + s + 0.4); b.arc(free, 0.6 + s * 0.5); b.rArc(free, 0.6 + s * 0.5); b.exit = free; } },
  { id: 'sprint', tier: 2, w: 3, heat: 3, build(b) { const s = U.lerp(0.95, 0.8, b.diff); const seq = U.pick([['desk', 'sign', 'banner', 'cart', 'sign'], ['sign', 'banner', 'desk', 'sign', 'banner'], ['cart', 'sign', 'desk', 'banner', 'desk']]); let last = -1; for (let i = 0; i < seq.length; i++) { const t = i * s; b.ob(seq[i], b.lane, t); if (seq[i] === 'banner') b.low(b.lane, t); else { b.arc(b.lane, t); last = t; } } if (last >= 0) b.rArc(b.lane, last); } }
];

export const Director = { lane: 1, count: 0, lastId: '', heat: 0, coinCd: 0 };
export function resetDirector() { Object.assign(Director, { lane: 1, count: 0, lastId: '', heat: 0, coinCd: 0 }); }

function predictSpeed(dist) { return Math.min(U.MAX_SPEED, Math.sqrt(G.speed * G.speed + 2 * U.ACCEL * Math.max(0, dist))); }
function patternById(id) { for (const p of PATTERNS) if (p.id === id) return p; return PATTERNS[0]; }
function choosePattern(diff) {
  if (Director.count === 0) return patternById('hop');
  if (Director.count === 1) return patternById('slide');
  if (Director.count === 2) return patternById('sidestep');
  const breather = Director.heat >= U.lerp(3, 6, diff);
  const pool = [];
  for (const p of PATTERNS) {
    if (p.id === Director.lastId || diff < TIER_DIFF[p.tier]) continue;
    if (breather && p.heat > 1) continue;
    let w = p.w * (1 + diff * p.tier * 0.9);
    if (p.tier === 0 && p.heat > 0) w *= 1 - diff * 0.55;
    pool.push({ p, w });
  }
  if (!pool.length) return patternById('river');
  return U.weightedPick(pool, e => e.w).p;
}

function spawnReward(r, z0, v) {
  if (r.k === 'arc') { for (let i = 0; i < 5; i++) { const tt = i / 4 * JUMP_T; ENT.spawnCoin(U.LANES[r.l], 0.95 + U.JUMP_V * tt - 0.5 * U.GRAVITY * tt * tt, z0 + (r.time - JUMP_T / 2 + tt) * v); } }
  else if (r.k === 'low') { for (let i = -1; i <= 1; i++) ENT.spawnCoin(U.LANES[r.l], 0.6, z0 + (r.time + i * 0.2) * v); }
  else { const n = U.clamp(Math.round((r.t1 - r.t0) * v / COIN_STEP), 1, 8); for (let i = 0; i <= n; i++) ENT.spawnCoin(U.LANES[r.l], r.y, z0 + (r.t0 + (r.t1 - r.t0) * i / n) * v); }
}

export function fillSpawns() {
  while (G.nextZ < player.z + U.SPAWN_AHEAD) {
    const ahead = G.nextZ - player.z;
    const v = predictSpeed(ahead);
    const distAt = G.dist + ahead;
    const diff = U.clamp(distAt / DIFF_DIST, 0, 1);
    const density = U.clamp((distAt - 140) / DENSITY_DIST, 0, 1);
    const p = choosePattern(diff);
    const b = makeBuilder(v, Director.lane, diff);
    p.build(b);
    b.route.push({ l: b.exit, t0: b.len, t1: b.len + 2 });
    if (Director.count >= 3) addFillers(b, density, p.heat <= 1);
    const z0 = G.nextZ;
    for (const o of b.obs) ENT.spawnObstacle(o.t, o.x, z0 + o.time * v, o.rot);
    const gap = U.lerp(1.0, 0.5, diff) + (p.heat >= 3 ? 0.25 : 0);
    const span = b.len + gap;
    let must = null;
    for (const r of b.rewards) if (r.must) { must = r; break; }
    if (must || (Director.coinCd <= 0 && b.rewards.length)) {
      spawnReward(must || U.pick(b.rewards), z0, v); Director.coinCd = U.rand(3.5, 7);
    } else if (Director.coinCd <= 0 && gap >= 0.9 && Math.random() < 0.3) {
      spawnReward({ k: 'line', l: b.exit, t0: b.len + 0.25, t1: b.len + gap - 0.45, y: 0.95 }, z0, v); Director.coinCd = U.rand(3.5, 7);
    }
    Director.coinCd -= span;
    G.nextZ = z0 + span * v;
    Director.lane = b.exit; Director.lastId = p.id; Director.count++; Director.heat = p.heat <= 1 ? 0 : Director.heat + p.heat;
  }
}