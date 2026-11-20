import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESCORT_GOLDEN_FILE, escortJobs, runEscortJob } from './escort-golden-lib.ts';
import { createTd, escortSetup, stepTd, type TdSetup } from '../src/core/index.ts';
import { escortLiveSetup } from '../src/core/escortlive.ts';

const golden = JSON.parse(readFileSync(ESCORT_GOLDEN_FILE, 'utf8')) as Record<string, string>;
const jobs = escortJobs();

describe('护航指纹锁', () => {
  it('键的集合和录的一样', () => {
    expect(jobs.map((j) => j.key)).toEqual(Object.keys(golden));
  });
  it('每一局逐位不变', () => {
    for (const j of jobs) expect(runEscortJob(j), j.key).toBe(golden[j.key]);
  }, 300_000);
  it('规则 25 只改三张图的新手档：别的关和实盘 4 档 v25- 和 v24- 逐个相同', () => {
    const easy = /^v25-(strait|bays|cape)-easy-/;
    for (const k of Object.keys(golden)) {
      if (!k.startsWith('v25-')) continue;
      const old = golden[`v24-${k.slice(4)}`];
      if (easy.test(k)) expect(golden[k], k).not.toBe(old);
      else expect(golden[k], k).toBe(old);
    }
  });
  it('新手照顾只给娱乐护航：实盘的开局不带，规则 24 的旧局也不跟', () => {
    expect(escortLiveSetup('small', 1).escortAssist).toBeUndefined();
    expect(createTd(escortLiveSetup('lux', 1)).escort!.follow).toBe(false);
    expect(createTd(escortSetup('strait-easy', 1)).escort!.follow).toBe(true);
    expect(createTd({ ...escortSetup('strait-easy', 1), rules: 24 }).escort!.follow).toBe(false);
  });
  /** 一直不碰船速，打到第一波开打（倒数走完），返回那时的船速和有没有自动开船的事件 */
  const toWave1 = (setup: TdSetup, first: 'hold' | null = null) => {
    const s = createTd(setup);
    let auto = false;
    let t = 0;
    while (s.wave === 0) {
      const evs = stepTd(s, t === 0 && first ? [{ t: 0, type: 'pace', pace: first }] : []);
      auto ||= evs.some((e) => e.type === 'pace' && 'auto' in e && e.auto === true);
      t++;
    }
    return { pace: s.escort!.pace, auto };
  };
  it('娱乐护航：第一波开打时船还停着、玩家没碰过船速，就自己开始巡航', () => {
    expect(toWave1(escortSetup('cape-easy', 1))).toEqual({ pace: 'sail', auto: true });
    expect(toWave1(escortSetup('strait-hard', 2))).toEqual({ pace: 'sail', auto: true });
  });
  it('玩家先点了「停」就尊重他；实盘和规则 24 的旧局照旧停着', () => {
    expect(toWave1(escortSetup('cape-easy', 1), 'hold')).toEqual({ pace: 'hold', auto: false });
    expect(toWave1(escortLiveSetup('small', 1))).toEqual({ pace: 'hold', auto: false });
    expect(toWave1({ ...escortSetup('cape-easy', 1), rules: 24 })).toEqual({ pace: 'hold', auto: false });
  });
});
