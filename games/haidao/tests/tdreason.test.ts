import { describe, expect, it } from 'vitest';
import { type BiteRec, type LossRec, type ReasonRes, KEY_MAX, LINE_MAX, escortMoment, escortReason, idleGoldText, lostAtText, newReasonLog, tdReason } from '../src/view/tdreason.ts';

const loss = (wave: number, kind: LossRec['kind'], lane: string, n: number): LossRec => ({ wave, kind, lane, n, tick: 0 });
const logOf = (losses: LossRec[], heroDown = 0) => ({ ...newReasonLog(), losses, heroDown });
const res = (lost: number, stars: number, goldEarned = 1000): ReasonRes => ({ lost, stars, goldEarned });
const cannons = [{ kind: 'cannon', branch: [] as string[] }];
const guns = [{ kind: 'gunTower', branch: [] as string[] }];
const withinLimits = (r: { line: string; key: string | null }): void => {
  expect(r.line.length).toBeLessThanOrEqual(LINE_MAX);
  if (r.key) expect(r.key.length).toBeLessThanOrEqual(KEY_MAX);
};

describe('tdReason', () => {
  it('三星一枚没丢：夸一句，没有危险时刻就是 null', () => {
    const r = tdReason(logOf([]), res(0, 3), { gold: 0, towers: guns, wave: 8 });
    expect(r.line).toBe('一枚没丢，守得很稳');
    expect(r.key).toBeNull();
    // 英雄倒下过，算最危险的一刻
    const h = tdReason(logOf([], 2), res(0, 3), { gold: 0, towers: guns, wave: 8 });
    expect(h.key).toContain('英雄倒下过 2 次');
    withinLimits(h);
  });

  it('某一路大量漏：点名那一波、那条路、那种敌人', () => {
    // 铁甲是重甲，炮弹克重甲，所以不算护甲不克，走「路」的判断
    const log = logOf([loss(5, 'ironclad', '北路', 2), loss(5, 'ironclad', '北路', 2), loss(5, 'ironclad', '北路', 2), loss(2, 'sailor', '西路', 1)]);
    const r = tdReason(log, res(7, 0), { gold: 0, towers: cannons, wave: 6 });
    expect(r.line).toBe('北路守不住，7 枚里 6 枚从这漏');
    expect(r.key).toBe('第 5 波：北路有 3 个铁甲冲过去，丢了 6 枚');
    withinLimits(r);
  });

  it('护甲不克：重甲的敌人只有枪塔', () => {
    const log = logOf([loss(4, 'ironclad', '南路', 3), loss(4, 'shield', '东路', 2)]);
    const r = tdReason(log, res(5, 1), { gold: 0, towers: guns, wave: 5 });
    expect(r.line).toBe('漏的多是重甲，没造克它的塔');
    withinLimits(r);
  });

  it('余金多：整局收入的 25% 以上才提示', () => {
    expect(idleGoldText(250, 1000)).toBe('还有 250 金没花');
    expect(idleGoldText(249, 1000)).toBeNull();
    const log = logOf([loss(3, 'sailor', '北路', 1), loss(3, 'sailor', '西路', 1), loss(4, 'sailor', '南路', 1)]);
    const r = tdReason(log, res(3, 1, 1000), { gold: 600, towers: cannons, wave: 5 });
    expect(r.idle).toBe('还有 600 金没花');
    expect(r.line).not.toContain('没花');
    withinLimits(r);
  });

  it('克它的塔这局造不了，就不拿护甲当原因', () => {
    // 第 1 关只有加农炮、火枪塔，布衣要火才克：这时该说哪条路漏了，而不是「没造克它的塔」
    const log = logOf([loss(2, 'sailor', '北路', 3), loss(3, 'sailor', '北路', 3)]);
    const r = tdReason(log, res(6, 0), { gold: 0, towers: cannons, wave: 3, unlocked: ['cannon', 'gunTower'] });
    expect(r.line).not.toContain('没造克它的塔');
    expect(r.line).toBe('北路守不住，6 枚全从这漏');
    // 能造喷火塔却没造：照样点出来
    const r2 = tdReason(log, res(6, 0), { gold: 0, towers: cannons, wave: 3, unlocked: ['cannon', 'gunTower', 'flame'] });
    expect(r2.line).toBe('漏的多是布衣，没造克它的塔');
  });

  it('海盗来袭和大潮：同样给原因和关键时刻', () => {
    const home = logOf([loss(7, 'sapper', '北路', 1), loss(8, 'sailor', '北路', 3), loss(8, 'sailor', '西路', 1)]);
    const r = tdReason(home, res(5, 0, 400), { gold: 0, towers: cannons, wave: 9 });
    expect(r.key).toBe('第 8 波：北路有 1 个水手冲过去，丢了 4 枚');
    expect(r.line.length).toBeGreaterThan(0);
    withinLimits(r);
    // 大潮：飞禽，场上只有炮塔
    const tide = logOf([loss(12, 'parrot', '', 4)]);
    const t = tdReason(tide, res(4, 0), { gold: 0, towers: cannons, wave: 12 });
    expect(t.line).toBe('漏的多是飞禽，没造克它的塔');
    expect(t.key).toBe('第 12 波：1 个鹦鹉群冲过去，丢了 4 枚');
    withinLimits(t);
  });

  it('文案：失守波数和护航', () => {
    expect(lostAtText(6)).toBe('打到第 6 波时失守');
    expect(escortReason({ arrived: false, sunk: true, hullPct: 0, stars: 0 }).line).toBe('船被海盗咬沉了');
    expect(escortReason({ arrived: true, sunk: false, hullPct: 60, stars: 2 }).line).toBe('到港了，船还剩 60% 血');
    expect(escortReason({ arrived: false, sunk: false, hullPct: 100, stars: 0, retreated: true }).line).toBe('中途撤退，商船没到港');
    expect(escortReason({ arrived: false, sunk: false, hullPct: 100, stars: 0 }).line).toBe('没赶在潮退前到港');
  });

  it('护航的关键时刻：船血掉得最多的那一波、咬得最狠的那种敌人有几个、掉了百分之几', () => {
    const b = (id: number, kind: BiteRec['kind'], wave: number, dmg: number): BiteRec => ({ id, kind, wave, lane: '', dmg });
    const bites = [b(1, 'sailor', 1, 30), b(2, 'sailor', 1, 30), b(3, 'ironclad', 3, 100), b(3, 'ironclad', 3, 100), b(4, 'ironclad', 3, 100), b(5, 'sailor', 3, 20)];
    expect(escortMoment(bites, 1200)).toBe('第 3 波：2 个铁甲咬住船，掉了 26% 血');
    expect(escortMoment(bites, 1200)!.length).toBeLessThanOrEqual(KEY_MAX);
    expect(escortMoment([], 1200)).toBeNull();
    expect(escortMoment([b(1, 'sailor', 1, 5)], 1200)).toBeNull(); // 不到 1% 不写
    expect(escortMoment([b(1, 'sailor', 1, 700), b(2, 'sailor', 1, 520)], 1200)).toBe('第 1 波：2 个水手咬住船，掉了 100% 血'); // 最后一口超出剩的血，不写 101%
    expect(escortReason({ arrived: false, sunk: true, hullPct: 0, stars: 0 }, bites, 1200).key).toBe('第 3 波：2 个铁甲咬住船，掉了 26% 血');
    expect(escortReason({ arrived: true, sunk: false, hullPct: 100, stars: 3 }, bites, 1200).key).toBeNull();
  });
});
