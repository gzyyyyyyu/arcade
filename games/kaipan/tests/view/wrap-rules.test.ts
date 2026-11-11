import { describe, expect, it } from 'vitest';
import { avoidOrphan } from '../../src/view/ui/wrapRules.ts';

/** 段尾不留孤字（src/view/ui/wrapRules.ts）：事件弹窗里出现过「条街。」「变）」单独一行。 */
describe('段尾不留孤字', () => {
  it('最后一行只剩一两个字时从上一行挪几个字下来', () => {
    const [p, t] = avoidOrphan('楼下证券营业部门口排起长队：开户送鸡蛋，还送一份小礼包。队伍绕了半', '条街。');
    expect(p + t).toBe('楼下证券营业部门口排起长队：开户送鸡蛋，还送一份小礼包。队伍绕了半条街。');
    expect(Array.from(t).length).toBeGreaterThanOrEqual(4);
    expect(Array.from(p).length).toBeLessThan(Array.from('楼下证券营业部门口排起长队：开户送鸡蛋，还送一份小礼包。队伍绕了半').length);
  });

  it('挪完最后一行不以标点开头', () => {
    const [, t] = avoidOrphan('不领（鸡蛋不值几个钱，什么都不', '变）');
    expect('，。）'.includes(Array.from(t)[0] as string)).toBe(false);
  });

  it('最后一行够长、上一行太短、或者末尾是数字时不动', () => {
    expect(avoidOrphan('今天大环境不错，群里很热闹', '大家都在聊')).toEqual(['今天大环境不错，群里很热闹', '大家都在聊']);
    expect(avoidOrphan('短短一行', '字')).toEqual(['短短一行', '字']);
    expect(avoidOrphan('排队领：折价 +¥1000', '天')).toEqual(['排队领：折价 +¥1000', '天']);
  });
});
