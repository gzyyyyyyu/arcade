/**
 * 角色技能的专属特效（core/skills.ts 发 skillUse / skillBeat / skillEnd，这里只管画）。
 * 全部用图集里现成的几个形状（斩痕、光圈、飞剑、符、花瓣……）换色、放大、排阵，不新增贴图；
 * 雪地很亮，用饱和色，不用叠加混合。每个技能一个函数，数值不在这里算——半径、方向、终点都来自事件。
 */
import { Ev } from '../../core/index.ts';
import type { Spawn } from '../game/fx.ts';

/**
 * 注意：Fx 的 follow 是"偏移"，位置 = 生成时的 x、y + follow() 的返回值，所以带 follow 的特效生成时写 x: 0、y: 0（返回值已经是主角的位置）。
 */
/** 技能特效要用的场景能力（GameScene 传进来，这个文件不认场景） */
export interface SkillFxCtx {
  fx: { spawn(o: Spawn): void };
  ground: { spawn(o: Spawn): void };
  /** 主角现在画在哪（持续类的光环跟着走） */
  hero(): { x: number; y: number };
  /** 主角的深度（斩痕画在身后） */
  depth: number;
  /** 省内存设备：粒子减半 */
  low: boolean;
  shake(ms: number, k: number): void;
}

/** 方向表下标 → 弧度 */
const rad = (idx: number): number => (idx / 256) * Math.PI * 2;

/** 技能编号（SKILL_IDS 的顺序，和 core/skills.ts 一致，测试锁住） */
export const SK = { sweep: 0, volley: 1, dash: 2, iron: 3, clap: 4, spring: 5, paper: 6, ferry: 7, fortune: 8, array: 9 } as const;

/** 一圈向外散的小火花 */
function sparks(c: SkillFxCtx, x: number, y: number, n: number, speed: number, tint: number, life = 420): void {
  const m = c.low ? Math.ceil(n / 2) : n;
  for (let k = 0; k < m; k++) {
    const a = (k / m) * Math.PI * 2;
    c.fx.spawn({ frame: 'spark', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, s0: 1, s1: 0.2, tint, rot: a, depth: 70 });
  }
}

/** 小道士·剑气纵横：面前三道叠起来的大斩（蓝白），主角脚下一圈冲击 */
function sweep(c: SkillFxCtx, x: number, y: number, face: number, r: number): void {
  const a = rad(face);
  const scale = r / 72;
  for (const [da, tint, life, alpha] of [[-0.55, 0x6ec8ff, 320, 0.85], [0.55, 0x6ec8ff, 320, 0.85], [0, 0xeaf8ff, 380, 1]] as const) {
    c.fx.spawn({ frame: 'slash', x: x + Math.cos(a) * 8, y: y - 24 + Math.sin(a) * 8, life, s0: scale * 0.55, s1: scale * 1.05, a0: alpha, a1: 0, rot: a + da, sx: 1.4, tint, depth: c.depth - 0.5 });
  }
  c.fx.spawn({ frame: 'slash', x, y: y - 24, life: 260, s0: scale * 0.7, s1: scale * 1.25, a0: 0.5, a1: 0, rot: a, sx: 1.8, tint: 0x2f7cc0, depth: c.depth - 1 });
  c.ground.spawn({ frame: 'ring', x, y, life: 360, s0: 0.3, s1: (r * 1.3) / 128, a0: 0.8, a1: 0, tint: 0x6ec8ff, ground: true });
  sparks(c, x + Math.cos(a) * r * 0.5, y - 20 + Math.sin(a) * r * 0.5, 10, 160, 0xeaf8ff);
  c.shake(160, 0.006);
}

/** 符师·万符齐发：脚下紫色符阵展开，十二点金紫火星往外扇开（符本身是子弹，画面层照常画） */
function volley(c: SkillFxCtx, x: number, y: number, face: number): void {
  c.ground.spawn({ frame: 'bagua', x, y, life: 600, s0: 0.5, s1: 1.2, a0: 0.9, a1: 0, rot: 0, spin: 3, tint: 0xb48cff, ground: true });
  c.fx.spawn({ frame: 'ring', x, y: y - 20, life: 360, s0: 0.3, s1: 1.2, a0: 0.9, a1: 0, tint: 0xb48cff, depth: 60 });
  const n = c.low ? 6 : 12;
  for (let k = 0; k < n; k++) {
    const a = rad(face) + (k - (n - 1) / 2) * 0.22;
    c.fx.spawn({ frame: 'mote', x, y: y - 24, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 380, s0: 1.4, s1: 0.2, tint: k % 2 ? 0xffd23a : 0xb48cff, rot: a, depth: 70 });
  }
}

/** 剑侠·御剑突进：沿冲刺线留一排飞剑残影，起点爆一圈、终点落一圈 */
function dash(c: SkillFxCtx, x0: number, y0: number, x1: number, y1: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const rot = Math.atan2(dy, dx);
  const n = c.low ? 5 : 10;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    c.fx.spawn({ frame: 'flysword', x: x0 + dx * t, y: y0 + dy * t - 22, life: 260 + 200 * t, s0: 1.5, s1: 1.1, a0: 0.35 + 0.55 * t, a1: 0, rot, tint: 0x7be0c0, depth: c.depth - 0.5 });
  }
  // 一道贴地的白线
  c.fx.spawn({ frame: 'slash', x: x0, y: y0 - 22, life: 220, s0: Math.max(0.5, Math.hypot(dx, dy) / 72), s1: Math.max(0.5, Math.hypot(dx, dy) / 72), a0: 0.8, a1: 0, rot, sx: 0.35, tint: 0xffffff, depth: c.depth - 1 });
  c.ground.spawn({ frame: 'ring', x: x0, y: y0, life: 300, s0: 0.2, s1: 0.8, a0: 0.8, a1: 0, tint: 0x7be0c0, ground: true });
  c.ground.spawn({ frame: 'ring', x: x1, y: y1, life: 360, s0: 0.2, s1: 1.1, a0: 0.9, a1: 0, tint: 0x7be0c0, ground: true });
  sparks(c, x1, y1 - 16, 8, 180, 0xeafff6);
  c.shake(120, 0.005);
}

/** 胖师叔·铁布衫：金色罩子裹住主角（持续期间跟着走），结束时一圈金色冲击波 */
function ironStart(c: SkillFxCtx, x: number, y: number, ticks: number): void {
  const ms = (ticks * 1000) / 30;
  const follow = (): { x: number; y: number } => {
    const p = c.hero();
    return { x: p.x, y: p.y - 22 };
  };
  c.fx.spawn({ frame: 'goldbell', x: 0, y: 0, life: ms, s0: 1.7, s1: 1.9, a0: 0.55, a1: 0.35, depth: c.depth + 1, follow });
  c.fx.spawn({ frame: 'ring', x: 0, y: 0, life: ms, s0: 0.75, s1: 0.8, a0: 0.9, a1: 0.5, tint: 0xf2c94c, depth: c.depth + 2, follow });
  c.fx.spawn({ frame: 'ring', x, y: y - 20, life: 400, s0: 0.3, s1: 1.2, a0: 1, a1: 0, tint: 0xf2c94c, depth: 60 });
  c.shake(140, 0.005);
}

function ironEnd(c: SkillFxCtx, x: number, y: number, r: number): void {
  c.fx.spawn({ frame: 'ring', x, y: y - 14, life: 520, s0: 0.3, s1: (r * 2) / 128, a0: 1, a1: 0, tint: 0xf2c94c, depth: 60 });
  c.ground.spawn({ frame: 'ring', x, y, life: 620, s0: 0.2, s1: (r * 2.2) / 128, a0: 0.8, a1: 0, tint: 0xe08a2a, ground: true });
  c.fx.spawn({ frame: 'goldbell', x, y: y - 10, life: 360, s0: 1.6, s1: 2.4, a0: 0.8, a1: 0, depth: c.depth + 2 });
  sparks(c, x, y - 16, 14, 240, 0xffe08a, 500);
  c.shake(260, 0.012);
}

/** 更夫·梆子声声：木色冲击波向外一圈，几点木屑 */
function clap(c: SkillFxCtx, x: number, y: number, r: number): void {
  c.fx.spawn({ frame: 'ring', x, y: y - 14, life: 460, s0: 0.2, s1: (r * 2) / 128, a0: 0.9, a1: 0, tint: 0xc98a3a, depth: 60 });
  c.ground.spawn({ frame: 'ring', x, y, life: 520, s0: 0.15, s1: (r * 1.9) / 128, a0: 0.7, a1: 0, tint: 0x7a4a1e, ground: true });
  sparks(c, x, y - 16, 10, 200, 0xe0b070, 380);
  c.shake(110, 0.004);
}

/** 采药女·回春：脚下一圈绿色光环（持续期间跟着走，大小 = 减速的范围），花瓣和光点往上飘 */
function springStart(c: SkillFxCtx, x: number, y: number, ticks: number, r: number): void {
  const ms = (ticks * 1000) / 30;
  const follow = (): { x: number; y: number } => c.hero();
  c.ground.spawn({ frame: 'ring', x: 0, y: 0, life: ms, s0: (r * 2) / 128, s1: (r * 2) / 128, a0: 0.55, a1: 0.2, tint: 0x4fcf7a, ground: true, follow });
  c.ground.spawn({ frame: 'haze', x: 0, y: 0, life: ms, s0: r / 32, s1: r / 32, a0: 0.4, a1: 0.1, tint: 0x9af0b4, ground: true, follow });
  c.fx.spawn({ frame: 'ring', x, y: y - 14, life: 520, s0: 0.2, s1: 1.4, a0: 1, a1: 0, tint: 0x7cf0a0, depth: 60 });
  springPulse(c, x, y);
}

/** 每秒一跳：花瓣和光点从脚下升起 */
function springPulse(c: SkillFxCtx, x: number, y: number): void {
  const n = c.low ? 3 : 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    c.fx.spawn({ frame: k % 2 ? 'petal' : 'mote', x: x + Math.cos(a) * 30, y: y - 4 + Math.sin(a) * 10, vx: Math.cos(a) * 18, vy: -70 - (k % 3) * 18, life: 800, s0: 1.2, s1: 0.4, tint: k % 2 ? 0xff9ad0 : 0x7cf0a0, rot: a, depth: 70 });
  }
}

/** 纸匠·剪纸成军：两道白色剪痕交叉一闪，纸片从身边四散飘开，脚下一圈红色符印 */
function paperArmy(c: SkillFxCtx, x: number, y: number, n: number, ring: number): void {
  for (const rot of [-0.6, 0.6]) c.fx.spawn({ frame: 'slash', x, y: y - 24, life: 260, s0: 0.9, s1: 1.3, a0: 1, a1: 0, rot, sx: 0.5, tint: 0xffffff, depth: c.depth + 2 });
  c.ground.spawn({ frame: 'ring', x, y, life: 520, s0: 0.2, s1: ((ring + 30) * 2) / 128, a0: 0.9, a1: 0, tint: 0xe8503c, ground: true });
  c.ground.spawn({ frame: 'bagua', x, y, life: 700, s0: 0.8, s1: 1.8, a0: 0.7, a1: 0, spin: 2, tint: 0xe8503c, ground: true });
  const m = c.low ? 6 : 12;
  for (let k = 0; k < m; k++) {
    const a = (k / m) * Math.PI * 2;
    c.fx.spawn({ frame: 'talisman', x, y: y - 20, vx: Math.cos(a) * 190, vy: Math.sin(a) * 120 - 40, g: 120, life: 640, s0: 0.9, s1: 0.5, a0: 1, a1: 0, rot: a + 1.2, spin: 6, tint: 0xfff4e6, depth: 70 });
  }
  // 站出来的位置各冒一小圈光
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2;
    c.fx.spawn({ frame: 'ring', x: x + Math.cos(a) * ring, y: y + Math.sin(a) * ring * 0.75 - 12, life: 360, s0: 0.1, s1: 0.5, a0: 1, a1: 0, tint: 0xfff4e6, depth: 60 });
  }
  c.shake(120, 0.004);
}

/** 摆渡人·横江一渡：蓝色水域铺在脚下跟着走（大小 = 减速的范围），几圈水纹和水珠 */
function ferryStart(c: SkillFxCtx, x: number, y: number, ticks: number, r: number): void {
  const ms = (ticks * 1000) / 30;
  const follow = (): { x: number; y: number } => c.hero();
  c.ground.spawn({ frame: 'haze', x: 0, y: 0, life: ms, s0: (r * 2) / 64, s1: (r * 2) / 64, a0: 0.7, a1: 0.2, tint: 0x4aa8e8, ground: true, follow });
  c.ground.spawn({ frame: 'ring', x: 0, y: 0, life: ms, s0: (r * 2) / 128, s1: (r * 2) / 128, a0: 0.8, a1: 0.25, tint: 0x2f7cc8, ground: true, follow });
  for (const [life, s1] of [[520, 1.0], [760, 1.5], [1000, 2.0]] as const) {
    c.ground.spawn({ frame: 'ring', x: 0, y: 0, life, s0: 0.2, s1: (r * 2 * s1 * 0.5) / 128, a0: 0.9, a1: 0, tint: 0xcdeeff, ground: true, follow });
  }
  const n = c.low ? 5 : 12;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    c.fx.spawn({ frame: 'mote', x: x + Math.cos(a) * r * 0.6, y: y + Math.sin(a) * r * 0.45 - 6, vx: Math.cos(a) * 30, vy: -110 - (k % 3) * 30, g: 260, life: 700, s0: 1.3, s1: 0.4, tint: 0xcdeeff, depth: 70 });
  }
  c.shake(110, 0.004);
}

/** 摆渡人水域打一下：跟着主角的一圈浅蓝水纹荡到水域边上 */
function ferryPulse(c: SkillFxCtx, r: number): void {
  c.ground.spawn({ frame: 'ring', x: 0, y: 0, life: 520, s0: 0.3, s1: (r * 2) / 128, a0: 0.9, a1: 0, tint: 0xcdeeff, ground: true, follow: () => c.hero() });
}

/** 货郎·招财进宝：金币从四面八方飞向身上，身上裹一圈金光（持续 10 秒，提示"多掉铜钱"开着） */
function fortuneStart(c: SkillFxCtx, x: number, y: number, ticks: number): void {
  const ms = (ticks * 1000) / 30;
  const follow = (): { x: number; y: number } => {
    const p = c.hero();
    return { x: p.x, y: p.y - 20 };
  };
  const n = c.low ? 8 : 18;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (k % 2) * 0.2;
    const d = 300 + (k % 3) * 60;
    // 从远处出发，0.5 秒飞到身上
    c.fx.spawn({ frame: 'coin', x: x + Math.cos(a) * d, y: y - 20 + Math.sin(a) * d * 0.7, vx: -Math.cos(a) * d * 2, vy: -Math.sin(a) * d * 1.4, life: 500, s0: 1.4, s1: 0.5, a0: 1, a1: 0.2, rot: a, spin: 8, depth: 75 });
  }
  c.fx.spawn({ frame: 'ring', x: 0, y: 0, life: ms, s0: 0.62, s1: 0.66, a0: 0.8, a1: 0.35, tint: 0xf2b620, depth: c.depth + 2, follow });
  c.fx.spawn({ frame: 'haze', x: 0, y: 0, life: ms, s0: 1.3, s1: 1.3, a0: 0.4, a1: 0.1, tint: 0xffd23a, depth: c.depth - 1, follow });
  c.fx.spawn({ frame: 'ring', x, y: y - 14, life: 480, s0: 0.3, s1: 1.4, a0: 1, a1: 0, tint: 0xffe27a, depth: 60 });
  sparks(c, x, y - 20, 10, 150, 0xffe27a, 600);
}

/** 阴阳先生·定阵：脚下铺开一座八卦阵（钉在原地，转着），阵边一圈紫光，阵里的怪被定住；阵散时一圈收光 */
function arrayStart(c: SkillFxCtx, x: number, y: number, ticks: number, r: number): void {
  const ms = (ticks * 1000) / 30;
  c.ground.spawn({ frame: 'bagua', x, y, life: ms, s0: (r * 2) / 44, s1: (r * 2) / 44, a0: 0.8, a1: 0.25, spin: 0.35, tint: 0x8a7ae8, ground: true });
  c.ground.spawn({ frame: 'ring', x, y, life: ms, s0: (r * 2) / 128, s1: (r * 2) / 128, a0: 0.85, a1: 0.3, tint: 0x6a5ad0, ground: true });
  c.ground.spawn({ frame: 'haze', x, y, life: ms, s0: (r * 2) / 64, s1: (r * 2) / 64, a0: 0.35, a1: 0.1, tint: 0xc0b4ff, ground: true });
  c.fx.spawn({ frame: 'ring', x, y: y - 10, life: 520, s0: 0.2, s1: (r * 2.2) / 128, a0: 1, a1: 0, tint: 0xe8e0ff, depth: 60 });
  const n = c.low ? 6 : 16;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    c.fx.spawn({ frame: 'mote', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8 - 8, vx: 0, vy: -90, life: 900, s0: 1.4, s1: 0.3, tint: k % 2 ? 0xffffff : 0x8a7ae8, depth: 70 });
  }
  c.shake(160, 0.006);
}

function arrayEnd(c: SkillFxCtx, x: number, y: number, r: number): void {
  c.ground.spawn({ frame: 'ring', x, y, life: 460, s0: (r * 2) / 128, s1: 0.1, a0: 0.8, a1: 0, tint: 0xc0b4ff, ground: true });
  sparks(c, x, y - 10, 8, 120, 0xe8e0ff, 420);
}

/** 事件 → 特效。type 是 Ev.SkillUse / SkillBeat / SkillEnd，a/b/c 含义见 events.ts */
export function playSkillFx(c: SkillFxCtx, type: number, x: number, y: number, a: number, b: number, k: number): void {
  if (type === Ev.SkillUse) {
    if (a === SK.sweep) sweep(c, x, y, b, k);
    else if (a === SK.volley) volley(c, x, y, b);
    else if (a === SK.iron) ironStart(c, x, y, b);
    else if (a === SK.spring) springStart(c, x, y, b, k);
    else if (a === SK.paper) paperArmy(c, x, y, b, k);
    else if (a === SK.ferry) ferryStart(c, x, y, b, k);
    else if (a === SK.fortune) fortuneStart(c, x, y, b);
    else if (a === SK.array) arrayStart(c, x, y, b, k);
    // 御剑的画在 SkillBeat（要等终点）；更夫的第一声也是 SkillBeat
  } else if (type === Ev.SkillBeat) {
    if (a === SK.dash) dash(c, x, y, b, k);
    else if (a === SK.clap) clap(c, x, y, b);
    else if (a === SK.spring) springPulse(c, x, y);
    // 摆渡人的水域每秒打一下（规则 67）：k = 水域半径，从脚下荡开一圈水纹
    else if (a === SK.ferry) ferryPulse(c, k);
    // 阴阳先生阴阳互换（规则 66）：b = 定住的拍数、k = 半径，画一个短的定阵
    else if (a === SK.array) arrayStart(c, x, y, b, k);
  } else if (type === Ev.SkillEnd) {
    if (a === SK.iron) ironEnd(c, x, y, b);
    else if (a === SK.array) arrayEnd(c, x, y, b);
  }
}
