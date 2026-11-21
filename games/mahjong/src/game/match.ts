/**
 * 快速匹配的档位（0.21.0，kit 0.20.0 的 MatchQueue，设计在 kit 的 docs/match.md）：Worker 的排队类和页面共用，纯函数。
 * 川麻：娱乐一个档位 fun，实盘每档一个 real-<档位>；立直：娱乐 rc-fun，实盘每档一个 rc-<档位>（rc-small、rc-mid、rc-big、rc-lux）。
 * 川麻三人两房（opts.three，3 个座位）：娱乐 x3-fun，实盘每档一个 x3-<档位>（x3-small、x3-mid、x3-big、x3-lux），一桌 3 个真人（tableSizeOf），开桌规则 three 开、swap 关（和主页三人两房快速一局一样），实盘再一局一结。
 * 川麻血流成河（opts.flow）：娱乐 xl-fun，实盘每档一个 xl-<档位>，开桌规则 flow 开，实盘再一局一结（底分减半由房间按 flow 算）。
 * 开桌的选项和好友房开房一样（这个玩法的默认规则：川麻 8 局、立直半庄）；实盘档照各玩法页面的 realOpts 固定一局一结（川麻 rounds 1、立直 length ikkyoku），房间的 options 照常校验。
 * 四人档一桌最多 4 个真人、三人两房档 3 个，空位电脑补；座位由房间随机排（kit 默认）。
 */
import { DEFAULT_VARIANT, VARIANTS } from '../core/variants/index.ts';
import { REAL_ROUNDS, STAKES, type StakesId, type TierId } from './stakes.ts';

type MatchTier = 'fun' | 'rc-fun' | `real-${TierId}` | `rc-${TierId}` | 'x3-fun' | `x3-${TierId}` | 'xl-fun' | `xl-${TierId}`;

export const MATCH_FUN: MatchTier = 'fun';
/** 立直的娱乐档 */
export const MATCH_RC_FUN: MatchTier = 'rc-fun';
/** 川麻三人两房的娱乐档 */
export const MATCH_X3_FUN: MatchTier = 'x3-fun';
/** 川麻血流成河的娱乐档 */
export const MATCH_XL_FUN: MatchTier = 'xl-fun';
const RIICHI = 'riichi';

const TIER_IDS = STAKES.filter((s) => s.wallet).map((s) => s.id as TierId);

/** 全部档位；单独部署（没有钱包）只开三个娱乐档（MATCH_FUN_TIERS） */
export const MATCH_TIERS: readonly MatchTier[] = [MATCH_FUN, MATCH_RC_FUN, ...TIER_IDS.map((t): MatchTier => `real-${t}`), ...TIER_IDS.map((t): MatchTier => `rc-${t}`), MATCH_X3_FUN, ...TIER_IDS.map((t): MatchTier => `x3-${t}`), MATCH_XL_FUN, ...TIER_IDS.map((t): MatchTier => `xl-${t}`)];
export const MATCH_FUN_TIERS: readonly MatchTier[] = [MATCH_FUN, MATCH_RC_FUN, MATCH_X3_FUN, MATCH_XL_FUN];

/** 四人档一桌最多几个真人 */
export const MATCH_TABLE = 4;
/** 三人两房档一桌最多几个真人 */
export const MATCH_TABLE_X3 = 3;

/** 这个档位一桌最多几个真人（排队类覆盖 tableSize 用） */
export function tableSizeOf(tier: string): number {
  return tier.startsWith('x3-') ? MATCH_TABLE_X3 : MATCH_TABLE;
}

/** 选档页的档位和玩法 → 排队的档位（立直排 rc-fun 或 rc-<档位>；川麻三人两房 three 排 x3-，血流成河 flow 排 xl-） */
export function matchTierOf(stakes: StakesId, variant: string = DEFAULT_VARIANT, opts: { three?: boolean; flow?: boolean } = {}): MatchTier {
  if (variant === RIICHI) return stakes === 'fun' ? MATCH_RC_FUN : `rc-${stakes}`;
  const pre = opts.three ? 'x3' : opts.flow ? 'xl' : null;
  if (pre) return stakes === 'fun' ? `${pre}-fun` : `${pre}-${stakes}`;
  return stakes === 'fun' ? MATCH_FUN : `real-${stakes}`;
}

/** 排队的档位 → 选档页的档位；认不得的是 null */
export function stakesOfTier(tier: string): StakesId | null {
  if (MATCH_FUN_TIERS.includes(tier as MatchTier)) return 'fun';
  const t = /^(?:real|rc|x3|xl)-(.+)$/.exec(tier)?.[1];
  return t && (TIER_IDS as readonly string[]).includes(t) ? (t as TierId) : null;
}

/** 开桌带的开局选项：和好友房开房的 opts 一样（默认玩法、默认规则），房间的 options 校验；认不得的档位 undefined */
export function matchRoomOptions(tier: string): { variant: string; stakes: StakesId; rules: unknown } | undefined {
  const stakes = stakesOfTier(tier);
  const variant = tier.startsWith('rc-') ? RIICHI : DEFAULT_VARIANT;
  if (!stakes) return undefined;
  // 三人两房：three 开、不换三张、血流关（和主页三人两房快速一局一样）；血流成河：flow 开
  const base = VARIANTS[variant]!.defaults as object;
  const defaults = tier.startsWith('x3-') ? { ...base, three: true, swap: false, flow: false } : tier.startsWith('xl-') ? { ...base, flow: true, three: false } : base;
  // 实盘一局一结，和各玩法页面的 realOpts 一样（川麻 rounds、立直 length）；娱乐档照玩法默认
  const rules = stakes === 'fun' ? defaults : variant === RIICHI ? { ...(defaults as object), length: 'ikkyoku' } : { ...(defaults as object), rounds: REAL_ROUNDS };
  return { variant, stakes, rules };
}

/** 排队的路径（相对页面；在开房、进房的 rooms/ 下面，wrangler.jsonc 的 run_worker_first 已经放行） */
export const MATCH_PATH = 'rooms/match';
