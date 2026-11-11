// 角色技能的音效：全部现场合成，每个技能一个自己的音色（不和法器出手的声音混用）。
// 用 sfx.ts 导出的发声原语，加载时注册进去；GameScene 里 sfx.play('skillXxx') 照常用。
import { metal, noise, pent, registerVoices, tone, type SkillSfxName, type Voice } from './sfx.ts';

const VOICES: Record<SkillSfxName, Voice> = {
  // 小道士·剑气纵横：一记厚重的破空，尾部带金属的颤
  skillSweep: (t) => {
    noise(t, 0.28, { f0: 300, f1: 5200, q: 2, vol: 0.4, attack: 0.03 });
    tone(150, t, 0.3, { type: 'sawtooth', f1: 55, vol: 0.2 });
    metal(1320, t + 0.04, 0.5, [1, 2.76, 5.4], 0.08);
  },
  // 符师·万符齐发：一串急促上行的符纸爆，错开出手
  skillVolley: (t) => {
    for (let i = 0; i < 9; i++) {
      noise(t + i * 0.035, 0.06, { type: 'highpass', f0: 3000 + i * 250, vol: 0.2 });
      tone(pent(i + 5, 440), t + i * 0.035, 0.14, { type: 'triangle', vol: 0.09 });
    }
    metal(1568, t + 0.3, 0.5, [1, 2.4, 4.1], 0.07);
  },
  // 剑侠·御剑突进：一声尖锐的长啸，落地一记轻响
  skillDash: (t) => {
    tone(300, t, 0.2, { type: 'sawtooth', f1: 2600, vol: 0.14, attack: 0.02 });
    noise(t, 0.22, { f0: 1500, f1: 9000, q: 1.5, vol: 0.26, attack: 0.02 });
    tone(880, t + 0.2, 0.2, { vol: 0.12 });
    noise(t + 0.2, 0.08, { type: 'highpass', f0: 4000, vol: 0.14 });
  },
  // 胖师叔·铁布衫：一声低沉的钟，嗡嗡地托着
  skillIron: (t) => {
    metal(131, t, 1.4, [1, 2.4, 4.1, 6.3], 0.26);
    tone(66, t, 0.5, { f1: 55, vol: 0.3, vib: [5, 12] });
  },
  // 铁布衫收尾：闷响一震
  skillIronEnd: (t) => {
    tone(120, t, 0.35, { f1: 38, vol: 0.5 });
    noise(t, 0.35, { type: 'lowpass', f0: 1800, f1: 200, vol: 0.34 });
    metal(196, t, 0.9, [1, 2.4, 4.1], 0.14);
  },
  // 更夫·梆子声声：木梆子"梆"的一下，干脆
  skillClap: (t) => {
    tone(540, t, 0.09, { type: 'triangle', f1: 380, vol: 0.3 });
    tone(810, t, 0.06, { vol: 0.12 });
    noise(t, 0.05, { f0: 1700, q: 4, vol: 0.3 });
    tone(130, t, 0.14, { f1: 80, vol: 0.2 });
  },
  // 采药女·回春：轻轻的上行琶音，像一阵暖风
  skillSpring: (t) => {
    [0, 2, 4, 6, 9].forEach((d, i) => tone(pent(d + 2, 392), t + i * 0.07, 0.5, { type: 'triangle', vol: 0.1, vib: [5, 8], attack: 0.02 }));
    noise(t, 0.5, { f0: 500, f1: 2400, q: 0.8, vol: 0.08, attack: 0.2 });
  },
  skillSpringTick: (t) => {
    tone(pent(9, 523), t, 0.3, { vol: 0.07, attack: 0.01 });
    tone(pent(11, 523), t + 0.07, 0.3, { vol: 0.05, attack: 0.01 });
  },
  // 纸匠·剪纸成军：剪刀"咔嚓"两下，接着一阵纸片哗啦展开
  skillPaper: (t) => {
    for (const d of [0, 0.09]) {
      noise(t + d, 0.04, { type: 'highpass', f0: 5200, vol: 0.28 });
      tone(2600, t + d, 0.05, { type: 'square', f1: 1700, vol: 0.07 });
    }
    for (let i = 0; i < 6; i++) noise(t + 0.2 + i * 0.045, 0.07, { f0: 2400 + i * 300, q: 1.2, vol: 0.14 });
    tone(pent(7, 330), t + 0.3, 0.3, { type: 'triangle', vol: 0.06, attack: 0.02 });
  },
  // 摆渡人·横江一渡：撑篙入水的一声"噗通"，水波一圈圈漾开
  skillFerry: (t) => {
    tone(340, t, 0.22, { f1: 90, vol: 0.28 });
    noise(t, 0.4, { type: 'lowpass', f0: 600, f1: 2600, vol: 0.2, attack: 0.04 });
    [0, 3, 5].forEach((d, i) => tone(pent(d + 4, 330), t + 0.12 + i * 0.1, 0.45, { vol: 0.07, vib: [6, 10], attack: 0.03 }));
  },
  // 货郎·招财进宝：一把铜钱哗啦倒下，叮叮当当往上
  skillFortune: (t) => {
    for (let i = 0; i < 9; i++) metal(2093 + (i % 3) * 330, t + i * 0.045, 0.28, [1, 2.76, 5.4], 0.07);
    tone(pent(14, 523), t + 0.4, 0.3, { vol: 0.09, attack: 0.005 });
    tone(pent(16, 523), t + 0.48, 0.45, { vol: 0.08, attack: 0.005 });
  },
  // 阴阳先生·定阵：一记沉的磬，嗡的一声，阵纹铺开
  skillArray: (t) => {
    metal(220, t, 1.6, [1, 2.0, 3.0, 4.2], 0.2);
    tone(110, t, 0.6, { f1: 98, vol: 0.26, vib: [3, 8] });
    noise(t, 0.5, { f0: 3000, f1: 400, q: 1, vol: 0.12, attack: 0.1 });
  },
  // 阵散：一声轻磬
  skillArrayEnd: (t) => {
    metal(330, t, 0.8, [1, 2.0, 3.0], 0.1);
  },
  // 技能冷却好了：一声清亮的叮
  skillReady: (t) => {
    tone(pent(12, 523), t, 0.25, { vol: 0.1, attack: 0.005 });
    tone(pent(14, 523), t + 0.08, 0.3, { vol: 0.08, attack: 0.005 });
  },
};

registerVoices(VOICES);
