/** 股票小人：名字梗剪影配方（下半）。 */
import {
  INK, SW, darken, ellipseD, frag, hiArc, lighten, merge, nid, rrectD, shape, smoothClosed, sparkleD,
} from '../lib/svg.ts';
import { type Colors, type Recipe, line, leaf, bumpsD } from './shared.ts';

export const RECIPES_B: Record<string, (c: Colors) => Recipe> = {
  // ------------------------------------------------------------ 0.3.0 新增 14 只
  /** 稳稳算力云：一朵大白云坐在机柜上，白马打领带 */
  cloudrack(c) {
    const cloud = shape(
      bumpsD([[24, 88], [14, 66], [28, 44], [50, 30], [78, 28], [101, 40], [114, 64], [104, 88, 2.2]]),
      {
        fill: c.body,
        shade: lighten(c.accent, 0.62),
        shadeOffset: [-4, -6],
        extra: hiArc('M26 60q4 -12 16 -16', 4, 0.9) + hiArc('M58 36q8 -4 16 -2', 3, 0.8),
      },
    );
    const rack = shape(rrectD(32, 80, 64, 32, 6), {
      fill: c.accent,
      extra:
        line('M36 92H92M36 102H92', darken(c.accent, 0.4), 2.4) +
        [[84, 87], [90, 87], [84, 97], [90, 97], [84, 107]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${['#7dff8a', '#ffe14a', '#7dff8a', '#7dff8a', '#5ee0ff'][i]}"/>`).join('') +
        line('M40 87h12M40 97h12M40 107h12', lighten(c.accent, 0.5), 2),
    });
    const sparks = `<path d="${sparkleD(112, 22, 5.5)}" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/><path d="${sparkleD(16, 30, 4)}" fill="#dff7ff" stroke="${INK}" stroke-width="1.5"/>`;
    return {
      body: merge(rack, cloud),
      top: sparks,
      face: { x: 64, y: 60, s: 1.02, gap: 15, headTopY: 30 },
      headTop: [64, 24],
      shadowRx: 42,
      armL: [[22, 74], [10, 86]],
      armR: [[106, 74], [118, 86]],
      feetX: [48, 80],
      tie: [64, 82, 0.8],
    };
  },
  /** 提示词工坊：对话气泡，肚子上是一行带光标的输入框 */
  promptbubble(c) {
    const d = 'M46 34H84Q104 34 104 54V78Q104 98 84 98H54L36 110L40 97Q24 94 24 78V54Q24 34 46 34Z';
    const bubble = shape(d, {
      fill: c.body,
      extra:
        `<rect x="34" y="76" width="60" height="16" rx="6" fill="#ffffff" stroke="${darken(c.body, 0.35)}" stroke-width="2.2"/>` +
        line('M39 80l4 4 -4 4', darken(c.body, 0.45), 2.4) + `<rect x="47" y="79" width="3" height="10" rx="1" fill="${INK}"/>` +
        line('M55 84h10M69 84h6M79 84h8', '#c8d6e6', 2.4) +
        hiArc('M30 54q2 -12 14 -14', 3.5, 0.6),
    });
    const legs = line('M56 98V110M74 98V110', INK, 11) + line('M56 98V110M74 98V110', c.body, 4.5);
    const dots = [44, 56, 68].map((x, i) => `<circle cx="${x}" cy="22" r="${3.4 - i * 0.4}" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`).join('');
    return {
      under: legs,
      body: bubble,
      top: dots + `<path d="${sparkleD(18, 30, 5)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.6"/>`,
      face: { x: 64, y: 58, s: 0.95, gap: 13, mouthDy: 10, headTopY: 34 },
      headTop: [64, 16],
      shadowRx: 34,
      armL: [[28, 72], [16, 82]],
      armR: [[100, 70], [110, 70]],
      feetX: [56, 74],
      flag: { x: 110, y: 66, dir: -1, w: 24 },
      scale: 0.86,
    };
  },
  /** 老实电池：敦实的圆柱电池，正极帽 + 腰带上的加号和叶子，白马打领带 */
  cellbattery(c) {
    const cid = nid('cell');
    const bodyD = 'M32 36V104A32 9 0 0 0 96 104V36A32 9 0 0 1 32 36Z';
    const band = 'M32 82A32 9 0 0 0 96 82V104A32 9 0 0 1 32 104Z';
    const cell = shape(bodyD, {
      fill: c.body,
      extra:
        `<clipPath id="${cid}"><path d="${bodyD}"/></clipPath><g clip-path="url(#${cid})"><path d="${band}" fill="#fff4d6"/><path d="M32 104A32 9 0 0 0 96 104V116H32Z" fill="#e8d9b0"/></g>` +
        line('M32 82A32 9 0 0 0 96 82', INK, 2.6) +
        `<path d="M40 92h8M44 88v8" stroke="${darken(c.body, 0.35)}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="${leaf(86, 100, 84, 86, 7, -3)}" fill="${c.body}" stroke="${INK}" stroke-width="1.8"/>` +
        hiArc('M39 46V74', 4, 0.55) + hiArc('M88 50v10', 3, 0.35),
    });
    const top = `<ellipse cx="64" cy="36" rx="32" ry="9" fill="${lighten(c.body, 0.3)}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M54 36V27A10 3 0 0 1 74 27V36A10 3 0 0 1 54 36Z" fill="#dfe6f0" stroke="${INK}" stroke-width="3"/><ellipse cx="64" cy="27" rx="10" ry="3" fill="#ffffff" stroke="${INK}" stroke-width="2.6"/>`;
    return {
      body: merge(cell, frag(top)),
      face: { x: 64, y: 60, s: 1, gap: 14, headTopY: 30 },
      headTop: [64, 20],
      shadowRx: 36,
      armL: [[34, 70], [22, 82]],
      armR: [[94, 70], [106, 82]],
      feetX: [50, 78],
      tie: [64, 78, 0.8],
    };
  },
  /** 风车转转：头顶插着彩色纸风车的小豆子，风车单独成层会转 */
  pinwheel(c) {
    const cols = ['#ffd23f', '#ff7a9a', '#5ee0ff', '#ffffff'];
    let blades = '';
    for (let i = 0; i < 4; i++) {
      blades += `<g transform="translate(64 28) rotate(${i * 90})"><path d="M0 0L-3 -24Q12 -24 20 -9Z" fill="${cols[i]}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M0 0L13 -15" stroke="${INK}" stroke-opacity="0.25" stroke-width="1.6"/></g>`;
    }
    blades += `<circle cx="64" cy="28" r="4" fill="#ff5d7a" stroke="${INK}" stroke-width="2.2"/>`;
    const stick = line('M64 30V68', INK, 7) + line('M64 30V68', '#e8d2a8', 3);
    const bean = shape(smoothClosed([[64, 60], [86, 64], [96, 84], [92, 104], [64, 112], [36, 104], [32, 84], [42, 64]]), {
      fill: c.body,
      extra: hiArc('M42 78q2 -9 10 -12', 3.5, 0.6),
    });
    const breeze = line('M100 30q8 -4 14 0M104 40q6 -3 12 0', '#9fd8ff', 2.6);
    return {
      under: stick,
      spin: blades,
      spinAt: [64, 28],
      body: bean,
      top: breeze,
      face: { x: 64, y: 84, s: 0.95, gap: 13, headTopY: 60 },
      headTop: [64, 2],
      shadowRx: 30,
      armL: [[38, 90], [26, 100]],
      armR: [[90, 90], [104, 84]],
      feetX: [52, 76],
      flag: { x: 104, y: 84, dir: 1, w: 20 },
      scale: 0.86,
    };
  },
  /** 螺蛳粉工厂：一碗红油螺蛳粉，碗边竖着冒绿烟的小烟囱 */
  noodlebowl(c) {
    const fume = (x: number, y: number, r: number) =>
      `<path d="${bumpsD([[x - r, y + r * 0.5], [x - r * 0.6, y - r * 0.6], [x + r * 0.5, y - r * 0.7], [x + r, y + r * 0.4], [x, y + r * 0.9, 1.2]])}" fill="#c6e07a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    const chimney =
      `<rect x="88" y="30" width="16" height="40" fill="#c8553e" stroke="${INK}" stroke-width="3"/>` +
      line('M88 40h16M88 50h16M88 60h16M96 30v10M93 40v10M99 50v10M95 60v10', '#8a3226', 1.6) +
      `<rect x="85" y="26" width="22" height="7" rx="2" fill="#a8463a" stroke="${INK}" stroke-width="2.6"/>` +
      fume(98, 16, 7) + fume(112, 8, 6) + fume(86, 8, 4.5) +
      line('M110 22q2 3 0 6M118 18q2 3 0 6', '#7aa83a', 1.8);
    const soup = `<ellipse cx="64" cy="66" rx="48" ry="11" fill="#e8553e" stroke="${INK}" stroke-width="3.2"/>` +
      line('M28 66q6 -5 12 0t12 0M50 70q6 -5 12 0t12 0M72 64q6 -5 12 0t12 0', '#fff1c9', 3) +
      [[40, 62], [84, 70], [62, 61]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="2.2" fill="#e0a860" stroke="${INK}" stroke-width="1.3"/>`).join('') +
      `<rect x="70" y="58" width="9" height="4" rx="1" fill="#f6e08a" stroke="${INK}" stroke-width="1.2" transform="rotate(-15 74 60)"/>` +
      `<circle cx="32" cy="68" r="2.6" fill="#5fb84a" stroke="${INK}" stroke-width="1.2"/><circle cx="96" cy="64" r="2.6" fill="#5fb84a" stroke="${INK}" stroke-width="1.2"/>` +
      `<circle cx="52" cy="62" r="2.4" fill="none" stroke="#b81f12" stroke-width="1.6"/>`;
    const bowl = shape('M16 66A48 11 0 0 0 112 66Q112 102 74 108H54Q16 102 16 66Z', {
      fill: c.body,
      extra: [36, 50, 64, 78, 92].map((x) => `<circle cx="${x}" cy="${x === 36 || x === 92 ? 96 : 101}" r="2.2" fill="#ffffff" fill-opacity="0.8"/>`).join('') + hiArc('M24 80q4 12 12 18', 3.5, 0.5),
    });
    const foot = `<rect x="46" y="104" width="36" height="9" rx="3" fill="${darken(c.body, 0.25)}" stroke="${INK}" stroke-width="3"/>`;
    return {
      back: chimney,
      under: foot,
      body: merge(frag(soup), bowl),
      face: { x: 64, y: 86, s: 0.9, gap: 13, mouthDy: 10, headTopY: 56 },
      headTop: [64, 8],
      shadowRx: 42,
      armL: [[20, 82], [8, 92]],
      armR: [[108, 82], [120, 92]],
      feetX: [50, 78],
      flag: { x: 34, y: 64, dir: -1, stick: true, w: 22 },
      scale: 0.86,
    };
  },
  /** 云养猫：一朵猫形的云，猫耳 + 胡须 + 云尾巴，小旗插在头顶 */
  cloudcat(c) {
    const ears =
      `<path d="M36 52L40 26L60 44Z" fill="${c.body}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><path d="M41 46L43 33L53 43Z" fill="${c.accent}"/>` +
      `<path d="M92 52L88 26L68 44Z" fill="${c.body}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><path d="M87 46L85 33L75 43Z" fill="${c.accent}"/>`;
    const tail = line('M100 92Q122 92 118 70Q116 60 108 62', INK, 13) + line('M100 92Q122 92 118 70Q116 60 108 62', c.body, 7) +
      `<circle cx="108" cy="62" r="6" fill="${c.body}" stroke="${INK}" stroke-width="3"/>` + line('M117 78h-6M118 70h-6', c.accent, 2.4);
    const cloud = shape(bumpsD([[28, 98], [20, 76], [30, 54], [52, 42], [76, 42], [98, 54], [108, 76], [100, 98, 1.6]]), {
      fill: c.body,
      shade: '#e4dcef',
      shadeOffset: [-4, -6],
      extra:
        line('M58 50l2 6M64 48v7M70 50l-2 6', c.accent, 2.6) +
        line('M24 74l12 2M24 84l12 -1M104 74l-12 2M104 84l-12 -1', INK, 1.8, ' stroke-opacity="0.7"') +
        `<ellipse cx="52" cy="98" rx="7" ry="4.5" fill="#ffffff" stroke="${INK}" stroke-width="2.2"/><ellipse cx="76" cy="98" rx="7" ry="4.5" fill="#ffffff" stroke="${INK}" stroke-width="2.2"/>` +
        hiArc('M30 70q2 -12 14 -18', 4, 0.9),
    });
    const puffs = [[36, 110, 6], [62, 113, 7], [90, 110, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#eef6ff" stroke="${INK}" stroke-width="2" stroke-opacity="0.6"/>`).join('');
    const heart = `<path d="M20 32C14 27 14 23 17 22C18.6 21.4 19.6 22.4 20 23.4C20.4 22.4 21.4 21.4 23 22C26 23 26 27 20 32Z" fill="#ff7a9a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
    return {
      under: puffs + tail + ears,
      body: cloud,
      top: heart,
      face: { x: 64, y: 74, s: 0.95, gap: 13, headTopY: 44 },
      headTop: [64, 22],
      shadowRx: 34,
      feetX: [],
      flag: { x: 66, y: 46, dir: 1, stick: true, w: 22 },
      scale: 0.86,
    };
  },
  /** 护发生发：亮闪闪的光头，头顶冒出三根新头发，滴管在上面滴生发水，披着理发围布 */
  baldsprout(c) {
    const head = shape(ellipseD(64, 80, 32, 31), {
      fill: c.body,
      shade: darken(c.body, 0.12),
      extra: hiArc('M40 66q4 -14 18 -18', 5, 0.95) + `<path d="${sparkleD(46, 56, 5)}" fill="#ffffff"/>`,
    });
    const hairs =
      line('M58 50Q52 40 58 32', INK, 3) + line('M64 49Q66 36 74 30', INK, 3) + line('M70 51Q76 44 84 44', INK, 3) +
      `<path d="${leaf(74, 30, 82, 22, 6, -2)}" fill="#7ad86a" stroke="${INK}" stroke-width="1.8"/>`;
    const dropper =
      `<g transform="translate(30 20) rotate(40)"><rect x="-6" y="-10" width="12" height="16" rx="3" fill="${c.accent}" stroke="${INK}" stroke-width="2.4"/>` +
      `<path d="M-4 -10V-15Q0 -21 4 -15V-10Z" fill="#ff7a9a" stroke="${INK}" stroke-width="2.2"/><path d="M-1.6 6V14H1.6V6Z" fill="#eaf8ff" stroke="${INK}" stroke-width="1.8"/></g>` +
      `<path d="M44 36q-3 4 -3 6a3 3 0 0 0 6 0q0 -2 -3 -6z" fill="${lighten(c.accent, 0.3)}" stroke="${INK}" stroke-width="1.6"/>`;
    const cape = shape('M32 96Q64 112 96 96L102 112Q64 120 26 112Z', { fill: c.accent, sw: 3.2, extra: line('M44 104l-2 8M64 108v6M84 104l2 8', lighten(c.accent, 0.45), 2) });
    return {
      body: merge(head, frag(hairs), cape),
      top: dropper,
      face: { x: 64, y: 80, s: 0.95, gap: 13, headTopY: 50 },
      headTop: [64, 20],
      shadowRx: 34,
      armL: [[34, 100], [22, 106]],
      armR: [[94, 100], [104, 90]],
      feetX: [50, 78],
      flag: { x: 104, y: 90, dir: 1, w: 20 },
      scale: 0.86,
    };
  },
  /** 理财小课堂：戴学士帽的金色小团子，左手教鞭指着身后的上涨曲线黑板 */
  classroom(c) {
    const board =
      `<path d="M14 62L8 84M60 62L66 84" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M14 62L8 84M60 62L66 84" stroke="#b8773a" stroke-width="2.6" stroke-linecap="round"/>` +
      `<rect x="4" y="14" width="66" height="50" rx="5" fill="#b8773a" stroke="${INK}" stroke-width="3.2"/>` +
      `<rect x="10" y="20" width="54" height="38" rx="2" fill="#2f5d4a"/>` +
      line('M15 50L26 42L35 46L48 30L58 25', '#ffffff', 2.6) + line('M51 24L58 25L56 32', '#ffffff', 2.6) +
      line('M14 54H60', '#ffffff', 1.2, ' stroke-opacity="0.5"') +
      `<circle cx="20" cy="27" r="2" fill="#ffd23f"/><circle cx="27" cy="27" r="2" fill="#ffd23f"/>`;
    const blob = shape(ellipseD(70, 88, 29, 25), { fill: c.body, extra: hiArc('M48 82q2 -10 10 -14', 3.5, 0.6) });
    const cap =
      `<rect x="57" y="58" width="26" height="9" rx="2" fill="#2f3b80" stroke="${INK}" stroke-width="2.6"/>` +
      `<path d="M48 58L70 49L92 58L70 66Z" fill="#3b4aa0" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>` +
      line('M70 58L88 61V72', '#ffd23f', 2.2) + `<circle cx="88" cy="73" r="2.6" fill="#ffd23f" stroke="${INK}" stroke-width="1.4"/>`;
    const pointer = line('M36 76L52 38', INK, 5) + line('M36 76L52 38', '#e8c48a', 2.2) + `<circle cx="52" cy="38" r="2.2" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/>`;
    return {
      back: board,
      body: blob,
      top: cap + pointer,
      face: { x: 70, y: 88, s: 0.9, gap: 12, mouthDy: 10, headTopY: 62 },
      headTop: [70, 48],
      shadowRx: 30,
      shadowX: 70,
      armL: [[46, 90], [36, 78]],
      armR: [[96, 90], [108, 82]],
      feetX: [58, 82],
      flag: { x: 108, y: 82, dir: 1, w: 18 },
      scale: 0.86,
    };
  },
  /** 停机坪物业：楼顶画着 H 停机坪、竖着风向袋的小楼，白马打领带 */
  helipad(c) {
    const roof = `<path d="M18 46L30 26H98L110 46Z" fill="#7d849e" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>` +
      `<ellipse cx="64" cy="36" rx="27" ry="7" fill="none" stroke="#ffd23f" stroke-width="3"/>` +
      line('M55.5 31.5L54 40.5M72.5 31.5L74 40.5M54.8 36H73.2', '#ffffff', 3.2) +
      `<circle cx="27" cy="31" r="3" fill="#ff5d5d" stroke="${INK}" stroke-width="1.8"/>`;
    const sock = line('M102 30V8', INK, 4.5) + line('M102 30V8', '#cfd8e6', 1.8) +
      `<path d="M103 9L122 13L121 19L103 17Z" fill="#ff8a3d" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M110 10.5V18.3M116 12V18.8" stroke="#ffffff" stroke-width="2.4"/>`;
    const win = (x: number, y: number, lit: boolean) => `<rect x="${x}" y="${y}" width="10" height="9" rx="1.5" fill="${lit ? '#ffe68a' : '#dff4ff'}" stroke="${darken(c.body, 0.4)}" stroke-width="1.6"/>`;
    let wins = '';
    for (const [i, y] of [52, 65, 78, 91].entries()) wins += win(31, y, i === 1) + win(87, y, i === 2);
    const front = shape(rrectD(26, 46, 76, 66, 5), {
      fill: c.body,
      extra: wins + `<rect x="26" y="46" width="76" height="5" fill="${lighten(c.body, 0.35)}"/>` + hiArc('M45 56v8', 3, 0.5),
    });
    return {
      back: sock,
      body: merge(front, frag(roof)),
      face: { x: 64, y: 68, s: 0.98, gap: 13, headTopY: 34 },
      headTop: [64, 14],
      shadowRx: 44,
      armL: [[28, 80], [16, 92]],
      armR: [[100, 80], [112, 92]],
      feetX: [46, 82],
      tie: [64, 86, 0.8],
    };
  },
  /** 像素老厂：像素风锯齿屋顶的老厂房，烟囱冒方块烟，白马打领带 */
  pixelfactory(c) {
    const st = (x0: number, x1: number) => {
      // 锯齿屋顶的一齿：竖直上去，再一阶一阶下来
      let d = `L${x0} 36`;
      const steps = 4;
      const dx = (x1 - x0) / steps;
      for (let i = 1; i <= steps; i++) d += `H${x0 + dx * i}V${36 + 4 * i}`;
      return d;
    };
    const d = `M22 112V52${st(22, 50)}${st(50, 78)}${st(78, 106)}V112Z`;
    const chimney = `<path d="M90 52V18H102V52" fill="#8a7a9a" stroke="${INK}" stroke-width="3" stroke-linejoin="miter"/>` + line('M90 26H102M90 34H102', '#5a4a6a', 2) +
      [[96, 8, 7], [106, 0, 6], [86, 2, 5]].map(([x, y, s]) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#e2dcef" stroke="${INK}" stroke-width="2"/>`).join('');
    const pix = (x: number, y: number, col: string) => `<rect x="${x}" y="${y}" width="8" height="8" fill="${col}" stroke="${darken(c.body, 0.45)}" stroke-width="1.6"/>`;
    const factory = shape(d, {
      fill: c.body,
      extra:
        pix(30, 58, '#ffe68a') + pix(42, 58, '#ffe68a') + pix(78, 58, '#ffe68a') + pix(90, 58, '#bdefff') +
        `<rect x="22" y="104" width="12" height="8" fill="${darken(c.body, 0.25)}"/><rect x="94" y="100" width="12" height="12" fill="${darken(c.body, 0.25)}"/><rect x="34" y="108" width="6" height="4" fill="${darken(c.body, 0.25)}"/>` +
        `<rect x="26" y="52" width="4" height="8" fill="#ffffff" fill-opacity="0.5"/><rect x="26" y="64" width="4" height="4" fill="#ffffff" fill-opacity="0.5"/>`,
      sw: 4,
    });
    const heart = [[0, 0], [4, 0], [12, 0], [16, 0], [-4, 4], [0, 4], [4, 4], [8, 4], [12, 4], [16, 4], [0, 8], [4, 8], [8, 8], [12, 8], [4, 12], [8, 12], [8, 16]]
      .map(([x, y]) => `<rect x="${x}" y="${y}" width="4" height="4"/>`).join('');
    return {
      back: chimney,
      body: factory,
      top: `<g transform="translate(14 14) scale(0.6)" fill="#ff5d7a" stroke="${INK}" stroke-width="1">${heart}</g>`,
      face: { x: 64, y: 80, s: 1, gap: 15, headTopY: 36 },
      headTop: [64, 24],
      shadowRx: 46,
      armL: [[24, 86], [12, 96]],
      armR: [[104, 86], [116, 96]],
      feetX: [44, 84],
      tie: [64, 95, 0.7],
    };
  },
  /** 主播经纪：带环形补光灯的直播麦克风，头顶亮着直播红点，飘着小爱心 */
  livemic(c) {
    const ring = `<circle cx="64" cy="56" r="45" fill="none" stroke="${INK}" stroke-width="13"/><circle cx="64" cy="56" r="45" fill="none" stroke="#fff6e0" stroke-width="8"/>` +
      `<circle cx="64" cy="56" r="45" fill="none" stroke="#ffd98a" stroke-width="2" stroke-dasharray="3 6"/>`;
    const stand = `<path d="M34 66Q34 98 64 98Q94 98 94 66" fill="none" stroke="${INK}" stroke-width="8"/><path d="M34 66Q34 98 64 98Q94 98 94 66" fill="none" stroke="#9aa6c0" stroke-width="3.5"/>` +
      `<rect x="59" y="96" width="10" height="14" fill="#9aa6c0" stroke="${INK}" stroke-width="2.8"/><ellipse cx="64" cy="112" rx="20" ry="4.5" fill="#5a6070" stroke="${INK}" stroke-width="3"/>`;
    const gid = nid('mesh');
    const capD = rrectD(38, 22, 52, 70, 26);
    const mesh = `<clipPath id="${gid}"><path d="M38 22H90V44H38Z"/></clipPath><g clip-path="url(#${gid})" stroke="${lighten(c.body, 0.55)}" stroke-width="1.6">` +
      Array.from({ length: 10 }, (_, i) => `<path d="M${30 + i * 7} 22l14 24M${44 + i * 7} 22l-14 24"/>`).join('') + `</g>`;
    const mic = shape(capD, {
      fill: c.body,
      extra: mesh + `<rect x="38" y="43" width="52" height="5" fill="${lighten(c.body, 0.3)}" stroke="${INK}" stroke-width="2"/>` + hiArc('M44 56v14', 3.5, 0.55),
    });
    const live = `<circle cx="24" cy="18" r="7" fill="#ff4d5e" stroke="${INK}" stroke-width="2.4"/><circle cx="24" cy="18" r="11" fill="none" stroke="#ff4d5e" stroke-width="2" stroke-opacity="0.5"/>`;
    const heart = (x: number, y: number, s: number) =>
      `<path transform="translate(${x} ${y}) scale(${s})" d="M0 6C-7 1 -7 -4 -3.5 -5C-1.6 -5.6 -0.4 -4.4 0 -3.2C0.4 -4.4 1.6 -5.6 3.5 -5C7 -4 7 1 0 6Z" fill="#ff7ad9" stroke="${INK}" stroke-width="${(1.8 / s).toFixed(2)}" stroke-linejoin="round"/>`;
    return {
      back: ring,
      under: stand,
      body: mic,
      top: live + heart(108, 22, 1.2) + heart(116, 40, 0.8),
      face: { x: 64, y: 64, s: 0.92, gap: 12, mouthDy: 10, headTopY: 22 },
      headTop: [64, 10],
      shadowRx: 26,
      armL: [[40, 74], [26, 84]],
      armR: [[88, 74], [104, 70]],
      feetX: [],
      flag: { x: 104, y: 70, dir: 1, w: 20 },
      scale: 0.86,
    };
  },
  /** 冷鲜肉铺：长着猪耳朵和猪鼻子的冷柜，玻璃门上挂霜，白马打领带 */
  fridgepig(c) {
    const ears =
      `<path d="M36 34L30 12L54 26Z" fill="${c.accent}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M38 28L35 18L47 25Z" fill="${darken(c.accent, 0.15)}"/>` +
      `<path d="M92 34L98 12L74 26Z" fill="${c.accent}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M90 28L93 18L81 25Z" fill="${darken(c.accent, 0.15)}"/>`;
    const glassD = rrectD(36, 38, 56, 54, 9);
    const frost = `<path d="M37 47Q42 44 45 39H37ZM91 47Q86 44 83 39H91Z" fill="#ffffff" fill-opacity="0.9"/>` +
      line('M40 88l5 -5M44 89l3 -3M84 88l5 -5', '#ffffff', 1.8, ' stroke-opacity="0.9"');
    const box = shape(rrectD(28, 28, 72, 84, 12), {
      fill: c.body,
      extra:
        `<path d="${glassD}" fill="#cfefff" stroke="${darken(c.body, 0.35)}" stroke-width="2.4"/>` + frost +
        `<rect x="93" y="48" width="4" height="26" rx="2" fill="#9aa6c0" stroke="${INK}" stroke-width="1.8"/>` +
        line('M36 30h8M52 30h4M70 30h6M84 30h6', '#ffffff', 2.2) +
        `<path d="M40 100l6 6M46 100l-6 6M43 98v10M38 103h10" stroke="#7fc8ff" stroke-width="1.8" stroke-linecap="round"/>` +
        hiArc('M33 46v20', 3, 0.6),
    });
    const icicles = [42, 56, 72, 86].map((x, i) => `<path d="M${x - 3} 28L${x} ${36 + (i % 2) * 4}L${x + 3} 28Z" fill="#eaf8ff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`).join('');
    const snout = `<ellipse cx="64" cy="74" rx="10" ry="7" fill="${c.accent}" stroke="${INK}" stroke-width="2.6"/><ellipse cx="60.6" cy="74" rx="1.9" ry="2.8" fill="${INK}"/><ellipse cx="67.4" cy="74" rx="1.9" ry="2.8" fill="${INK}"/>`;
    return {
      under: ears,
      body: merge(box, frag(icicles + snout)),
      face: { x: 64, y: 60, s: 0.98, gap: 15, mouthDy: 25, headTopY: 28 },
      headTop: [64, 10],
      shadowRx: 40,
      armL: [[30, 70], [18, 82]],
      armR: [[98, 70], [110, 82]],
      feetX: [46, 82],
      tie: [64, 92, 0.75],
    };
  },
  /** ST画大饼：一张旧大饼，手里的刷子在空中描一个更大的虚线饼 */
  pie(c) {
    const dl = (d: string, w = 2.4) => `<path d="${d}" fill="none" stroke="${INK}" stroke-opacity="0.5" stroke-width="${w}" stroke-dasharray="6 5" stroke-linecap="round"/>`;
    const dream = `<circle cx="66" cy="52" r="48" fill="#fff8e8" fill-opacity="0.45"/>` + dl(`M18 52a48 48 0 1 0 96 0a48 48 0 1 0 -96 0`, 2.8) +
      dl('M28 52a38 38 0 1 0 76 0a38 38 0 1 0 -76 0', 1.8) + dl('M66 52L66 4M66 52L108 76M66 52L24 78', 1.8) +
      `<path d="${sparkleD(20, 14, 6)}" fill="none" stroke="${INK}" stroke-opacity="0.5" stroke-width="1.8" stroke-dasharray="3 2"/>` +
      `<path d="${sparkleD(112, 14, 5)}" fill="none" stroke="${INK}" stroke-opacity="0.5" stroke-width="1.8" stroke-dasharray="3 2"/>`;
    const flat = shape(ellipseD(60, 88, 36, 24), {
      fill: c.body,
      extra:
        `<ellipse cx="60" cy="87" rx="28" ry="17" fill="${lighten(c.body, 0.3)}"/>` +
        [[36, 94, 4], [84, 82, 3.5], [70, 106, 3]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r! * 0.6}" fill="${darken(c.body, 0.2)}"/>`).join('') +
        [[46, 76], [60, 73], [76, 78], [42, 96], [58, 100], [80, 96]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="1.1" fill="#f4ecd8" stroke="${darken(c.body, 0.35)}" stroke-width="0.6"/>`).join('') +
        line('M90 80l-5 5 2 4 -4 4', darken(c.body, 0.45), 1.6) + hiArc('M30 82q4 -9 14 -12', 3.2, 0.4),
    });
    const brush = line('M98 84L114 52', INK, 6) + line('M98 84L114 52', '#a89478', 2.6) +
      `<path d="M111 52L117 55L121 44Q118 38 114 41Z" fill="#6a6470" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    const dust = [[22, 108, 4], [104, 110, 3], [112, 104, 2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#d8d2c8" stroke="${INK}" stroke-width="1.6" stroke-opacity="0.6"/>`).join('');
    return {
      back: dream,
      under: dust,
      body: flat,
      top: brush,
      face: { x: 60, y: 84, s: 0.92, gap: 13, mouthDy: 10, headTopY: 60 },
      headTop: [60, 52],
      shadowRx: 34,
      shadowX: 62,
      armL: [[28, 92], [16, 100]],
      armR: [[92, 90], [100, 82]],
      feetX: [46, 74],
      bandage: [36, 68],
    };
  },
  /** ST失联中：没信号的旧手机，信号格全空打叉，角上结了蜘蛛网，头顶冒问号 */
  deadphone(c) {
    const screen = '#d8dce0';
    const bars = [0, 1, 2, 3].map((i) => `<rect x="${43 + i * 4.5}" y="${42 - i * 2.5}" width="3" height="${3 + i * 2.5}" fill="none" stroke="#6a6e76" stroke-width="1.3"/>`).join('');
    const phone = shape(rrectD(34, 18, 60, 94, 12), {
      fill: c.body,
      extra:
        `<rect x="40" y="28" width="48" height="66" rx="6" fill="${screen}" stroke="${darken(c.body, 0.4)}" stroke-width="2"/>` + bars +
        line('M62 34l5 5M67 34l-5 5', '#c86a6a', 2.2) +
        line('M80 30l-6 12 5 4 -8 12M74 42l-8 -2', '#9aa0a8', 1.4) +
        `<rect x="56" y="22" width="16" height="3" rx="1.5" fill="${darken(c.body, 0.35)}"/><circle cx="64" cy="103" r="4.5" fill="${lighten(c.body, 0.2)}" stroke="${darken(c.body, 0.4)}" stroke-width="1.8"/>` +
        hiArc('M38 32v12', 2.6, 0.5),
    });
    const web = `<g stroke="#ffffff" stroke-opacity="0.85" stroke-width="1.2" fill="none" stroke-linecap="round">` +
      `<path d="M94 18L112 14M94 18L110 30M94 18L100 34"/><path d="M103 16Q104 22 106 24Q102 25 98 26M108 15Q109 24 109 28Q104 30 100 31"/></g>` +
      `<g stroke="${INK}" stroke-opacity="0.35" stroke-width="0.8" fill="none"><path d="M94 18L112 14M94 18L110 30M94 18L100 34"/></g>`;
    const q = `<circle cx="18" cy="28" r="11" fill="#f2f2f0" stroke="${INK}" stroke-width="2.4"/>` +
      line('M14 25Q14 20 18.5 20Q23 20 23 24.5Q23 27.5 18.5 29V31.5', INK, 2.6) + `<circle cx="18.5" cy="35.5" r="1.6" fill="${INK}"/>` +
      `<circle cx="26" cy="42" r="3" fill="#f2f2f0" stroke="${INK}" stroke-width="1.8"/>`;
    return {
      body: phone,
      top: web + q,
      face: { x: 64, y: 66, s: 0.88, gap: 12, mouthDy: 11, headTopY: 20 },
      headTop: [64, 12],
      shadowRx: 34,
      armL: [[36, 80], [24, 92]],
      armR: [[92, 80], [104, 92]],
      feetX: [52, 76],
      bandage: [44, 100],
    };
  },
};
