import { describe, expect, it } from 'vitest';
import { FAN_EXAMPLE, PAGES } from '../src/view/variants/sichuan-xuezhan/guide.ts';

/** 川麻要缺一门：三门齐是花猪不能胡，新手说明和番型牌例都只许两门（0.47.1 Gemini 审查：示范牌教错规则） */
const suits = (groups: number[][]): number => new Set(groups.flat().map((t) => Math.floor(t / 9))).size;

describe('川麻牌例缺一门', () => {
  it('新手说明「怎么胡」', () => {
    const how = PAGES.find(([title]) => title === '怎么胡');
    expect(how).toBeDefined();
    expect(suits(how![2])).toBeLessThanOrEqual(2);
  });
  it('番型牌例', () => {
    for (const [id, g] of Object.entries(FAN_EXAMPLE)) expect(suits(g!), id).toBeLessThanOrEqual(2);
  });
});
