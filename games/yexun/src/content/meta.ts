/**
 * 开局选的东西：咒印、角色、永久加成（DESIGN.md 3.7、3.8、13.2）。规则效果在核心里按这些表算；
 * 解锁条件和铜钱怎么花在 `src/platform/save.ts`。实盘不开咒印、不带加成，角色和地图可选已解锁的（4.1）。
 */
import type { WeaponId } from './weapons.ts';

// ───────────────────────── 咒印 ─────────────────────────

export type CurseId = 'fast' | 'noheal' | 'noreroll' | 'more' | 'elites' | 'dark' | 'rage' | 'moon';
export const CURSE_IDS: readonly CurseId[] = ['fast', 'noheal', 'noreroll', 'more', 'elites', 'dark', 'rage', 'moon'];
/** 一局最多挂几条 */
export const MAX_CURSES = 3;
/** 每挂一条，这局结束拿到的铜钱多几成 */
export const CURSE_COIN_BONUS = 0.25;

export interface CurseDef {
  id: CurseId;
  name: string;
  /** 分享卡上写的一句（单字 name 离开选关页不好懂） */
  label: string;
  text: string;
}

export const CURSES: Record<CurseId, CurseDef> = {
  fast: { id: 'fast', name: '疾', label: '怪更快', text: '怪走得快 15%' },
  noheal: { id: 'noheal', name: '枯', label: '少回血', text: '肉包和回血减半' },
  noreroll: { id: 'noreroll', name: '定', label: '禁用刷新', text: '不能刷新卡片' },
  more: { id: 'more', name: '众', label: '怪更多', text: '怪多 25%' },
  elites: { id: 'elites', name: '凶', label: '精英更多', text: '每次精英多来一只' },
  dark: { id: 'dark', name: '暗', label: '夜更黑', text: '夜更黑，看得更近' },
  rage: { id: 'rage', name: '狂', label: '精英发狂', text: '精英掉过半血就发狂' },
  moon: { id: 'moon', name: '月', label: '血月', text: '血月当空，怪一阵阵发疯' },
};

/** 咒印的数值（核心按这些算；"暗"只改画面，看得见的半径） */
export const CURSE_FX = { fastSpeed: 1.15, noheal: 0.5, moreCount: 1.25, darkView: 0.6 };

// ───────────────────────── 角色 ─────────────────────────

export type CharacterId = 'xiaodao' | 'fushi' | 'jianxia' | 'pang' | 'gengfu' | 'caiyao' | 'zhijiang' | 'baidu' | 'huolang' | 'yinyang';
/** 顺序 = 技能编号（core/skills.ts 的 SKILL_IDS）= 角色页的排列；以后加角色往后加，别插队 */
export const CHARACTER_IDS: readonly CharacterId[] = ['xiaodao', 'fushi', 'jianxia', 'pang', 'gengfu', 'caiyao', 'zhijiang', 'baidu', 'huolang', 'yinyang'];

export interface CharacterDef {
  id: CharacterId;
  name: string;
  start: WeaponId;
  /** 专属被动的名字（角色卡上的小标题） */
  perkName: string;
  /** 专属被动，一句话 */
  perk: string;
  /** 怎么解锁，一句话（判断在 save.ts） */
  unlock: string;
  /** 一句话的人设（角色卡上） */
  look: string;
  /** 台词：选中时显示在卡上，开局时头上冒一次气泡。大白话，有性格 */
  line: string;
  /** 初始数值（所有者 10-20：以小道士为 1 的倍数；运气是加数）。角色页画成 6 根条 */
  base: CharBase;
  /** 小特权，一句话（后加的角色没有，他们的特色都在主动技能和被动里） */
  privilege?: string;
}

/** 初始数值：血量、移速、伤害、冷却（越小越快）、范围、拾取范围是倍数，运气是加数 */
export interface CharBase {
  hp: number;
  speed: number;
  might: number;
  cd: number;
  area: number;
  magnet: number;
  luck: number;
}
const EVEN: CharBase = { hp: 1, speed: 1, might: 1, cd: 1, area: 1, magnet: 1, luck: 0 };

/** 角色解锁的门槛（platform/save.ts 的 charOpen 判；角色卡、角色页进度的文案都从这几个数拼） */
/** 纸匠：守夜一局撑过这么久（秒） */
export const ZHIJIANG_SECONDS = 4 * 60;
/** 更夫：守夜一局撑过这么久（秒） */
export const GENGFU_SECONDS = 8 * 60;
/** 摆渡人：夜探撤出过之后，守夜一局撑过这么久（秒） */
export const BAIDU_SECONDS = 6 * 60;
/** 货郎：夜市买过几次东西 */
export const HUOLANG_BUYS = 3;
/** 胖师叔的价钱 */
export const PANG_PRICE = 300;

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  xiaodao: { id: 'xiaodao', name: '小道士', start: 'sword', perkName: '越战越勇', perk: '每升 5 级，伤害、范围、持续、移速各 +1.5%', unlock: '一开始就有', look: '蓝袍桃木剑，什么都会一点', line: '师父说，夜路不怕，怕的是不走。', base: EVEN, privilege: '起步多 1 次刷新' },
  fushi: { id: 'fushi', name: '符师', start: 'talisman', perkName: '连环符', perk: '符类冷却 −10%，每第 4 次出符多飞一张', unlock: '一开始就有', look: '紫袍高冠，腰上挂满黄符', line: '符纸管够，今晚谁来都是一张。', base: { ...EVEN, hp: 0.9, cd: 0.92, area: 1.1 }, privilege: '起步多 1 次封禁' },
  jianxia: { id: 'jianxia', name: '剑侠', start: 'flysword', perkName: '剑不停步', perk: '走动时暴击 +12%，暴击更疼 +30%', unlock: '一开始就有', look: '青衣红围巾，背着一把长剑', line: '剑在鞘里闷得慌，边走边打。', base: { ...EVEN, hp: 1.15, speed: 1.1, might: 1.15, area: 0.95 }, privilege: '打倒精英多补 1 次刷新' },
  pang: { id: 'pang', name: '胖师叔', start: 'bell', perkName: '皮糙肉厚', perk: '挨打时震开身边的怪', unlock: `花 ${PANG_PRICE} 铜钱请他`, look: '橙袍大圆脸，手里摇着小铃', line: '吃饱了才有力气，挨两下不算啥。', base: { ...EVEN, hp: 1.45, speed: 0.9, magnet: 1.2 }, privilege: '跳过时抽中回血的机会翻倍' },
  gengfu: { id: 'gengfu', name: '更夫', start: 'shield', perkName: '三更锣', perk: '每 24 秒敲一声锣：全屏的怪被震退并受伤，金钟罩补一层', unlock: `守夜撑过 ${GENGFU_SECONDS / 60} 分钟`, look: '灰袄毡帽，一手锣一手灯笼', line: '天干物燥——小心火烛——咣！', base: { ...EVEN, hp: 0.95, area: 1, cd: 1.1 }, privilege: '夜市提前 10 秒预告、多开 5 秒' },
  caiyao: { id: 'caiyao', name: '采药女', start: 'petals', perkName: '百草香', perk: '每秒回 0.7 血，肉包回血加倍，经验 +20%', unlock: '夜探成功撤出 1 次', look: '青裙双髻，背着药篓采药', line: '药篓里什么都有，也有给你的。', base: { ...EVEN, hp: 0.95, luck: 0.15, magnet: 1.2 }, privilege: '夜市打九折' },
  zhijiang: { id: 'zhijiang', name: '纸匠', start: 'zhibing', perkName: '巧手', perk: '纸兵活得久 30%，倒下时两成概率还你一张纸兵的冷却；身边的纸兵会替你挨一下，挨完就碎', unlock: `守夜撑过 ${ZHIJIANG_SECONDS / 60} 分钟`, look: '蓝布衫挽着袖子，手里总捏着一把剪刀', line: '纸也能站岗——你信不信？', base: { ...EVEN, hp: 0.9, speed: 1.05, might: 0.95, cd: 0.95, area: 1.1, magnet: 1.1 } },
  baidu: { id: 'baidu', name: '摆渡人', start: 'pole', perkName: '顺水', perk: '水里不减速，冰面不打滑，水类法器伤害 +50%，竹篙冷却 −25%、多戳一下', unlock: `夜探撤出 1 次后，守夜撑过 ${BAIDU_SECONDS / 60} 分钟`, look: '蓑衣斗笠，肩上扛着长竹篙', line: '上船不问来路，下船不问归途。', base: { ...EVEN, hp: 1.05, speed: 1.1, might: 1.05, cd: 1.05, area: 1.05 } },
  huolang: { id: 'huolang', name: '货郎', start: 'dart', perkName: '讨价', perk: '夜市九折，局内铜钱 +15%，铜钱每满 100 枚伤害 +1%（最多 +10%）；每捡 100 枚铜钱补一次刷新', unlock: `夜市买过 ${HUOLANG_BUYS} 次东西`, look: '花布头巾，挑着一副叮当响的货担', line: '好货不贵，不好的白送。', base: { ...EVEN, hp: 1, speed: 1.05, might: 0.95, magnet: 1.3, luck: 0.1 } },
  yinyang: { id: 'yinyang', name: '阴阳先生', start: 'flag', perkName: '阴阳互济', perk: '血过半是阳：伤害 +8%；不足一半是阴：技能冷却 −8%，捆、定住的怪多定半秒；血量越过一半那一下（阳变阴、阴变阳都算）脚下炸一圈，身边的怪定住 1 秒，两个方向共用 20 秒冷却', unlock: '守夜撑到天亮 1 次', look: '黑袍方巾，腰间挂着罗盘和八卦牌', line: '阴阳有序，今晚的账我来算。', base: { ...EVEN, hp: 0.95, speed: 0.95, might: 1.05, cd: 1.05, area: 1.1 } },
};


/** 角色被动的数值 */
export const CHAR_FX = {
  xiaodaoEvery: 5,
  xiaodaoStep: 0.015,
  fushiCd: 0.9,
  /** 每第几次出符，那一轮多飞一张 */
  fushiEvery: 4,
  jianxiaCrit: 0.12,
  jianxiaCritDmg: 0.3,
  /** 胖师叔：挨打时震开的半径和力道（血多、走得慢在初始数值 base 里） */
  pangArea: 130,
  pangKnock: 40,
  /** 更夫的锣：隔几拍一次、多远的怪被震、退多远，伤害 = 底 + 每级 × 等级 */
  // 1.1：0.2.0 模拟里更夫胜率约 60%（六个角色最高），锣 20 → 24 秒一声、伤害 20 → 15
  gongEvery: 24 * 30,
  gongArea: 720,
  gongKnock: 40,
  gongDmg: 15,
  gongPerLevel: 3,
  caiyaoBun: 2,
  caiyaoXp: 0.2,
  caiyaoRegen: 0.7,
  /** 小特权（0.4.5）：剑侠打倒精英多补几次刷新；胖师叔跳过抽回血的权重倍数；更夫夜市提前预告、多开的拍数；采药女夜市价格倍数 */
  jianxiaReroll: 1,
  pangSkipHeal: 2,
  gengfuMarketWarn: 10 * 30,
  gengfuMarketLonger: 5 * 30,
  caiyaoMarket: 0.9,
  /** 纸匠·巧手：纸兵寿命倍数；纸兵倒下时还冷却的概率（由拍号和槽位算出的固定散列决定，不占随机流） */
  zhijiangLife: 1.3,
  zhijiangRefund: 0.2,
  /** 摆渡人·顺水：水类法器（五行为水）的伤害倍数（起手竹篙也是水类） */
  baiduWater: 1.5,
  /** 摆渡人的竹篙冷却倍数（另外多戳一下，core/step.ts） */
  baiduPoleCd: 0.75,
  /** 货郎·讨价：夜市价格倍数、局内铜钱额外概率、每满多少枚铜钱伤害 +1%（最多 +10%） */
  huolangMarket: 0.9,
  huolangCoin: 0.15,
  huolangPer: 100,
  huolangStep: 0.01,
  huolangMax: 0.1,
  /** 阴阳先生·阴阳互济：血过半（含半）时的伤害倍数；不足一半时技能冷却的减幅 */
  yinyangHigh: 1.08,
  yinyangCd: 0.08,
  /** 阴时缚妖索、阵旗定身多几拍——阳靠打，阴靠控 */
  yinyangBind: 15,
  /** 血量越过一半（阴变阳或阳变阴）那一下，定阵那么大的一圈里的怪定住几拍；两个方向共用一个冷却（拍） */
  yinyangFlipBind: 30,
  yinyangFlipCd: 20 * 30,
  /**
   * 角色钩子：纸匠身边 zhijiangStandInR 以内的纸兵替他挨一下（纸兵下一拍倒下）；
   * 货郎每捡 huolangRerollEvery 枚铜钱补一次刷新（一局常捡五百到一千多枚，约补 5～13 次；刷新存满时不补）
   */
  zhijiangStandInR: 90,
  huolangRerollEvery: 100,
  /** 前几次升级里，和初始法器同一类（剑 / 符 / 镇 / 灵）的法器卡权重乘多少 */
  earlyEvery: 5,
  earlyMul: 1.3,
};

// ───────────────────────── 永久加成 ─────────────────────────

export type PerkId = 'liliang' | 'huti' | 'tipo' | 'shenxing' | 'lingqi' | 'wuxing' | 'fuyuan' | 'fuhuo' | 'shuaxin' | 'kapian';
export const PERK_IDS: readonly PerkId[] = ['liliang', 'huti', 'tipo', 'shenxing', 'lingqi', 'wuxing', 'fuyuan', 'fuhuo', 'shuaxin', 'kapian'];

export interface PerkDef {
  id: PerkId;
  name: string;
  /** 每级的效果，一句话 */
  text: string;
  /** 每一级的价格（长度就是最高级） */
  cost: readonly number[];
}

/** 价格逐级涨；第一局结束送的铜钱正好够买一级最便宜的（FIRST_RUN_COINS，3.8） */
export const PERKS: Record<PerkId, PerkDef> = {
  liliang: { id: 'liliang', name: '力量', text: '伤害 +5%', cost: [100, 200, 350, 550, 800] },
  huti: { id: 'huti', name: '护体', text: '每次挨打少掉 1 点血', cost: [200, 450, 800] },
  tipo: { id: 'tipo', name: '体魄', text: '血上限 +10', cost: [100, 200, 350, 550, 800] },
  shenxing: { id: 'shenxing', name: '神行', text: '移速 +4%', cost: [150, 300, 500] },
  lingqi: { id: 'lingqi', name: '灵气', text: '冷却 −3%', cost: [150, 300, 500, 750, 1050] },
  wuxing: { id: 'wuxing', name: '悟性', text: '魂珠 +5%', cost: [100, 200, 350, 550, 800] },
  fuyuan: { id: 'fuyuan', name: '福缘', text: '运气 +5%，铜钱 +5%', cost: [120, 250, 420, 650, 900] },
  fuhuo: { id: 'fuhuo', name: '复活', text: '倒下时原地站起来一次（半血）', cost: [1500] },
  shuaxin: { id: 'shuaxin', name: '刷新', text: '每局刷新次数 +1', cost: [300, 700, 1200] },
  kapian: { id: 'kapian', name: '多一张', text: '升级时多给一张卡', cost: [2000] },
};

export const PERK_FX = { liliang: 0.05, huti: 1, tipo: 10, shenxing: 0.04, lingqi: 0.03, wuxing: 0.05, fuyuan: 0.05, fuhuo: 1, shuaxin: 1, kapian: 1 };

/** 第一局（无论胜负）结束至少给这么多铜钱：正好够买一级最便宜的加成 */
export const FIRST_RUN_COINS = 100;

/**
 * 一局结束另给的铜钱（所有者 2026-10-17："筹码要丰富"，娱乐模式收益别抠）：每局都看得到进账，结算页按来源列。
 * 撑的时间、击杀、天亮、打倒尸王四项按危险档放大（每档 +dangerStep）；每日首胜一天一次（按北京时间的日期）。
 * 量级：危险 2 撑到天亮约 600–900 枚一局，最便宜的加成 100 枚，一套加成十几局攒齐。
 */
/** rushBoss：首领连战每打倒一只（夜漏君之前的 10 只）给几枚，再乘危险档；连战的分钟、夜漏君沿用 perMin、boss（platform/save.ts rushCoins） */
export const RUN_BONUS = { perMin: 10, killsPer: 40, dawn: 120, boss: 200, dangerStep: 0.2, dailyWin: 150, rushBoss: 12 };

/** 复活：站起来时的血和无敌拍数，身边的怪震开 */
export const REVIVE = { hp: 0.5, invuln: 90, area: 260, knock: 90 };

/** 连死几局后问"要不要降低伤害"；开着时挨打 × dmg，成绩不进总榜（13.2） */
export const ASSIST = { deaths: 3, dmg: 0.7 };

// ───────────────────────── 铜钱的用途：换筹码、锦囊、外观（0.35.0，DESIGN 3.8a） ─────────────────────────

/**
 * 铜钱换筹码：rate 枚换 1 个筹码；每天能换多少由平台钱包定（默认 2,000，管理页可调），dailyCap 只是拿不到额度时界面上写的数。
 * 换满一天要 6,000 枚，约 3～4 局普通守夜；同样的时间打小档实盘期望高 2.5 倍以上，不挤掉实盘（所有者 11-21 定）。
 */
export const COIN_EXCHANGE = { rate: 3, dailyCap: 2_000, steps: [100, 500, 1_000] as const };

/** 换筹码、实盘带入处写明（仓库根 AGENTS.md 第 4 节「不碰真钱」） */
export const CHIPS_NO_CASH = '筹码只在游戏厅里用，无任何现金价值';

/** 局的种类：能带什么按它分（runKind 从开局设置认；每日挑战认不出，交榜前 online/daily.ts isDailySetup 核） */
export type RunKind = 'play' | 'live' | 'daily' | 'weekly' | 'rush' | 'trial' | 'teach';
export const RUN_KIND_NAMES: Record<Exclude<RunKind, 'play'>, string> = { live: '实盘', daily: '每日守夜', weekly: '本周夜事', rush: '首领连战', trial: '试炼', teach: '教学镇' };

/**
 * 各种局能带的局前选择（normalizeSetup、开局扣锦囊、说明文案都读这张表）：
 * 排行榜局（每日、本周夜事、连战、试炼）人人一样，都不带；实盘带起手和心法（实盘系数按带着配的），不带锦囊；教学镇倒下不丢包，不收锦囊的铜钱
 */
export const CARRY = {
  kits: ['play'],
  xinfa: ['play', 'live', 'teach'],
  startAlt: ['play', 'live', 'teach'],
} as const satisfies Record<string, readonly RunKind[]>;
export type CarryItem = keyof typeof CARRY;

/** 这一局是哪种；每日挑战的 Setup 和普通局长得一样，这里认作 play，不带的东西由开局不给、交榜前 isDailySetup 核（参数只取认种类要的几个字段，首屏不引核心） */
export function runKind(s: { mode: string; live?: boolean; rush?: boolean; weekly?: string; trial?: string; raid?: { template?: string } }): Exclude<RunKind, 'daily'> {
  if (s.trial !== undefined) return 'trial';
  if (s.rush) return 'rush';
  if (s.live) return 'live';
  if (s.weekly !== undefined) return 'weekly';
  if (s.mode === 'raid' && s.raid?.template === 'teach') return 'teach';
  return 'play';
}

export function carries(item: CarryItem, kind: RunKind): boolean {
  return (CARRY[item] as readonly RunKind[]).includes(kind);
}

/** 不带这一项的局，按 RUN_KIND_NAMES 的顺序用顿号连起来（「实盘、每日挑战…」） */
export function carryExcept(item: CarryItem): string {
  return (Object.keys(RUN_KIND_NAMES) as Exclude<RunKind, 'play'>[]).filter((k) => !carries(item, k)).map((k) => RUN_KIND_NAMES[k]).join('、');
}

/** 局前锦囊：开局前选上，开局时扣铜钱，只管这一局；哪些局能带见 CARRY */
export type KitId = 'reroll' | 'start2' | 'passive';
export const KIT_IDS: readonly KitId[] = ['reroll', 'start2', 'passive'];
export const KITS: Record<KitId, { name: string; text: string; cost: number }> = {
  reroll: { name: '刷新符', text: '起步多 2 次刷新、1 次封禁', cost: 150 },
  start2: { name: '开门红', text: '起手法器直接 2 级', cost: 250 },
  passive: { name: '随身宝', text: '开局多一件随机被动（1 级，从这个角色的池里抽）', cost: 400 },
};
export const KIT_FX = { rerolls: 2, bans: 1 };

/** 外观：全角色通用，只改画面；头像框（HUD、结算页）和脚下光圈各几款，买下永久有 */
export type LookId = 'frame_jade' | 'frame_gold' | 'frame_ink' | 'frame_cinnabar' | 'aura_moon' | 'aura_lotus' | 'aura_ember' | 'aura_frost';
export type LookSlot = 'frame' | 'aura';
export const LOOK_IDS: readonly LookId[] = ['frame_jade', 'frame_gold', 'frame_ink', 'frame_cinnabar', 'aura_moon', 'aura_lotus', 'aura_ember', 'aura_frost'];
export const LOOKS: Record<LookId, { slot: LookSlot; name: string; cost: number; color: string; edge: string }> = {
  frame_jade: { slot: 'frame', name: '青玉框', cost: 2_000, color: '#5fb39a', edge: '#2f6f5e' },
  frame_gold: { slot: 'frame', name: '鎏金框', cost: 2_000, color: '#f2c94c', edge: '#a8741a' },
  frame_ink: { slot: 'frame', name: '墨竹框', cost: 2_000, color: '#3a3f4c', edge: '#17131c' },
  frame_cinnabar: { slot: 'frame', name: '朱砂框', cost: 2_000, color: '#d0453a', edge: '#7e1f1a' },
  aura_moon: { slot: 'aura', name: '月华', cost: 2_000, color: '#cfe3ff', edge: '#6f8fc8' },
  aura_lotus: { slot: 'aura', name: '莲台', cost: 2_000, color: '#f3a9c4', edge: '#b8527a' },
  aura_ember: { slot: 'aura', name: '炭火', cost: 2_000, color: '#ff9a3c', edge: '#b8401a' },
  aura_frost: { slot: 'aura', name: '霜花', cost: 2_000, color: '#bff1ff', edge: '#4aa8c8' },
};
