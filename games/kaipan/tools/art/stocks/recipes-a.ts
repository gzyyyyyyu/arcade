/** 股票小人：名字梗剪影配方（上半）。 */
import {
  INK, darken, ellipseD, frag, hiArc, lighten, merge, nid, rrectD, shape, smoothClosed, sparkleD, starD,
} from '../lib/svg.ts';
import { type Colors, type Recipe, line, arm, feet, leaf, wing, coinStack } from './shared.ts';

export const RECIPES_A: Record<string, (c: Colors) => Recipe> = {
  /** 算力搬砖：顶着散热风扇的砖块 */
  brickfan(c) {
    let blades = '';
    for (let i = 0; i < 4; i++) blades += `<path d="M0 0C5 -5 13 -10 3 -15C-3 -11 -4 -6 0 0Z" transform="translate(52 38) rotate(${i * 90})" fill="${lighten(c.accent, 0.5)}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
    blades += `<circle cx="52" cy="38" r="4" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
    const brick = shape(rrectD(20, 56, 88, 56, 9), {
      fill: c.body,
      extra: line('M20 76H32M96 76H108M20 96H28M100 96H108M44 56v8M84 104v8', lighten(c.body, 0.4), 2.6) + hiArc('M28 66q2 -5 8 -6', 3.5, 0.6),
    });
    return {
      back: `<rect x="44" y="50" width="16" height="10" fill="#5a6070" stroke="${INK}" stroke-width="2.6"/><circle cx="52" cy="38" r="20" fill="${darken(c.accent, 0.35)}" stroke="${INK}" stroke-width="3.4"/><circle cx="52" cy="38" r="16" fill="#1d2a3a"/>`,
      spin: blades,
      spinAt: [52, 38],
      body: brick,
      face: { x: 64, y: 86, s: 1, gap: 15, headTopY: 56 },
      headTop: [64, 16],
      shadowRx: 42,
      armL: [[26, 92], [14, 102]],
      armR: [[100, 92], [108, 76]],
      feetX: [44, 84],
      flag: { x: 108, y: 76, dir: -1 },
      scale: 0.86,
    };
  },
  /** 光伏追光：花瓣是光伏板的向日葵 */
  sunflower(c) {
    let petals = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 360;
      const r = (a * Math.PI) / 180;
      const x = 64 + Math.cos(r) * 35;
      const y = 54 + Math.sin(r) * 35;
      petals += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a + 90})"><rect x="-7.5" y="-12" width="15" height="24" rx="3" fill="#3d63d6" stroke="${INK}" stroke-width="2.8"/><path d="M-7.5 0H7.5M0 -12V12M-7.5 -6H7.5M-7.5 6H7.5" stroke="#a9c4ff" stroke-width="1.1"/></g>`;
    }
    const under =
      line('M64 80V106', INK, 9) + line('M64 80V106', '#5aa84c', 4.5) +
      `<path d="${leaf(64, 98, 40, 88, 10, -4)}" fill="#7ccf6a" stroke="${INK}" stroke-width="2.6"/><path d="${leaf(64, 102, 88, 92, 10, 4)}" fill="#7ccf6a" stroke="${INK}" stroke-width="2.6"/>`;
    const pot = shape('M48 102H80L76 116H52Z', { fill: '#e9875a', sw: 3.2 });
    const disc = shape(ellipseD(64, 54, 26, 26), { fill: c.body, extra: hiArc('M46 46q3 -8 10 -10', 3.5, 0.6) });
    return {
      under: under + petals,
      body: merge(pot, disc),
      face: { x: 64, y: 55, s: 0.92, gap: 12, headTopY: 28 },
      headTop: [64, 4],
      shadowRx: 22,
      crown: [64, 28, -6, 0.8],
    };
  },
  /** 充电五分钟：电池 */
  battery(c) {
    return {
      under: `<rect x="53" y="32" width="22" height="12" rx="3" fill="#cfd8e6" stroke="${INK}" stroke-width="3.2"/>` + line('M40 110Q24 112 20 100T14 86', INK, 5) + line('M40 110Q24 112 20 100T14 86', '#5a5f73', 2) + `<rect x="8" y="76" width="10" height="10" rx="2" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/>`,
      body: shape(rrectD(36, 40, 56, 74, 12), {
        fill: c.body,
        extra:
          `<rect x="42" y="88" width="44" height="20" rx="5" fill="${darken(c.body, 0.3)}"/>` +
          [0, 1, 2].map((i) => `<rect x="${45 + i * 13.3}" y="91" width="11" height="14" rx="2.5" fill="#eaff9e"/>`).join('') +
          `<path d="M66 44l-6 9h5l-3 8" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` +
          hiArc('M43 56q0 -8 7 -10', 3.5, 0.55),
      }),
      face: { x: 64, y: 68, s: 0.95, gap: 13, headTopY: 32 },
      headTop: [64, 22],
      shadowRx: 32,
      armL: [[38, 84], [28, 94]],
      armR: [[90, 86], [104, 74]],
      feetX: [50, 78],
      flag: { x: 104, y: 74, dir: -1 },
      scale: 0.86,
    };
  },
  /** 奶茶续命：插着吸管的奶茶杯 */
  cup(c) {
    const straw = line('M74 44L86 10', INK, 9) + line('M74 44L86 10', c.accent, 4.5) + line('M77.5 34l2 -6M81 24l2 -6', '#ffffff', 2.2);
    const lid = shape(rrectD(28, 38, 72, 14, 7), { fill: '#fff6ea', shade: '#e6d6c4', sw: 3.4 });
    const boba = [[46, 104], [56, 108], [68, 106], [80, 103], [62, 99], [50, 97]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="#5a3a2c"/><circle cx="${x! - 1.2}" cy="${y! - 1.4}" r="1.2" fill="#a07a66"/>`).join('');
    const cup = shape('M32 50H96L88 108Q87 114 80 114H48Q41 114 40 108Z', {
      fill: c.body,
      extra: `<path d="M34 64H94L92.4 76H35.6Z" fill="${c.accent}"/>` + boba + hiArc('M40 58l3 40', 3.5, 0.5),
    });
    return {
      under: straw,
      body: merge(cup, lid),
      face: { x: 64, y: 86, s: 0.92, gap: 13, mouthDy: 10, headTopY: 38 },
      headTop: [64, 8],
      shadowRx: 32,
      armL: [[38, 84], [26, 92]],
      armR: [[90, 84], [102, 92]],
      feetX: [52, 76],
      crown: [46, 32, -14, 0.85],
    };
  },
  /** 预制菜大王：微波炉饭盒 */
  bento(c) {
    const food =
      `<path d="M26 66Q28 48 46 48Q60 50 62 66Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="60" y="50" width="16" height="9" rx="4.5" fill="#e8553e" stroke="${INK}" stroke-width="2" transform="rotate(-12 68 54)"/>` +
      `<circle cx="84" cy="54" r="6" fill="#5fb84a" stroke="${INK}" stroke-width="2"/><circle cx="90" cy="58" r="5" fill="#5fb84a" stroke="${INK}" stroke-width="2"/><rect x="85" y="58" width="4" height="8" fill="#9ad66f"/>` +
      `<ellipse cx="100" cy="62" rx="7" ry="4.5" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/><circle cx="100" cy="62" r="2.6" fill="#ffd23f"/>`;
    const lid = `<path d="M16 66Q16 38 64 34Q112 38 112 66Z" fill="#e8f6ff" fill-opacity="0.55" stroke="${INK}" stroke-width="3.4"/>` + hiArc('M28 54q8 -12 24 -14', 3, 0.85);
    const steam = line('M44 30q-5 -6 0 -11t0 -11M64 26q-5 -6 0 -11t0 -11M84 30q-5 -6 0 -11t0 -11', '#c8b6d6', 3.2);
    const box = shape(rrectD(14, 62, 100, 50, 10), {
      fill: c.body,
      extra: `<rect x="14" y="62" width="100" height="9" fill="${lighten(c.body, 0.3)}"/>` + line('M14 71H114', INK, 2.4) + hiArc('M22 80v10', 3, 0.5),
    });
    return {
      under: steam + food,
      body: merge(frag(lid), box),
      face: { x: 64, y: 89, s: 0.95, gap: 15, headTopY: 62, markDy: -14 },
      headTop: [64, 8],
      shadowRx: 48,
      armL: [[20, 92], [8, 100]],
      armR: [[108, 92], [120, 100]],
      feetX: [36, 92],
    };
  },
  /** 熬夜救星药业：额头上推着眼罩的药瓶 */
  pillbottle(c) {
    const cap = shape(rrectD(40, 30, 48, 18, 5), { fill: '#fffaf0', shade: '#e6dccb', sw: 3.2, extra: line('M48 32v14M56 32v14M64 32v14M72 32v14M80 32v14', '#d8cbb4', 1.6) });
    const bottle = shape('M40 48Q34 50 34 60V106Q34 114 42 114H86Q94 114 94 106V60Q94 50 88 48Z', {
      fill: c.body,
      extra:
        `<rect x="38" y="94" width="52" height="16" rx="4" fill="#ffffff" stroke="${darken(c.body, 0.3)}" stroke-width="1.8"/>` +
        `<path d="M47 98h4v-3h4v3h4v4h-4v3h-4v-3h-4z" fill="${c.body}"/>` + line('M64 100h20M64 105h14', '#cfd8e6', 2) +
        hiArc('M40 66v18', 3.5, 0.55),
    });
    const mask =
      line('M34 57H94', INK, 5) + line('M34 57H94', '#4a4a9a', 2.4) +
      `<path d="M40 52Q52 48 64 54Q76 48 88 52Q92 58 86 63Q76 65 64 60Q52 65 42 63Q36 58 40 52Z" fill="#5a5ab0" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
      line('M45 57q6 4 12 0M71 57q6 4 12 0', '#ffffff', 1.8) + line('M48 59l-1 2.5M54 59l1 2.5M74 59l-1 2.5M80 59l1 2.5', '#ffffff', 1.4);
    return {
      body: merge(cap, bottle, frag(mask)),
      face: { x: 64, y: 79, s: 0.95, gap: 13, headTopY: 30 },
      headTop: [64, 8],
      shadowRx: 34,
      armL: [[36, 84], [26, 94]],
      armR: [[92, 84], [102, 94]],
      feetX: [50, 78],
      crown: [64, 26, 8, 0.8],
    };
  },
  /** 板蓝根集团：冲剂袋 */
  packet(c) {
    const d = 'M30 48L34 44L38 48L42 44L46 48L50 44L54 48L58 44L62 48L66 44L70 48L74 44L78 48L82 44L86 48L90 44L94 48L98 44V112L94 116L90 112L86 116L82 112L78 116L74 112L70 116L66 112L62 116L58 112L54 116L50 112L46 116L42 112L38 116L34 112L30 116Z';
    return {
      body: shape(d, {
        fill: c.body,
        extra:
          `<rect x="30" y="52" width="68" height="7" fill="${darken(c.body, 0.18)}"/>` + hiArc('M36 66v20', 3.5, 0.5) +
          `<path d="${leaf(40, 106, 48, 88, 12, 0)}" fill="#5fb84a" stroke="${INK}" stroke-width="2.2"/>` + line('M41 104L46 92', '#d8f5c8', 1.4) +
          `<path d="M78 92q4 -6 8 0t-4 10q-8 -4 -4 -10z" fill="#ffffff" fill-opacity="0.8"/>`,
      }),
      face: { x: 64, y: 74, s: 1, gap: 13, headTopY: 44 },
      headTop: [64, 40],
      shadowRx: 36,
      armL: [[32, 90], [22, 100]],
      armR: [[96, 90], [106, 100]],
      feetX: [48, 80],
    };
  },
  /** 神药概念：冒泡的魔法药水瓶 */
  potion(c) {
    const cid = nid('liq');
    const bulbD = ellipseD(64, 82, 34, 32);
    const bubbles = [[72, 20, 5], [60, 10, 3.6], [80, 5, 2.6], [50, 22, 2.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${lighten(c.body, 0.5)}" stroke="${INK}" stroke-width="2"/>`).join('');
    const neck = shape(rrectD(52, 28, 24, 30, 5), { fill: '#eaf8ff', shade: '#cfe6f2', sw: 3 });
    const cork = shape(rrectD(54, 20, 20, 12, 3), { fill: '#c98a4a', sw: 2.8 });
    const bulb = shape(bulbD, {
      fill: c.body,
      extra:
        `<clipPath id="${cid}"><path d="${bulbD}"/></clipPath><g clip-path="url(#${cid})"><path d="M20 66Q42 58 64 66T110 64V40H20Z" fill="#eaf8ff" fill-opacity="0.92"/><path d="M20 66Q42 58 64 66T110 64" fill="none" stroke="${lighten(c.body, 0.4)}" stroke-width="3"/></g>` +
        `<circle cx="84" cy="98" r="4" fill="#ffffff" fill-opacity="0.45"/><circle cx="44" cy="102" r="2.6" fill="#ffffff" fill-opacity="0.45"/><circle cx="90" cy="80" r="2" fill="#ffffff" fill-opacity="0.5"/>` +
        hiArc('M38 72q2 -10 10 -14', 4, 0.7),
    });
    return {
      under: bubbles,
      body: merge(neck, cork, bulb),
      top: `<path d="${sparkleD(100, 50, 6)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.8"/><path d="${sparkleD(26, 60, 4.5)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.6"/>`,
      face: { x: 64, y: 84, s: 0.95, gap: 13, headTopY: 50, markDy: -20 },
      headTop: [64, 2],
      shadowRx: 30,
      feetX: [],
    };
  },
  /** 割韭菜证券：木柄当身体、头顶弯着一把带尖的镰刀刃，脚边一排被割的韭菜（v0.3 重画：旧版月牙太像月亮） */
  sickle(c) {
    const bladeD =
      'M46 62C36 44 42 22 70 14C96 6 120 22 118 50C117 63 112 74 106 86C108 70 106 52 98 42C90 32 74 28 64 34C56 39 54 50 58 62Z';
    const edge = 'M106 84C107 70 105 53 97.5 43.5C89.5 33.5 74.5 29.5 64.5 35.5';
    const cid = nid('blade');
    const blade = shape(bladeD, {
      fill: c.trim,
      shade: '#aab6ca',
      shadeOffset: [5, 4],
      extra:
        // 开了刃的内弧：一道亮白的刃口 + 细小的锯齿
        `<clipPath id="${cid}"><path d="${bladeD}"/></clipPath><g clip-path="url(#${cid})">` +
        line(edge, '#ffffff', 7) + line(edge, '#8e9bb4', 1.4, ' stroke-dasharray="2 3" transform="translate(2.2 -1)"') +
        `</g>` +
        hiArc('M48 46q2 -20 22 -28', 4, 0.85) + hiArc('M96 16q12 6 16 18', 3, 0.6),
    });
    const glint = `<path d="${sparkleD(112, 30, 7)}" fill="#ffffff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
    const wood = c.body;
    const handle = shape(rrectD(42, 64, 40, 48, 14), {
      fill: wood,
      extra:
        line('M50 74q2 8 0 14M74 76q-2 10 0 18', '#a8682e', 2, ' stroke-opacity="0.7"') +
        `<rect x="42" y="100" width="40" height="5" fill="#b8453a"/>` + line('M42 100H82M42 105H82', INK, 2) +
        hiArc('M47 76v8', 3, 0.5),
    });
    const collar = shape(rrectD(40, 57, 44, 12, 4), {
      fill: c.accent,
      shadeOffset: [-2, -3],
      sw: 3.2,
      extra: `<circle cx="48" cy="63" r="2" fill="${INK}"/><circle cx="76" cy="63" r="2" fill="${INK}"/>`,
    });
    // 被割的韭菜：地上一排茬 + 两截飞起来的叶尖
    const stalk = (x: number, h: number, tilt: number) =>
      `<path d="M${x - 3.5} 116V${116 - h + tilt}L${x + 3.5} ${116 - h - tilt}V116Z" fill="#56c45a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="M${x - 2.4} 115V108H${x + 2.4}V115Z" fill="#f4f8e8"/>` +
      `<path d="M${x - 2} ${116 - h + tilt + 1.5}L${x + 2} ${116 - h - tilt + 1.5}" stroke="#d8ffc0" stroke-width="2" stroke-linecap="round"/>`;
    const leeks =
      stalk(100, 16, 2) + stalk(110, 20, 2.5) + stalk(120, 15, 2) +
      `<path d="${leaf(112, 92, 124, 78, 7, -2)}" fill="#7ad86a" stroke="${INK}" stroke-width="2"/>` +
      `<path d="${leaf(100, 90, 92, 76, 6, 2)}" fill="#7ad86a" stroke="${INK}" stroke-width="2"/>` +
      line('M118 74l3 -3M88 82l-3 -2', INK, 1.8, ' stroke-opacity="0.5"');
    return {
      under: leeks,
      body: merge(handle, blade, collar, frag(glint)),
      face: { x: 62, y: 84, s: 0.86, gap: 12, mouthDy: 12, headTopY: 62 },
      headTop: [72, 4],
      shadowRx: 26,
      armL: [[44, 88], [30, 98]],
      armR: [[80, 88], [90, 98]],
      feetX: [52, 72],
      crown: [74, 14, 10, 0.68],
    };
  },
  /** 币圈信托：发光的硬币 */
  coin(c) {
    let ticks = '';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ticks += `<path d="M${(64 + Math.cos(a) * 34).toFixed(1)} ${(74 + Math.sin(a) * 34).toFixed(1)}L${(64 + Math.cos(a) * 37).toFixed(1)} ${(74 + Math.sin(a) * 37).toFixed(1)}" stroke="${darken(c.body, 0.3)}" stroke-width="1.6"/>`;
    }
    let rays = `<circle cx="64" cy="74" r="50" fill="#fff3b0" fill-opacity="0.55"/>`;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      rays += line(`M${(64 + Math.cos(a) * 46).toFixed(1)} ${(74 + Math.sin(a) * 46).toFixed(1)}L${(64 + Math.cos(a) * 58).toFixed(1)} ${(74 + Math.sin(a) * 58).toFixed(1)}`, '#ffc93a', 4.5);
    }
    return {
      back: rays,
      body: shape(ellipseD(64, 74, 38, 38), {
        fill: c.body,
        extra: ticks + `<circle cx="64" cy="74" r="29" fill="${lighten(c.body, 0.25)}" stroke="${darken(c.body, 0.25)}" stroke-width="2.5"/>` + `<path d="${starD(64, 99, 5)}" fill="${darken(c.body, 0.15)}"/>` + hiArc('M38 60q6 -16 22 -20', 4, 0.6),
      }),
      top: `<path d="${sparkleD(104, 36, 7)}" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/><path d="${sparkleD(22, 104, 5)}" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>`,
      face: { x: 64, y: 76, s: 0.95, gap: 13, headTopY: 36 },
      headTop: [64, 18],
      shadowRx: 32,
      armL: [[30, 84], [20, 94]],
      armR: [[98, 84], [108, 94]],
      feetX: [52, 76],
    };
  },
  /** 飞天外卖：顶着螺旋桨的外卖箱 */
  propbox(c) {
    const rotor =
      line('M64 44V28', INK, 4) +
      `<ellipse cx="64" cy="26" rx="34" ry="5" fill="#e8eef7" stroke="${INK}" stroke-width="2.8"/>` +
      line('M36 24q8 -3 14 0M80 24q8 -3 14 0', '#ffffff', 2) +
      `<circle cx="64" cy="26" r="4" fill="#ffd23f" stroke="${INK}" stroke-width="2.2"/>`;
    const top = shape('M24 54L36 44H114L104 54Z', { fill: lighten(c.body, 0.35), shade: false, sw: 3.2 });
    const side = shape('M104 54L114 44V102L104 112Z', { fill: darken(c.body, 0.2), shade: false, sw: 3.2 });
    const front = shape(rrectD(22, 54, 82, 58, 7), {
      fill: c.body,
      extra: `<rect x="22" y="98" width="82" height="7" fill="#ffffff" fill-opacity="0.85"/>` + line('M28 60H98', darken(c.body, 0.25), 2, ' stroke-dasharray="3 3"') + hiArc('M28 70v14', 3.5, 0.55),
    });
    return {
      under: rotor,
      body: merge(top, side, front),
      face: { x: 63, y: 80, s: 1, gap: 14, headTopY: 44 },
      headTop: [64, 16],
      shadowRx: 46,
      armL: [[26, 88], [14, 98]],
      feetX: [42, 84],
      crown: [44, 40, -12, 0.75],
    };
  },
  /** 螺旋桨精工：螺旋桨本体，桨叶单独成层可以转（v0.3：桨毂放大，脸更大） */
  propeller(c) {
    let blades = '';
    for (const rot of [0, 180]) {
      blades += `<g transform="translate(64 62) rotate(${rot - 15})"><path d="M22 -9C34 -16 52 -12 61 0C52 9 34 14 22 9Z" fill="${c.body}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><path d="M51 -8C55 -6 59 -3 61 0C59 3 55 6 51 8Z" fill="#ffd23f"/>${hiArc('M28 -8q12 -4 22 -2', 2.4, 0.6)}</g>`;
    }
    const stand = `<rect x="57" y="88" width="14" height="22" rx="3" fill="#9aa6c0" stroke="${INK}" stroke-width="3"/><ellipse cx="64" cy="112" rx="22" ry="5" fill="#5a6070" stroke="${INK}" stroke-width="3"/>`;
    const hub = shape(ellipseD(64, 62, 30, 30), { fill: lighten(c.body, 0.6), shade: lighten(c.body, 0.3), extra: hiArc('M43 54q3 -11 13 -14', 3.2, 0.7) });
    return {
      spin: blades,
      spinAt: [64, 62],
      under: stand,
      body: hub,
      face: { x: 64, y: 62, s: 1.02, gap: 13, mouthDy: 11, headTopY: 32 },
      headTop: [64, 6],
      shadowRx: 26,
      feetX: [],
      flag: { x: 41, y: 48, dir: -1, stick: true, w: 22 },
      scale: 0.86,
    };
  },
  /** 会飞的车：长翅膀的小车 */
  car(c) {
    const w1 = wing(-1, 30, 70, 0.78);
    const w2 = wing(1, 98, 70, 0.78);
    const wind = line('M2 46q10 -6 20 0t20 0M88 30q8 -5 16 0t16 0', '#ffffff', 2.6, ' stroke-opacity="0.9"');
    const wheels = [42, 88].map((x) => `<circle cx="${x}" cy="104" r="11" fill="#3a3448" stroke="${INK}" stroke-width="3.2"/><circle cx="${x}" cy="104" r="4.5" fill="#cfd8e6"/>`).join('');
    return {
      back: w1.content + w2.content + wind,
      body: merge(
        shape('M22 98Q20 80 32 78L42 56Q46 48 56 48H72Q82 48 86 56L96 78Q108 80 106 98Q106 104 100 104H28Q22 104 22 98Z', {
          fill: c.body,
          extra:
            `<path d="M42 78L48 58Q50 54 56 54H72Q78 54 80 58L86 78Z" fill="#dff4ff" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
            `<circle cx="28" cy="88" r="4" fill="#fff6b0" stroke="${INK}" stroke-width="2"/><circle cx="100" cy="88" r="4" fill="#fff6b0" stroke="${INK}" stroke-width="2"/>` +
            hiArc('M30 84q2 -4 6 -5', 3, 0.6),
        }),
        frag(wheels),
      ),
      face: { x: 64, y: 67, s: 0.82, gap: 13, mouthDy: 10, headTopY: 48, noCheeks: true, markDy: -15 },
      headTop: [64, 40],
      shadowRx: 44,
      feetX: [],
    };
  },
  /** 氪金游戏：手柄 + 金币 */
  gamepad(c) {
    const pad = shape('M12 74Q10 50 32 48H96Q118 50 116 74Q118 104 102 106Q92 106 86 94H42Q36 106 26 106Q10 104 12 74Z', {
      fill: c.body,
      extra:
        `<path d="M24 64h6v-6h6v6h6v6h-6v6h-6v-6h-6z" fill="#ffffff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<circle cx="100" cy="60" r="4" fill="#ff5d7a" stroke="${INK}" stroke-width="1.8"/><circle cx="108" cy="68" r="4" fill="#5ee0ff" stroke="${INK}" stroke-width="1.8"/><circle cx="92" cy="68" r="4" fill="#ffd23f" stroke="${INK}" stroke-width="1.8"/><circle cx="100" cy="76" r="4" fill="#7ccf6a" stroke="${INK}" stroke-width="1.8"/>` +
        hiArc('M22 58q4 -6 10 -7', 3, 0.6),
    });
    return {
      body: merge(pad, frag(coinStack(104, 112, 3) + coinStack(22, 112, 2))),
      top: `<g transform="translate(16 30)"><circle r="9" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/><path d="${starD(0, 0.5, 4.5)}" fill="#f0a020"/></g><path d="${sparkleD(30, 20, 4.5)}" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>`,
      face: { x: 64, y: 72, s: 0.9, gap: 12, headTopY: 48 },
      headTop: [64, 20],
      shadowRx: 48,
      feetX: [],
      crown: [64, 42, -6, 0.88],
    };
  },
  /** 电竞椅：发光的椅子 */
  gamingchair(c) {
    const glow =
      `<rect x="30" y="12" width="68" height="80" rx="22" fill="none" stroke="#5ee0ff" stroke-width="10" stroke-opacity="0.35"/>` +
      `<rect x="32" y="14" width="64" height="76" rx="20" fill="none" stroke="#ff7ad9" stroke-width="3.5" stroke-opacity="0.7"/>`;
    const base =
      line('M64 96V106M64 106L36 112M64 106L92 112M64 106V114', INK, 6) + line('M64 96V106M64 106L36 112M64 106L92 112M64 106V114', '#6b6585', 2.5) +
      [36, 92, 64].map((x) => `<circle cx="${x}" cy="${x === 64 ? 114 : 112}" r="3.6" fill="#3a3448" stroke="${INK}" stroke-width="2"/>`).join('');
    const seat = shape(rrectD(26, 82, 76, 16, 7), { fill: '#3a3354', sw: 3 });
    const arms = shape(rrectD(18, 64, 12, 24, 5), { fill: '#3a3354', sw: 3 });
    const arms2 = shape(rrectD(98, 64, 12, 24, 5), { fill: '#3a3354', sw: 3 });
    const back = shape(rrectD(36, 18, 56, 72, 18), {
      fill: c.body,
      extra:
        `<rect x="40" y="28" width="7" height="52" rx="3.5" fill="#3a3354"/><rect x="81" y="28" width="7" height="52" rx="3.5" fill="#3a3354"/>` +
        `<rect x="50" y="22" width="28" height="10" rx="5" fill="#3a3354" stroke="${INK}" stroke-width="2"/>` +
        `<rect x="41" y="23" width="46" height="62" rx="14" fill="none" stroke="#5ee0ff" stroke-width="2"/>` +
        hiArc('M54 40q3 -4 8 -4', 2.4, 0.5),
    });
    return {
      back: glow,
      under: base,
      body: merge(seat, arms, arms2, back),
      face: { x: 64, y: 58, s: 0.92, gap: 11, headTopY: 18 },
      headTop: [64, 4],
      shadowRx: 38,
      feetX: [],
      flag: { x: 104, y: 66, dir: 1, stick: true, w: 22 },
      scale: 0.86,
    };
  },
  /** 元宇宙：VR 头盔，脸显示在面罩屏幕上 */
  vrhead(c) {
    const gid = nid('vr');
    const screen = `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="48" x2="0" y2="88"><stop offset="0" stop-color="#f0e4ff"/><stop offset="1" stop-color="#bff1ff"/></linearGradient>`;
    const legs = `<rect x="44" y="90" width="11" height="20" rx="4" fill="#3a3354" stroke="${INK}" stroke-width="2.8"/><rect x="73" y="90" width="11" height="20" rx="4" fill="#3a3354" stroke="${INK}" stroke-width="2.8"/>` + feet([48, 80], c.body);
    const shell = shape(rrectD(10, 38, 108, 56, 22), {
      fill: '#3a3354',
      extra:
        `<rect x="20" y="47" width="88" height="40" rx="15" fill="url(#${gid})" stroke="${INK}" stroke-width="2.4"/>` +
        line('M26 60H102M26 70H102M26 80H102', '#ffffff', 1, ' stroke-opacity="0.5"') +
        `<circle cx="16" cy="66" r="3" fill="${c.body}"/><circle cx="112" cy="66" r="3" fill="${c.body}"/>` +
        hiArc('M26 52q4 -2 10 -2', 2.4, 0.9),
    });
    shell.defs.set(gid, screen);
    return {
      back: line('M18 62Q16 18 64 18Q112 18 110 62', INK, 13) + line('M18 62Q16 18 64 18Q112 18 110 62', c.body, 7.5),
      under: legs,
      body: shell,
      face: { x: 64, y: 66, s: 0.85, gap: 15, headTopY: 38, noCheeks: false, markDy: -21 },
      headTop: [64, 12],
      shadowRx: 34,
      feetX: [],
    };
  },
  /** 饲料大王：饲料袋 */
  sack(c) {
    return {
      body: shape('M50 50Q44 42 48 36Q56 42 64 40Q72 42 80 36Q84 42 78 50Q98 62 98 92Q98 114 64 114Q30 114 30 92Q30 62 50 50Z', {
        fill: c.body,
        extra:
          line('M49 51Q64 56 79 51', INK, 3) +
          `<rect x="46" y="90" width="36" height="17" rx="4" fill="${c.accent}" stroke="${INK}" stroke-width="2.4"/>` +
          line('M64 104v-11M64 97l-4 -3M64 97l4 -3M64 101l-4 -3M64 101l4 -3', '#ffffff', 1.8) +
          line('M36 72q2 4 0 8M92 70q-2 4 0 8', darken(c.body, 0.25), 1.6) +
          hiArc('M38 72q2 -12 10 -16', 4, 0.5),
      }),
      under: [[24, 112], [34, 114], [104, 113]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.8" fill="#e8c88a" stroke="${INK}" stroke-width="1.2"/>`).join(''),
      face: { x: 64, y: 72, s: 0.95, gap: 13, headTopY: 36 },
      headTop: [64, 22],
      shadowRx: 36,
      armL: [[34, 86], [24, 96]],
      armR: [[92, 86], [104, 78]],
      feetX: [50, 78],
      flag: { x: 104, y: 78, dir: -1 },
      scale: 0.86,
    };
  },
  /** 风口上的猪：被电风扇吹上天的小猪（v0.3：猪放大，脸更大，风扇缩小） */
  fanpig(c) {
    let blades = '';
    for (let i = 0; i < 3; i++) blades += `<path d="M0 0C5 -3.4 12 -10 3.4 -13.6C-1.7 -10 -2.6 -5 0 0Z" transform="translate(20 88) rotate(${i * 120})" fill="#ffffff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
    blades += `<circle cx="20" cy="88" r="3.2" fill="#9fd8ff" stroke="${INK}" stroke-width="1.8"/>`;
    const fanBack =
      `<ellipse cx="20" cy="112" rx="14" ry="4" fill="#9fd8ff" stroke="${INK}" stroke-width="2.6"/>` + line('M20 103V110', INK, 6) + line('M20 103V110', '#dff4ff', 2.4) +
      `<circle cx="20" cy="88" r="16" fill="#dff4ff" fill-opacity="0.7" stroke="${INK}" stroke-width="2.8"/>` +
      line('M40 82q8 -10 18 -9M40 96q10 -6 20 -4M36 68q6 -8 14 -9', '#7fc8ff', 3.2);
    const ears = `<path d="M58 36L52 14L74 28Z" fill="${c.body}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M98 36L104 14L82 28Z" fill="${c.body}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M58 30L55 19L67 27Z" fill="${darken(c.body, 0.12)}"/><path d="M98 30L101 19L89 27Z" fill="${darken(c.body, 0.12)}"/>`;
    const legs = [[60, 80], [70, 86], [86, 86], [96, 80]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="7.5" fill="${darken(c.body, 0.12)}" stroke="${INK}" stroke-width="2.8"/>`).join('');
    const tail = line('M110 54q9 -2 7 -9q-3 -4 -6 0q-2 4 4 6', INK, 5.5) + line('M110 54q9 -2 7 -9q-3 -4 -6 0q-2 4 4 6', c.body, 2.2);
    const pig = shape(ellipseD(78, 54, 34, 30), {
      fill: c.body,
      extra:
        `<ellipse cx="78" cy="65" rx="11" ry="7.5" fill="${darken(c.body, 0.12)}" stroke="${INK}" stroke-width="2.6"/><ellipse cx="74.3" cy="65" rx="2" ry="3" fill="${INK}"/><ellipse cx="81.7" cy="65" rx="2" ry="3" fill="${INK}"/>` +
        hiArc('M52 48q3 -12 14 -16', 3.8, 0.6),
    });
    return {
      back: fanBack,
      spin: blades,
      spinAt: [20, 88],
      under: ears + legs + tail,
      body: pig,
      face: { x: 78, y: 49, s: 1.04, gap: 14, mouthDy: 25, headTopY: 24 },
      headTop: [78, 12],
      shadowRx: 22,
      shadowX: 80,
      feetX: [],
    };
  },
  /** ST摆烂：瘫成一滩的小团子 */
  melt(c) {
    return {
      body: shape('M14 110Q10 100 24 98Q28 84 44 78Q52 70 64 70Q78 70 86 78Q102 84 104 96Q118 98 116 110Q116 116 108 116H22Q14 116 14 110Z', {
        fill: c.body,
        extra: `<path d="M28 106q-2 6 2 8M100 106q2 6 -2 8" fill="none" stroke="${darken(c.body, 0.25)}" stroke-width="2"/>` + hiArc('M44 86q6 -10 16 -12', 4, 0.55),
      }),
      under: `<ellipse cx="108" cy="113" rx="9" ry="3" fill="#7fd3ff" fill-opacity="0.7"/>`,
      face: { x: 64, y: 94, s: 0.92, gap: 13, mouthDy: 10, headTopY: 70 },
      headTop: [64, 62],
      shadowRx: 50,
      feetX: [],
      bandage: [36, 88],
    };
  },
  /** ST退退退：伸手推开、往后退的小人 */
  backpedal(c) {
    const palm = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${c.body}" stroke="${INK}" stroke-width="3"/>` + line(`M${x - 4} ${y - 5}l-2 -4M${x - 1} ${y - 6}l-1 -4M${x + 2} ${y - 6}l1 -4`, INK, 2.2);
    const body = shape(smoothClosed([[66, 50], [82, 56], [90, 78], [96, 104], [82, 114], [48, 114], [34, 104], [42, 78], [50, 56]]), {
      fill: c.body,
      extra: hiArc('M48 72q2 -10 10 -14', 4, 0.55),
    });
    const dust = [[22, 110, 6], [12, 104, 4.5], [30, 104, 3.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#e8e0f0" stroke="${INK}" stroke-width="2"/>`).join('');
    return {
      under: dust,
      body: merge(body, frag(arm(42, 84, 18, 74, c.body, false) + arm(44, 96, 20, 98, c.body, false) + palm(16, 74) + palm(18, 98))),
      top:
        line('M86 30Q104 24 112 40', INK, 7) + line('M86 30Q104 24 112 40', '#ff7a7a', 3.5) +
        `<path d="M104 40L114 48L117 35Z" fill="#ff7a7a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
        line('M100 70h10M102 80h12', INK, 3, ' stroke-opacity="0.35"'),
      face: { x: 66, y: 80, s: 0.95, gap: 13, sweatSide: -1, headTopY: 50 },
      headTop: [66, 40],
      shadowRx: 34,
      feetX: [52, 82],
    };
  },
};
