/**
 * 选桌页的规则设置（玩法 → 选项 → 默认值）：每个玩法只给一张表（game/xuezhan-rules.ts、game/riichi/rules.ts），
 * 选桌页那一行摘要、「改规则」面板、好友房等人页的规则行都从这张表来，不各写各的。
 * 这里只有数据和纯函数，不碰 DOM（面板画在 view/rule-row.ts）。默认值是偏好里没存过时的取值，在各玩法的 loadRules 里。
 */

export interface RuleChoice {
  text: string;
  value: string | number | boolean;
}

export interface RuleDef<O> {
  /** 规则设置里的字段名 */
  key: string;
  label: string;
  choices: readonly RuleChoice[];
  /** 摘要里这一项写什么，空串不写（关着的呼叫转移） */
  brief(o: O): string;
  /** 实盘不让选：实盘一局一结，局数、长度是固定的 */
  realFixed?: boolean;
}

export interface RuleSpec<O> {
  defs: readonly RuleDef<O>[];
  /** 规则以外固定不给选的（立直的赤宝牌）：brief 进摘要，note 写在面板里 */
  fixed?: { brief: string; note: string };
  /** 一场约几分钟（选档卡上写） */
  minutes(o: O): number;
}

const field = (o: unknown, key: string): unknown => (o as Record<string, unknown>)[key];

/** 这一档能选的几项：实盘把固定的藏掉 */
export function editable<O>(spec: RuleSpec<O>, real: boolean): RuleDef<O>[] {
  return spec.defs.filter((d) => !(real && d.realFixed));
}

/** 这一项现在选的是哪个 */
export function chosen<O>(d: RuleDef<O>, o: O): RuleChoice | undefined {
  return d.choices.find((c) => c.value === field(o, d.key));
}

/** 选了某一项：返回新的规则设置（不改原来的） */
export function choose<O>(spec: RuleSpec<O>, o: O, key: string, value: RuleChoice['value']): O {
  const d = spec.defs.find((x) => x.key === key);
  if (!d?.choices.some((c) => c.value === value)) throw new Error(`unknown rule choice ${key}=${String(value)}`);
  return { ...o, [key]: value } as O;
}

/** 摘要的各项（「4 局 · 4 番封顶 · 自摸加底 · 换三张」）；实盘开头写「一局一结」，不写固定的那几项 */
export function summary<O>(spec: RuleSpec<O>, o: O, real: boolean): string[] {
  const parts = editable(spec, real).map((d) => d.brief(o));
  return [...(real ? ['一局一结'] : []), ...parts, ...(spec.fixed ? [spec.fixed.brief] : [])].filter(Boolean);
}
