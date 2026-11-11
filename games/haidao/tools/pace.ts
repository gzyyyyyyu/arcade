/**
 * 节奏取证：node tools/pace.ts
 * 确定性的"普通玩家"（同 tests/progress.test.ts）加时间模型，按真实分钟记录每个"盼头事件"。
 * 时间模型：每场 = 部署 20 秒 + 战斗游戏内时长（1×，算到部队全灭或战斗结束）+ 结算 15 秒；
 * 每次上线开头收资源和花钱 60 秒；每次上线打 3 场，两次上线之间离线 12 小时（只攒资源，不计分钟）。
 */
import {
  BUILDINGS, CAMPAIGN, capacity, TROOPS, battleResult, botActions, build, boatSlots, canPlace, collect, createBattle, hqLevel, nextUnlock, newProfile,
  produce, research, setBoat, settleCampaign, startCampaign, stepBattle, totalStars, upgrade,
} from '../src/core/index.ts';
import type { BuildingKind, Profile } from '../src/core/index.ts';
import { fleetFor } from './sample.ts';

const SESSION_OFFLINE = 12 * 3600;
const FIGHTS = 3;
const DEPLOY = 20;
const SETTLE = 15;
const OPEN = 60;

type Ev = { min: number; big: boolean; text: string };
const events: Ev[] = [];
let clock = 0; // 活跃秒
const ev = (text: string, big = false): void => {
  events.push({ min: clock / 60, big, text });
};

function spot(p: Profile, kind: BuildingKind): [number, number] | null {
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) if (canPlace(p, kind, x, y)) return [x, y];
  return null;
}
function collectAll(p0: Profile): Profile {
  let p = p0;
  for (const b of p.base.buildings) {
    if (b.kind !== 'goldmine' && b.kind !== 'sawmill') continue;
    const r = collect(p, b.id);
    if (r.ok) p = r.value.profile;
  }
  return p;
}
const NEW_ITEMS = (hq: number): string => {
  const n = [] as string[];
  for (const [, d] of Object.entries(BUILDINGS)) if (d.unlockHq === hq && d.category !== 'deco' && hq > 1) n.push(d.name);
  for (const [, d] of Object.entries(TROOPS)) if (d.unlockHq === hq && hq > 1) n.push(d.name);
  return n.join('、');
};

function spend(p0: Profile): Profile {
  let p = p0;
  // 优先级：主寨 > 船坞 / 军械所（建、升） > 研究 > 资源 / 仓库（建、升）
  const army: BuildingKind[] = ['dock', 'armory'];
  const eco: BuildingKind[] = ['goldmine', 'sawmill', 'vault', 'woodyard'];
  const tryKinds = (kinds: BuildingKind[]): [Profile, string] | null => {
    for (const kind of kinds) {
      if (BUILDINGS[kind].unlockHq > hqLevel(p)) continue;
      const at = spot(p, kind);
      if (!at) continue;
      const r = build(p, kind, at[0], at[1]);
      if (r.ok) return [r.value, `新建 ${BUILDINGS[kind].name}`];
    }
    const cands = p.base.buildings.filter((b) => kinds.includes(b.kind)).sort((a, b) => a.level - b.level || kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
    for (const b of cands) {
      const r = upgrade(p, b.id);
      if (r.ok) return [r.value, `升级 ${BUILDINGS[b.kind].name} → ${b.level + 1} 级`];
    }
    return null;
  };
  for (let guard = 0; guard < 300; guard++) {
    let next: Profile | null = null;
    let what = '';
    let big = false;
    const hq = p.base.buildings.find((b) => b.kind === 'hq');
    if (hq) {
      const r = upgrade(p, hq.id);
      if (r.ok) {
        next = r.value;
        what = `主寨升到 ${hq.level + 1} 级（开放：${NEW_ITEMS(hq.level + 1)}；技能 ${hq.level + 1 === 2 ? '信号弹' : hq.level + 1 === 5 ? '补给桶' : '-'}）`;
        big = true;
      }
    }
    // 星数够了、只差钱时就攒着，不把钱花在别处（真人会这么做）
    if (!next) {
      const r = tryKinds(army);
      if (r) [next, what] = r;
    }
    if (!next) {
      for (const key of ['sailor', 'gunner', 'brute', 'bomber', 'captain', 'harpooner', 'cannoneer', 'medic', 'barrage', 'flare', 'medkit'] as const) {
        const r = research(p, key);
        if (r.ok) {
          next = r.value;
          what = `研究 ${key} → ${next.research[key] ?? 1} 级`;
          break;
        }
      }
    }
    const nu = nextUnlock(p);
    if (!next && nu && nu.starsLeft === 0) {
      // 攒钱期间仓库装不下下一级主寨的花费，就先扩仓库
      const cap = capacity(p);
      if (nu.cost.gold > cap.gold || nu.cost.wood > cap.wood) {
        const r = tryKinds(['vault', 'woodyard']);
        if (r) {
          [next, what] = r;
          p = next;
          ev(what);
          continue;
        }
      }
      break;
    }
    if (!next) {
      const r = tryKinds(eco);
      if (r) [next, what] = r;
    }
    if (!next) break;
    p = next;
    ev(what, big);
  }
  return p;
}

function fleet(p: Profile): Profile {
  const comp = fleetFor(hqLevel(p));
  const { boats } = boatSlots(p);
  let q = p;
  for (let i = 0; i < boats; i++) {
    const r = setBoat(q, i, comp[i] ?? 'sailor');
    if (r.ok) q = r.value;
  }
  return q;
}

interface FightLog {
  n: number;
  level: string;
  stars: number;
  min: number;
  secs: number;
  hq: number;
  gold: number;
  wood: number;
  starsTotal: number;
  blocker: string;
}
const fights: FightLog[] = [];

let p = newProfile();
let n = 0;
let sinceProgress = 0;
let lastKey = '';
const cleared = new Set<string>();
const unlockedLevels = new Set<string>(['c01', 'c02']);
for (const l of CAMPAIGN) if (l.reqStars === 0) unlockedLevels.add(l.id);

function blocker(pp: Profile): string {
  const nu = nextUnlock(pp);
  if (!nu) return '主寨满级';
  if (nu.starsLeft > 0) return `星差${nu.starsLeft}`;
  const g = nu.cost.gold - pp.res.gold;
  const w = nu.cost.wood - pp.res.wood;
  if (g > 0 && w > 0) return `金差${g}木差${w}`;
  if (g > 0) return `金差${g}`;
  if (w > 0) return `木差${w}`;
  return '可升';
}

while (n < 250 && !CAMPAIGN.every((l) => (p.stars[l.id] ?? 0) >= 3)) {
  p = produce(p, SESSION_OFFLINE);
  p = collectAll(p);
  clock += OPEN;
  p = spend(p);
  for (let f = 0; f < FIGHTS && n < 250; f++) {
    p = fleet(p);
    const open = CAMPAIGN.filter((l) => totalStars(p) >= l.reqStars);
    for (const l of open) {
      if (!unlockedLevels.has(l.id)) {
        unlockedLevels.add(l.id);
        ev(`新关解锁：${l.id} ${l.name}`, true);
      }
    }
    // 玩家策略：先把已解锁的关都打到 2 星再往前推，推完了回头补 3 星（--strict3 则同 progress.test：一直重刷到 3 星才往前）
    const need = process.argv.includes('--strict3') ? 3 : 2;
    let idx = open.findIndex((l) => (p.stars[l.id] ?? 0) < need);
    if (idx < 0) idx = open.findIndex((l) => (p.stars[l.id] ?? 0) < 3);
    if (idx < 0) idx = open.length - 1;
    const latest = open[idx]!;
    const target = (p.stars[latest.id] ?? 0) === 0 && idx > 0 && sinceProgress >= 3 && n % 3 !== 0 ? open[idx - 1]! : latest;
    const st = startCampaign(p, target.id, 1000 + n);
    n++;
    if (!st.ok) {
      sinceProgress++;
      continue;
    }
    const { setup } = st.value;
    const acts = botActions(setup, 'normal');
    const s = createBattle(setup);
    let wiped = -1;
    while (!s.over) {
      stepBattle(s, acts.filter((a) => a.t === s.tick));
      if (wiped < 0 && s.landed.every(Boolean) && !s.units.some((u) => u.mode !== 'dead')) wiped = s.tick;
    }
    const result = battleResult(s);
    const secs = DEPLOY + (wiped >= 0 ? wiped : s.tick) / 20 + SETTLE;
    clock += secs;
    const prevStars = p.stars[target.id] ?? 0;
    const done = settleCampaign(st.value.profile, target.id, result);
    p = done.profile;
    if (done.newStars > 0 && prevStars === 0) {
      ev(`首次拿星：${target.id} ${result.stars}★（掠夺 ${done.loot.gold}金/${done.loot.wood}木）`, !cleared.has(target.id));
      if (!cleared.has(target.id)) {
        cleared.add(target.id);
      }
    } else if (done.newStars > 0) ev(`加星：${target.id} → ${p.stars[target.id]}★`);
    const key = `${hqLevel(p)}:${totalStars(p)}`;
    if (key !== lastKey) {
      sinceProgress = 0;
      lastKey = key;
    } else sinceProgress++;
    fights.push({ n, level: target.id, stars: result.stars, min: clock / 60, secs, hq: hqLevel(p), gold: p.res.gold, wood: p.res.wood, starsTotal: totalStars(p), blocker: blocker(p) });
    p = spend(p);
  }
}

console.log('## 时间线（活跃分钟）');
for (const e of events) console.log(`${e.min.toFixed(1).padStart(6)}  ${e.big ? '★' : ' '} ${e.text}`);
console.log(`\n共 ${n} 场，活跃 ${(clock / 60).toFixed(1)} 分钟，${Math.ceil(n / FIGHTS)} 次上线`);

console.log('\n## 大盼头间隔（主寨升级 / 新关首过 / 新关解锁）');
const bigs = events.filter((e) => e.big && !e.text.startsWith('新关解锁'));
const gaps: number[] = [];
for (let i = 1; i < bigs.length; i++) {
  const a = bigs[i - 1]!;
  const b = bigs[i]!;
  const g = b.min - a.min;
  gaps.push(g);
  const inside = fights.filter((f) => f.min > a.min && f.min <= b.min);
  const lost = inside.filter((f) => f.stars <= 1).length;
  const blk = new Map<string, number>();
  for (const f of inside) blk.set(f.blocker.replace(/\d+/g, '#'), (blk.get(f.blocker.replace(/\d+/g, '#')) ?? 0) + 1);
  console.log(`${a.min.toFixed(1).padStart(6)} → ${b.min.toFixed(1).padStart(6)}  间隔 ${g.toFixed(1).padStart(5)}${g > 8 ? ' !!' : '   '}  ${a.text.slice(0, 22)} → ${b.text.slice(0, 22)}  [${inside.length} 场，≤1星 ${lost} 场；主寨阻碍：${[...blk].map(([k, v]) => `${k}×${v}`).join(' ')}]`);
}
const sorted = [...gaps].sort((x, y) => x - y);
console.log(`间隔分钟：最小 ${sorted[0]?.toFixed(1)} 中位 ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)} 最大 ${sorted[sorted.length - 1]?.toFixed(1)}；>8 分钟 ${gaps.filter((g) => g > 8).length} 个`);

console.log('\n## 逐场（场次 关 星 累计分钟 主寨 金 木 总星 下一级阻碍）');
for (const f of fights) console.log(`${String(f.n).padStart(3)} ${f.level} ${f.stars}★ ${f.min.toFixed(1).padStart(6)}min hq${f.hq} ${String(f.gold).padStart(6)}g ${String(f.wood).padStart(6)}w ★${f.starsTotal} ${f.blocker}`);

if (process.argv.includes('--state')) {
  console.log(JSON.stringify({ hq: hqLevel(p), res: p.res, research: p.research, boats: p.boats.map((b) => b.troop), b: p.base.buildings.filter((x) => !['palm', 'rock'].includes(x.kind)).map((x) => `${x.kind}${x.level}`) }));
}
