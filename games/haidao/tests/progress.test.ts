import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, CAMPAIGN, boatSlots, botActions, build, canPlace, capacity, collect, hqLevel, newProfile, nextUnlock, produce, research,
  runBattle, setBoat, settleCampaign, startCampaign, totalStars, upgrade,
} from '../src/core/index.ts';
import type { BuildingKind, Profile } from '../src/core/index.ts';
import { fleetFor } from '../tools/sample.ts';

/**
 * 进度集成测试：一个确定性的"普通玩家"从新号开始（策略同 tools/pace.ts）：
 * 每次上线隔 12 小时、打 3 场；先推到没打过的关；主寨 > 船坞 / 军械所 > 研究 > 资源 / 仓库；
 * 星数够了只差钱就攒着。用来发现经济卡点。
 */
const SESSION_SECONDS = 12 * 3600;
const FIGHTS_PER_SESSION = 3;
/** 固定打这么多场（不追满三星，后段关卡机器人追不满，打满 200 场要 130 秒）；断言按这个场数相称的进度写 */
const MAX_FIGHTS = 80;

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

function tryKinds(p: Profile, kinds: BuildingKind[]): Profile | null {
  for (const kind of kinds) {
    if (BUILDINGS[kind].unlockHq > hqLevel(p)) continue;
    const at = spot(p, kind);
    if (!at) continue;
    const r = build(p, kind, at[0], at[1]);
    if (r.ok) return r.value;
  }
  const cands = p.base.buildings.filter((b) => kinds.includes(b.kind)).sort((a, b) => a.level - b.level || kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  for (const b of cands) {
    const r = upgrade(p, b.id);
    if (r.ok) return r.value;
  }
  return null;
}

function spend(p0: Profile): Profile {
  let p = p0;
  for (let guard = 0; guard < 400; guard++) {
    let next: Profile | null = null;
    const hq = p.base.buildings.find((b) => b.kind === 'hq');
    if (hq) {
      const r = upgrade(p, hq.id);
      if (r.ok) next = r.value;
    }
    if (!next) next = tryKinds(p, ['dock', 'armory']);
    if (!next) {
      for (const key of ['sailor', 'gunner', 'brute', 'bomber', 'captain', 'harpooner', 'cannoneer', 'medic', 'barrage', 'flare', 'medkit'] as const) {
        const r = research(p, key);
        if (r.ok) {
          next = r.value;
          break;
        }
      }
    }
    if (!next) {
      const nu = nextUnlock(p);
      if (nu && nu.starsLeft === 0) {
        // 攒钱期间仓库装不下下一级主寨的花费，就先扩仓库
        const cap = capacity(p);
        if (nu.cost.gold > cap.gold || nu.cost.wood > cap.wood) next = tryKinds(p, ['vault', 'woodyard']);
        if (!next) break;
      } else next = tryKinds(p, ['goldmine', 'sawmill', 'vault', 'woodyard']);
    }
    if (!next) break;
    p = next;
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

describe('进度', () => {
  it(`普通玩家固定 ${MAX_FIGHTS} 场：主寨、通关数跟得上，资源不为负、不卡死`, () => {
    let p = newProfile();
    const firstClear: Record<string, number> = {};
    let sinceProgress = 0;
    let lastKey = '';
    let hqAt = '';
    let fights = 0;
    let maxStall = 0;
    while (fights < MAX_FIGHTS) {
      p = produce(p, SESSION_SECONDS);
      p = spend(collectAll(p));
      for (let f = 0; f < FIGHTS_PER_SESSION && fights < MAX_FIGHTS; f++) {
        p = fleet(p);
        const open = CAMPAIGN.filter((l) => totalStars(p) >= l.reqStars);
        // 先推到没打过的关（后段关卡机器人平均拿不到 2 星，追 2 星会原地打转），都打过了再补星
        let idx = open.findIndex((l) => (p.stars[l.id] ?? 0) === 0);
        if (idx < 0) idx = open.findIndex((l) => (p.stars[l.id] ?? 0) < 2);
        if (idx < 0) idx = open.findIndex((l) => (p.stars[l.id] ?? 0) < 3);
        if (idx < 0) idx = open.length - 1;
        const latest = open[idx]!;
        // 最新关打不过就回头刷前一关，但每 3 场回来试一次
        const target = (p.stars[latest.id] ?? 0) === 0 && idx > 0 && sinceProgress >= 3 && fights % 3 !== 0 ? open[idx - 1]! : latest;
        const st = startCampaign(p, target.id, 1000 + fights);
        fights++;
        if (!st.ok) {
          sinceProgress++;
          continue;
        }
        const { setup } = st.value;
        const { result } = runBattle(setup, botActions(setup, 'normal'));
        const done = settleCampaign(st.value.profile, target.id, result);
        p = done.profile;
        expect(p.res.gold).toBeGreaterThanOrEqual(0);
        expect(p.res.wood).toBeGreaterThanOrEqual(0);
        if (result.stars >= 1 && firstClear[target.id] === undefined) firstClear[target.id] = fights;
        const key = `${hqLevel(p)}:${totalStars(p)}`;
        if (key !== lastKey) {
          sinceProgress = 0;
          lastKey = key;
        } else sinceProgress++;
        maxStall = Math.max(maxStall, sinceProgress);
        if (hqAt.indexOf(`主寨${hqLevel(p)}@`) < 0) hqAt += `主寨${hqLevel(p)}@${fights} `;
        // 还有没通关的岛时，不许连续 50 场毫无进展
        if (CAMPAIGN.some((l) => (p.stars[l.id] ?? 0) === 0)) expect(sinceProgress, `连续 50 场没进展（第 ${fights} 场，${target.id}）`).toBeLessThan(50);
        p = spend(collectAll(p));
        expect(p.res.gold).toBeLessThanOrEqual(capacity(p).gold);
      }
    }
    console.log(`首次过关场次：${CAMPAIGN.map((l) => `${l.id}@${firstClear[l.id] ?? '-'}`).join(' ')}`);
    console.log(`主寨升级场次：${hqAt}；共 ${fights} 场，星 ${totalStars(p)}，最长停滞 ${maxStall} 场`);
    expect(hqLevel(p)).toBeGreaterThanOrEqual(8);
    expect(Object.keys(firstClear).length).toBeGreaterThanOrEqual(20);
  }, 120_000);
});
