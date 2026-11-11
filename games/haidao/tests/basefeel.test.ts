import { describe, expect, it } from 'vitest';
import { BUILDINGS, HQ_LEVELS } from '../src/content/index.ts';
import { canPlace, newProfile } from '../src/core/index.ts';
import { ISLAND, type BuildingKind } from '../src/core/types.ts';
import { DROP_MS, WALL_RISE_MS, buildFrame, buildPlan, buildingMenu, celebrateGo, clampPlace, costGap, fullText, nextSlotHq, dropPose, edgePan, keyAction, menuPos, placeCheck, placeReason, startSpot, statDiff, panelFocus, camLerp, upFrame, upPlan, withKey } from '../src/view/basefeel.ts';

describe('升级面板：当前 → 下一级', () => {
  it('金矿列出血量、产量、存量，增量 = 下一级 - 当前，都来自内容表', () => {
    const rows = statDiff('goldmine', 2);
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(['hp', 'rate', 'cap']);
    const lv = BUILDINGS.goldmine.levels;
    for (const r of rows) {
      expect(r.cur).toBe(lv[1]![r.key]);
      expect(r.next).toBe(lv[2]![r.key]);
      expect(r.delta).toBe((r.next ?? 0) - r.cur);
      expect(r.delta).toBeGreaterThan(0);
    }
  });
  it('防御塔有伤害和射程；仓库的容量叫"仓库容量"，产出建筑叫"最多存"', () => {
    expect(statDiff('cannon', 1).map((r) => r.key)).toEqual(expect.arrayContaining(['hp', 'dmg', 'range']));
    expect(statDiff('vault', 1).find((r) => r.key === 'cap')?.label).toBe('仓库容量');
    expect(statDiff('goldmine', 1).find((r) => r.key === 'cap')?.label).toBe('最多存');
  });
  it('满级没有下一级，增量为 0', () => {
    const max = BUILDINGS.goldmine.maxLevel;
    for (const r of statDiff('goldmine', max)) {
      expect(r.next).toBeNull();
      expect(r.delta).toBe(0);
    }
  });
  it('花费：够的项差 0，不够的写差多少；0 花费的项不列', () => {
    expect(costGap({ gold: 300, wood: 0 }, { gold: 120, wood: 9 })).toEqual([{ k: 'gold', need: 300, have: 120, short: 180 }]);
    expect(costGap({ gold: 100, wood: 50 }, { gold: 100, wood: 80 }).map((c) => c.short)).toEqual([0, 0]);
  });
});

describe('摆放：每一格能不能放和原因', () => {
  const p = newProfile();
  const list = p.base.buildings;
  it('和规则核心 canPlace 逐格对拍（全岛、每种尺寸）', () => {
    for (const kind of ['mine', 'cannon', 'goldmine', 'hq'] as BuildingKind[]) {
      const size = BUILDINGS[kind].size;
      for (let y = -(size - 1); y < ISLAND; y++) {
        for (let x = -(size - 1); x < ISLAND; x++) {
          const c = placeCheck(list, kind, x, y, ISLAND);
          expect(c.ok, `${kind} ${x},${y}`).toBe(canPlace(p, kind, x, y));
          expect(c.cells).toHaveLength(size * size);
        }
      }
    }
  });
  it('压到建筑：原因是 hit，说出压到了哪座；探出岛外：原因是 out', () => {
    const hq = list.find((b) => b.kind === 'hq')!;
    const c = placeCheck(list, 'cannon', hq.x, hq.y, ISLAND);
    expect(c.reason).toBe('hit');
    expect(c.hit).toBe('hq');
    expect(placeReason(c)).toBe('压到主寨了');
    expect(c.cells.some((q) => q.s === 'hit')).toBe(true);
    const o = placeCheck([], 'cannon', -1, 3, ISLAND);
    expect(o.reason).toBe('out');
    expect(placeReason(o)).toContain('边界');
    expect(o.cells.filter((q) => q.s === 'out')).toHaveLength(2);
  });
  it('移动时不算自己：原地放下是合法的', () => {
    const gm = list.find((b) => b.kind === 'goldmine')!;
    expect(placeCheck(list, 'goldmine', gm.x, gm.y, ISLAND).ok).toBe(false);
    expect(placeCheck(list, 'goldmine', gm.x, gm.y, ISLAND, gm.id).ok).toBe(true);
  });
  it('虚影最多探出 size-1 格，至少一格留在岛上', () => {
    expect(clampPlace(-9, 40, 3, ISLAND)).toEqual({ x: -2, y: ISLAND - 1 });
    expect(clampPlace(5, 6, 3, ISLAND)).toEqual({ x: 5, y: 6 });
  });
});

describe('电脑操作', () => {
  it('快捷键：U 升级、I 信息、C 收集全部、M 移动、B 建造、Esc 取消，大小写都认', () => {
    expect(keyAction('u')).toBe('upgrade');
    expect(keyAction('U')).toBe('upgrade');
    expect(keyAction('i')).toBe('info');
    expect(keyAction('C')).toBe('collectAll');
    expect(keyAction('m')).toBe('move');
    expect(keyAction('b')).toBe('build');
    expect(keyAction('Escape')).toBe('cancel');
    expect(keyAction('x')).toBeNull();
    expect(withKey('升级', 'upgrade')).toBe('升级（U）');
  });
  it('右键菜单：升级（带花费和键位）、信息、有存量才有收集、移动；升不起时灰着带原因', () => {
    const cost = { gold: 300, wood: 0 };
    const a = buildingMenu('goldmine', 1, 12, { ok: true }, cost);
    expect(a.map((m) => [m.id, m.key])).toEqual([['upgrade', 'U'], ['info', 'I'], ['collect', 'C'], ['move', 'M']]);
    expect(a[0]!.cost).toEqual(cost);
    expect(a[0]!.dot).toBe(true);
    const b = buildingMenu('goldmine', 1, 0.5, { ok: false, why: '还差 180 金币' }, cost);
    expect(b.map((m) => m.id)).toEqual(['upgrade', 'info', 'move']);
    expect(b[0]!.off).toBe(true);
    expect(b[0]!.why).toBe('还差 180 金币');
    expect(buildingMenu('cannon', 8, 0, null, null).map((m) => m.id)).toEqual(['info', 'move']);
  });
  it('菜单贴在鼠标右下，右边 / 下边放不下就翻过去，不出可见区', () => {
    const area = { l: 0, r: 1280, t: 60, b: 720 };
    expect(menuPos(100, 200, 200, 180, area)).toEqual({ x: 106, y: 206 });
    const p = menuPos(1250, 700, 200, 180, area);
    expect(p.x + 200).toBeLessThanOrEqual(1280);
    expect(p.y + 180).toBeLessThanOrEqual(720);
    expect(p.x).toBe(1250 - 6 - 200);
    const q = menuPos(5, 10, 200, 180, area);
    expect(q.y).toBeGreaterThanOrEqual(60);
  });
  it('拖到屏幕边缘镜头平移：中间不动，越贴边越快，鼠标离开画布不动', () => {
    expect(edgePan(640, 400, 1280, 800)).toEqual({ vx: 0, vy: 0 });
    const a = edgePan(1270, 400, 1280, 800);
    const b = edgePan(1250, 400, 1280, 800);
    expect(a.vx).toBeGreaterThan(b.vx);
    expect(b.vx).toBeGreaterThan(0);
    expect(edgePan(3, 400, 1280, 800).vx).toBeLessThan(0);
    expect(edgePan(640, 2, 1280, 800).vy).toBeLessThan(0);
    expect(edgePan(NaN, NaN, 1280, 800)).toEqual({ vx: 0, vy: 0 });
  });
});

describe('升级演出时间线', () => {
  it('总长 1.6–2.0 秒（城墙快版 1 秒），主寨更长', () => {
    const n = upPlan('normal');
    const h = upPlan('hq');
    for (const p of [n, h]) {
      expect(p.end).toBeGreaterThanOrEqual(1600);
      expect(p.end).toBeLessThanOrEqual(2000);
      expect(p.morph).toBeGreaterThan(p.rise);
      for (const t of p.hits) expect(t).toBeLessThan(p.morph);
    }
    expect(h.end).toBeGreaterThan(n.end);
    expect(upPlan('quick').morph).toBe(0);
  });
  it('施工时脚手架立着、建筑颤；换外观后脚手架落下消失、光柱和字出来；结束时一切复原', () => {
    const p = upPlan('normal');
    const mid = upFrame(p, p.hits[1]! + 10);
    expect(mid.scaf).toBeGreaterThan(0.9);
    expect(mid.fall).toBe(0);
    expect(Math.abs(mid.dx)).toBeGreaterThan(0);
    expect(mid.beamA).toBe(0);
    expect(mid.wordA).toBe(0);
    expect(mid.lvNew).toBe(false);
    const after = upFrame(p, p.morph + 300);
    expect(after.fall).toBeGreaterThan(0.5);
    expect(after.beamA).toBeGreaterThan(0.5);
    expect(after.wordA).toBe(1);
    expect(after.lvNew).toBe(true);
    const end = upFrame(p, p.end);
    expect(end.done).toBe(true);
    expect([end.sx, end.sy, end.dx, end.scaf, end.glow]).toEqual([1, 1, 0, 0, 0]);
    expect(end.wordA).toBeLessThan(0.05);
    expect(end.beamA).toBeLessThan(0.05);
  });
  it('逐帧（60 帧）采样没有跳变：缩放每帧变化不超过 0.12', () => {
    for (const kind of ['normal', 'hq', 'quick'] as const) {
      const p = upPlan(kind);
      let prev = upFrame(p, 0);
      for (let t = 1000 / 60; t <= p.end; t += 1000 / 60) {
        const f = upFrame(p, t);
        expect(Math.abs(f.sy - prev.sy), `${kind} ${t}`).toBeLessThan(0.12);
        expect(Math.abs(f.sx - prev.sx)).toBeLessThan(0.12);
        prev = f;
      }
    }
  });
  it('落地：先在上面、越落越快，着地压扁，最后站直', () => {
    const [h0] = dropPose(0);
    const [h1] = dropPose(0.2);
    expect(h0).toBeGreaterThan(h1);
    const squash = dropPose(0.45);
    expect(squash[0]).toBe(0);
    expect(squash[2]).toBeLessThan(1);
    expect(dropPose(1).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 1, 1, 1]);
    expect(DROP_MS).toBeGreaterThan(300);
  });
});

describe('摆放起点：画面中心附近最近的一块空地', () => {
  it('能放、四周留空、前方不贴着别的建筑；从中心往外找', () => {
    const p = newProfile();
    const list = p.base.buildings;
    const hq = list.find((b) => b.kind === 'hq')!;
    // 从主寨的位置起步：不能落在主寨上，也不能贴在它身后被挡住
    const at = startSpot(list, 'gunTower', hq.x, hq.y, ISLAND, (x, y) => canPlace(p, 'gunTower', x, y))!;
    expect(at).not.toBeNull();
    expect(canPlace(p, 'gunTower', at.x, at.y)).toBe(true);
    const size = BUILDINGS.gunTower.size;
    for (const q of list) {
      const qs = BUILDINGS[q.kind].size;
      const touch = q.x < at.x + size + 2 && q.x + qs > at.x - 1 && q.y < at.y + size + 2 && q.y + qs > at.y - 1;
      expect(touch, `${q.kind}`).toBe(false);
    }
  });
  it('空岛上中心那一格就是起点；放不下时返回 null', () => {
    expect(startSpot([], 'gunTower', 10, 10, ISLAND, () => true)).toEqual({ x: 10, y: 10 });
    expect(startSpot([], 'gunTower', 10, 10, ISLAND, () => false)).toBeNull();
  });
});

describe('开建筑面板时镜头让开', () => {
  const toScreen = (v: { cx: number; cy: number; z: number }, wx: number, wy: number, vw: number, vh: number) => ({ x: (wx - v.cx) * v.z + vw / 2, y: (wy - v.cy) * v.z + vh / 2 });
  it('手机竖屏：建筑挪到抽屉上方可见区的正中，太小就拉近，不超过最大缩放', () => {
    const cam = { cx: 0, cy: 0, z: 0.5 };
    const box = { l: 180, t: 600, r: 220, b: 640 }; // 被抽屉盖住的位置，40×40
    const area = { l: 8, t: 110, r: 382, b: 330 };
    const v = panelFocus(box, area, cam, 390, 844, 1.6);
    expect(v.z).toBeGreaterThan(cam.z);
    expect(v.z).toBeLessThanOrEqual(cam.z * 1.8 + 1e-9);
    // 建筑中心（世界坐标）在新镜头下落在可见区正中
    const wx = cam.cx + (200 - 195) / cam.z;
    const wy = cam.cy + (620 - 422) / cam.z;
    const s = toScreen(v, wx, wy, 390, 844);
    expect(s.x).toBeCloseTo((area.l + area.r) / 2, 6);
    expect(s.y).toBeCloseTo((area.t + area.b) / 2, 6);
    expect(panelFocus(box, area, { ...cam, z: 1.5 }, 390, 844, 1.6).z).toBeLessThanOrEqual(1.6);
  });
  it('电脑右侧面板：建筑挪到面板左边；够大时不缩放，也不会拉远', () => {
    const cam = { cx: 100, cy: 50, z: 1 };
    const box = { l: 950, t: 250, r: 1250, b: 550 };
    const area = { l: 8, t: 60, r: 860, b: 712 };
    const v = panelFocus(box, area, cam, 1280, 720, 1.6);
    expect(v.z).toBe(1);
    const s = toScreen(v, cam.cx + (1100 - 640), cam.cy + (400 - 360), 1280, 720);
    expect(s.x).toBeCloseTo(434, 6);
    expect(s.y).toBeCloseTo(386, 6);
  });
  it('插值两头对得上，缩放按比例插', () => {
    const a = { cx: 0, cy: 0, z: 0.5 };
    const b = { cx: 10, cy: -4, z: 2 };
    expect(camLerp(a, b, 0)).toEqual(a);
    const e = camLerp(a, b, 1);
    expect(e.cx).toBe(10);
    expect(e.z).toBeCloseTo(2, 9);
    expect(camLerp(a, b, 0.5).z).toBeCloseTo(1, 9);
  });
});

describe('建造卡和庆祝框的文字', () => {
  it('名额满了写清哪一级加名额，读内容表：金矿 1 级 1 座、2 级 2 座', () => {
    const lims = HQ_LEVELS.map((l) => l.limits.goldmine ?? 0);
    expect(nextSlotHq(lims, 1)).toBe(2);
    expect(fullText(1, 2)).toBe('名额满了，主寨 2 级加名额');
  });

  it('到顶了只写名额满了，没开放的写还不能建', () => {
    const lims = HQ_LEVELS.map((l) => l.limits.goldmine ?? 0);
    expect(nextSlotHq(lims, HQ_LEVELS.length)).toBeNull();
    expect(fullText(6, null)).toBe('名额满了');
    expect(fullText(0, 3)).toBe('现在还不能建');
  });

  it('主寨庆祝框：开放里有建筑就带去建造，只有兵种技能就收起', () => {
    expect(celebrateGo([{ type: 'troop' }, { type: 'building' }])).toBe('build');
    expect(celebrateGo([{ type: 'skill' }])).toBe('close');
    expect(celebrateGo([])).toBe('close');
  });
});

describe('新建筑的施工时间线', () => {
  for (const big of [false, true]) {
    it(`${big ? '大' : '小'}建筑：1.2–1.6 秒，升起在完工之前结束，锤子都在完工前`, () => {
      const p = buildPlan(big);
      expect(p.end).toBeGreaterThanOrEqual(1200);
      expect(p.end).toBeLessThanOrEqual(1600);
      expect(p.growAt + p.growDur).toBeLessThanOrEqual(p.morph);
      expect(p.hits.every((h) => h < p.morph)).toBe(true);
      expect(p.rise).toBeLessThanOrEqual(p.growAt);
    });
    it(`${big ? '大' : '小'}建筑：先搭架子本体不见，再从地面长出，完工后站稳，结束时 done`, () => {
      const p = buildPlan(big);
      const a = buildFrame(p, 0);
      expect(a.alpha).toBe(0);
      expect(buildFrame(p, p.growAt - 1).alpha).toBe(0);
      expect(buildFrame(p, p.rise).scaf).toBeGreaterThan(0.9);
      const mid = buildFrame(p, p.growAt + p.growDur * 0.3);
      expect(mid.alpha).toBeGreaterThan(0);
      expect(mid.sy).toBeLessThan(1.05);
      expect(buildFrame(p, p.morph - 1).sy).toBeGreaterThan(0.9);
      expect(buildFrame(p, p.morph + 10).alpha).toBe(1);
      expect(buildFrame(p, p.morph + 100).beamA).toBeGreaterThan(0);
      const end = buildFrame(p, p.end);
      expect(end.done).toBe(true);
      expect(end.sx).toBe(1);
      expect(end.sy).toBe(1);
      expect(end.alpha).toBe(1);
    });
  }
  it('大建筑比小建筑更长', () => {
    expect(buildPlan(true).end).toBeGreaterThan(buildPlan(false).end);
  });
  it('城墙短版 < 0.5 秒', () => {
    expect(WALL_RISE_MS).toBeLessThan(500);
  });
});
