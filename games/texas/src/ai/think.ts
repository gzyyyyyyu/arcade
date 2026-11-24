/**
 * 电脑想多久（在页面里，搬到这里变成纯函数；docs/ai.md 4.7 第 4 节）。
 * 要像对面坐着个人：有的局面一把梭、有的要想半天，每个性格的快慢不一样。
 * 但快慢绝不能透露牌力——久想本身就是信号。所以只吃公开的东西：性格、这一场的快慢状态、桌上的人数、
 * 这一手的操作记录、池子和要跟的钱；不碰底牌、不碰牌力（本文件里不出现 hole，test/think.test.ts 查源码，并做同局面换底牌的对照）。
 * 随机数是传进来的单独一条流，序号和牌、种子无关；每次调用固定抽 3 个数，不管走哪个分支，所以换了牌也不会错位。
 */
import type { RandomStream } from 'arcade-kit/rng';
import type { View } from '../core/view.ts';

/** 每种性格的底数（毫秒，顺序同 PERSONAS）：稳哥、阿强、老好、慢慢、算盘、江湖、虎子、老鹰、熊猫哥、板凳儿 */
const BASE = [650, 450, 700, 900, 750, 600, 450, 600, 550, 800];
/** 一把梭的概率（‰）：凶的、话多的人常不假思索；算盘、慢慢几乎不会 */
const SNAP = [80, 220, 100, 20, 40, 60, 260, 90, 150, 30];
/** 想很久的概率（‰，难的局面 ×2、顺手的局面 ×0.5）：慢慢、算盘、板凳儿、江湖爱掂量 */
const TANK = [120, 40, 60, 250, 200, 180, 30, 100, 70, 200];

/** 顺手的局面：翻牌前没人加注，只补一个大盲、过牌或者弃（大家都弃的一手别磨蹭） */
const EASY_MIN = 150;
const EASY_SPAN = 150;

/** 整体提速：试玩里 6 人桌一手要 25–35 秒太慢，各段时间乘 0.6；分布的形状（一把梭、掂量的概率）不变 */
const SPEED = 600;
/** 这条街前面还没人下注、轮到的人可以过牌：每家最多想这么久（毫秒）。"能不能过牌"是桌上公开的，不透露牌力 */
const CHECK_CAP = 600;

/** 想多久，毫秒（还没乘页面的节奏档 pace）。v 是这个座位的视图 */
export function thinkMs(v: View, r: RandomStream): number {
  const me = v.me!;
  const s = v.seats[me]!;
  const persona = s.persona >= 0 && s.persona < BASE.length ? s.persona : 4;
  const mood = v.form?.[3] ?? 1000;
  const roll = r.below(1000);
  const noise = r.below(400);
  const hardNoise = r.below(600);
  // 7–9 人桌一圈要等七八个电脑：整体再快一档（连拍量的）
  const crowd = v.seats.filter((x) => x.owner !== 'none').length >= 7 ? 700 : 1000;
  const owe = Math.min(s.stack, v.currentBet - s.bet);
  const pre = v.board.length === 0;
  const capped = (ms: number): number => (owe === 0 ? Math.min(CHECK_CAP, ms) : ms);
  if (pre && owe <= v.bb) return capped(Math.floor(((EASY_MIN + Math.floor((EASY_SPAN * noise) / 400)) * crowd * mood) / 1_000_000));
  const pot = v.pot;
  // 难的决定：要跟的比池子大，或者占了手里三分之一以上；池子越大越慎重
  const hard = owe > 0 && (owe >= pot || owe * 3 >= s.stack);
  const weight = Math.min(500, Math.floor((pot * 10) / v.bb));
  let ms = (BASE[persona]! + (owe > 0 ? 300 : 0) + (pre ? 0 : 100) + noise + (hard ? 0 : weight)) * crowd;
  ms = Math.floor((ms * SPEED) / 1_000_000);
  const snap = hard ? Math.floor(SNAP[persona]! / 3) : SNAP[persona]!;
  const tank = Math.floor((TANK[persona]! * (hard ? 2000 : owe > 0 ? 1000 : 500)) / 1000);
  const tanked = roll >= snap && roll < snap + tank;
  if (roll < snap) ms = Math.floor((ms * 4) / 10);
  else if (tanked) ms = Math.floor((ms * 18) / 10);
  if (hard) ms += Math.floor(((800 + hardNoise) * SPEED) / 1000);
  // 久想本身就是信号：封顶，常态最多 1.6 秒（难的 2.3 秒），"掂量一下"的最多 3 秒（乘快慢档后不超过约 3.5 秒）；能过牌的再封到 CHECK_CAP
  return capped(Math.floor((Math.min(tanked ? 3_000 : hard ? 2_300 : 1_600, ms) * mood) / 1000));
}
