/**
 * 经济估算：node tools/econ.ts [--days 10] [--sessions 2] [--fights 3]
 * 假想玩家每天上线 sessions 次，每次收资源、打 fights 场、再贪心地花掉（主寨 > 缺的产出建筑 > 产出建筑升级 > 仓库 > 船坞 / 军械所）。
 * 打关的结果用经验值：前 5 关第 1 次 2 星、第 2 次 3 星；后面的关 1 星、2 星、3 星。用的全是真实的基地函数。
 */
import {
  BUILDINGS, CAMPAIGN, HQ_LEVELS, build, canPlace, collect, hqLevel, newProfile, produce, settleCampaign, startCampaign, totalStars, upgrade,
} from '../src/core/index.ts';
import type { BuildingKind, Profile } from '../src/core/index.ts';
import { sampleProfile } from './sample.ts';
import { num } from './args.ts';

const days = num('--days', 10);
const sessions = num('--sessions', 2);
const fights = num('--fights', 3);

function freeSpot(p: Profile, kind: BuildingKind): [number, number] | null {
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) if (canPlace(p, kind, x, y)) return [x, y];
  return null;
}

function spend(p0: Profile): Profile {
  let p = p0;
  for (let guard = 0; guard < 200; guard++) {
    const hq = hqLevel(p);
    let next: Profile | null = null;
    const hqB = p.base.buildings.find((b) => b.kind === 'hq');
    if (hqB) {
      const r = upgrade(p, hqB.id);
      if (r.ok) next = r.value;
    }
    if (!next) {
      for (const kind of ['goldmine', 'sawmill', 'vault', 'woodyard', 'dock', 'armory'] as BuildingKind[]) {
        if (BUILDINGS[kind].unlockHq > hq) continue;
        const spot = freeSpot(p, kind);
        if (!spot) continue;
        const r = build(p, kind, spot[0], spot[1]);
        if (r.ok) {
          next = r.value;
          break;
        }
      }
    }
    if (!next) {
      const order: BuildingKind[] = ['goldmine', 'sawmill', 'vault', 'woodyard', 'dock', 'armory'];
      const cands = p.base.buildings.filter((b) => order.includes(b.kind)).sort((a, b) => a.level - b.level || order.indexOf(a.kind) - order.indexOf(b.kind));
      for (const b of cands) {
        const r = upgrade(p, b.id);
        if (r.ok) {
          next = r.value;
          break;
        }
      }
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

const attempts: Record<string, number> = {};
let p = newProfile();
console.log('天  主寨  星数  金币/上限  木材/上限  打的关（星）');
for (let day = 1; day <= days; day++) {
  const log: string[] = [];
  for (let s = 0; s < sessions; s++) {
    p = produce(p, 86400 / sessions);
    p = collectAll(p);
    p = spend(p);
    for (let f = 0; f < fights; f++) {
      const sp = sampleProfile(hqLevel(p));
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
      log.push(`${target.id}(${stars})`);
    }
    p = spend(collectAll(p));
  }
  const cap = HQ_LEVELS[hqLevel(p) - 1];
  void cap;
  const lim = (await import('../src/core/index.ts')).capacity(p);
  console.log(`${String(day).padEnd(3)} ${String(hqLevel(p)).padEnd(5)} ${String(totalStars(p)).padEnd(5)} ${p.res.gold}/${lim.gold}  ${p.res.wood}/${lim.wood}  ${log.join(' ')}`);
}
