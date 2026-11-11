import { describe, expect, it } from 'vitest';
import { RANKS } from '../src/content/rank.ts';
import { FLAG_SWEEP_FROM, FLAG_WAVE, rankColors, rankFlagFrames, rankHex } from '../src/view/art/rankflag.ts';
import { shipArt } from '../src/view/art/index.ts';
import { pctOf, rankTitle, rankView } from '../src/view/ranktext.ts';
import { newProfile } from '../src/core/index.ts';

describe('海盗王阶的界面文字和进度', () => {
  it('称号：0 阶和越界为空，其余带阶数和名字', () => {
    expect(rankTitle(0)).toBe('');
    expect(rankTitle(11)).toBe('');
    expect(rankTitle(3)).toBe(`海盗王阶 3 · ${RANKS[2]!.name}`);
    expect(rankTitle(10)).toBe(`海盗王阶 10 · ${RANKS[9]!.name}`);
  });

  it('献上多少：手里有的，不超过还差的；满阶没有下一阶', () => {
    const p = { ...newProfile(), res: { gold: 1000, wood: 99_999 }, rankFund: { gold: 10_000, wood: 0 } };
    const v = rankView(p);
    expect(v.rank).toBe(0);
    expect(v.next?.left).toEqual({ gold: 30_000, wood: 15_000 });
    expect(v.want).toEqual({ gold: 1000, wood: 15_000 });
    expect(rankView({ ...p, rank: 10 }).next).toBeNull();
  });

  it('进度条百分比取整、夹在 0..100', () => {
    expect(pctOf(0, 100)).toBe(0);
    expect(pctOf(999, 1000)).toBe(99);
    expect(pctOf(5, 0)).toBe(100);
    expect(pctOf(300, 100)).toBe(100);
  });
});

describe('王旗和船帆的素材', () => {
  it('每阶帧数、key 不重复；4 阶起多一组闪光帧', () => {
    for (let r = 1; r <= RANKS.length; r++) {
      const fr = rankFlagFrames(r);
      expect(fr.length).toBe(r >= FLAG_SWEEP_FROM ? FLAG_WAVE * 2 : FLAG_WAVE);
      expect(new Set(fr.map((p) => p.key)).size).toBe(fr.length);
      expect(fr.every((p) => p.key.startsWith('rk.flag.') && p.svg.includes(rankColors(r)!.color))).toBe(true);
    }
    expect(rankFlagFrames(0)).toEqual([]);
    expect(rankFlagFrames(11)).toEqual([]);
    expect(rankFlagFrames(5)).toBe(rankFlagFrames(5));
  });

  it('旗面用表里的主色；同一阶画两次逐位一样', () => {
    expect(rankColors(1)).toEqual({ color: rankHex(RANKS[0]!.color), trim: rankHex(RANKS[0]!.trim) });
    expect(rankFlagFrames(7)[0]!.svg).toBe(rankFlagFrames(7)[0]!.svg);
  });

  it('船：0 阶原样（key 不变），有王阶另存一张带阶数的', () => {
    expect(shipArt('raft').key).toBe('s.raft');
    expect(shipArt('flagship', 0).key).toBe('s.flagship');
    expect(shipArt('raft', 4).key).toBe('s.raft.r4');
    expect(shipArt('flagship', 4).svg).not.toBe(shipArt('flagship').svg);
    expect(shipArt('flagship', 4)).toBe(shipArt('flagship', 4));
  });
});
