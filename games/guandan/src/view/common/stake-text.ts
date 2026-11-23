/**
 * 实盘的几句话（docs/stake.md 2.4、第 5 节）。和 quota-text.ts 一样不依赖别的文件：页面和实盘冒烟（tools/stake-smoke.ts，在 Node 里直接跑）共用，
 * 冒烟按这些字核对。
 */

/** 档位的名字 */
export const TIER_NAME = { small: '小档', mid: '中档', big: '大档', lux: '豪华档' } as const;

/** 电脑多强：1–4 颗星（仓库 docs/balance.md 第 5 节，四个游戏一样的写法） */
export function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n));
}

/**
 * 娱乐三档的卡（docs/ai.md 第 2 节）：电脑多强、一局多久、适合谁，随时存档。time 是完整（打过 A），short 是短局（打到 10）。
 * 时长按 `ai-sim length` 的中位数（0.25.0 的出牌节奏，我每手 4 秒估）：完整 新手 7 副约 20 分钟、普通高手 11–12 副约 30 分钟；
 * 短局 新手 4 副约 11 分钟、普通高手 5 副约 14 分钟
 */
export const LEVEL_CARD = {
  novice: { name: '新手', stars: 1, time: '一局约 20 分钟，随时存档', short: '一局约 10 分钟，随时存档', who: '刚学掼蛋，先赢几把找感觉' },
  normal: { name: '普通', stars: 2, time: '一局约 30 分钟，随时存档', short: '一局约 15 分钟，随时存档', who: '会打，想认真赢' },
  pro: { name: '高手', stars: 4, time: '一局约 30 分钟，随时存档', short: '一局约 15 分钟，随时存档', who: '老手，电脑全记牌、残局会算' },
} as const;

/** 局长：娱乐单机开局时选，记在设置里；每档多久看上面卡的 time / short */
export const LENGTH_CARD = {
  short: { name: '短局', goal: '升到 10' },
  full: { name: '完整', goal: '打过 A' },
} as const;

/** 实盘四档的卡：电脑多强；一场 3 副约 8 分钟（docs/stake.md 1.4） */
export const TIER_CARD = {
  small: { stars: 1 },
  mid: { stars: 2 },
  big: { stars: 3 },
  lux: { stars: 4 },
  time: '约 8 分钟',
} as const;

/** 断网（连不上、fetch 失败）统一的一句和按钮字：好友房面板、实盘带入 / 结回、出错面板共用，不各写各的 */
export const NET_DOWN = '网络不通，检查后重试';
export const RETRY_LABEL = '重试';
/** 补给后面跟一句从哪领（大厅里每天领一次） */
const SUPPLY = '补给（每天一次）';

/**
 * 钱包被拒、没连上时页面说的话（按 error）：照平台的错误码对照表（docs/platform-backend.md 15.10），
 * 每句都说清楚出了什么事、怎么办。掼蛋一份的大小跟档位走，"少带一点"就是换小一点的档
 */
export const STAKE_ERROR: Record<string, string> = {
  no_funds: `钱包里的筹码不够这一档，换小一点的档，或者去大厅领${SUPPLY}`,
  limit: '今天开局太多了，明早 0 点恢复；桌上的照常带回，娱乐局照常玩',
  at_table: '这一桌带入的是别的档，换一桌再开',
  expired: '带入的筹码放太久了（超过 24 小时），已经原样退回钱包',
  no_stake: '这一场已经带回过了',
  busy: '服务器今天有点忙，先不能带入筹码开局；娱乐局照常玩，明早恢复',
  internal: '出了点问题，筹码没动，过一会儿再试',
  /** 连不上（浏览器 fetch 失败，或掼蛋的 Worker 连不上钱包）：全站断网统一这一句，旁边配"重试" */
  unavailable: NET_DOWN,
  login: '登录过期了，回大厅重新登录一下',
  /** bad_request、bad_amount 之类：程序写错了 */
  bad: '出了点问题，筹码没动，刷新一下再试',
};

export function stakeError(error: string): string {
  return STAKE_ERROR[error] ?? STAKE_ERROR.bad!;
}

export const STAKE_TEXT = {
  /** 选档页、结算页底下的小字（economy.md 第 0 节：界面写明） */
  noCash: '筹码只在游戏里用，无任何现金价值',
  /** 选档页切到"快速匹配"时，每档时间那行（0.26.0：好友房实盘的规则，和真人打，空位电脑补） */
  matchWho: '和真人打',
  /** 快速匹配时星级那一列（电脑只补空位） */
  matchBots: '空位电脑补',
  /** 掼蛋选档页里切换的位置：娱乐有短局，实盘没有，说清为什么 */
  fixedDeals: '实盘固定打 3 副',
  walletDown: `${NET_DOWN}。实盘先开不了，娱乐局照常玩`,
  lowFunds: `钱包里的筹码不够的档灰掉了：选小一点的档，或者去大厅领${SUPPLY}`,
  /** 四档全灰（钱包连最低档都不够）：没有"小一点的档"可选 */
  noTier: (min: number) => `筹码不够最低档（${fmtChips(min)}），去大厅领${SUPPLY}`,
  /** 平台 0.9.5 起同一个游戏能同时有好几份：别处那一份不挡开新的，只是给个退回的办法 */
  // 掼蛋和斗地主的选档页共用（各认各的那一份），不写玩法
  elsewhere: '别的设备上还有一场实盘没打完，不影响开新的',
  refundAsk: '实盘还没开始计分，现在退出会把带入的筹码原样退回',
  settleLater: `${NET_DOWN}。结果存着，下次打开会接着带回`,
  gone: '这一场已经带回过了',
  capped: (n: number) => `今天单机实盘赢够了，多出的 ${fmtChips(n)} 没进钱包；好友房不限`,
} as const;

/** 好友房实盘：这个座位这一场不计输赢的原因（房间的 why：钱包的错误码，或 need_two） */
export function roomWhy(why: string): string {
  if (why === 'need_two') return '开局时真人不到两个，这一场不计输赢';
  if (why === 'left') return '你中途离开过，已经按当时的分带回钱包';
  // 带入被拒（0.6.0 起旁边有"重新带入"）：照平台的对照表说清楚为什么、怎么办
  if (why === 'no_funds') return `钱包里的筹码不够这一档，没带入；去大厅领${SUPPLY}后点"重新带入"`;
  if (why === 'limit') return '今天开局太多了，没带入；明早 0 点恢复，这局照常打';
  if (why === 'busy') return '服务器今天有点忙，没带入；这局照常打，过一会儿点"重新带入"';
  return `${NET_DOWN}。没带入，点"重新带入"`;
}

export const ROOM_STAKE_TEXT = {
  needTwo: '实盘好友房至少要两个人；一个人想玩实盘，去单机',
  bots: '电脑一律最强',
  /** 0.6.0 起离开立即结算 */
  leave: '离开房间？按现在的分马上带回钱包，之后电脑接着打，输赢不再算你的；回来会重新带入',
  pending: '带入在办，到账之前的分归庄家',
} as const;

/** 中途结算那一行：按现在的分结回多少（back = 带入的一份加输赢，调用方用 stake 的 payout 算） */
/** 模板里 {0} 是分、{1} 是筹码（画面用 signedLine 红绿，fillSigned 拼成整句） */
export function settleNowText(back: number): string {
  return `现在带回：按 {0} 分（{1}）带回 ${fmtChips(back)} 筹码`;
}

/** 确认框里的一行：模板 + 数字（{0}、{1} 画面上红绿，fillSigned 拼成整句） */
export interface SignedRow {
  tpl: string;
  nums: number[];
}

/**
 * 好友房实盘离开：把数字写出来。两副之间（结算页）当场结回；一副打到一半走的，这一副电脑替他打完、输赢照算，打完按那时的分结回。
 * 拆成短行：确认框里一行放不下一整句（signedLine 不换行），每行 ≤14 字，带输赢的那一行单独成行好上色；fillSigned 逐行拼起来就是原来的整句
 */
export function roomLeaveText(points: number, chips: number, back: number, midDeal = false): SignedRow[] {
  const nums = [points, chips];
  if (midDeal) {
    return [
      { tpl: '离开房间？这一副电脑', nums: [] },
      { tpl: '替你打完、输赢照算，', nums: [] },
      { tpl: '打完按那时的分带回', nums: [] },
      { tpl: '（现在 {0} 分，{1}）；', nums },
      { tpl: '之后输赢不再算你的，', nums: [] },
      { tpl: '回来会重新带入', nums: [] },
    ];
  }
  return [
    { tpl: '离开房间？按现在的 ', nums: [] },
    { tpl: '{0} 分（{1}）', nums },
    { tpl: `马上带回 ${fmtChips(back)} 筹码，之后`, nums: [] },
    { tpl: '电脑接着打，输赢不再算你的；', nums: [] },
    { tpl: '回来会重新带入', nums: [] },
  ];
}

/** 若干行拼成整句（测试、比较用） */
export function fillRows(rows: readonly SignedRow[]): string {
  return rows.map((r) => fillSigned(r.tpl, r.nums)).join('');
}

/** 筹码数：千分位（不用 toLocaleString，免得跟着系统区域变） */
export function fmtChips(n: number): string {
  const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `−${s}` : s;
}

/** 带符号的数：+1,500 / −1,500 / 0 */
export function signed(n: number): string {
  return n > 0 ? `+${fmtChips(n)}` : fmtChips(n);
}

/** 把 `{0}`、`{1}` 换成 signed(nums[i])：和画面上 signedLine 同一份模板拼出整句（判断顶栏要不要重画用） */
export function fillSigned(tpl: string, nums: readonly number[]): string {
  return tpl.replace(/\{(\d+)\}/g, (_, i: string) => signed(nums[Number(i)] ?? 0));
}
