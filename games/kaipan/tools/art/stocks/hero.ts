/** 股票小人：精做 6 只的身体配方。 */
import type { FaceStyle } from '../lib/face.ts';
import {
  INK, darken, ellipseD, frag, grained, hiArc, lighten, merge, nid, rrectD, shape, smoothClosed,
} from '../lib/svg.ts';
import { GROUND, type Colors, type Built, type Pt, line, arm, feet, crown, tie, boltMark, leaf } from './shared.ts';

export const HERO_BODIES: Record<string, (c: Colors) => Built> = {
  /** 韭菜芯片：长着韭菜头发的芯片，龙头戴皇冠 */
  leekchip(c) {
    const gid = nid('leek');
    const leekGrad = `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="0" y2="30"><stop offset="0" stop-color="#f1fbe2"/><stop offset="0.35" stop-color="#bfe98f"/><stop offset="1" stop-color="${c.accent}"/></linearGradient>`;
    const blades: [number, number, number, number, number][] = [
      [47, 16, 26, 9, -8],
      [53, 30, 10, 9, -6],
      [60, 50, 3, 9, -3],
      [67, 74, 4, 9, 3],
      [74, 96, 12, 9, 6],
      [80, 112, 30, 9, 9],
      [57, 40, 20, 8, -2],
      [71, 86, 22, 8, 2],
    ];
    let leeks = '';
    for (const [bx, tx, ty, w, b] of blades) {
      const d = leaf(bx, 52, tx, ty, w, b);
      leeks += `<path d="${d}" fill="url(#${gid})" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
      leeks += `<path d="M${bx} 48L${(bx * 0.6 + tx * 0.4).toFixed(1)} ${(52 * 0.6 + ty * 0.4).toFixed(1)}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round"/>`;
    }
    const pins = (() => {
      let s = '';
      for (const y of [62, 78, 94]) {
        s += `<rect x="18" y="${y - 3.5}" width="14" height="7" rx="2" fill="${c.trim}" stroke="${INK}" stroke-width="3"/>`;
        s += `<rect x="96" y="${y - 3.5}" width="14" height="7" rx="2" fill="${c.trim}" stroke="${INK}" stroke-width="3"/>`;
      }
      for (const x of [46, 64, 82]) s += `<rect x="${x - 4}" y="102" width="8" height="14" rx="2.5" fill="${c.trim}" stroke="${INK}" stroke-width="3"/>`;
      return s;
    })();
    const chipD = rrectD(28, 46, 72, 62, 12);
    const chip = shape(chipD, {
      fill: c.body,
      extra:
        `<rect x="39" y="57" width="50" height="41" rx="9" fill="#d8f4ff" stroke="${darken(c.body, 0.3)}" stroke-width="2.5"/>` +
        line('M33 54h5v5M95 54h-5v5M33 101h5v-5M95 101h-5v-5', c.trim, 2.2) +
        `<circle cx="33" cy="54" r="1.8" fill="${c.trim}"/><circle cx="95" cy="54" r="1.8" fill="${c.trim}"/>` +
        hiArc('M34 60q0 -8 8 -9', 3, 0.5),
    });
    const body = merge(frag(leeks, new Map([[gid, leekGrad]])), frag(pins), chip);
    return {
      body: grained(body),
      acc: crown(64, 44, 0.95, -6),
      face: { x: 64, y: 76, s: 1, gap: 13, mouthDy: 11, headTopY: 46 },
      shadowRx: 40,
      anchors: { headTop: [64, 6] },
    };
  },

  /** 躺平银行：趴在枕头上的金色存钱猪，大脑袋在左，身子躺平向右，领带松垮 */
  lazypiggy(c) {
    const pillow = shape('M4 104Q4 92 18 92H62Q74 92 74 104Q74 116 62 116H18Q4 116 4 104Z', { fill: '#cfe3ff', sw: 3.2 });
    const pillowLines = line('M14 100q6 3 12 0M50 110q6 3 12 0', '#9fbde8', 2);
    const legs =
      `<rect x="100" y="98" width="12" height="15" rx="5" fill="${darken(c.body, 0.12)}" stroke="${INK}" stroke-width="3.2" transform="rotate(-35 106 106)"/>` +
      `<rect x="84" y="102" width="12" height="13" rx="5" fill="${darken(c.body, 0.12)}" stroke="${INK}" stroke-width="3.2" transform="rotate(-12 90 108)"/>`;
    const tail = line('M117 82q8 -4 5 -10q-3 -4 -6 0q-2 4 4 6', INK, 6) + line('M117 82q8 -4 5 -10q-3 -4 -6 0q-2 4 4 6', c.body, 2.5);
    const bodyMain = shape(ellipseD(84, 90, 36, 22), {
      fill: c.body,
      extra: `<rect x="80" y="69" width="20" height="4.5" rx="2.25" fill="${INK}" transform="rotate(8 90 71)"/>` + hiArc('M104 76q6 2 8 6', 3, 0.45),
    });
    const coin = `<g transform="rotate(8 90 71)"><path d="M81 70.5a9 9 0 0 1 18 0z" fill="#fff0a0" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M90 64.5v4" stroke="#e0a020" stroke-width="2" stroke-linecap="round"/></g>`;
    const earL = shape('M22 62Q14 44 30 48Q36 52 34 60Z', { fill: c.body, sw: 3.2, shadeOffset: [2, -2] });
    const earR = shape('M62 60Q66 44 52 46Q46 50 48 58Z', { fill: c.body, sw: 3.2, shadeOffset: [-2, -2] });
    const head = shape(ellipseD(42, 80, 31, 28), { fill: c.body, extra: hiArc('M18 74q2 -12 12 -18', 4, 0.6) });
    const snout = `<ellipse cx="42" cy="91" rx="10.5" ry="7.5" fill="${c.accent}" stroke="${INK}" stroke-width="3"/><ellipse cx="38.3" cy="91" rx="2" ry="3" fill="${INK}"/><ellipse cx="45.7" cy="91" rx="2" ry="3" fill="${INK}"/>`;
    const body = merge(pillow, frag(pillowLines + legs + tail), bodyMain, frag(coin), earL, earR, head, frag(snout));
    return {
      body: grained(body),
      acc: tie(76, 96, c.trim, 0.8, -55, false),
      face: { x: 42, y: 76, s: 1.02, gap: 13, mouthDy: 25, eyeKind: 'sleepy', sweatSide: 1, headTopY: 52 },
      shadowRx: 52,
      anchors: { headTop: [42, 40] },
    };
  },

  /** 国民辣条：波浪边的红辣条，常戴墨镜，打领带 */
  latiao(c) {
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i <= 13; i++) {
      const y = 16 + i * 7.3;
      const bend = 5 * Math.sin(((y - 16) / 96) * Math.PI * 1.6);
      const ruff = i % 2 === 0 ? 0 : 2.6;
      left.push([41 + bend - ruff, y]);
      right.push([87 + bend + ruff, y]);
    }
    const pts: Pt[] = [[64, 11], ...right, [70, 114], [58, 114], ...left.reverse()];
    const d = smoothClosed(pts, 0.9);
    // 辣椒碎、芝麻、油光
    let deco = '';
    const flakes: Pt[] = [[50, 30], [76, 34], [52, 86], [80, 92], [60, 100], [47, 64], [82, 58]];
    for (const [x, y] of flakes) deco += `<path d="M${x} ${y}l3 -2 2 3 -3 2z" fill="#9e1f12"/>`;
    const seeds: Pt[] = [[70, 24], [56, 40], [78, 74], [50, 100], [72, 104]];
    for (const [x, y] of seeds) deco += `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="1.4" fill="#fff1c9" stroke="#b5651d" stroke-width="0.6" transform="rotate(${(x * 7) % 60 - 30} ${x} ${y})"/>`;
    deco += hiArc('M47 26q-2 10 0 18', 3.2, 0.6) + hiArc('M50 76q-2 8 -1 14', 2.6, 0.45);
    deco += `<path d="M58 20q6 30 2 80" stroke="${c.accent}" stroke-opacity="0.5" stroke-width="6" stroke-linecap="round" fill="none"/>`;
    const strip = shape(d, { fill: c.body, extra: deco });
    const limbs = arm(44, 78, 30, 90, c.body) + arm(84, 76, 99, 66, c.body) + feet([56, 74], c.body);
    return {
      body: grained(merge(frag(limbs), strip)),
      acc: tie(64, 73, c.trim, 0.85),
      face: { x: 64, y: 48, s: 1, gap: 12, mouthDy: 13, eyeKind: 'shades', headTopY: 12 },
      shadowRx: 30,
      anchors: { headTop: [64, 10] },
    };
  },

  /** 永动机能源：仓鼠跑轮。轮子单独成层（spin），可以绕轴转 */
  hamsterwheel(c) {
    const cx = 64;
    const cy = 58;
    const stand =
      line(`M${cx} ${cy}L36 ${GROUND - 2}M${cx} ${cy}L92 ${GROUND - 2}`, INK, 10) +
      line(`M${cx} ${cy}L36 ${GROUND - 2}M${cx} ${cy}L92 ${GROUND - 2}`, darken(c.accent, 0.25), 4.5) +
      `<rect x="26" y="${GROUND - 6}" width="76" height="7" rx="3.5" fill="${darken(c.accent, 0.3)}" stroke="${INK}" stroke-width="3"/>`;
    // 电源线和插头
    const cable =
      line(`M96 ${GROUND - 3}q14 -2 16 -14t8 -12`, INK, 5) + line(`M96 ${GROUND - 3}q14 -2 16 -14t8 -12`, '#5a5f73', 2) +
      `<rect x="114" y="80" width="10" height="9" rx="2" fill="#ffd23f" stroke="${INK}" stroke-width="2.4" transform="rotate(-30 119 84)"/>` +
      line('M117 78l-1 -5M122 81l1 -5', INK, 2.4);
    let wheel = '';
    const R = 47;
    const r = 40;
    wheel += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${INK}" stroke-width="${R - r + 4.5}"/>`;
    wheel += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${c.accent}" stroke-width="${R - r - 1}"/>`;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const x1 = cx + Math.cos(a) * (r + 1);
      const y1 = cy + Math.sin(a) * (r + 1);
      const x2 = cx + Math.cos(a) * (R - 1);
      const y2 = cy + Math.sin(a) * (R - 1);
      wheel += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${darken(c.accent, 0.35)}" stroke-width="2"/>`;
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      wheel += line(`M${cx} ${cy}L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`, INK, 5) +
        line(`M${cx} ${cy}L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`, '#e8eef7', 2);
    }
    // 轮辋上两枚闪电贴纸
    for (const a of [-0.9, 2.2]) {
      const x = cx + Math.cos(a) * ((R + r) / 2);
      const y = cy + Math.sin(a) * ((R + r) / 2);
      wheel += `<path d="M${x + 1} ${y - 6}l-4 6h3l-2 6 5 -7h-3l2 -5z" fill="#ffe14a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
    wheel += `<circle cx="${cx}" cy="${cy}" r="7" fill="#ffd23f" stroke="${INK}" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="2" fill="${INK}"/>`;
    wheel += hiArc(`M${cx - 40} ${cy - 28}q14 -20 36 -22`, 2.6, 0.55);

    // 仓鼠
    const hx = 64;
    const hy = 75;
    const k = 1.32;
    const sc = (inner: string) => `<g transform="translate(${hx} ${hy}) scale(${k}) translate(${-hx} ${-hy})">${inner}</g>`;
    const ears =
      `<circle cx="${hx - 19}" cy="${hy - 18}" r="7.5" fill="${c.body}" stroke="${INK}" stroke-width="3.2"/><circle cx="${hx - 19}" cy="${hy - 18}" r="3.8" fill="#ffb3c0"/>` +
      `<circle cx="${hx + 19}" cy="${hy - 18}" r="7.5" fill="${c.body}" stroke="${INK}" stroke-width="3.2"/><circle cx="${hx + 19}" cy="${hy - 18}" r="3.8" fill="#ffb3c0"/>`;
    const legs =
      `<ellipse cx="${hx - 15}" cy="104" rx="7" ry="4.5" fill="#ffb3c0" stroke="${INK}" stroke-width="2.8" transform="rotate(-20 ${hx - 15} 104)"/>` +
      `<ellipse cx="${hx + 18}" cy="101" rx="7" ry="4.5" fill="#ffb3c0" stroke="${INK}" stroke-width="2.8" transform="rotate(25 ${hx + 18} 101)"/>`;
    const hamD = smoothClosed([
      [hx, hy - 22], [hx + 20, hy - 18], [hx + 28, hy - 2], [hx + 24, hy + 15], [hx, hy + 21], [hx - 24, hy + 15], [hx - 28, hy - 2], [hx - 20, hy - 18],
    ]);
    const ham = shape(hamD, {
      fill: c.body,
      extra:
        `<path d="M${hx - 16} ${hy + 4}q16 -12 32 0q2 14 -16 16q-18 -2 -16 -16z" fill="${c.trim}"/>` +
        `<path d="M${hx - 3} ${hy - 21}q3 6 6 0" fill="none" stroke="${darken(c.body, 0.2)}" stroke-width="2.4" stroke-linecap="round"/>` +
        hiArc(`M${hx - 20} ${hy - 8}q2 -8 9 -11`, 3, 0.6),
    });
    const paws = `<ellipse cx="${hx - 8}" cy="${hy + 10}" rx="4" ry="3" fill="#ffb3c0" stroke="${INK}" stroke-width="2.4"/><ellipse cx="${hx + 8}" cy="${hy + 10}" rx="4" ry="3" fill="#ffb3c0" stroke="${INK}" stroke-width="2.4"/>`;
    const face: FaceStyle = { x: hx, y: hy - 6 * k, s: 0.9 * k, gap: 12, mouthDy: 9, headTopY: 8, markDy: -15 };
    // 跑动的速度线
    const speed = line('M4 100h8M2 108h10M6 92h6', INK, 3, ' stroke-opacity="0.35"');
    return {
      back: grained(frag(stand + cable)),
      spin: grained(frag(wheel)),
      body: grained(merge(frag(sc(legs + ears)), frag(sc(ham.content), ham.defs), frag(sc(paws) + speed))),
      mark: boltMark(face),
      face,
      shadowRx: 46,
      anchors: { headTop: [64, 6], spin: [cx, cy] },
    };
  },

  /** 二师兄牧业：Q 版小猪，大耳朵，扛着小钉耙，龙头戴皇冠 */
  bajie(c) {
    const rake =
      line('M92 112L108 24', INK, 7) + line('M92 112L108 24', c.trim, 3.2) +
      `<g transform="rotate(10 108 22)"><rect x="93" y="16" width="30" height="8" rx="3" fill="#cfd8e6" stroke="${INK}" stroke-width="2.8"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<path d="M${95 + i * 3.25} 24v6" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`).join('') +
      `</g>`;
    const earL = shape('M40 56C26 50 16 58 18 74C28 74 38 68 46 60Z', { fill: c.body, sw: 3.4, shadeOffset: [2, -3] });
    const earR = shape('M88 56C102 50 112 58 110 74C100 74 90 68 82 60Z', { fill: c.body, sw: 3.4, shadeOffset: [-2, -3] });
    const earIn = `<path d="M38 60C30 58 24 62 24 69C30 68 36 65 41 61Z" fill="${c.accent}" fill-opacity="0.55"/><path d="M90 60C98 58 104 62 104 69C98 68 92 65 87 61Z" fill="${c.accent}" fill-opacity="0.55"/>`;
    const bodyD = ellipseD(64, 80, 38, 34);
    const main = shape(bodyD, {
      fill: c.body,
      extra:
        `<ellipse cx="64" cy="103" rx="20" ry="9" fill="${lighten(c.body, 0.35)}"/>` +
        `<path d="M50 52q14 -6 28 0" fill="none" stroke="${darken(c.body, 0.15)}" stroke-width="2.4" stroke-linecap="round"/>` +
        hiArc('M34 72q2 -14 14 -20', 4, 0.6),
    });
    const snout =
      `<ellipse cx="64" cy="87" rx="12" ry="8.5" fill="${c.accent}" stroke="${INK}" stroke-width="3"/>` +
      `<ellipse cx="59.5" cy="87" rx="2.2" ry="3.2" fill="${INK}"/><ellipse cx="68.5" cy="87" rx="2.2" ry="3.2" fill="${INK}"/>` +
      hiArc('M57 82q4 -2 8 -1', 1.8, 0.6);
    return {
      back: frag(rake),
      body: grained(merge(earL, earR, frag(earIn + feet([48, 80], c.accent)), main, frag(snout + arm(94, 86, 101, 82, c.body)))),
      acc: crown(64, 44, 1, 4),
      face: { x: 64, y: 72, s: 1, gap: 16, mouthDy: 26, headTopY: 46 },
      shadowRx: 42,
      anchors: { headTop: [64, 26] },
    };
  },

  /** 量子波动：抖动的果冻原子，带色散残影与轨道 */
  quantumjelly(c) {
    const pts: Pt[] = [
      [64, 38], [84, 42], [97, 56], [101, 78], [103, 98], [95, 111], [64, 114], [33, 111], [25, 98], [27, 78], [31, 56], [44, 42],
    ];
    const d = smoothClosed(pts);
    const ghost =
      `<path d="${d}" transform="translate(-5 1)" fill="none" stroke="${c.accent}" stroke-width="3.5" stroke-opacity="0.85"/>` +
      `<path d="${d}" transform="translate(5 -1)" fill="none" stroke="${c.trim}" stroke-width="3.5" stroke-opacity="0.85"/>`;
    const waves = line('M8 64q3 -4 6 0t6 0M108 52q3 -4 6 0t6 0M112 70q3 -4 6 0', c.accent, 2.6);
    const ring = (rot: number, half: 'back' | 'front') => {
      const path = half === 'back' ? 'M-58 0A58 15 0 0 1 58 0' : 'M-58 0A58 15 0 0 0 58 0';
      return `<g transform="translate(64 88) rotate(${rot})">${line(path, INK, 6.5)}${line(path, half === 'back' ? darken(c.accent, 0.1) : c.accent, 3)}</g>`;
    };
    const electron = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="5" fill="${c.trim}" stroke="${INK}" stroke-width="2.6"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.5" fill="#ffffff"/>`;
    const gid = nid('jelly');
    const grad = `<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="56" cy="62" r="56"><stop offset="0" stop-color="${lighten(c.body, 0.55)}"/><stop offset="0.6" stop-color="${c.body}"/><stop offset="1" stop-color="${darken(c.body, 0.15)}"/></radialGradient>`;
    const jelly = shape(d, {
      fill: `url(#${gid})`,
      shade: darken(c.body, 0.25),
      extra:
        `<circle cx="84" cy="96" r="4" fill="#ffffff" fill-opacity="0.35"/><circle cx="44" cy="100" r="2.6" fill="#ffffff" fill-opacity="0.35"/><circle cx="90" cy="70" r="2" fill="#ffffff" fill-opacity="0.4"/>` +
        hiArc('M38 60q4 -12 16 -16', 5, 0.75) + hiArc('M34 74l0 4', 4, 0.6),
    });
    jelly.defs.set(gid, grad);
    return {
      back: frag(ghost + waves + ring(16, 'back') + ring(-16, 'back') + electron(110, 74)),
      body: grained(jelly),
      mark: undefined,
      acc: frag(ring(16, 'front') + ring(-16, 'front') + electron(28, 110) + electron(104, 104)),
      face: { x: 64, y: 70, s: 1, gap: 14, mouthDy: 11, headTopY: 40 },
      shadowRx: 42,
      anchors: { headTop: [64, 34] },
    };
  },
};
