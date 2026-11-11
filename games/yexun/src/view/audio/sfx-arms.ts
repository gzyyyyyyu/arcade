// 2.0 第一批法器的音色：阵旗、勾魂锁、竹篙、长明灯，进化版的加强变体，十个搭配的短声。
// 配方写法和 sfx.ts 一样（tone / noise / metal / pent 合成，不带音频文件）；加载时登记进 sfx.ts 的音色表。
// 阵旗、长明灯是常驻的，一拍里可能来好几条：每个音色自己带最小间隔（GAP），同一事件不会连响。
import { metal, noise, pent, registerVoices, tone, type Voice } from './sfx.ts';

export type ArmSfxName =
  | 'armFlag' | 'armChain' | 'armPole' | 'armLamp'
  | 'armZone4' | 'armFreeze' | 'armChainEvo' | 'armPoleEvo' | 'armLampBig'
  | 'armLeijie' | 'armHejin' | 'armQiankun' | 'armQianjian' | 'armHeling'
  | 'armYiwei' | 'armChenzhong' | 'armHuadeng' | 'armDudeng' | 'armLiangyi';

/** 各音色两次发声之间至少隔多少毫秒 */
const GAP: Record<ArmSfxName, number> = {
  armFlag: 250, armChain: 160, armPole: 120, armLamp: 700,
  armZone4: 400, armFreeze: 140, armChainEvo: 200, armPoleEvo: 160, armLampBig: 700,
  armLeijie: 200, armHejin: 200, armQiankun: 300, armQianjian: 150, armHeling: 250,
  armYiwei: 400, armChenzhong: 300, armHuadeng: 400, armDudeng: 300, armLiangyi: 300,
};

const last = new Map<ArmSfxName, number>();
function gated(name: ArmSfxName, v: Voice): Voice {
  return (t) => {
    const now = performance.now();
    if (now - (last.get(name) ?? -1e9) < GAP[name]) return;
    last.set(name, now);
    v(t);
  };
}

/** 水声：噪声扫频（拨水）+ 一点气泡 */
function splash(t: number, big: number): void {
  noise(t, 0.2 + 0.1 * big, { f0: 500, f1: 2600, q: 1.6, vol: 0.2 + 0.08 * big, attack: 0.02 });
  noise(t + 0.05, 0.16, { type: 'highpass', f0: 3200, f1: 6000, vol: 0.08 + 0.05 * big, attack: 0.01 });
  for (let i = 0; i < 2 + big * 2; i++) tone(500 + i * 170, t + 0.04 + i * 0.045, 0.07, { f1: 900 + i * 220, vol: 0.05, attack: 0.005 });
}

/** 一串金属链环声：噪声 + 高频金属，快速衰减 */
function rattle(t: number, n: number, v: number): void {
  for (let i = 0; i < n; i++) {
    const d = i * 0.042 + (i % 2) * 0.008;
    noise(t + d, 0.05, { type: 'highpass', f0: 3800 + (i % 3) * 600, vol: v * (1 - i * 0.07), attack: 0.002 });
    tone(2100 + (i % 3) * 430, t + d, 0.09, { vol: v * 0.35, attack: 0.002 });
    tone(3300 + (i % 2) * 520, t + d, 0.05, { vol: v * 0.2, attack: 0.002 });
  }
}

const VOICES: Record<ArmSfxName, Voice> = {
  // 法器出手 ----
  armFlag: (t) => { // 布旗抖开 + 旗杆插地的闷响 + 低频嗡
    noise(t, 0.14, { f0: 900, f1: 400, q: 1.2, vol: 0.12, attack: 0.03 });
    tone(130, t + 0.1, 0.18, { f1: 55, vol: 0.4 });
    noise(t + 0.1, 0.07, { type: 'lowpass', f0: 700, f1: 200, vol: 0.28 });
    tone(110, t + 0.12, 0.7, { type: 'triangle', vol: 0.1, vib: [5, 10], attack: 0.08 });
  },
  armChain: (t) => { // 铁链哗啦
    rattle(t, 7, 0.14);
    tone(160, t, 0.12, { type: 'triangle', f1: 110, vol: 0.12 });
  },
  armPole: (t) => { // 拨水 + 竹节叩声
    splash(t, 0);
    tone(620, t + 0.03, 0.09, { type: 'triangle', f1: 480, vol: 0.2, attack: 0.002 });
    tone(1240, t + 0.03, 0.05, { vol: 0.07, attack: 0.002 });
  },
  armLamp: (t) => { // 灯芯暖嗡：低频正弦 + 轻颤音
    tone(196, t, 0.9, { vol: 0.14, vib: [5.5, 12], attack: 0.12 });
    tone(294, t + 0.02, 0.8, { vol: 0.07, vib: [6, 10], attack: 0.14 });
    noise(t, 0.3, { type: 'lowpass', f0: 600, f1: 300, vol: 0.05, attack: 0.1 });
  },
  // 进化版的加强变体 ----
  armZone4: (t) => { // 四象大阵：四声插地依次落，上面一声钟
    [0, 0.09, 0.18, 0.27].forEach((d, i) => {
      tone(150 - i * 12, t + d, 0.16, { f1: 60, vol: 0.34 });
      noise(t + d, 0.06, { type: 'lowpass', f0: 800, f1: 220, vol: 0.2 });
    });
    metal(330, t + 0.3, 1.0, [1, 2.4, 4.1], 0.12);
    tone(98, t + 0.3, 1.0, { vol: 0.14, vib: [4.5, 8], attack: 0.1 });
  },
  armFreeze: (t) => { // 阵里定住：轻轻一声叮
    tone(1976, t, 0.28, { vol: 0.07, attack: 0.002 });
    tone(2960, t, 0.16, { vol: 0.03, attack: 0.002 });
  },
  armChainEvo: (t) => { // 勾魂索命：更重更长的链声 + 低沉的勾
    rattle(t, 11, 0.16);
    tone(110, t + 0.05, 0.3, { type: 'sawtooth', f1: 55, vol: 0.16 });
    metal(520, t + 0.28, 0.5, [1, 2.76, 5.4], 0.07);
  },
  armPoleEvo: (t) => { // 撑船破浪：水声更大
    splash(t, 1);
    noise(t + 0.08, 0.35, { type: 'lowpass', f0: 1800, f1: 300, vol: 0.2, attack: 0.04 });
    tone(520, t + 0.03, 0.1, { type: 'triangle', f1: 400, vol: 0.22, attack: 0.002 });
  },
  armLampBig: (t) => { // 万家灯火：嗡声厚一层，上面一串暖的高音
    tone(147, t, 1.2, { vol: 0.14, vib: [5, 12], attack: 0.15 });
    tone(220, t, 1.1, { vol: 0.1, vib: [5.5, 12], attack: 0.15 });
    tone(330, t + 0.02, 1.0, { vol: 0.07, vib: [6, 10], attack: 0.16 });
    [4, 6, 7, 9].forEach((d, i) => tone(pent(d, 440), t + 0.15 + i * 0.1, 0.5, { vol: 0.05, attack: 0.01 }));
  },
  // 搭配 ----
  armLeijie: (t) => { // 雷劫锁魂：劈啪 + 雷
    noise(t, 0.05, { type: 'highpass', f0: 4500, vol: 0.2 });
    noise(t + 0.03, 0.04, { type: 'highpass', f0: 5500, vol: 0.14 });
    rattle(t + 0.01, 3, 0.09);
    tone(100, t + 0.05, 0.4, { f1: 36, vol: 0.4 });
    noise(t + 0.05, 0.4, { type: 'lowpass', f0: 2200, f1: 220, vol: 0.28 });
  },
  armHejin: (t) => { // 鹤翼金身：清亮铃 + 翅响
    metal(1318, t, 0.6, [1, 2.76, 5.4], 0.07);
    noise(t + 0.05, 0.05, { f0: 3400, q: 2, vol: 0.09 });
    noise(t + 0.11, 0.05, { f0: 3000, q: 2, vol: 0.07 });
  },
  armQiankun: (t) => { // 乾坤护阵：钟鸣 + 光波扫开
    metal(247, t, 1.5, [1, 2.4, 4.1, 6.3], 0.2);
    noise(t, 0.5, { f0: 400, f1: 5200, q: 1.1, vol: 0.14, attack: 0.2 });
    tone(pent(7, 392), t + 0.05, 0.8, { vol: 0.06, vib: [6, 10] });
  },
  armQianjian: (t) => { // 钱剑连城：一串铜钱叮
    [0, 1, 2, 3, 4].forEach((i) => {
      const f = 3000 + (i % 3) * 420;
      tone(f, t + i * 0.045, 0.2, { vol: 0.09 });
      tone(f * 1.51, t + i * 0.045, 0.1, { vol: 0.04 });
    });
    tone(900, t, 0.1, { type: 'triangle', f1: 2200, vol: 0.06 });
  },
  armHeling: (t) => { // 引魂鹤铃：铃响，翅扑
    metal(880, t, 1.0, [1, 2.76, 5.4], 0.14);
    noise(t + 0.18, 0.05, { f0: 3400, q: 2, vol: 0.09 });
    noise(t + 0.25, 0.05, { f0: 3000, q: 2, vol: 0.07 });
  },
  armYiwei: (t) => { // 一苇渡江：水声滑过
    noise(t, 0.4, { f0: 400, f1: 2400, q: 1.2, vol: 0.16, attack: 0.1 });
    tone(330, t, 0.35, { f1: 660, vol: 0.06, attack: 0.05 });
  },
  armChenzhong: (t) => { // 晨钟暮鼓：钟 + 鼓
    metal(330, t, 1.2, [1, 2.4, 4.1], 0.16);
    tone(95, t + 0.2, 0.22, { f1: 52, vol: 0.4 });
    noise(t + 0.2, 0.06, { type: 'lowpass', f0: 600, f1: 200, vol: 0.22 });
  },
  armHuadeng: (t) => { // 花灯会：柔和风铃
    [9, 11, 12, 14, 16].forEach((d, i) => tone(pent(d - 5, 523), t + i * 0.08, 0.45, { vol: 0.055, attack: 0.008 }));
  },
  armDudeng: (t) => { // 渡魂灯：灯火噗
    noise(t, 0.12, { type: 'lowpass', f0: 900, f1: 260, vol: 0.2, attack: 0.01 });
    tone(260, t, 0.2, { f1: 140, vol: 0.16 });
    tone(880, t + 0.04, 0.3, { vol: 0.05, vib: [6, 14] });
  },
  armLiangyi: (t) => { // 两仪阵：阴阳两音，一高一低
    tone(784, t, 0.7, { vol: 0.1, vib: [5, 8], attack: 0.02 });
    tone(196, t + 0.12, 0.8, { type: 'triangle', vol: 0.18, attack: 0.03 });
    tone(392, t + 0.12, 0.6, { vol: 0.05, attack: 0.03 });
  },
};

registerVoices(Object.fromEntries(Object.entries(VOICES).map(([k, v]) => [k, gated(k as ArmSfxName, v)])) as Record<ArmSfxName, Voice>);
