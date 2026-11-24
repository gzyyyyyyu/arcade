import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRun, dispatch, replay, validate, type Action, type GameState, type Segment } from '../../src/core/index.ts';

/** 自选：加星 / 取消只记标记，不影响任何规则，可以回放。 */
const index = JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')) as { segments: { file: string }[] };
const seg = JSON.parse(readFileSync(`public/data/segments/${index.segments[3]?.file}`, 'utf8')) as Segment;

function strip(s: GameState): unknown {
  const { stars: _stars, actions: _actions, ...rest } = s;
  return rest;
}

describe('自选', () => {
  it('加星、再点取消；不存在的股票不行', () => {
    const s0 = createRun('star-1', null, { segment: seg, ext: true }).state;
    const id = Object.keys(s0.stocks)[0]!;
    expect(validate(s0, { type: 'star', stockId: 'nope' })).toBe('没有这只股票');
    const s1 = dispatch(s0, { type: 'star', stockId: id });
    expect(s1.error).toBeNull();
    expect(s1.events).toEqual([]);
    expect(s1.state.stars).toEqual([id]);
    expect(dispatch(s1.state, { type: 'star', stockId: id }).state.stars).toEqual([]);
  });

  it('加了星和没加星，开盘以后的局面完全一样；带星的操作记录能回放', () => {
    const s0 = createRun('star-2', null, { segment: seg, ext: true }).state;
    const id = Object.keys(s0.stocks)[2]!;
    const plain: Action[] = [{ type: 'buy', rec: 0 }, { type: 'open' }, { type: 'open' }];
    const starred: Action[] = [{ type: 'star', stockId: id }, { type: 'buy', rec: 0 }, { type: 'open' }, { type: 'star', stockId: Object.keys(s0.stocks)[3]! }, { type: 'open' }];
    const a = replay('star-2', plain, null, { segment: seg, ext: true });
    const b = replay('star-2', starred, null, { segment: seg, ext: true });
    expect(strip(b)).toEqual(strip(a));
    expect(b.stars).toHaveLength(2);
  });
});
