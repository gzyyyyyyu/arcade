/**
 * 快速匹配的档位（0.21.0，kit 0.20.0 的 MatchQueue，设计在 kit 的 docs/match.md）：Worker 的排队类和页面共用，纯函数。
 * 川麻：娱乐一个档位 fun，实盘每档一个 real-<档位>；立直：娱乐 rc-fun，实盘每档一个 rc-<档位>（rc-small、rc-mid、rc-big、rc-lux）。
 * 川麻三人两房（opts.three，3 个座位）：娱乐 x3-fun，实盘每档一个 x3-<档位>（x3-small、x3-mid、x3-big、x3-lux），一桌 3 个真人（tableSizeOf），开桌规则 three 开、swap 关（和主页三人两房快速一局一样），实盘再一局一结。
 * 川麻血流成河（opts.flow）：娱乐 xl-fun，实盘每档一个 xl-<档位>，开桌规则 flow 开，实盘再一局一结（底分减半由房间按 flow 算）。
 * 开桌的选项和好友房开房一样（这个玩法的默认规则：川麻 8 局、立直半庄）；实盘档照各玩法页面的 realOpts 固定一局一结（川麻 rounds 1、立直 length ikkyoku），房间的 options 照常校验。
 * 四人档一桌最多 4 个真人、三人两房档 3 个，空位电脑补；座位由房间随机排（kit 默认）。
 */
import { DEFAULT_VARIANT, VARIANTS } from '../core/variants/index.ts';
import { seatsOf } from '../core/variants/sichuan-xuezhan/rules.ts';
import { REAL_ROUNDS, STAKES, type StakesId, type TierId } from './stakes.ts';

const RIICHI = 'riichi';

/**
 * 排队的种类，一行一种：娱乐档 id 是 fun，实盘每档是 `<real>-<档位>`；开桌规则在玩法默认规则上改 rules 这几项，一桌几个真人按 rules 算座位。
 * 档位 id 上线后不改（排队按它分桌），加一种排队只加一行
 */
const KINDS = [
  { fun: 'fun', real: 'real', variant: DEFAULT_VARIANT, rules: {} },
  { fun: 'rc-fun', real: 'rc', variant: RIICHI, rules: {} },
  // 三人两房：three 开、不换三张、血流关（和主页三人两房快速一局一样）
  { fun: 'x3-fun', real: 'x3', variant: DEFAULT_VARIANT, rules: { three: true, swap: false, flow: false } },
  { fun: 'xl-fun', real: 'xl', variant: DEFAULT_VARIANT, rules: { flow: true, three: false } },
] as const;
type Kind = (typeof KINDS)[number];
type MatchTier = Kind['fun'] | `${Kind['real']}-${TierId}`;

const [XZ_KIND, RC_KIND, X3_KIND, XL_KIND] = KINDS;
export const MATCH_FUN: MatchTier = XZ_KIND.fun;
export const MATCH_RC_FUN: MatchTier = RC_KIND.fun;
export const MATCH_X3_FUN: MatchTier = X3_KIND.fun;
export const MATCH_XL_FUN: MatchTier = XL_KIND.fun;

const TIER_IDS = STAKES.filter((s) => s.wallet).map((s) => s.id as TierId);

/** 全部档位（按种类，每种先娱乐后各实盘档）；单独部署（没有钱包）只开娱乐档（MATCH_FUN_TIERS） */
export const MATCH_TIERS: readonly MatchTier[] = KINDS.flatMap((k): MatchTier[] => [k.fun, ...TIER_IDS.map((t): MatchTier => `${k.real}-${t}`)]);
export const MATCH_FUN_TIERS: readonly MatchTier[] = KINDS.map((k) => k.fun);

/** 四人档一桌最多几个真人（排队类的默认，认不得的档位也按它） */
export const MATCH_TABLE = 4;

const kindOf = (tier: string): Kind | undefined => KINDS.find((k) => tier === k.fun || tier.startsWith(`${k.real}-`));

/** 这个档位一桌最多几个真人（排队类覆盖 tableSize 用）：按开桌规则的座位数 */
export function tableSizeOf(tier: string): number {
  const k = kindOf(tier);
  return k ? seatsOf(k.rules) : MATCH_TABLE;
}

/** 选档页的档位和玩法 → 排队的档位（立直排 rc-；川麻三人两房 three 排 x3-，血流成河 flow 排 xl-） */
export function matchTierOf(stakes: StakesId, variant: string = DEFAULT_VARIANT, opts: { three?: boolean; flow?: boolean } = {}): MatchTier {
  const k = variant === RIICHI ? RC_KIND : opts.three ? X3_KIND : opts.flow ? XL_KIND : XZ_KIND;
  return stakes === 'fun' ? k.fun : `${k.real}-${stakes}`;
}

/** 排队的档位 → 选档页的档位；认不得的是 null */
export function stakesOfTier(tier: string): StakesId | null {
  const k = kindOf(tier);
  if (!k) return null;
  if (tier === k.fun) return 'fun';
  const t = tier.slice(k.real.length + 1);
  return (TIER_IDS as readonly string[]).includes(t) ? (t as TierId) : null;
}

/** 开桌带的开局选项：和好友房开房的 opts 一样（玩法默认规则加这一种的改动），房间的 options 校验；认不得的档位 undefined */
export function matchRoomOptions(tier: string): { variant: string; stakes: StakesId; rules: unknown } | undefined {
  const k = kindOf(tier);
  const stakes = stakesOfTier(tier);
  if (!k || !stakes) return undefined;
  const defaults = { ...(VARIANTS[k.variant]!.defaults as object), ...k.rules };
  // 实盘一局一结，和各玩法页面的 realOpts 一样（川麻 rounds、立直 length）；娱乐档照玩法默认
  const rules = stakes === 'fun' ? defaults : k.variant === RIICHI ? { ...defaults, length: 'ikkyoku' } : { ...defaults, rounds: REAL_ROUNDS };
  return { variant: k.variant, stakes, rules };
}

/** 排队的路径（相对页面；在开房、进房的 rooms/ 下面，wrangler.jsonc 的 run_worker_first 已经放行） */
export const MATCH_PATH = 'rooms/match';
