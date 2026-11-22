import { describe, expect, it } from 'vitest';
import { WEAPONS, baseNums, upChanges, type WeaponId } from '../../src/content/weapons.ts';

// 升级卡的数从规则表算（所有者 11-21：升级卡写具体改了什么、带数字）
describe('升级卡的数', () => {
  it('竹篙 1→2 级：一次戳几下 1→2', () => {
    expect(upChanges('pole', 1)).toEqual([{ key: 'amount', name: '一次戳几下', from: 1, to: 2, unit: '' }]);
  });
  it('冷却按秒写', () => {
    expect(upChanges('pole', 4)).toEqual([{ key: 'cd', name: '冷却', from: 1.8, to: 1.53, unit: '秒' }]);
  });
  it('每件法器每一级都列得出数，前后不同', () => {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      WEAPONS[id].ups.forEach((_, i) => {
        const ch = upChanges(id, i + 1);
        expect(ch.length).toBeGreaterThan(0);
        for (const c of ch) expect(c.from).not.toBe(c.to);
      });
      for (const n of baseNums(id)) expect(Number.isFinite(n.from)).toBe(true);
    }
  });
});
