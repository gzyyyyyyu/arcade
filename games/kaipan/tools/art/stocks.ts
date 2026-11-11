/**
 * 股票小人：身体（精做配方 / 生成器形状）+ 角色配饰 + 名字梗道具，输出分层部件与合成图。
 *
 * 画布 128×128，地面 y=116，所有分层文件同尺寸同原点（叠放即对齐）。
 * 层序（下→上）：shadow, back, spin, body, mark, cheeks, eyes_*, mouth_*, acc, fx_*
 */
import { EXPRESSIONS, type Expr, type FaceStyle, cheeks, eyes, eyesBlink, faceFx, mouth } from './lib/face.ts';
import {
  INK, SW, THEME_COLORS, type Frag, darken, frag, grained, grayscaleSvg, lighten, merge, sparkleD, svgDoc,
} from './lib/svg.ts';
import { HERO_BODIES } from './stocks/hero.ts';
import { RECIPES_A } from './stocks/recipes-a.ts';
import { RECIPES_B } from './stocks/recipes-b.ts';
import {
  CANVAS, GROUND, type Pt, arm, feet, crown, tie, boltMark, flag, bandage, type Built, type Colors, type Recipe,
  type StockSpec,
} from './stocks/shared.ts';

export { CANVAS, GROUND };
export type { Built, Colors, StockSpec };

const RECIPES: Record<string, (c: Colors) => Recipe> = { ...RECIPES_A, ...RECIPES_B };

function genBody(spec: StockSpec, c: Colors): Built {
  const fn = RECIPES[spec.shape ?? ''];
  if (!fn) throw new Error(`unknown shape ${spec.shape} (${spec.id})`);
  const r = fn(c);
  const role = spec.role;
  const face: FaceStyle = { ...r.face };
  if (role === 'st') face.sweatSide = -1;
  let arms = '';
  const fl = role === 'follower' ? r.flag : undefined;
  if (r.armL) arms += arm(r.armL[0][0], r.armL[0][1], r.armL[1][0], r.armL[1][1], c.body);
  if (r.armR) {
    if (fl && !fl.stick) arms += arm(r.armR[0][0], r.armR[0][1], fl.x, fl.y, c.body, false);
    else arms += arm(r.armR[0][0], r.armR[0][1], r.armR[1][0], r.armR[1][1], c.body);
  }
  const body = merge(frag(arms + feet(r.feetX ?? [50, 78], c.body) + (r.under ?? '')), r.body);

  let accF = frag(r.top ?? '');
  let headTop = r.headTop;
  let hand: Pt | undefined;
  switch (role) {
    case 'leader': {
      const [x, y, rot, s] = r.crown ?? [r.headTop[0], r.headTop[1] + 8, -8, 0.9];
      accF = merge(accF, crown(x, y, s ?? 0.9, rot));
      break;
    }
    case 'follower':
      if (!fl) throw new Error(`follower ${spec.id} needs flag`);
      accF = merge(accF, flag(fl.x, fl.y, '#ffcf3a', fl.dir, fl.stick, fl.w));
      hand = [fl.x, fl.y];
      headTop = [headTop[0], Math.min(headTop[1], fl.y - (fl.stick ? 46 : 54))];
      break;
    case 'bluechip': {
      const [tx, ty, ts] = r.tie ?? [face.x, face.y + 20 * face.s];
      accF = merge(accF, tie(tx, ty, '#3047a8', ts ?? 0.85));
      break;
    }
    case 'st': {
      const [bx, by] = r.bandage ?? [r.headTop[0] + 16, r.headTop[1] + 12];
      accF = merge(accF, frag(bandage(bx, by)));
      break;
    }
    case 'meme':
      break;
  }
  // 整体缩放：所有层包一层以地面中心为原点的变换，脸和锚点同步换算
  const k = r.scale ?? 1;
  const T = (f: Frag | undefined): Frag | undefined =>
    f && k !== 1 ? frag(`<g transform="matrix(${k} 0 0 ${k} ${r2(64 * (1 - k))} ${r2(GROUND * (1 - k))})">${f.content}</g>`, f.defs) : f;
  const P = (p: Pt): Pt => [r2(64 + (p[0] - 64) * k), r2(GROUND + (p[1] - GROUND) * k)];
  if (k !== 1) {
    const [fx, fy] = P([face.x, face.y]);
    face.x = fx;
    face.y = fy;
    face.s = r2(face.s * k, 1000);
    if (face.headTopY !== undefined) face.headTopY = P([0, face.headTopY])[1];
  }
  const spinAt = r.spinAt ? P(r.spinAt) : undefined;
  return {
    back: T(r.back ? grained(frag(r.back)) : undefined),
    spin: T(r.spin ? grained(frag(r.spin)) : undefined),
    body: T(grained(body))!,
    mark: role === 'meme' ? boltMark(face) : undefined,
    acc: accF.content ? T(accF) : undefined,
    face,
    shadowRx: r.shadowRx * k,
    shadowX: r.shadowX === undefined ? undefined : P([r.shadowX, 0])[0],
    anchors: { headTop: P(headTop), ...(hand ? { hand: P(hand) } : {}), ...(spinAt ? { spin: spinAt } : {}) },
  };
}

function r2(n: number, q = 100): number {
  return Math.round(n * q) / q;
}

// ---------------------------------------------------------------- 输出

export interface StockOut {
  id: string;
  files: Map<string, string>; // 相对 stocks/ 的路径 → SVG
  manifest: Record<string, unknown>;
}

function resolveColors(spec: StockSpec): Colors {
  const theme = THEME_COLORS[spec.theme];
  if (!theme) throw new Error(`unknown theme ${spec.theme}`);
  const body = spec.colors?.body ?? theme.main;
  return {
    body,
    accent: spec.colors?.accent ?? (spec.colors?.body ? theme.main : lighten(theme.main, 0.45)),
    trim: spec.colors?.trim ?? darken(theme.main, 0.35),
  };
}

function shadow(rx: number, x = 64): Frag {
  return frag(`<ellipse cx="${x}" cy="${GROUND}" rx="${rx}" ry="5.5" fill="${INK}" fill-opacity="0.2"/>`);
}

export function buildStock(spec: StockSpec): StockOut {
  const c = resolveColors(spec);
  let b: Built;
  if (spec.hero) {
    const fn = spec.body ? HERO_BODIES[spec.body] : undefined;
    if (!fn) throw new Error(`unknown hero body ${spec.body}`);
    b = fn(c);
    // 精做的配方按角色补上统一配饰（妖股的额头闪电）
    if (spec.role === 'meme' && !b.mark) b.mark = boltMark(b.face);
  } else {
    b = genBody(spec, c);
  }
  const fs = b.face;
  const files = new Map<string, string>();
  const doc = (f: Frag) => svgDoc(CANVAS, CANVAS, f);
  const P = `${spec.id}/parts/`;

  const layers: { name: string; file: string; z: number; when?: string }[] = [];
  let z = 0;
  const put = (name: string, f: Frag | undefined, opts: { gray?: boolean; when?: string } = {}) => {
    if (!f?.content) return;
    files.set(`${P}${name}.svg`, doc(f));
    if (opts.gray) files.set(`${P}${name}_gray.svg`, grayscaleSvg(doc(f)));
    layers.push({ name, file: `parts/${name}.svg`, z: z++, ...(opts.when ? { when: opts.when } : {}) });
  };
  put('shadow', shadow(b.shadowRx, b.shadowX));
  put('back', b.back, { gray: true });
  put('spin', b.spin, { gray: true });
  put('body', b.body, { gray: true });
  put('mark', b.mark, { gray: true });
  put('cheeks', cheeks(fs), { when: '除 delisted 外' });
  // 五官：每种表情一套；同一 z 位置互斥
  const eyeZ = z++;
  const mouthZ = z++;
  for (const e of EXPRESSIONS) {
    files.set(`${P}eyes_${e}.svg`, doc(eyes(e, fs)));
    files.set(`${P}mouth_${e}.svg`, doc(mouth(e, fs)));
  }
  files.set(`${P}eyes_blink.svg`, doc(eyesBlink(fs)));
  layers.push({ name: 'eyes', file: 'parts/eyes_<expr|blink>.svg', z: eyeZ });
  layers.push({ name: 'mouth', file: 'parts/mouth_<expr>.svg', z: mouthZ });
  put('acc', b.acc, { gray: true });
  const fxZ = z++;
  const fxExprs: Expr[] = [];
  for (const e of EXPRESSIONS) {
    const f = faceFx(e, fs);
    if (f.content) {
      files.set(`${P}fx_${e}.svg`, doc(f));
      fxExprs.push(e);
    }
  }
  layers.push({ name: 'fx', file: 'parts/fx_<expr>.svg', z: fxZ, when: fxExprs.join(' / ') });

  // 合成图
  for (const e of EXPRESSIONS) {
    const parts = merge(
      shadow(b.shadowRx, b.shadowX), b.back, b.spin, b.body, b.mark,
      e === 'delisted' ? undefined : cheeks(fs),
      eyes(e, fs), mouth(e, fs), b.acc, faceFx(e, fs),
    );
    let svg = doc(parts);
    if (e === 'delisted') svg = grayscaleSvg(svg);
    files.set(`${spec.id}/${e}.svg`, svg);
  }
  // 眨眼帧：与 calm 完全相同，只把眼睛换成闭眼（墨镜款是一道反光）
  files.set(
    `${spec.id}/blink.svg`,
    doc(merge(shadow(b.shadowRx, b.shadowX), b.back, b.spin, b.body, b.mark, cheeks(fs), eyesBlink(fs), mouth('calm', fs), b.acc)),
  );

  const g = fs.gap ?? 14;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const manifest = {
    id: spec.id,
    name: spec.name,
    theme: spec.theme,
    role: spec.role,
    hero: !!spec.hero,
    recipe: spec.hero ? { body: spec.body } : { shape: spec.shape ?? 'round', motif: spec.motif ?? null },
    colors: c,
    composite: { ...Object.fromEntries(EXPRESSIONS.map((e) => [e, `${spec.id}/${e}.svg`])), blink: `${spec.id}/blink.svg` },
    layers,
    anchors: {
      ground: [64, GROUND],
      face: [r1(fs.x), r1(fs.y)],
      eyes: [r1(fs.x), r1(fs.y)],
      eyeL: [r1(fs.x - g * fs.s), r1(fs.y)],
      eyeR: [r1(fs.x + g * fs.s), r1(fs.y)],
      mouth: [r1(fs.x), r1(fs.y + (fs.mouthDy ?? 11) * fs.s)],
      headTop: b.anchors.headTop,
      ...(b.anchors.hand ? { hand: b.anchors.hand } : {}),
      ...(b.anchors.spin ? { spin: b.anchors.spin } : {}),
    },
    faceScale: fs.s,
  };
  return { id: spec.id, files, manifest };
}

export { SW, sparkleD };
