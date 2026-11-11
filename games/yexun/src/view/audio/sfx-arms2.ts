// 2.0 第二批法器的音色：铜钱镖、算盘、招魂幡、判官笔、鞭炮，进化加强版，聚财 / 幽冥套件和五个专属搭配的短声。
// 写法和 sfx-arms.ts 一样（tone / noise / metal / pent 合成，不带音频文件），加载时登记进 sfx.ts 的音色表。
// 镖、冤魂、爆竹是常驻连发的：每个音色自带最小间隔（GAP），同一批事件不会连响。
import { metal, noise, pent, registerVoices, tone, type Voice } from './sfx.ts';

export type Arm2SfxName =
  | 'armDart' | 'armDartHit' | 'armAbacus' | 'armAbacusTick' | 'armBanner' | 'armGhost' | 'armBrush' | 'armBrushEvo' | 'armCracker' | 'armCrackerEvo'
  | 'armRain' | 'armChai' | 'armYinlv' | 'armMaibu' | 'armYinbing' | 'armBaozhu' | 'armCaiyuan';

const GAP: Record<Arm2SfxName, number> = {
  armDart: 160, armDartHit: 70, armAbacus: 200, armAbacusTick: 120, armBanner: 400, armGhost: 140, armBrush: 90, armBrushEvo: 400, armCracker: 70, armCrackerEvo: 300,
  armRain: 500, armChai: 400, armYinlv: 200, armMaibu: 140, armYinbing: 250, armBaozhu: 400, armCaiyuan: 200,
};

const last = new Map<Arm2SfxName, number>();
function gated(name: Arm2SfxName, v: Voice): Voice {
  return (t) => {
    const now = performance.now();
    if (now - (last.get(name) ?? -1e9) < GAP[name]) return;
    last.set(name, now);
    v(t);
  };
}

/** 一串木珠的噼啪：短促的木质敲击，音高随机地错开 */
function beads(t: number, n: number, v: number): void {
  for (let i = 0; i < n; i++) {
    const d = i * 0.035 + (i % 3) * 0.006;
    tone(780 + (i % 4) * 130, t + d, 0.05, { type: 'triangle', f1: 520, vol: v, attack: 0.001 });
    noise(t + d, 0.03, { type: 'highpass', f0: 2600, vol: v * 0.6, attack: 0.001 });
  }
}

/** 爆竹响：一记短促的爆裂（噪声尖峰）+ 低一点的闷响 */
function crack(t: number, v: number, pitch = 1): void {
  noise(t, 0.05, { type: 'highpass', f0: 1800 * pitch, f1: 6000, vol: v, attack: 0.001 });
  tone(180 * pitch, t, 0.07, { f1: 70, vol: v * 0.9, attack: 0.001 });
}

const VOICES: Record<Arm2SfxName, Voice> = {
  armDart: (t) => { // 铜钱出手：清脆的"叮" + 旋转的嗡
    metal(2300, t, 0.35, [1, 2.7, 4.3], 0.1);
    noise(t, 0.18, { f0: 1500, f1: 3400, q: 3, vol: 0.07, attack: 0.02 });
    tone(880, t, 0.22, { f1: 1320, vol: 0.05, vib: [22, 30] });
  },
  armDartHit: (t) => { // 弹到怪身上：更短的叮
    metal(2900, t, 0.16, [1, 2.4], 0.1);
    tone(1500, t, 0.05, { vol: 0.06, attack: 0.001 });
  },
  armAbacus: (t) => { // 结算：一串珠子噼啪滚落 + 最后"啪"一声拨回
    beads(t, 9, 0.1);
    noise(t + 0.34, 0.06, { type: 'lowpass', f0: 1400, f1: 500, vol: 0.2 });
    tone(220, t + 0.34, 0.1, { f1: 110, vol: 0.2 });
  },
  armAbacusTick: (t) => { // 记一层：单颗木珠
    tone(900, t, 0.04, { type: 'triangle', f1: 600, vol: 0.07, attack: 0.001 });
  },
  armBanner: (t) => { // 立幡：布抖开 + 幽幽低吟（两个略失谐的低音）
    noise(t, 0.2, { f0: 700, f1: 300, q: 1.2, vol: 0.12, attack: 0.04 });
    tone(147, t + 0.02, 1.1, { type: 'triangle', vol: 0.12, vib: [4, 14], attack: 0.15 });
    tone(152, t + 0.02, 1.1, { type: 'triangle', vol: 0.08, vib: [5, 18], attack: 0.15 });
    tone(pent(-3, 523), t + 0.3, 0.8, { vol: 0.04, vib: [6, 20], attack: 0.1 });
  },
  armGhost: (t) => { // 冤魂出现：由低往上一声"呜"
    tone(300, t, 0.4, { f1: 520, vol: 0.07, vib: [8, 30], attack: 0.06 });
    noise(t, 0.3, { f0: 1100, f1: 2200, q: 4, vol: 0.05, attack: 0.08 });
  },
  armBrush: (t) => { // 落笔：湿墨的闷"噗" + 笔锋划过的沙沙
    noise(t, 0.09, { type: 'lowpass', f0: 900, f1: 260, vol: 0.28, attack: 0.002 });
    tone(110, t, 0.12, { f1: 70, vol: 0.28 });
    noise(t + 0.02, 0.14, { f0: 2400, f1: 900, q: 2, vol: 0.08, attack: 0.02 });
  },
  armBrushEvo: (t) => { // 生死簿勾销：重笔 + 一声低沉的钟
    metal(196, t, 0.9, [1, 2.2, 3.7], 0.14);
    noise(t, 0.12, { type: 'lowpass', f0: 700, f1: 200, vol: 0.3 });
    tone(80, t, 0.3, { f1: 45, vol: 0.4 });
  },
  armCracker: (t) => { // 一串爆竹：噼噼啪啪
    for (let i = 0; i < 5; i++) crack(t + i * 0.045 + (i % 2) * 0.012, 0.16 - i * 0.015, 0.9 + (i % 3) * 0.2);
  },
  armCrackerEvo: (t) => { // 十响连环：更密更响，尾巴一个闷大炮
    for (let i = 0; i < 8; i++) crack(t + i * 0.035, 0.18, 0.8 + (i % 3) * 0.25);
    tone(95, t + 0.3, 0.25, { f1: 45, vol: 0.45 });
    noise(t + 0.3, 0.12, { type: 'lowpass', f0: 800, f1: 150, vol: 0.35 });
  },
  armRain: (t) => { // 铜钱雨：一阵铜钱落地的叮叮当当
    for (let i = 0; i < 10; i++) metal(1800 + ((i * 7) % 5) * 260, t + i * 0.05, 0.25, [1, 2.5], 0.06);
  },
  armChai: (t) => { // 鬼差出场：低沉的锣 + 锁链
    metal(110, t, 1.2, [1, 2.3, 3.9], 0.2);
    for (let i = 0; i < 3; i++) noise(t + 0.1 + i * 0.05, 0.05, { type: 'highpass', f0: 3600, vol: 0.1 });
  },
  armYinlv: (t) => { // 阴律斩：剑啸 + 笔的闷响
    noise(t, 0.12, { f0: 800, f1: 4000, q: 2.5, vol: 0.14, attack: 0.02 });
    tone(110, t + 0.08, 0.14, { f1: 70, vol: 0.28 });
  },
  armMaibu: (t) => { // 买路符钱：纸符"嗤" + 铜钱叮当
    noise(t, 0.1, { type: 'highpass', f0: 3000, vol: 0.08 });
    [0, 1, 2].forEach((i) => metal(2400 + i * 330, t + 0.06 + i * 0.05, 0.28, [1, 2.6], 0.08));
  },
  armYinbing: (t) => { // 阴兵借道：纸响 + 魂吟
    noise(t, 0.1, { f0: 2500, f1: 1200, q: 2, vol: 0.1 });
    tone(260, t + 0.05, 0.5, { f1: 420, vol: 0.06, vib: [7, 26], attack: 0.05 });
  },
  armBaozhu: (t) => { // 爆竹驱年：锣一声，随后一大串爆竹
    metal(260, t, 0.8, [1, 2.4, 4], 0.16);
    for (let i = 0; i < 9; i++) crack(t + 0.12 + i * 0.04, 0.16, 0.8 + (i % 4) * 0.2);
  },
  armCaiyuan: (t) => { // 财源滚滚：算盘一拨 + 一枚钱飞出
    beads(t, 4, 0.08);
    metal(2600, t + 0.15, 0.3, [1, 2.7], 0.1);
  },
};

registerVoices(Object.fromEntries(Object.entries(VOICES).map(([k, v]) => [k, gated(k as Arm2SfxName, v)])) as Record<Arm2SfxName, Voice>);
