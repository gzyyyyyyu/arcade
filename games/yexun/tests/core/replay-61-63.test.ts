// 规则 60–63 的内容先只在娱乐局，规则 64（RULES_63_LIVE）起进实盘：之前录的局在新代码里回放要逐位一致。
// 夹具是用规则 61、62、63 那时的代码各录的两局（剑侠、剑修心法，机器人打 9 分钟）：一局娱乐、一局实盘中档雪原。
// 实盘那几局当时没有选卡新规、角色钩子、换池和新搭配、两段式合成，新代码靠 World.contentFrom 的同一道闸照旧放
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fingerprint } from '../../src/core/index.ts';
import { ReplayPlayer } from '../../src/replay/player.ts';
import type { ReplayRecord } from '../../src/replay/format.ts';

const items = JSON.parse(readFileSync(new URL('../fixtures/replay-rules61-63.json', import.meta.url), 'utf8')) as { rec: ReplayRecord; fp: number; kills: number; level: number }[];

describe('规则 61–63 的旧录像', () => {
  it('规则 61、62、63 各一局娱乐、一局实盘，在现行代码里回放逐位一致', () => {
    expect(items.map((x) => `${x.rec.rules}${x.rec.setup.live ? '实盘' : '娱乐'}`)).toEqual(['61娱乐', '61实盘', '62娱乐', '62实盘', '63娱乐', '63实盘']);
    for (const it of items) {
      const p = ReplayPlayer.from(it.rec)!;
      expect(p.outdated).toBe(true);
      while (!p.done) p.tickOnce();
      const tag = `${it.rec.rules} ${it.rec.setup.live ? '实盘' : '娱乐'}`;
      expect(fingerprint(p.world), tag).toBe(it.fp);
      expect(p.exact, tag).toBe(true);
      expect(p.world.kills, tag).toBe(it.kills);
      expect(p.world.level, tag).toBe(it.level);
      // 当时的实盘局：60–63 的内容都关着
      if (it.rec.setup.live) expect([p.world.newPicks, p.world.skillHooks, p.world.armsCombos, p.world.mergeStages], tag).toEqual([false, false, false, false]);
    }
  }, 120_000);
});
