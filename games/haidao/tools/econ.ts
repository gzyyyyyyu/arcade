/**
 * 经济估算：node tools/econ.ts [--days 10] [--sessions 2] [--fights 3] [--td 0] [--quiet]
 * 假想玩家每天上线 sessions 次，每次收资源、打 fights 场出海、守 td 局岛，再贪心地花掉：先造缺的、再升最低级的（经济、仓储、船坞、军械所、防御塔），
 * 这一级建满了才升主寨，所以升级天数看的是收入（主寨要的战役星数在这个打法下一直够）。
 * 出海的结果用经验值：前 5 关第 1 次 2 星、第 2 次 3 星；后面的关 1 星、2 星、3 星。
 * 守岛打"已解锁、建议主寨不高于自己"的最后一关，星数按 docs/balance-haidao.md 第 5 节"稳"的三星率摊开（攒够一局 3★，其余 2★）。
 * 用的全是真实的基地和结算函数。最后打一张"主寨 n → n+1 用了几天、几场出海、几局守岛"的表；--quiet 只打这张表。
 */
import {
  BUILDINGS, CAMPAIGN, DEFENSE_KINDS, HQ_LEVELS, build, canPlace, capacity, collect, hqLevel, newProfile, produce, settleCampaign, settleTd, startCampaign,
  tdCampaign, tdLevelUnlocked, totalStars, upgrade,
} from '../src/core/index.ts';
import type { BuildingKind, Profile } from '../src/core/index.ts';
import { sampleProfile } from './sample.ts';
import { flag, num, opt } from './args.ts';

const days = num('--days', 10);
const sessions = num('--sessions', 2);
const fights = num('--fights', 3);
// 0 是合法值（只出海），所以不走 num 的"0 当默认"
const tdRuns = Number(opt('--td') ?? 0);
const quiet = flag('--quiet');
/** 守岛各关"稳"机器人的三星率（docs/balance-haidao-td.md，CI 每关 200 局） */
const TD_THREE: Record<string, number> = {
  td01: 100, td02: 96, td03: 80, td04: 100, td05: 80, td06: 100, td07: 66, td08: 59, td09: 58,
  td10: 51, td11: 55, td12: 57, td13: 53, td14: 42, td15: 40, td16: 46, td17: 35, td18: 45,
};

function freeSpot(p: Profile, kind: BuildingKind): [number, number] | null {
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) if (canPlace(p, kind, x, y)) return [x, y];
  return null;
}

/** 要花钱的建筑：经济、仓储、船坞、军械所，再加防御塔（城墙、地雷、焦油这类零碎不算） */
const SPEND: BuildingKind[] = ['goldmine', 'sawmill', 'vault', 'woodyard', 'dock', 'armory', ...DEFENSE_KINDS];

/** 这个主寨等级下还有没造的、或没升到顶（min(主寨, 上限)）的；下一级的价超过仓库上限的不算（这一级永远攒不够，比如主寨 6 的狙击塔 6 级） */
function unfinished(p: Profile): boolean {
  const hq = hqLevel(p);
  const lim = HQ_LEVELS[hq - 1]?.limits ?? {};
  const cap = capacity(p);
  const fits = (k: BuildingKind, lv: number): boolean => {
    const c = BUILDINGS[k].levels[lv - 1]?.cost;
    return !!c && c.gold <= cap.gold && c.wood <= cap.wood;
  };
  return SPEND.some((k) => {
    if (BUILDINGS[k].unlockHq > hq) return false;
    const own = p.base.buildings.filter((b) => b.kind === k);
    const top = Math.min(hq, BUILDINGS[k].maxLevel);
    return (own.length < (lim[k] ?? 0) && fits(k, 1)) || own.some((b) => b.level < top && fits(k, b.level + 1));
  });
}

/** 贪心地花：先造缺的、再升最低级的，这一级建满了才升主寨（升级天数因此看的是收入，不是战役星数） */
function spend(p0: Profile): Profile {
  let p = p0;
  for (let guard = 0; guard < 400; guard++) {
    const hq = hqLevel(p);
    let next: Profile | null = null;
    for (const kind of SPEND) {
      if (BUILDINGS[kind].unlockHq > hq) continue;
      const spot = freeSpot(p, kind);
      if (!spot) continue;
      const r = build(p, kind, spot[0], spot[1]);
      if (r.ok) {
        next = r.value;
        break;
      }
    }
    if (!next) {
      const cands = p.base.buildings.filter((b) => SPEND.includes(b.kind)).sort((a, b) => a.level - b.level || SPEND.indexOf(a.kind) - SPEND.indexOf(b.kind));
      for (const b of cands) {
        const r = upgrade(p, b.id);
        if (r.ok) {
          next = r.value;
          break;
        }
      }
    }
    if (!next && !unfinished(p)) {
      const hqB = p.base.buildings.find((b) => b.kind === 'hq');
      const r = hqB ? upgrade(p, hqB.id) : null;
      if (r?.ok) next = r.value;
    }
    if (!next) break;
    p = next;
  }
  return p;
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

/** 守岛一局：挑关、按三星率摊星数、照真实的 settleTd 结算 */
const tdAcc: Record<string, number> = {};
function defend(p: Profile, day: number): { p: Profile; tag: string } | null {
  const hq = hqLevel(p);
  const open = tdCampaign().filter((l) => l.hq <= hq && tdLevelUnlocked(p, l.id));
  const lv = open[open.length - 1];
  if (!lv) return null;
  const acc = (tdAcc[lv.id] ?? 0) + (TD_THREE[lv.id] ?? 50);
  const stars = acc >= 100 ? 3 : 2;
  tdAcc[lv.id] = acc >= 100 ? acc - 100 : acc;
  const r = settleTd(p, lv.id, { over: true, stars, lost: 0, waves: 0, total: 0, ticks: 0, goldEarned: 0 }, day);
  if (!r.ok) return null;
  return { p: r.value.profile, tag: `${lv.id}(${stars})` };
}

const attempts: Record<string, number> = {};
let p = newProfile();
/** 升到某级主寨时的 [天, 累计出海场数, 累计守岛局数] */
const reached: Array<[number, number, number]> = [[0, 0, 0]];
let raids = 0;
let defenses = 0;
const mark = (day: number): void => {
  for (let lv = reached.length + 1; lv <= hqLevel(p); lv++) reached.push([day, raids, defenses]);
};
if (!quiet) console.log('天  主寨  星数  金币/上限  木材/上限  打的关（星）');
for (let day = 1; day <= days; day++) {
  const log: string[] = [];
  for (let s = 0; s < sessions; s++) {
    p = produce(p, 86400 / sessions);
    p = collectAll(p);
    p = spend(p);
    mark(day);
    for (let f = 0; f < fights; f++) {      const sp = sampleProfile(hqLevel(p));
      p = { ...p, boats: sp.boats.slice(0, 6), research: sp.research };
      const open = CAMPAIGN.filter((l) => totalStars(p) >= l.reqStars);
      const target = open.find((l) => (p.stars[l.id] ?? 0) < 3) ?? open[open.length - 1];
      if (!target) break;
      const idx = CAMPAIGN.indexOf(target);
      const n = (attempts[target.id] = (attempts[target.id] ?? 0) + 1);
      const seq = idx < 5 ? [2, 3] : [1, 2, 3];
      const stars = seq[Math.min(n, seq.length) - 1] ?? 3;
      const st = startCampaign(p, target.id, 1);
      if (!st.ok) {
        log.push(`${target.id}:${st.error}`);
        continue;
      }
      const res = settleCampaign(st.value.profile, target.id, { over: true, stars, destroyedPct: stars === 3 ? 100 : stars === 2 ? 80 : 55, hqDown: stars >= 2 });
      p = res.profile;
      raids++;
      log.push(`${target.id}(${stars})`);
    }
    for (let t = 0; t < tdRuns; t++) {
      const d = defend(p, day);
      if (!d) break;
      p = d.p;
      defenses++;
      log.push(d.tag);
    }
    p = spend(collectAll(p));
    mark(day);
  }
  const lim = capacity(p);
  if (!quiet) console.log(`${String(day).padEnd(3)} ${String(hqLevel(p)).padEnd(5)} ${String(totalStars(p)).padEnd(5)} ${p.res.gold}/${lim.gold}  ${p.res.wood}/${lim.wood}  ${log.join(' ')}`);
}
console.log(`主寨 n → n+1（每天 ${sessions} 次上线，每次出海 ${fights} 场、守岛 ${tdRuns} 局）：天 / 出海 / 守岛`);
for (let lv = 1; lv < HQ_LEVELS.length; lv++) {
  const a = reached[lv - 1];
  const b = reached[lv];
  console.log(`${lv} → ${lv + 1}: ${a && b ? `${b[0] - a[0]} 天 / ${b[1] - a[1]} 场 / ${b[2] - a[2]} 局` : '没升到'}`);
}
