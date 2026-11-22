/**
 * 共用电脑名册（docs/personas.md）：全站牌类游戏里的同一批人，名字、人设、口头禅、头像、性格都在这里，每个游戏把性格翻译成自己的打法。
 * 只有数据和纯函数：不懂任何一种牌的规则，不碰 DOM、存储、网络；随机只用传进来的种子（rng.ts 的流），整数运算，同输入同输出。
 * 名册只往后加人，不改 id（游戏存档、录像、昵称保留名单按 id 和名字认人）。
 */
import { type Entropy, type RandomStream, stream } from './rng.js';

/** 性格，都是 0–100 的整数 */
export interface Traits {
  /** 激进：抢着出手、加注、碰杠 */
  aggr: number;
  /** 冒险：做大、下重注、早用大牌 */
  risk: number;
  /** 诈唬：牌不好也装作好 */
  bluff: number;
  /** 耐心：等好机会、肯跟、肯忍 */
  patience: number;
  /** 细心：少犯错、会算、会读别人 */
  care: number;
  /** 上头：输了以后打法变形的程度 */
  tilt: number;
  /** 起伏：一场一场手感差多少 */
  form: number;
  /** 话多 */
  talk: number;
  /** 变招：碰到触发条件时换打法的概率 */
  switchy: number;
}

export const TRAIT_KEYS = ['aggr', 'risk', 'bluff', 'patience', 'care', 'tilt', 'form', 'talk', 'switchy'] as const satisfies readonly (keyof Traits)[];

/** 什么情况下会换打法：输多了、领先了、被针对、牌桌松、按节奏 */
export type SwitchWhy = 'losing' | 'leading' | 'targeted' | 'loose' | 'rhythm';

/** 头像的画法参数（personaFace 用） */
export interface Look {
  skin: string;
  hair: 'short' | 'spiky' | 'bun' | 'bald' | 'long' | 'curly';
  hairColor: string;
  acc: 'none' | 'glasses' | 'headband' | 'cap' | 'hat' | 'flower' | 'beard';
  shirt: string;
}

export interface Person {
  id: string;
  name: string;
  /** 一句人设（头像旁的小字） */
  bio: string;
  /** 口头禅：和具体哪种牌无关的几句 */
  catchphrases: readonly string[];
  /** 出现在哪档：0 新手 1 普通 2 稳 3 老练 4 高手（谁能上哪张桌，强度由游戏定） */
  level: 0 | 1 | 2 | 3 | 4;
  traits: Traits;
  /** 换打法后改成的值（只写要改的项） */
  alt: Partial<Traits>;
  /** 哪些情况会让他换打法 */
  switchOn: readonly SwitchWhy[];
  /** 牌桌互动的脾气（table-fun 的 FunTemper） */
  fun: 'rowdy' | 'normal' | 'cool';
  /** 出手快慢：思考时间的千分比，1000 = 平常 */
  tempo: number;
  look: Look;
}

const t = (aggr: number, risk: number, bluff: number, patience: number, care: number, tilt: number, form: number, talk: number, switchy: number): Traits => ({
  aggr, risk, bluff, patience, care, tilt, form, talk, switchy,
});

const SKIN = { light: '#ffe0c4', mid: '#f6cfa6', warm: '#eab98e', old: '#f3d2b4' } as const;

export const ROSTER: readonly Person[] = [
  {
    id: 'laozhang', name: '老张', bio: '豪爽，有大牌就想亮', catchphrases: ['痛快！', '再来再来', '怕什么'], level: 2,
    traits: t(70, 75, 40, 35, 50, 30, 60, 70, 30), alt: { aggr: 35, risk: 35 }, switchOn: ['leading', 'rhythm'], fun: 'rowdy', tempo: 800,
    look: { skin: SKIN.old, hair: 'bald', hairColor: '#cfcfcf', acc: 'glasses', shirt: '#8a5a3c' },
  },
  {
    id: 'xiaomei', name: '小美', bio: '稳，大牌捂到最后', catchphrases: ['不急', '慢慢来', '等我一下'], level: 3,
    traits: t(30, 25, 20, 85, 80, 0, 30, 25, 35), alt: { aggr: 75, risk: 70 }, switchOn: ['targeted'], fun: 'cool', tempo: 1250,
    look: { skin: SKIN.light, hair: 'bun', hairColor: '#2a1d1a', acc: 'flower', shirt: '#6b3fa0' },
  },
  {
    id: 'aqiang', name: '阿强', bio: '莽，什么都想压', catchphrases: ['我不服！', '再来一把', '冲！'], level: 1,
    traits: t(90, 70, 55, 15, 40, 100, 80, 85, 25), alt: { aggr: 100, risk: 90, care: 25 }, switchOn: ['losing'], fun: 'rowdy', tempo: 650,
    look: { skin: SKIN.warm, hair: 'spiky', hairColor: '#1d1d1d', acc: 'headband', shirt: '#f0b72f' },
  },
  {
    id: 'wengge', name: '稳哥', bio: '好牌才进，进了就打', catchphrases: ['稳住', '这把有了', '不跟了'], level: 3,
    traits: t(45, 30, 25, 90, 75, 20, 30, 30, 30), alt: { aggr: 70, bluff: 50, patience: 60 }, switchOn: ['losing'], fun: 'cool', tempo: 1150,
    look: { skin: SKIN.mid, hair: 'short', hairColor: '#3a2a20', acc: 'none', shirt: '#2f5d8a' },
  },
  {
    id: 'laohao', name: '老好', bio: '爱跟，很难被吓走', catchphrases: ['跟一个', '看看再说', '哈哈都行'], level: 1,
    traits: t(20, 50, 10, 40, 35, 40, 50, 80, 20), alt: { patience: 75, aggr: 35 }, switchOn: ['targeted'], fun: 'rowdy', tempo: 900,
    look: { skin: SKIN.warm, hair: 'short', hairColor: '#4a3a2a', acc: 'beard', shirt: '#4f8a3c' },
  },
  {
    id: 'manman', name: '慢慢', bio: '很少出头，好牌爱装弱', catchphrases: ['嗯……', '我想想', '随便'], level: 2,
    traits: t(15, 20, 5, 95, 70, 10, 30, 20, 40), alt: { aggr: 70, bluff: 35 }, switchOn: ['loose'], fun: 'cool', tempo: 1400,
    look: { skin: SKIN.light, hair: 'long', hairColor: '#5a3b2a', acc: 'glasses', shirt: '#9aa0a6' },
  },
  {
    id: 'suanpan', name: '算盘', bio: '精打细算', catchphrases: ['算过了', '不划算', '这个数可以'], level: 4,
    traits: t(50, 40, 45, 70, 90, 0, 20, 35, 50), alt: { bluff: 70, aggr: 65 }, switchOn: ['rhythm'], fun: 'cool', tempo: 1100,
    look: { skin: SKIN.mid, hair: 'short', hairColor: '#202020', acc: 'glasses', shirt: '#3d4b5c' },
  },
  {
    id: 'jianghu', name: '江湖', bio: '爱下套，过一手再反打', catchphrases: ['你猜', '江湖规矩', '有意思'], level: 3,
    traits: t(55, 55, 60, 65, 70, 20, 40, 50, 60), alt: { bluff: 30, patience: 40, aggr: 70 }, switchOn: ['targeted'], fun: 'normal', tempo: 1000,
    look: { skin: SKIN.warm, hair: 'long', hairColor: '#2b2b2b', acc: 'hat', shirt: '#5c3b2e' },
  },
  {
    id: 'huzi', name: '虎子', bio: '爱唬人，下手又大又猛', catchphrases: ['敢不敢', '全压了', '就问你怕不怕'], level: 2,
    traits: t(85, 85, 85, 20, 45, 60, 60, 60, 35), alt: { bluff: 35, aggr: 60 }, switchOn: ['targeted'], fun: 'rowdy', tempo: 750,
    look: { skin: SKIN.warm, hair: 'spiky', hairColor: '#6b3a1e', acc: 'none', shirt: '#c0392b' },
  },
  {
    id: 'laoying', name: '老鹰', bio: '挑着出手，一出就猛', catchphrases: ['盯上你了', '机会来了', '就这把'], level: 4,
    traits: t(75, 50, 55, 75, 80, 10, 25, 25, 45), alt: { aggr: 85, bluff: 65 }, switchOn: ['loose', 'rhythm'], fun: 'cool', tempo: 1050,
    look: { skin: SKIN.mid, hair: 'short', hairColor: '#8a8a8a', acc: 'cap', shirt: '#2e3a2f' },
  },
  {
    id: 'yaomeir', name: '幺妹儿', bio: '快，见好就收、爱抢', catchphrases: ['我先来！', '要得', '快点嘛'], level: 1,
    traits: t(80, 40, 30, 20, 45, 30, 30, 70, 30), alt: { aggr: 45, risk: 75, patience: 60 }, switchOn: ['losing'], fun: 'rowdy', tempo: 650,
    look: { skin: SKIN.light, hair: 'long', hairColor: '#1f1410', acc: 'flower', shirt: '#e0567a' },
  },
  {
    id: 'xiongmao', name: '熊猫哥', bio: '贪大的，要做就做大', catchphrases: ['等等，要来大的', '巴适', '安逸'], level: 2,
    traits: t(45, 95, 40, 55, 45, 60, 50, 80, 30), alt: { risk: 50, patience: 75, care: 65 }, switchOn: ['targeted'], fun: 'normal', tempo: 1000,
    look: { skin: SKIN.mid, hair: 'curly', hairColor: '#1a1a1a', acc: 'none', shirt: '#2b2b2b' },
  },
  {
    id: 'gaiwan', name: '盖碗儿', bio: '稳，规规矩矩', catchphrases: ['喝口茶', '莫慌', '稳到起'], level: 3,
    traits: t(15, 20, 10, 95, 95, 10, 20, 25, 35), alt: { aggr: 45, risk: 70 }, switchOn: ['rhythm'], fun: 'cool', tempo: 1350,
    look: { skin: SKIN.old, hair: 'short', hairColor: '#e6e6e6', acc: 'glasses', shirt: '#3f6e5a' },
  },
  {
    id: 'tutou', name: '兔头哥', bio: '爱冲，输了容易上头', catchphrases: ['来来来', '不服再来', '冲就完了'], level: 1,
    traits: t(75, 60, 35, 30, 45, 70, 50, 90, 25), alt: { aggr: 90, risk: 80, care: 30 }, switchOn: ['losing'], fun: 'rowdy', tempo: 850,
    look: { skin: SKIN.warm, hair: 'spiky', hairColor: '#7a4a2a', acc: 'cap', shirt: '#e67e22' },
  },
  {
    id: 'hgpp', name: '火锅婆婆', bio: '老练，攻守都细', catchphrases: ['年轻人莫急', '看到起', '婆婆我见得多'], level: 4,
    traits: t(55, 35, 40, 75, 100, 0, 25, 40, 55), alt: { aggr: 75, patience: 55 }, switchOn: ['targeted', 'losing'], fun: 'cool', tempo: 1150,
    look: { skin: SKIN.old, hair: 'bun', hairColor: '#dcdcdc', acc: 'none', shirt: '#b03a2e' },
  },
  {
    id: 'bandeng', name: '板凳儿', bio: '新手，什么都想试试', catchphrases: ['这样对吗？', '我再学学', '哎呀'], level: 0,
    traits: t(40, 50, 10, 30, 10, 90, 80, 60, 0), alt: {}, switchOn: [], fun: 'normal', tempo: 900,
    look: { skin: SKIN.light, hair: 'short', hairColor: '#3b2a1f', acc: 'none', shirt: '#7fb3d5' },
  },
];

const BY_ID = new Map(ROSTER.map((p) => [p.id, p]));

export function personById(id: string): Person {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`unknown persona: ${id}`);
  return p;
}

/** 换打法的判断按"段"走：一段这么多手（局、副）里要么一直换、要么一直不换，不会一手一变 */
export const SWITCH_WINDOW = 10;

/** 这一手的局面（游戏只给公开信息） */
export interface PersonaCtx {
  /** 第几手（局、副），从 0 起 */
  hand: number;
  /** 这一场的手感 −100..100（游戏按种子抽，一场一个） */
  form: number;
  /** 现在上头多少 0..100（游戏按刚输的大小算） */
  tiltNow: number;
  /** 连着输了几手 */
  lossRun: number;
  /** 现在的位置 −100（垫底）..100（领先） */
  lead: number;
  /** 这一段里被同一家针对了几次（压他、抓他、点他） */
  targeted: number;
  /** 牌桌松不松 0..100 */
  tableLoose: number;
}

export interface TraitsNow {
  traits: Traits;
  mode: 'base' | 'alt';
  /** 换打法的原因（画面和台词用；电脑出牌只读 traits） */
  why: SwitchWhy | null;
}

function active(why: SwitchWhy, ctx: PersonaCtx): boolean {
  switch (why) {
    case 'losing':
      return ctx.lossRun >= 3 || ctx.lead <= -50;
    case 'leading':
      return ctx.lead >= 50;
    case 'targeted':
      return ctx.targeted >= 2;
    case 'loose':
      return ctx.tableLoose >= 70;
    case 'rhythm':
      return true;
  }
}

const clamp = (x: number): number => Math.max(0, Math.min(100, x));

/**
 * 这一手的有效性格：底子 →（满足条件时）换打法 → 手感 → 上头，最后夹在 0–100。
 * 换不换按 seed 和第几段抽（同一段同一个原因结果一样）；按节奏换的概率是变招的四分之一，其余原因按变招的概率。
 */
export function traitsNow(p: Person, ctx: PersonaCtx, seed: Entropy): TraitsNow {
  const window = Math.floor(Math.max(0, ctx.hand) / SWITCH_WINDOW);
  let why: SwitchWhy | null = null;
  for (const w of p.switchOn) {
    if (!active(w, ctx)) continue;
    const chance = w === 'rhythm' ? Math.trunc(p.traits.switchy / 4) : p.traits.switchy;
    if (stream(seed, `persona-switch-${p.id}-${w}`, window).below(100) < chance) {
      why = w;
      break;
    }
  }
  const out: Traits = { ...p.traits, ...(why ? p.alt : {}) };
  const fs = Math.trunc((Math.max(-100, Math.min(100, ctx.form)) * p.traits.form) / 500);
  out.aggr += fs;
  out.risk += fs;
  out.care += Math.trunc(fs / 2);
  const tl = Math.trunc((clamp(ctx.tiltNow) * p.traits.tilt) / 100);
  out.aggr += Math.trunc(tl / 4);
  out.risk += Math.trunc(tl / 4);
  out.care -= Math.trunc(tl / 4);
  out.patience -= Math.trunc(tl / 4);
  for (const k of TRAIT_KEYS) out[k] = clamp(out[k]);
  return { traits: out, mode: why ? 'alt' : 'base', why };
}

/** 按权重挑 n 个不同的人（权重 0 或没写的不挑）；能挑的人不够 n 个时抛错（场地表要给够人） */
export function pickLineup(rng: RandomStream, weights: Readonly<Record<string, number>>, n: number): string[] {
  const pool = ROSTER.filter((p) => (weights[p.id] ?? 0) > 0).map((p) => ({ id: p.id, w: weights[p.id]! }));
  if (pool.length < n) throw new Error(`pickLineup: need ${n} people, weights give ${pool.length}`);
  const out: string[] = [];
  while (out.length < n) {
    const total = pool.reduce((a, x) => a + x.w, 0);
    let r = rng.below(total);
    const at = pool.findIndex((x) => (r -= x.w) < 0);
    out.push(pool[at]!.id);
    pool.splice(at, 1);
  }
  return out;
}

export type FaceMood = 'normal' | 'happy' | 'sad' | 'angry';

const INK = '#3b2a1f';
const SW = `stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;

function hairSvg(l: Look): string {
  const c = l.hairColor;
  switch (l.hair) {
    case 'short':
      return `<path d="M22 44Q22 16 50 16Q78 16 78 44Q70 30 50 30Q30 30 22 44Z" fill="${c}" ${SW}/>`;
    case 'spiky':
      return `<path d="M20 46L24 22L32 30L38 12L46 26L54 10L60 26L68 14L72 30L80 24L80 46Q66 32 50 32Q34 32 20 46Z" fill="${c}" ${SW}/>`;
    case 'bun':
      return `<circle cx="50" cy="12" r="9" fill="${c}" ${SW}/><path d="M22 46Q22 18 50 18Q78 18 78 46Q70 30 50 30Q30 30 22 46Z" fill="${c}" ${SW}/>`;
    case 'bald':
      return `<path d="M22 50Q20 40 26 38M78 50Q80 40 74 38" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`;
    case 'long':
      return `<path d="M18 80Q14 20 50 16Q86 20 82 80L72 80Q76 40 50 32Q24 40 28 80Z" fill="${c}" ${SW}/>`;
    case 'curly':
      return `<path d="M22 46Q16 34 26 28Q26 16 40 18Q46 10 56 16Q68 12 72 24Q84 28 78 46Q68 32 50 32Q32 32 22 46Z" fill="${c}" ${SW}/>`;
  }
}

function accSvg(l: Look): string {
  switch (l.acc) {
    case 'none':
      return '';
    case 'glasses':
      return `<circle cx="38" cy="52" r="8" fill="none" ${SW}/><circle cx="62" cy="52" r="8" fill="none" ${SW}/><path d="M46 52H54" ${SW}/>`;
    case 'headband':
      return `<path d="M22 38Q50 30 78 38L78 44Q50 36 22 44Z" fill="#d63a2f" ${SW}/>`;
    case 'cap':
      return `<path d="M22 40Q24 16 50 16Q76 16 78 40Z" fill="#c0392b" ${SW}/><path d="M50 40L88 42Q86 48 76 46Z" fill="#c0392b" ${SW}/>`;
    case 'hat':
      return `<path d="M14 36L86 36Q80 30 70 30L66 12Q50 6 34 12L30 30Q20 30 14 36Z" fill="#4a3426" ${SW}/>`;
    case 'flower':
      return `<circle cx="74" cy="30" r="6" fill="#ff7aa2" ${SW}/><circle cx="74" cy="30" r="2" fill="#ffd54a"/>`;
    case 'beard':
      return `<path d="M30 66Q50 92 70 66Q60 74 50 74Q40 74 30 66Z" fill="#6b4a32" ${SW}/>`;
  }
}

function faceSvg(mood: FaceMood): string {
  const eyes =
    mood === 'happy'
      ? `<path d="M33 53Q38 47 43 53M57 53Q62 47 67 53" fill="none" ${SW}/>`
      : mood === 'angry'
        ? `<path d="M32 46L44 50M68 46L56 50" ${SW}/><circle cx="38" cy="54" r="3" fill="${INK}"/><circle cx="62" cy="54" r="3" fill="${INK}"/>`
        : mood === 'sad'
          ? `<path d="M32 50L44 47M68 50L56 47" ${SW}/><circle cx="38" cy="55" r="3" fill="${INK}"/><circle cx="62" cy="55" r="3" fill="${INK}"/>`
          : `<circle cx="38" cy="53" r="3.5" fill="${INK}"/><circle cx="62" cy="53" r="3.5" fill="${INK}"/>`;
  const mouth =
    mood === 'happy'
      ? `<path d="M40 66Q50 78 60 66Z" fill="#c0392b" ${SW}/>`
      : mood === 'sad'
        ? `<path d="M41 72Q50 64 59 72" fill="none" ${SW}/>`
        : mood === 'angry'
          ? `<path d="M41 70H59" ${SW}/>`
          : `<path d="M42 68Q50 73 58 68" fill="none" ${SW}/>`;
  return eyes + mouth;
}

/** 座位头像：程序画的 SVG 字符串（viewBox 0 0 100 100），不碰 DOM、不引外部图片 */
export function personaFace(id: string, mood: FaceMood = 'normal'): string {
  const l = personById(id).look;
  const body =
    `<path d="M14 100Q16 80 50 80Q84 80 86 100Z" fill="${l.shirt}" ${SW}/>` +
    `<ellipse cx="50" cy="52" rx="28" ry="30" fill="${l.skin}" ${SW}/>` +
    hairSvg(l) +
    `<ellipse cx="30" cy="62" rx="5" ry="3" fill="#ff9a9a" opacity=".5"/><ellipse cx="70" cy="62" rx="5" ry="3" fill="#ff9a9a" opacity=".5"/>` +
    faceSvg(mood) +
    accSvg(l);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">${body}</svg>`;
}
