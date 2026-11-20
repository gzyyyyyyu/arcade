import { describe, expect, it } from 'vitest';
import { BUILDINGS, COSMETICS, TD_TROPHIES, build, canPlace, isDecoKind, settleTd, tdCampaign, tdChapterCleared, tdGrowthProfile } from '../src/core/index.ts';
import { TD2_LEVEL_BY_ID } from '../src/content/tdmaps.ts';
import { ISLAND, type BuildingKind, type Profile, type TdResult } from '../src/core/index.ts';
import { fresh, reviveSave } from '../src/platform/sync.ts';
import { DECO_FRAMES, buildingArt, decoFrames, isDecoAnim } from '../src/view/art/buildings.ts';
import { trophyText } from '../src/view/tdreason.ts';

/** 守岛每章全部过关送一件会动的纪念装饰（TD_TROPHIES，settleTd 发）：存档只多收藏 id，走 sync.ts 的收藏白名单 */

const res = (stars: number): TdResult => ({ over: true, stars, lost: 0, waves: 10, total: 10, ticks: 4000, goldEarned: 0 });
/** 战役除了 last 都 1 星的老玩家（收藏可给） */
function almost(last: string, cosmetics: string[] = []): Profile {
  const p = tdGrowthProfile(TD2_LEVEL_BY_ID.get('td24')!, 'suggest');
  const stars: Record<string, number> = {};
  for (const l of tdCampaign()) if (l.id !== last) stars[l.id] = 1;
  return { ...p, cosmetics, td: { stars, day: 5, gotGold: 0, gotWood: 0 } };
}
const settle = (p: Profile, id: string, stars: number) => {
  const r = settleTd(p, id, res(stars), 5);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const lastOf = (ch: number): string => tdCampaign().filter((l) => l.chapter === ch).at(-1)!.id;
const ids = Object.values(TD_TROPHIES);

describe('章节纪念装饰：发放', () => {
  it('五章各一件、都是装饰、都在存档白名单里，都会动（有帧）', () => {
    expect(Object.keys(TD_TROPHIES).map(Number)).toEqual([1, 2, 3, 4, 5]);
    for (const id of ids) {
      const kind = id.slice('deco:'.length) as BuildingKind;
      expect(isDecoKind(kind), id).toBe(true);
      expect(COSMETICS).toContain(id);
      expect(isDecoAnim(kind), id).toBe(true);
    }
  });

  it('拿下一章最后一关的第一颗星时送这一章的，只送一次', () => {
    for (const ch of [1, 2, 3, 4, 5]) {
      const others = ids.filter((id) => id !== TD_TROPHIES[ch]);
      const p = almost(lastOf(ch), others);
      expect(tdChapterCleared(p.td!.stars, ch)).toBe(false);
      const a = settle(p, lastOf(ch), 1);
      expect(a.reward.trophies, `第 ${ch} 章`).toEqual([TD_TROPHIES[ch]]);
      expect(tdChapterCleared(a.profile.td!.stars, ch)).toBe(true);
      const b = settle(a.profile, lastOf(ch), 3);
      expect(b.reward.trophies).toEqual([]);
      expect(b.profile.cosmetics?.filter((c) => c === TD_TROPHIES[ch])).toHaveLength(1);
    }
  });

  it('一章还有一关 0 星时不送；0 星这一局也不送', () => {
    const p = almost('td24', ids.filter((id) => id !== TD_TROPHIES[4]));
    const miss = { ...p, td: { ...p.td!, stars: { ...p.td!.stars, td19: 0 } } };
    expect(settle(miss, 'td24', 2).reward.trophies).toEqual([]);
    expect(settle(p, 'td24', 0).reward.trophies).toEqual([]);
  });

  it('老存档早已全有星、一件没领：输的一局不发，下一次拿星按章号一起补发', () => {
    const p = almost('td24');
    const all = { ...p, td: { ...p.td!, stars: { ...p.td!.stars, td24: 1 } } };
    const lose = settle(all, 'td05', 0);
    expect(lose.reward.trophies).toEqual([]);
    expect(lose.profile.cosmetics).toEqual([]);
    const win = settle(lose.profile, 'td05', 1);
    expect(win.reward.trophies).toEqual(ids);
    expect(win.profile.cosmetics).toEqual(ids);
  });

  it('结算框那一行：一件写章名和装饰名，几件并成一行；第四章叫远洋通关', () => {
    expect(trophyText(['deco:windmill'])).toBe('第一章通关！得到装饰「小风车」，在收藏里摆到岛上');
    expect(trophyText(['deco:lighthouse', 'deco:wheel'])).toBe('第二章通关、远洋通关！得到装饰「小灯塔」「海盗王的舵轮」，在收藏里摆到岛上');
    expect(trophyText(['deco:lookout'])).toBe('第五章通关！得到装饰「瞭望台」，在收藏里摆到岛上');
  });
});

describe('章节纪念装饰：摆放和存档', () => {
  it('没拿到不能摆，拿到了能摆', () => {
    const p = almost('td24');
    for (const id of ids) {
      const kind = id.slice('deco:'.length) as BuildingKind;
      let at: [number, number] | null = null;
      for (let y = 0; y < ISLAND && !at; y++) for (let x = 0; x < ISLAND && !at; x++) if (canPlace(p, kind, x, y)) at = [x, y];
      expect(at, id).not.toBeNull();
      const r = build(p, kind, at![0], at![1]);
      expect(r.ok ? 'ok' : r.error, id).toBe('locked');
      expect(build({ ...p, cosmetics: [id] }, kind, at![0], at![1]).ok, id).toBe(true);
    }
  });

  it('读存档：有收藏的留着、摆着的留着；没收藏却摆着的去掉；旧存档（没有这几件）照常读', () => {
    expect(reviveSave(JSON.parse(JSON.stringify(fresh())))).not.toBeNull();
    const s = JSON.parse(JSON.stringify(fresh())) as ReturnType<typeof fresh>;
    s.profile.cosmetics = ['deco:lighthouse'];
    const spot = (kind: BuildingKind): [number, number] => {
      for (let y = 0; y < ISLAND; y++) for (let x = 0; x < ISLAND; x++) if (canPlace(s.profile, kind, x, y)) return [x, y];
      throw new Error('no spot');
    };
    const [lx, ly] = spot('lighthouse');
    s.profile.base.buildings.push({ id: 900, kind: 'lighthouse', level: 1, x: lx, y: ly });
    const [wx, wy] = spot('windmill');
    s.profile.base.buildings.push({ id: 901, kind: 'windmill', level: 1, x: wx, y: wy });
    s.profile.base.nextId = 902;
    const r = reviveSave(s)!;
    expect(r.profile.cosmetics).toEqual(['deco:lighthouse']);
    expect(r.profile.base.buildings.some((b) => b.id === 900)).toBe(true);
    expect(r.profile.base.buildings.some((b) => b.id === 901)).toBe(false);
  });

  it('只占格：不挨打、不算摧毁率（规则按 category 认装饰）', () => {
    for (const id of ids) expect(BUILDINGS[id.slice('deco:'.length) as BuildingKind].category).toBe('deco');
  });
});

describe('章节纪念装饰：动画帧', () => {
  it('每种的帧和静态图同画布同锚点（换纹理不跳），key 各不相同', () => {
    for (const kind of Object.keys(DECO_FRAMES) as Array<keyof typeof DECO_FRAMES>) {
      const st = buildingArt(kind, 1);
      const fs = decoFrames(kind);
      expect(fs).toHaveLength(DECO_FRAMES[kind]);
      for (const f of fs) expect([f.w, f.h, f.ax, f.ay], kind).toEqual([st.w, st.h, st.ax, st.ay]);
      expect(new Set(fs.map((f) => f.key)).size).toBe(fs.length);
      expect(new Set(fs.map((f) => f.svg)).size, `${kind} 每帧画得不一样`).toBe(fs.length);
    }
  });
});
