/**
 * 电脑的性格（DESIGN.md 第 5 节）：人是 kit 共用名册里的人（arcade-kit/personas：名字、上头、起伏、话多、出手快慢、互动脾气），
 * 这里只写雀馆的翻译：怎么防守、做大、碰杠、打错、读牌，强弱档和功力。参数都是整数千分比（不用浮点的平台相关函数，同一局面同一选择）。
 * 性格只是底子：每一场按 Tune 的种子在 swing 的范围里浮动，场地的"手软"和局面（领先、落后、快输光、刚点了炮）再往上加减（style.ts）。
 */
import { personById, pickLineup } from 'arcade-kit/personas';
import type { RandomStream } from 'arcade-kit/rng';

export interface Persona {
  name: string;
  /** 一句话的打法（结算页、头像上的小字） */
  style: string;
  /** 防守：别人像听牌时多重视"不放炮"（0–1000） */
  defense: number;
  /** 贪：放过小胡等大胡、冲清一色对对胡（0–1000） */
  greed: number;
  /** 爱杠：听牌时也杠（0–1000） */
  kanLove: number;
  /** 爱碰：碰了能快一点就碰，不在乎门清（0–1000；低的守门清） */
  pon: number;
  /** 偶尔打错：千分之几的时候不打最好的那张，在第 2 到第 4 好里挑（新手连向听都会打坏） */
  slip: number;
  /** 读牌：看出别人在做清一色（副露、弃牌都偏一门）就不打那一门（0–1000，越大越准） */
  reads: number;
  /** 上头：刚点了炮、输了一大把以后打得更急、更容易错（0–1000） */
  temper: number;
  /** 状态起伏：每一场在性格范围里浮动多大（0–1000，新手忽好忽坏，老手稳） */
  swing: number;
  /** 出手快慢：单机里思考时间的千分比（1000 = 平常） */
  tempo: number;
  /** 话多：单机里胡、杠、点炮以后开口的千分比 */
  talk: number;
  /** 互动性格（kit 的 FunTemper）：爱闹（概率 ×1.5）、普通（×1）、高冷（×0.3），乘在被扔后回应、名场面起哄的概率上（kit 的 botReact 读；电脑出牌不读） */
  fun: 'rowdy' | 'normal' | 'cool';
  /** 强弱的档：0 新手、1 普通、2 稳、3 老练（场地表按它排，见 venues.ts） */
  level: number;
  /** 功力：牌效多看一步、按胡牌的番算听牌好坏、读牌和防守更细（0–1000；场地的手紧再往上加，见 style.ts） */
  skill: number;
}

/** 雀馆自己的翻译（名册里没有的、只对麻将有意义的参数） */
type Play = Omit<Persona, 'name' | 'temper' | 'swing' | 'tempo' | 'talk' | 'fun'> & { id: string };

/** 下标就是存档、房间状态里的性格编号：只往后加，不挪、不删 */
const PLAY: readonly Play[] = [
  { id: 'yaomeir', style: '快：见胡就胡，能碰就碰', defense: 350, greed: 0, kanLove: 300, pon: 900, slip: 50, reads: 250, level: 1, skill: 0 },
  { id: 'xiongmao', style: '贪：爱做清一色、对对胡', defense: 200, greed: 950, kanLove: 500, pon: 450, slip: 60, reads: 200, level: 1, skill: 0 },
  { id: 'gaiwan', style: '稳：守门清，少碰少杠', defense: 950, greed: 200, kanLove: 150, pon: 150, slip: 20, reads: 700, level: 2, skill: 300 },
  { id: 'tutou', style: '爱杠：能杠就杠，输了容易上头', defense: 300, greed: 400, kanLove: 1_000, pon: 600, slip: 60, reads: 300, level: 1, skill: 0 },
  { id: 'hgpp', style: '老练：牌效和防守都细', defense: 750, greed: 350, kanLove: 400, pon: 450, slip: 0, reads: 1_000, level: 3, skill: 1_000 },
  { id: 'bandeng', style: '新手：常打错，不太防守', defense: 50, greed: 100, kanLove: 600, pon: 700, slip: 300, reads: 0, level: 0, skill: 0 },
  // 高档轮换的三个（名册 level 3–4）：和火锅婆婆一样不打错、读牌细，各有偏重
  { id: 'wengge', style: '稳：好牌才做，做成了就冲', defense: 900, greed: 300, kanLove: 250, pon: 300, slip: 0, reads: 850, level: 3, skill: 800 },
  { id: 'suanpan', style: '算：每张都算过，牌效最细', defense: 750, greed: 400, kanLove: 350, pon: 400, slip: 0, reads: 1_000, level: 3, skill: 1_000 },
  { id: 'laoying', style: '鹰：挑准了就猛攻，攻多守少', defense: 600, greed: 550, kanLove: 500, pon: 550, slip: 0, reads: 900, level: 3, skill: 1_000 },
];

/** 名册的性格（0–100）换成这里的千分比：上头、起伏、话多 ×10，出手快慢和互动脾气照搬 */
export const PERSONAS: readonly Persona[] = PLAY.map(({ id, ...play }) => {
  const p = personById(id);
  return { name: p.name, ...play, temper: p.traits.tilt * 10, swing: p.traits.form * 10, tempo: p.tempo, talk: p.traits.talk * 10, fun: p.fun };
});

/**
 * 按权重挑 n 个不同的性格（weights[i] 是 PERSONAS[i] 的权重，0 不挑），挑人用名册的 pickLineup（同一个随机流、同样的顺序）。
 * 能挑的人比座位少时剩下的用第一个补：房间给真人座位也配一个性格（离座时电脑代打用），实盘桌只有两个人能挑
 */
export function pickPersonas(rng: RandomStream, weights: readonly number[], n: number): number[] {
  const byId = Object.fromEntries(PLAY.map((p, i) => [p.id, weights[i] ?? 0]));
  const can = weights.filter((w) => w > 0).length;
  const out = pickLineup(rng, byId, Math.min(n, can)).map((id) => PLAY.findIndex((p) => p.id === id));
  while (out.length < n) out.push(out[0] ?? 0);
  return out;
}
