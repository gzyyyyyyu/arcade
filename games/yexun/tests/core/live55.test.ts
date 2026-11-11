import { describe, expect, it } from 'vitest';
import { createWorld, fingerprint, RULES_VERSION, step, type World } from '../../src/core/index.ts';
import type { CharacterId } from '../../src/content/meta.ts';
import type { MapId } from '../../src/content/maps.ts';

/** 走 n 拍（左右来回走，血补满），返回世界 */
function run(map: MapId, character: CharacterId, rules: number | undefined, live: boolean, n = 6000): World {
  const w = createWorld({ seed: 23, mode: 'vigil', danger: 2, map, character, ...(live ? { live } : {}) }, rules);
  for (let t = 0; t < n; t++) {
    w.hp = w.stats.hpMax;
    step(w, t % 90 < 45 ? 1 : 17, 0);
  }
  return w;
}

describe('规则 55 的新内容实盘晚一版（0.20.0 只在娱乐，规则 56 起实盘也有）', () => {
  it('新内容闸 new55：娱乐 55 起开；实盘 56 起开（现行规则 56 起），规则 55 的实盘录像、规则 54 的录像都关', () => {
    expect(RULES_VERSION).toBeGreaterThanOrEqual(56);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2 }).new55).toBe(true);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }).new55).toBe(true);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }, 55).new55).toBe(false);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2 }, 54).new55).toBe(false);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }, 56).new55).toBe(true);
  });

  it('规则 55 的实盘录像和规则 54 逐位一样（河滩、荒庙、雪原，带镇魂铃的更夫、纸匠、阴阳先生）', () => {
    const cases: [MapId, CharacterId][] = [['riverbank', 'gengfu'], ['temple', 'zhijiang'], ['temple', 'yinyang'], ['snow', 'xiaodao']];
    for (const [map, c] of cases) {
      const now = run(map, c, 55, true);
      const old = run(map, c, 54, true);
      expect(fingerprint(now), `${map} ${c}`).toBe(fingerprint(old));
    }
  }, 120000);
});
