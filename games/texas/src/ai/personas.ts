/**
 * 电脑的性格（docs/ai.md 4.3；0.3.0 起的参数和取舍见 4.6）。名字是化名，不对应真人；平台的昵称保留名单要有这几个名字。
 * 个数要等于规则里的 PERSONA_COUNT（test/ai.test.ts 核对）。
 * 门槛都用"相对强度"：胜率 ×（对手数 + 1），千分数，1000 = 这一桌的平均水平。参数由 scripts/sim.ts 的机器人对打调。
 */

export interface Persona {
  name: string;
  /** 一句话风格（界面上的小字） */
  style: string;
  /** 翻牌前跟进的相对强度门槛 */
  call: number;
  /** 加注的相对强度门槛 */
  raise: number;
  /** 翻牌前开池加注的门槛，不填同 raise（0.3.0 实打后：慢慢翻牌后照样很少加注，翻牌前拿 QQ+、AK 这类大牌开池多加一点） */
  open?: number;
  /** 没人下注时诈唬下注的概率（‰，按对手数再打折） */
  bluff: number;
  /** 翻牌后跟注时对底池赔率的放宽（‰，负数是更挑；正数 0.3.0 起按档的 soft 打折） */
  slack: number;
  /** 拿到大牌时慢打（只过牌、跟注）的概率（‰） */
  slow: number;
  /** 翻牌后下注占池子的比例（‰） */
  size: number;
  /** 软桌上翻牌前跟进门槛再放低多少（相对强度，按档的 SKILL.soft 打折）：让老好、阿飙在小桌像真人那样松 */
  loose: number;
  /** 同上，加注门槛再放低多少 */
  wild: number;
  /** 翻牌后按"前百分之几"猜翻牌前加过注的人（和这一档的 SKILL.raiser 取紧的那个，100 = 按档） */
  raiser: number;
  /** 翻牌前面对一次加注，拿着够跟的牌再加注的概率（‰）：凶的人不只拿大牌再加 */
  threebet: number;
  /** 上一轮自己下了注、这一轮没人下注时，接着再打一枪的概率（‰，0.3.0；按档的 bluff 倍数，对手每多一个少 60） */
  barrel: number;
  /** 河牌上：连着打过来的诈唬改成全下、或者大牌直接全下的概率（‰） */
  shove: number;
  /**
   * 河牌没人下注、手里只有高牌（也不到 THIN）时诈唬的概率（‰，0.3.0 实打后；按档的 bluff 倍数，对手每多一个少 80）。
   * 翻牌上的诈唬多半当场把人打走，空气很少打到河牌；河牌的诈唬常被有一对的人跟到摊牌，"诈唬"才亮得出来
   */
  river: number;
  /**
   * 风格（docs/ai.md 4.3 的"风格"表）。下面几项都是 1000 = 标准；不写按标准。
   * 面对下注时对"他多半有牌"的相信程度（乘功力的 read）：大了容易被吓走，小了爱抓诈唬
   */
  trust: number;
  /** 位置的分量（乘位置加成，也乘前位的惩罚）：算位置的人大，不看位置的人小 */
  posX: number;
  /** 后位（按钮、关煞、小盲）前面全弃到我时，开池加注的门槛再放低多少（相对强度）：偷盲 */
  steal: number;
  /** 翻牌前加注的大小（乘 2.5–3.5 个大盲的基本尺度）：有的人爱加大，有的人只加到刚好 */
  openX: number;
  /** 翻牌后下注尺度的离散程度（乘随机浮动的幅度）：小 = 每次差不多（算盘），大 = 忽大忽小（虎子、江湖） */
  spread: number;
  /** 低档"不敢先打、多跟少加"（功力的 shy / passive）对这个性格起几成：凶的人少受压，胆小的人多受压 */
  mild: number;
  /** 看对手打法用几成（乘功力的 adapt）：算盘、老鹰会调整，老好、小白几乎不看 */
  reads: number;
  /** 这个性格爱犯的小错（见 Flaw）和每次碰到那种局面时犯的概率（‰；高档只剩一半）。不写 = 不犯 */
  flaw?: Flaw;
  leak?: number;
}

/**
 * 性格里"爱犯的小错"，让电脑像人而不是机器：
 * overcall 差一点就弃的牌被下注时偶尔舍不得（跟注站）；scared 够跟但是下注很大时偶尔怕了弃掉（胆小）；
 * spew 没牌的局面里偶尔手痒多打一枪（凶的人）；trap 河牌大牌装得太久，忘了收钱（爱慢打）
 */
export type Flaw = 'overcall' | 'scared' | 'spew' | 'trap';

export const PERSONAS: readonly Persona[] = [
  { name: '稳哥', style: '好牌才进，进了就打', call: 1400, raise: 1320, bluff: 120, slack: 0, slow: 50, size: 750, loose: 60, wild: 0, raiser: 100, threebet: 40, barrel: 250, shove: 0, river: 300, trust: 1150, posX: 1300, steal: 20, openX: 900, spread: 450, mild: 850, reads: 700, flaw: 'scared', leak: 40 },
  // 0.3.0 起 call 是"没人加注时跟进"的门槛（不再查赔率），按目标入池率重调：紧的调高，loose 只剩软桌上的放松（原来要大到抵掉赔率那一关）
  // 阿飙的 loose / wild 0.2.0 从 100 / 70 收到 80 / 55：9 人桌后面坐的人多，原来那么松在小桌混桌里每百手 −59，收一点到 −39；6 人桌小桌入池 34% → 32%
  { name: '阿飙', style: '爱加注，常偷盲', call: 1250, raise: 1200, bluff: 220, slack: 0, slow: 30, size: 800, loose: 80, wild: 55, raiser: 60, threebet: 150, barrel: 350, shove: 120, river: 800, trust: 900, posX: 1100, steal: 50, openX: 1100, spread: 1100, mild: 800, reads: 500, flaw: 'spew', leak: 70 },
  { name: '老好', style: '爱跟注，很难被吓走', call: 1100, raise: 1450, bluff: 40, slack: 30, slow: 100, size: 550, loose: 150, wild: 0, raiser: 45, threebet: 5, barrel: 80, shove: 0, river: 150, trust: 500, posX: 300, steal: 0, openX: 800, spread: 700, mild: 1000, reads: 100, flaw: 'overcall', leak: 120 },
  { name: '慢慢', style: '很少加注，好牌爱装弱', call: 1290, raise: 1700, open: 1500, bluff: 20, slack: -30, slow: 300, size: 500, loose: 0, wild: 0, raiser: 100, threebet: 0, barrel: 100, shove: 0, river: 30, trust: 1350, posX: 800, steal: 0, openX: 1000, spread: 500, mild: 1000, reads: 400, flaw: 'scared', leak: 90 },
  { name: '算盘', style: '严格按赔率算', call: 1230, raise: 1300, bluff: 180, slack: -10, slow: 60, size: 700, loose: 0, wild: 0, raiser: 100, threebet: 50, barrel: 300, shove: 20, river: 400, trust: 1000, posX: 1400, steal: 40, openX: 1000, spread: 300, mild: 900, reads: 1000 },
  { name: '江湖', style: '爱慢打，偶尔过牌加注', call: 1230, raise: 1300, bluff: 250, slack: 10, slow: 250, size: 800, loose: 0, wild: 0, raiser: 100, threebet: 60, barrel: 300, shove: 40, river: 650, trust: 900, posX: 1000, steal: 30, openX: 1000, spread: 1600, mild: 800, reads: 800, flaw: 'trap', leak: 100 },
  // 0.2.0 起（9 人桌最多 8 个电脑、一桌不重复）
  { name: '虎子', style: '爱诈唬，下注又大又猛', call: 1210, raise: 1200, bluff: 200, slack: 0, slow: 20, size: 850, loose: 40, wild: 40, raiser: 100, threebet: 220, barrel: 360, shove: 140, river: 950, trust: 850, posX: 600, steal: 30, openX: 1100, spread: 1400, mild: 850, reads: 250, flaw: 'spew', leak: 120 },
  { name: '老鹰', style: '挑牌进池，一进就加，翻牌后也凶', call: 1270, raise: 1190, bluff: 220, slack: 10, slow: 30, size: 750, loose: 0, wild: 0, raiser: 100, threebet: 100, barrel: 400, shove: 60, river: 600, trust: 1050, posX: 1500, steal: 70, openX: 1000, spread: 500, mild: 750, reads: 1000 },
  { name: '叨叨', style: '话多，爱凑热闹跟一手', call: 1150, raise: 1400, bluff: 100, slack: 15, slow: 80, size: 600, loose: 180, wild: 0, raiser: 45, threebet: 15, barrel: 120, shove: 0, river: 500, trust: 700, posX: 400, steal: 0, openX: 900, spread: 1200, mild: 1000, reads: 200, flaw: 'overcall', leak: 100 },
  { name: '小白', style: '刚学会，什么牌都想看看', call: 1150, raise: 1500, bluff: 30, slack: 40, slow: 120, size: 500, loose: 200, wild: 0, raiser: 40, threebet: 0, barrel: 50, shove: 0, river: 250, trust: 500, posX: 0, steal: 0, openX: 700, spread: 1000, mild: 1000, reads: 0, flaw: 'overcall', leak: 150 },
];

/**
 * 电脑的"功力"，按强弱档（0.5.0 起按档，原来按档位，docs/ai.md 4.3、4.7）：同一种性格，低档松、软、不太会看人（0 新手档只给娱乐），越往上越紧、越凶、越会按对手的动作猜他的牌。
 * 电脑从 View.level 知道是哪一档；场地按档位挑档（stakes.ts 的 SOLO_LEVEL、ROOM_LEVEL），补位时各档挑哪些性格多一些见 stakes.ts 的 LEVEL_HOUSE。
 */
export interface Skill {
  /**
   * 翻牌后这一轮每有一次下注、加注，胜率乘 (1 − read)（‰，最多连乘 3 次；转牌 ×1.15、河牌 ×1.3）：越大越相信别人下注是真有牌。
   * 0.3.0 前是线性的 read × 次数、约 100；它是"简单打法"每百手最敏感的一项，各档的值见 docs/ai.md 4.10 的表
   */
  read: number;
  /** 翻牌前每有一次加注，加注门槛抬高多少（相对强度；跟注门槛少抬 50） */
  pre: number;
  /** 翻牌前加过注、跟过加注、平跟进来的对手，翻牌后按"前百分之几的起手牌"估他的底牌（100 = 不猜，当随机牌） */
  raiser: number;
  caller: number;
  limper: number;
  /** 翻牌后跟注对底池赔率的放宽（‰，加在性格的 slack 上）：正数是爱跟、难被吓走 */
  slack: number;
  /** 诈唬和持续下注的倍数（‰） */
  bluff: number;
  /** 翻牌前跟注、加注门槛整体抬高多少（相对强度）：负数是松 */
  tight: number;
  /** 性格的 loose / wild 和正的 slack 在这一档用几成（‰）：第 0–2 档全用，越往上越少 */
  soft: number;
  /** "手软"（0.5.0；0.12.0 起第 0–3 档）：翻牌后拿着中等牌被人下注时偶尔就弃了、该薄薄下一注时偶尔只过牌（‰）。给低档桌的人留点赢的感觉 */
  slip: number;
  /**
   * 翻牌后价值下注、加注的尺度（‰，1000 = 照性格）：低档小一点（0.12.0 起第 0–4 档逐档放大），面对一路跟到底的人少输一些（docs/ai.md 4.9）。
   * 只管有牌时的下注，诈唬照性格
   */
  value: number;
  /** 翻牌、转牌都是我下的注，河牌有牌也只过牌的概率（‰）：低档（0–3）不会连开三枪。0 = 照常 */
  third: number;
  /**
   * 记住上一手亮出来的牌（‰，大桌以上）：这一轮下注的人上一手摊牌亮的是高牌（空气也跟到底，或者诈唬被抓），
   * 这一手对他下注的折扣（read）少打这么多。只看 lastHand.shown，是大家都看到的牌（docs/ai.md 4.9）
   */
  memory: number;
  /**
   * 多跟少加（‰，低档）：翻牌后拿着够加注的牌、有人下注时，这么多的时候只跟不加；翻牌前面对加注也只跟不再加。
   * 新手像人一样弱：有牌也不敢打大，不靠乱弃乱推（docs/balance.md 第 3 节）
   */
  passive: number;
  /** 不敢先打（‰，低档）：没人下注时拿着够加注、够薄打的牌，这么多的时候只过牌（翻牌前是平跟不开池加注） */
  shy: number;
  /**
   * 性格的风格项拉开到几成（‰）：性格里 trust / openX / spread / mild / steal / posX 在这一档起几成作用，1000 = 全用。
   * 新手档、小桌要对新手友好（4.10 的配平），风格项只露一部分；越往上拉得越开
   */
  style: number;
  /** 看对手的打法用几成（‰）：对紧的人多偷、对跟注站少诈唬多薄打、对爱加注的人放宽跟注。第 0–3 档不看 */
  adapt: number;
  /** 按筹码深浅打：剩的不到 SHORT_BB 个大盲翻牌前只推或弃，很深时多看便宜的翻牌。第 0–3 档不会 */
  depth: boolean;
}

const LUX: Skill = { read: 240, pre: 215, raiser: 30, caller: 55, limper: 80, slack: -5, bluff: 800, tight: 40, soft: 0, slip: 0, value: 1000, third: 0, passive: 0, shy: 0, memory: 250, style: 1000, adapt: 1000, depth: true };

/** 下标是强弱档：0 新手、1 小桌、2 中桌、3 大桌、4 豪华桌、5 最强（功力同豪华桌，性格按 STRONG 挑最强的） */
export const SKILL: readonly Skill[] = [
  { read: 600, pre: 600, raiser: 100, caller: 100, limper: 100, slack: 150, bluff: 100, tight: -250, soft: 1000, slip: 400, value: 300, third: 1000, passive: 950, shy: 800, memory: 0, style: 300, adapt: 0, depth: false },
  { read: 550, pre: 500, raiser: 100, caller: 100, limper: 100, slack: 120, bluff: 120, tight: -220, soft: 1000, slip: 350, value: 330, third: 1000, passive: 930, shy: 750, memory: 0, style: 600, adapt: 0, depth: false },
  { read: 460, pre: 400, raiser: 100, caller: 100, limper: 100, slack: 40, bluff: 250, tight: -200, soft: 1000, slip: 300, value: 400, third: 1000, passive: 900, shy: 700, memory: 0, style: 500, adapt: 0, depth: false },
  { read: 420, pre: 300, raiser: 100, caller: 100, limper: 100, slack: 30, bluff: 500, tight: -150, soft: 800, slip: 250, value: 500, third: 800, passive: 700, shy: 450, memory: 0, style: 550, adapt: 0, depth: false },
  { ...LUX, value: 900, passive: 150, shy: 150 },
  LUX,
];
