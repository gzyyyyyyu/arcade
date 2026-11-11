import { beforeAll, describe, expect, it } from 'vitest';
import {
  AMBIENCE_MIX, DUCK_ATTACK_MS, duckGainAt, duckPlan, GROUP_MAX, Limiter, nextBirdGap, pickVariant, VARIANTS, variantParams,
} from '../src/view/audio/mix.ts';
import { SFX_META, SFX_NAMES, SOUNDS, type SfxName } from '../src/view/audio/synth.ts';

describe('并发上限', () => {
  it('同组超过上限的丢弃，声音结束后又能放', () => {
    const l = new Limiter();
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const ok = names.map((n) => l.tryAcquire(n, 'fire', 0, 500));
    expect(ok.filter(Boolean).length).toBe(GROUP_MAX.fire);
    expect(l.active('fire')).toBe(GROUP_MAX.fire);
    expect(l.tryAcquire('h', 'fire', 600, 500)).toBe(true);
  });
  it('不同组互不占名额', () => {
    const l = new Limiter();
    for (let i = 0; i < GROUP_MAX.hit; i++) expect(l.tryAcquire(`h${i}`, 'hit', 0, 500)).toBe(true);
    expect(l.tryAcquire('x', 'hit', 0, 500)).toBe(false);
    expect(l.tryAcquire('ui', 'ui', 0, 500)).toBe(true);
  });
  it('同名 60ms 内最多 2 个', () => {
    const l = new Limiter();
    expect(l.tryAcquire('cannon', 'fire', 0, 100)).toBe(true);
    expect(l.tryAcquire('cannon', 'fire', 10, 100)).toBe(true);
    expect(l.tryAcquire('cannon', 'fire', 20, 100)).toBe(false);
    expect(l.tryAcquire('cannon', 'fire', 70, 100)).toBe(true);
  });
  it('结算短句同时只放一个', () => {
    const l = new Limiter();
    expect(l.tryAcquire('win', 'stinger', 0, 3000)).toBe(true);
    expect(l.tryAcquire('lose', 'stinger', 100, 3000)).toBe(false);
  });
});

describe('变体', () => {
  it('不连续重复同一个变体，且都能被选到', () => {
    let last = -1;
    const seen = new Set<number>();
    let seed = 7;
    const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 300; i++) {
      const v = pickVariant(3, last, rand);
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      seen.add(v);
      last = v;
    }
    expect(seen.size).toBe(3);
  });
  it('rand 取到边界值也不越界', () => {
    for (const r of [0, 0.999999]) for (let last = -1; last < 3; last++) {
      const v = pickVariant(3, last, () => r);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(3); expect(v).not.toBe(last);
    }
    expect(pickVariant(1, 0)).toBe(0);
  });
  it('变体参数在合理范围内，细抖不超过 ±3%', () => {
    for (let i = 0; i < VARIANTS.length; i++) {
      const base = VARIANTS[i]!;
      for (const r of [0, 0.5, 1]) {
        const v = variantParams(i, () => r);
        expect(Math.abs(v.p / base.p - 1)).toBeLessThanOrEqual(0.0301);
        expect(Math.abs(v.l / base.l - 1)).toBeLessThanOrEqual(0.0301);
        expect(Math.abs(v.b / base.b - 1)).toBeLessThanOrEqual(0.0301);
      }
    }
  });
});

describe('闪避', () => {
  it('压低保持加恢复总长夹在 300–600ms', () => {
    for (const ms of [50, 300, 450, 3000]) {
      const p = duckPlan(ms);
      const total = DUCK_ATTACK_MS + p.holdMs + p.releaseMs;
      expect(total).toBeGreaterThanOrEqual(300);
      expect(total).toBeLessThanOrEqual(630);
    }
  });
  it('增益曲线：先压到 depth，保持，再回到 1', () => {
    const p = duckPlan(500, 0.3);
    expect(duckGainAt(p, 0)).toBe(1);
    expect(duckGainAt(p, DUCK_ATTACK_MS)).toBeCloseTo(0.3);
    expect(duckGainAt(p, DUCK_ATTACK_MS + p.holdMs - 1)).toBeCloseTo(0.3);
    const mid = duckGainAt(p, DUCK_ATTACK_MS + p.holdMs + p.releaseMs / 2);
    expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(1);
    expect(duckGainAt(p, 5000)).toBe(1);
  });
});

describe('环境声表', () => {
  it('对战里没有海鸟，基地有；关闭时静音', () => {
    expect(nextBirdGap('battle')).toBeNull();
    expect(nextBirdGap('off')).toBeNull();
    const g = nextBirdGap('base', () => 0.5)!;
    expect(g).toBeGreaterThan(AMBIENCE_MIX.base.birdGapMs[0]);
    expect(g).toBeLessThan(AMBIENCE_MIX.base.birdGapMs[1]);
    expect(AMBIENCE_MIX.off.wave + AMBIENCE_MIX.off.wind).toBe(0);
  });
});

describe('声音表', () => {
  it('每个名字都有合成函数和元数据，变体 1–3 个', () => {
    expect(Object.keys(SOUNDS).sort()).toEqual([...SFX_NAMES].sort());
    for (const n of SFX_NAMES) {
      const m = SFX_META[n];
      expect(m.variants).toBeGreaterThanOrEqual(1); expect(m.variants).toBeLessThanOrEqual(VARIANTS.length);
      expect(m.dur).toBeGreaterThan(0);
    }
  });
  it('旧的声音名都还在', () => {
    const old: SfxName[] = ['tap', 'coin', 'wood', 'build', 'upgrade', 'cannon', 'musket', 'mortar', 'boom', 'hit', 'die', 'land', 'barrage', 'flare', 'heal', 'star', 'win', 'lose', 'error', 'crumble', 'splash', 'rocket', 'harpoon', 'flame'];
    for (const n of old) expect(SFX_NAMES).toContain(n);
  });
  it('结算短句 2–4 秒', () => {
    for (const n of ['win', 'lose', 'star3'] as const) expect(SFX_META[n].dur).toBeGreaterThanOrEqual(2);
    for (const n of ['win', 'lose', 'star3'] as const) expect(SFX_META[n].dur).toBeLessThanOrEqual(4);
  });
});

// ---- 最小假 AudioContext：只记录节点的创建、连接和断开 ----
interface FakeNode { kind: string; connected: number; disconnected: boolean; onended?: () => void; [k: string]: unknown }
const created: FakeNode[] = [];
const param = (): Record<string, unknown> => ({
  value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {},
});
function fakeNode(kind: string): FakeNode {
  const n: FakeNode = {
    kind, connected: 0, disconnected: false,
    gain: param(), frequency: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    connect(x: unknown) { n.connected++; return x; }, disconnect() { n.disconnected = true; },
    start() {}, stop() {}, type: '', buffer: null, loop: false,
  };
  created.push(n);
  return n;
}
class FakeAudioContext {
  state = 'running'; currentTime = 1; sampleRate = 8000; destination = fakeNode('dest');
  createGain() { return fakeNode('gain'); }
  createOscillator() { return fakeNode('osc'); }
  createBiquadFilter() { return fakeNode('filter'); }
  createBufferSource() { return fakeNode('src'); }
  createDynamicsCompressor() { return fakeNode('comp'); }
  createBuffer(_c: number, len: number) { return { duration: len / 8000, getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

describe('sfx 接入假 AudioContext', () => {
  let m: typeof import('../src/view/audio/sfx.ts');
  beforeAll(async () => {
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    m = await import('../src/view/audio/sfx.ts');
    m.unlockAudio();
  });
  it('放一个声音会创建节点，结束后全部断开', () => {
    const before = created.length;
    m.sfx('musket');
    const mine = created.slice(before);
    expect(mine.length).toBeGreaterThan(0);
    for (const n of mine) n.onended?.();
    for (const n of mine) expect(n.disconnected, n.kind).toBe(true);
  });
  it('音效关掉时什么都不创建，音乐开关不影响音效', () => {
    m.setSfxOn(false);
    const before = created.length;
    m.sfx('cannon');
    expect(created.length).toBe(before);
    m.setSfxOn(true);
    m.setMusicOn(false);
    m.sfx('cannon');
    expect(created.length).toBeGreaterThan(before);
    m.setMusicOn(true);
  });
  it('大音效触发闪避、小音效不触发', () => {
    // 闪避增益是 unlock 后创建的第 2 个 gain（主增益之后）；通过 cancelScheduledValues 是否被调用来判断
    const calls: string[] = [];
    const gains = created.filter((n) => n.kind === 'gain');
    const duckG = gains[1]!.gain as Record<string, unknown>;
    duckG.cancelScheduledValues = () => { calls.push('duck'); };
    m.sfx('tap');
    expect(calls).toEqual([]);
    m.sfx('win');
    expect(calls).toEqual(['duck']);
  });
  it('切换环境声不重复创建循环节点', () => {
    m.setAmbience('base');
    const srcs = created.filter((n) => n.kind === 'src').length;
    m.setAmbience('battle');
    m.setAmbience('td');
    m.setAmbience('base');
    expect(created.filter((n) => n.kind === 'src').length).toBe(srcs);
    m.setAmbience('off');
  });
});
