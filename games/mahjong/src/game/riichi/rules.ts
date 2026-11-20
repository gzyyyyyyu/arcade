/**
 * 立直选桌页的规则表（game/rule-spec.ts）：只有长度一项（实盘固定一局一结，不让选）；赤宝牌固定 3 张，不给选、只写一句。
 */
import { DEFAULT_OPTS, type RcOpts } from '../../core/variants/riichi/index.ts';
import type { RuleSpec } from '../rule-spec.ts';

/** 立直一场的长度名 */
export const RC_LENGTH_NAME: Readonly<Record<RcOpts['length'], string>> = { hanchan: '半庄', tonpuu: '东风战', ikkyoku: '一局' };

/**
 * 偏好里没存过时用的：东风战（约 15 分钟）。核心的 DEFAULT_OPTS（半庄）不动，好友房、每日挑战照旧；
 * 半庄约 30 分钟，第一次来的人打不完
 */
export const RC_FIRST_OPTS: RcOpts = { ...DEFAULT_OPTS, length: 'tonpuu' };

export const RC_RULES: RuleSpec<RcOpts> = {
  defs: [
    {
      key: 'length',
      label: '长度',
      choices: (['tonpuu', 'hanchan', 'ikkyoku'] as const).map((l) => ({ text: RC_LENGTH_NAME[l], value: l })),
      brief: (o) => RC_LENGTH_NAME[o.length],
      realFixed: true,
    },
  ],
  fixed: { brief: '赤宝牌 3 张', note: '赤宝牌固定 3 张：5 万、5 筒、5 条各一张。' },
  // 半庄按 30 分钟、东风战一半估（docs/riichi.md 第 2 节）；只打一局的约 3 分钟
  minutes: (o) => (o.length === 'ikkyoku' ? 3 : o.length === 'hanchan' ? 30 : 15),
};
