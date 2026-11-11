// 《夜巡》首领、特色怪和夜探的音效：同样全部现场合成。
// 发声原语来自 sfx.ts；这里只描述音色，由 sfx.ts 末尾调用 installFoeSfx() 注册进音色表。
// 每个音各有辨识度：首领按「出场低沉有分量、倒下带解脱感」，技能按各自的材质（竹、水、冰、金、香火）。
import { metal, noise, pent, registerVoices, tone } from './sfx.ts';

export const FOE_SFX_NAMES = [
  'zhumuArrive', 'zhumuDown', 'shuihouArrive', 'shuihouDown',
  'binghunArrive', 'binghunDown', 'wumianArrive', 'wumianDown',
  'bambooPop', 'bambooWave', 'spiritSummon',
  'monkeyDive', 'monkeyPounce', 'waterWhip', 'waterDrag',
  'iceWind', 'iceSpike', 'iceCrack',
  'goldChime', 'wumianCharge', 'wumianStun', 'censerOut', 'rageRoar',
  'snowChildDash', 'snowChildReveal', 'coffinOpen', 'nailShot', 'coffinSmash',
  'stageGong', 'troupeAppear', 'sleeveSweep', 'faceChange', 'hongyiArrive', 'hongyiDown',
  'ratSkitter', 'ratBurrow', 'ricePile', 'shuoshuArrive', 'shuoshuDown',
] as const;

export type FoeSfxName = (typeof FOE_SFX_NAMES)[number];

type Voice = (t: number) => void;

/** 水泡：短促上扬的正弦，咕噜感。 */
function bubble(t: number, f: number, v = 0.1): void {
  tone(f, t, 0.09, { f1: f * 1.8, vol: v, attack: 0.008 });
}

/** 木头咔嚓：短带通噪声加低三角。 */
function crack(t: number, f: number, v = 0.25): void {
  noise(t, 0.07, { f0: f, q: 2.5, vol: v });
  tone(f / 8, t, 0.1, { type: 'triangle', f1: f / 14, vol: v * 0.7 });
}

function build(): Record<FoeSfxName, Voice> {
  return {
    // ---- 首领出场 / 倒下 ----
    zhumuArrive: (t) => { // 竹子吱呀 + 裂开 + 竹管空洞回响
      tone(120, t, 0.9, { type: 'sawtooth', f1: 210, vol: 0.1, vib: [11, 45], attack: 0.15 });
      noise(t, 0.9, { f0: 500, f1: 1300, q: 5, vol: 0.1, attack: 0.2 });
      crack(t + 0.5, 1500, 0.28);
      tone(196, t + 0.55, 1.2, { vol: 0.14, vib: [4, 8], attack: 0.05 });
      tone(392, t + 0.55, 0.9, { type: 'triangle', vol: 0.05 });
      tone(55, t, 0.7, { f1: 40, vol: 0.4 });
    },
    zhumuDown: (t) => { // 一串竹节爆开，空管回响渐落
      [0, 0.09, 0.2, 0.34].forEach((d, i) => crack(t + d, 1900 - i * 300, 0.24));
      noise(t, 0.6, { type: 'lowpass', f0: 1500, f1: 200, vol: 0.2 });
      [7, 4, 2, 0].forEach((d, i) => tone(pent(d, 330), t + 0.4 + i * 0.16, 0.7, { vol: 0.1, vib: [4, 8], attack: 0.03 }));
    },
    shuihouArrive: (t) => { // 咕噜水声 + 猴子尖啸
      [0, 0.1, 0.17, 0.29, 0.38].forEach((d, i) => bubble(t + d, 130 + i * 25, 0.12));
      noise(t, 0.8, { type: 'lowpass', f0: 600, f1: 250, q: 1, vol: 0.2, attack: 0.2 });
      tone(900, t + 0.45, 0.5, { type: 'sawtooth', f1: 2000, vol: 0.12, vib: [18, 90], attack: 0.04 });
      tone(1350, t + 0.45, 0.4, { type: 'square', f1: 2600, vol: 0.04, vib: [18, 90] });
      tone(60, t + 0.45, 0.6, { f1: 38, vol: 0.4 });
    },
    shuihouDown: (t) => { // 长长的悲啸下滑，水声退去
      tone(1800, t, 0.8, { type: 'sawtooth', f1: 420, vol: 0.12, vib: [14, 70], attack: 0.03 });
      noise(t + 0.2, 1.0, { type: 'lowpass', f0: 1200, f1: 150, q: 1, vol: 0.22, attack: 0.1 });
      [0.5, 0.65, 0.85, 1.1].forEach((d, i) => bubble(t + d, 420 - i * 70, 0.09));
    },
    binghunArrive: (t) => { // 冰晶清脆 + 低风
      noise(t, 1.2, { type: 'lowpass', f0: 200, f1: 900, q: 1.5, vol: 0.28, attack: 0.5 });
      [0, 1, 3, 4].forEach((d, i) => metal(pent(d + 10, 523), t + 0.1 + i * 0.11, 0.9, [1, 2.76, 4.2], 0.06));
      noise(t + 0.4, 0.5, { type: 'highpass', f0: 5000, vol: 0.08, attack: 0.1 });
      tone(65, t, 0.9, { f1: 42, vol: 0.38 });
    },
    binghunDown: (t) => { // 琉璃碎成一地，风声散去
      noise(t, 0.35, { type: 'highpass', f0: 3500, f1: 8000, vol: 0.25 });
      for (let i = 0; i < 7; i++) {
        tone(2500 + ((i * 937) % 2600), t + 0.03 + i * 0.05, 0.25, { vol: 0.07 });
      }
      noise(t, 1.4, { type: 'lowpass', f0: 1200, f1: 150, q: 1, vol: 0.2, attack: 0.1 });
      tone(pent(5, 523), t + 0.5, 1.2, { vol: 0.09, vib: [5, 9], attack: 0.1 });
    },
    wumianArrive: (t) => { // 梵钟 + 颂钵嗡鸣，两下低沉
      metal(73, t, 3.2, [1, 2.0, 2.76, 4.1], 0.4);
      tone(36, t, 0.8, { f1: 30, vol: 0.5 });
      tone(220, t + 0.6, 2.4, { vol: 0.14, vib: [3.5, 12], attack: 0.3 });
      tone(330.5, t + 0.6, 2.4, { vol: 0.1, vib: [4, 12], attack: 0.3 });
      noise(t, 0.2, { type: 'lowpass', f0: 1500, vol: 0.15 });
    },
    wumianDown: (t) => { // 钟声渐远，颂钵一声长鸣后归静
      metal(110, t, 3.0, [1, 2.0, 2.76, 5.4], 0.26);
      tone(293, t + 0.2, 3.0, { vol: 0.1, vib: [3, 10], attack: 0.5 });
      tone(440, t + 0.6, 2.2, { vol: 0.05, vib: [3.5, 10], attack: 0.6 });
      noise(t, 1.5, { type: 'highpass', f0: 5500, vol: 0.04, attack: 0.5 });
    },

    // ---- 首领技能 ----
    bambooPop: (t) => { // 笋尖破土：泥土闷一下 + 竹节脆响
      noise(t, 0.05, { type: 'lowpass', f0: 700, vol: 0.2 });
      crack(t + 0.02, 2600, 0.22);
      tone(1400, t + 0.02, 0.07, { f1: 2400, vol: 0.06 });
    },
    bambooWave: (t) => { // 竹浪：宽频沙沙 + 摇晃的哗声
      noise(t, 0.8, { f0: 2800, f1: 4200, q: 0.7, vol: 0.22, attack: 0.25 });
      noise(t + 0.1, 0.65, { f0: 900, f1: 1800, q: 1.5, vol: 0.14, attack: 0.25 });
      tone(150, t + 0.05, 0.7, { type: 'sawtooth', f1: 120, vol: 0.05, vib: [9, 60], attack: 0.3 });
    },
    spiritSummon: (t) => { // 精怪成圈：诡异上扬 + 三下点缀
      tone(240, t, 0.5, { type: 'triangle', f1: 940, vol: 0.12, vib: [12, 45], attack: 0.1 });
      tone(247, t, 0.5, { type: 'triangle', f1: 1000, vol: 0.08, attack: 0.1 });
      [0.15, 0.27, 0.39].forEach((d, i) => tone(pent(3 + i * 2, 523), t + d, 0.2, { vol: 0.07 }));
      noise(t, 0.4, { f0: 1200, f1: 3500, q: 4, vol: 0.08, attack: 0.15 });
    },
    monkeyDive: (t) => { // 噗通 + 气泡向下
      tone(220, t, 0.18, { f1: 70, vol: 0.4 });
      noise(t, 0.2, { type: 'lowpass', f0: 1800, f1: 300, vol: 0.28 });
      [0.12, 0.22, 0.34, 0.5].forEach((d, i) => bubble(t + d, 700 - i * 130, 0.08));
    },
    monkeyPounce: (t) => { // 水花爆开 + 低吼
      noise(t, 0.3, { type: 'bandpass', f0: 1500, f1: 3500, q: 0.8, vol: 0.3 });
      noise(t, 0.15, { type: 'highpass', f0: 5000, vol: 0.14 });
      tone(110, t, 0.38, { type: 'sawtooth', f1: 70, vol: 0.18, vib: [22, 70], attack: 0.03 });
      tone(55, t, 0.3, { f1: 36, vol: 0.4 });
    },
    waterWhip: (t) => { // 鞭响 + 水
      noise(t, 0.04, { type: 'highpass', f0: 4500, vol: 0.32 });
      tone(2200, t, 0.1, { f1: 600, vol: 0.1 });
      noise(t + 0.03, 0.3, { f0: 2200, f1: 700, q: 1, vol: 0.18 });
      [0.1, 0.17].forEach((d, i) => bubble(t + d, 500 + i * 150, 0.07));
    },
    waterDrag: (t) => { // 漩涡：低频持续，带摇摆
      noise(t, 0.6, { type: 'lowpass', f0: 300, f1: 700, q: 3, vol: 0.34, attack: 0.15 });
      tone(90, t, 0.6, { type: 'triangle', f1: 55, vol: 0.2, vib: [7, 90], attack: 0.15 });
      noise(t + 0.1, 0.45, { f0: 600, f1: 250, q: 4, vol: 0.1, attack: 0.15 });
    },
    iceWind: (t) => { // 冰风：高通噪声长扫
      noise(t, 1.3, { type: 'highpass', f0: 1500, f1: 5500, q: 0.8, vol: 0.22, attack: 0.45 });
      noise(t + 0.2, 1.0, { type: 'bandpass', f0: 3200, f1: 1800, q: 3, vol: 0.1, attack: 0.4 });
    },
    iceSpike: (t) => { // 冰刺落：尖锐碎裂
      noise(t, 0.08, { type: 'highpass', f0: 6000, vol: 0.28 });
      tone(3300, t, 0.14, { f1: 2800, vol: 0.09 });
      tone(4900, t + 0.01, 0.1, { vol: 0.05 });
      tone(2100, t + 0.03, 0.18, { vol: 0.05 });
    },
    iceCrack: (t) => { // 冰面大裂：低咔嚓 + 一道裂纹蔓延 + 回响
      tone(80, t, 0.22, { f1: 32, vol: 0.5 });
      noise(t, 0.06, { f0: 900, q: 1.5, vol: 0.35 });
      noise(t + 0.04, 0.5, { type: 'bandpass', f0: 3000, f1: 700, q: 6, vol: 0.14 });
      tone(60, t + 0.22, 0.6, { f1: 40, vol: 0.2 });
      noise(t + 0.3, 0.4, { type: 'lowpass', f0: 900, f1: 120, vol: 0.12 });
    },
    goldChime: (t) => { // 金光圈：清亮金钟
      metal(1175, t, 0.9, [1, 2.0, 3.0, 5.2], 0.13);
      tone(pent(9, 784), t + 0.05, 0.4, { type: 'triangle', vol: 0.06 });
    },
    wumianCharge: (t) => { // 蓄力低吼上扬，末尾一记冲劲
      tone(70, t, 0.6, { type: 'sawtooth', f1: 240, vol: 0.2, vib: [16, 60], attack: 0.2 });
      tone(35, t, 0.6, { f1: 70, vol: 0.4, attack: 0.1 });
      noise(t + 0.2, 0.45, { type: 'lowpass', f0: 300, f1: 2500, q: 1.5, vol: 0.25, attack: 0.25 });
    },
    wumianStun: (t) => { // 撞庙柱：木石闷撞 + 耳鸣
      tone(90, t, 0.25, { f1: 30, vol: 0.6 });
      crack(t, 700, 0.3);
      noise(t, 0.3, { type: 'lowpass', f0: 1800, f1: 150, vol: 0.3 });
      tone(5200, t + 0.06, 0.9, { vol: 0.04, attack: 0.05 });
      tone(5320, t + 0.06, 0.9, { vol: 0.03, attack: 0.05 });
    },
    censerOut: (t) => { // 香炉灭：嘶一声 + 低沉余音
      noise(t, 0.5, { type: 'highpass', f0: 3000, f1: 1200, q: 0.8, vol: 0.25, attack: 0.02 });
      tone(82, t + 0.1, 0.7, { f1: 45, vol: 0.28, attack: 0.04 });
      tone(165, t + 0.1, 0.4, { type: 'triangle', f1: 120, vol: 0.06 });
    },
    rageRoar: (t) => { // 二段怒吼：低沉带颤，先压后顶
      tone(95, t, 0.9, { type: 'sawtooth', f1: 165, vol: 0.22, vib: [24, 90], attack: 0.08 });
      tone(143, t, 0.8, { type: 'square', f1: 230, vol: 0.06, vib: [26, 80], attack: 0.1 });
      noise(t, 0.8, { type: 'bandpass', f0: 500, f1: 1400, q: 1.2, vol: 0.2, attack: 0.15 });
      tone(48, t, 0.8, { f1: 34, vol: 0.45 });
    },

    // ---- 特色怪 ----
    snowChildDash: (t) => { // 风 + 轻脆的一声喊
      noise(t, 0.3, { f0: 1500, f1: 4500, q: 1.5, vol: 0.18, attack: 0.05 });
      tone(1500, t + 0.05, 0.16, { type: 'triangle', f1: 2300, vol: 0.08, vib: [20, 40] });
    },
    snowChildReveal: (t) => { // 嗤 + 雪融滴答
      noise(t, 0.22, { type: 'highpass', f0: 4000, f1: 2000, vol: 0.2 });
      [0.12, 0.22].forEach((d, i) => tone(1800 - i * 400, t + d, 0.06, { f1: 900, vol: 0.06 }));
    },
    coffinOpen: (t) => { // 棺盖弹开：板响 + 吱呀
      noise(t, 0.06, { f0: 1100, q: 2, vol: 0.3 });
      tone(160, t, 0.12, { type: 'triangle', f1: 90, vol: 0.28 });
      tone(180, t + 0.06, 0.35, { type: 'sawtooth', f1: 340, vol: 0.08, vib: [13, 50], attack: 0.05 });
    },
    nailShot: (t) => { // 钉击破空
      noise(t, 0.09, { f0: 3200, f1: 1500, q: 3, vol: 0.14 });
      tone(1100, t, 0.05, { f1: 300, vol: 0.12, type: 'triangle' });
      tone(2600, t + 0.02, 0.04, { vol: 0.05 });
    },
    coffinSmash: (t) => { // 木头碎裂几块
      [0, 0.05, 0.11].forEach((d, i) => crack(t + d, 1400 + i * 500, 0.26));
      tone(70, t, 0.25, { f1: 36, vol: 0.45 });
      noise(t + 0.08, 0.25, { type: 'lowpass', f0: 1800, f1: 300, vol: 0.2 });
    },

    // ---- 夜探 ----
    stageGong: (t) => { // 开场锣鼓：由慢渐快，收尾一锣
      let d = 0;
      let gap = 0.26;
      for (let i = 0; i < 8; i++) {
        tone(i % 2 ? 150 : 190, t + d, 0.12, { f1: 80, vol: 0.3 });
        if (i % 2) noise(t + d, 0.05, { f0: 3000, q: 2, vol: 0.12 });
        d += gap;
        gap *= 0.8;
      }
      metal(130, t + d, 1.6, [1, 1.52, 2.1, 3.4], 0.3);
    },
    troupeAppear: (t) => { // 小锣 + 弦乐上滑
      metal(900, t, 0.5, [1, 2.4, 3.9], 0.1);
      tone(330, t, 0.35, { type: 'sawtooth', f1: 520, vol: 0.06, vib: [6, 25], attack: 0.1 });
    },
    sleeveSweep: (t) => { // 水袖：丝绸破空
      noise(t, 0.5, { f0: 1200, f1: 4200, q: 4, vol: 0.14, attack: 0.15 });
      noise(t + 0.15, 0.3, { type: 'highpass', f0: 3000, f1: 6000, vol: 0.1, attack: 0.1 });
    },
    faceChange: (t) => { // 变脸：快速打击 + 上滑
      for (let i = 0; i < 6; i++) tone(700 + i * 160, t + i * 0.04, 0.05, { type: 'square', vol: 0.06 });
      noise(t, 0.3, { f0: 2000, f1: 5000, q: 2, vol: 0.1, attack: 0.02 });
      tone(500, t + 0.05, 0.3, { type: 'sawtooth', f1: 1800, vol: 0.07, attack: 0.04 });
    },
    hongyiArrive: (t) => { // 梆子 + 胡琴拉长的哀音
      [0, 0.22].forEach((d) => {
        tone(420, t + d, 0.08, { type: 'triangle', f1: 360, vol: 0.28 });
        noise(t + d, 0.04, { f0: 2200, q: 3, vol: 0.12 });
      });
      tone(pent(4, 392), t + 0.45, 1.2, { type: 'sawtooth', f1: pent(3, 392), vol: 0.08, vib: [5.5, 28], attack: 0.15 });
      tone(pent(4, 392) * 2, t + 0.45, 1.0, { vol: 0.03, vib: [5.5, 28], attack: 0.15 });
      tone(60, t + 0.4, 0.6, { f1: 40, vol: 0.3 });
    },
    hongyiDown: (t) => { // 倒下：一声长长的拖音下坠
      tone(pent(5, 392), t, 2.0, { type: 'sawtooth', f1: pent(0, 392), vol: 0.09, vib: [5, 30], attack: 0.1 });
      tone(pent(5, 392) * 2, t, 1.5, { vol: 0.03, vib: [5, 30] });
      tone(500, t + 0.05, 0.08, { type: 'triangle', f1: 380, vol: 0.2 });
      noise(t + 0.8, 1.0, { f0: 3500, f1: 1500, q: 3, vol: 0.04, attack: 0.4 });
    },
    ratSkitter: (t) => { // 窸窣小碎步
      [0, 0.035, 0.07].forEach((d, i) => noise(t + d, 0.03, { f0: 4000 + i * 600, q: 3, vol: 0.07 }));
    },
    ratBurrow: (t) => { // 挖土闷响
      noise(t, 0.35, { type: 'lowpass', f0: 800, f1: 250, q: 1.5, vol: 0.28, attack: 0.04 });
      [0, 0.09, 0.18].forEach((d) => tone(95, t + d, 0.09, { f1: 55, vol: 0.28 }));
    },
    ricePile: (t) => { // 米粒哗啦
      noise(t, 0.5, { type: 'highpass', f0: 3500, f1: 6500, vol: 0.2, attack: 0.03 });
      noise(t + 0.05, 0.4, { f0: 2200, f1: 1500, q: 1, vol: 0.14, attack: 0.05 });
      [0.1, 0.19, 0.3, 0.38].forEach((d) => noise(t + d, 0.03, { f0: 5000, q: 4, vol: 0.08 }));
    },
    shuoshuArrive: (t) => { // 低沉大鼠叫 + 铠甲金属声
      tone(190, t, 0.16, { type: 'sawtooth', f1: 520, vol: 0.12, vib: [26, 60], attack: 0.01 });
      tone(190, t + 0.2, 0.2, { type: 'sawtooth', f1: 440, vol: 0.12, vib: [26, 60], attack: 0.01 });
      metal(600, t + 0.45, 0.7, [1, 1.5, 2.7], 0.1);
      tone(58, t + 0.4, 0.5, { f1: 38, vol: 0.45 });
    },
    shuoshuDown: (t) => { // 吱吱哀鸣 + 甲片散落
      tone(600, t, 0.5, { type: 'sawtooth', f1: 160, vol: 0.1, vib: [24, 80], attack: 0.01 });
      [0.25, 0.4, 0.5, 0.65].forEach((d, i) => metal(1300 + i * 230, t + d, 0.3, [1, 1.7, 2.9], 0.05));
      tone(50, t + 0.2, 0.8, { f1: 30, vol: 0.4 });
    },
  };
}

/** 把本文件的音色并入 sfx.ts 的音色表；sfx.ts 末尾调用，重复调用无害。 */
export function installFoeSfx(): void {
  registerVoices(build());
}
