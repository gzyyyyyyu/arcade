/**
 * 川麻（血战、血流、三人两房）选桌页的规则表（game/rule-spec.ts）：局数、封顶、自摸、换三张、呼叫转移。
 * 血流成河（opts.flow）、三人两房（opts.three）在选桌页的玩法行选（VariantPage.homePick），不在这张表里：同一件事只一处选。
 */
import { DEFAULT_OPTS, type XzOpts } from '../core/variants/sichuan-xuezhan/index.ts';
import type { RuleSpec } from './rule-spec.ts';

/**
 * 一局大约几分钟（真人速度）：模拟器按自己每个决定 3 秒、电脑 1.2 秒、每局另加 20 秒估，8 局 p50 约 18 分钟（DESIGN.md 4.1）；
 * 卡片上按选的局数乘出来
 */
const MINUTES_PER_ROUND = 2.25;
/** 三人两房摸得快：8 局约 8–9 分钟（DESIGN.md 4.1） */
const MINUTES_PER_ROUND_THREE = 1.1;

/**
 * 偏好里没存过规则时用的（第一次来的新手）：4 局约 10 分钟，其余照核心默认（4 番封顶、自摸加底、换三张、呼叫转移）。
 * 核心的 DEFAULT_OPTS（8 局）不动：每日挑战、擂台、快速匹配、回放指纹都靠它
 */
export const XZ_FIRST_OPTS: XzOpts = { ...DEFAULT_OPTS, rounds: 4 };

const onOff = [
  { text: '开', value: true },
  { text: '关', value: false },
] as const;

export const XZ_RULES: RuleSpec<XzOpts> = {
  defs: [
    { key: 'rounds', label: '局数', choices: [1, 4, 8, 16].map((n) => ({ text: `${n} 局`, value: n })), brief: (o) => `${o.rounds} 局`, realFixed: true },
    { key: 'cap', label: '封顶', choices: [3, 4, 5].map((n) => ({ text: `${n} 番`, value: n })), brief: (o) => `${o.cap} 番封顶` },
    {
      key: 'zimo',
      label: '自摸',
      choices: [
        { text: '加底', value: 'di' },
        { text: '加番', value: 'fan' },
      ],
      brief: (o) => (o.zimo === 'fan' ? '自摸加番' : '自摸加底'),
    },
    {
      key: 'swap',
      label: '换三张',
      choices: [
        { text: '换', value: true },
        { text: '不换', value: false },
      ],
      brief: (o) => (o.swap ? '换三张' : '不换三张'),
    },
    { key: 'transfer', label: '呼叫转移', choices: onOff, brief: (o) => (o.transfer ? '呼叫转移' : '') },
  ],
  minutes: (o) =>
    o.rounds === 1 ? (o.three ? 2 : 3) : Math.max(5, Math.round(((o.three ? MINUTES_PER_ROUND_THREE : MINUTES_PER_ROUND) * o.rounds) / 5) * 5),
};
