// 结算演出的时间轴：画面（星星落下、战利品滚动、飞进仓库、按钮淡入）和声音用同一组常量算，不各算各的。
// 纯函数，不碰 DOM 和 WebAudio；播放器 playBeats 在 beats.ts（离线渲染 WAV 的工具只引这个纯文件）。
// 节奏：框落下 -> 横幅落地一声重音 -> 星星一颗颗落（每颗一声，音高递增，三星最后一颗换成 star3 的号角）
//       -> 战利品滚动（金币连击）-> 最后一句 win / lose。失败更慢更低，没有星星，也没有号角。
import type { SfxName } from './synth.ts';

type ResultKind = 'battle' | 'td';

interface ResultTiming {
  /** 横幅落地的时刻（ms，从结算框出现起；和 skin.ts 的 hd-banner 动画对齐） */
  bannerHit: number;
  /** 第一颗星落下的时刻 */
  starStart: number;
  /** 两颗星之间 */
  starGap: number;
  /** 战利品数字滚动的时长（ease-out）和滚动时的金币连击 */
  rollDur: number;
  coinGap: number;
  coinCount: number;
  /** 滚完到图标飞进仓库的间隔 */
  flyAfterRoll: number;
  /** 全部落定到按钮淡入的间隔 */
  finAfterRoll: number;
  /** 声音音高倍数（失败压低） */
  pitch: number;
}

/** 胜利：横幅 .12s 起 0.7s、过冲点约 55%，落在 ~500ms */
const WIN: Omit<ResultTiming, 'starGap'> = {
  bannerHit: 500, starStart: 600, rollDur: 900, coinGap: 200, coinCount: 4, flyAfterRoll: 950, finAfterRoll: 1100, pitch: 1,
};
/** 失败：横幅 .15s 起 0.9s、不回弹，落在 ~1050ms；整体更慢，声音更低 */
const LOSE: Omit<ResultTiming, 'starGap'> = {
  bannerHit: 1050, starStart: 1150, rollDur: 900, coinGap: 320, coinCount: 3, flyAfterRoll: 950, finAfterRoll: 1100, pitch: 0.72,
};
/** 星星间隔：登陆战 350ms，守岛 300ms */
export const STAR_GAP: Record<ResultKind, number> = { battle: 350, td: 300 };
/** 星星音高：第 i 颗是前一颗的 1.12 倍（大约两个半音） */
export const STAR_PITCH_STEP = 1.12;

export function resultTiming(kind: ResultKind, win: boolean): ResultTiming {
  return { ...(win ? WIN : LOSE), starGap: STAR_GAP[kind] };
}

interface ResultTimes {
  /** 第 i 颗星落下的时刻 */
  starAt: (i: number) => number;
  /** 战利品开始滚动 */
  rollAt: number;
  /** 图标飞进仓库 */
  flyAt: number;
  /** 其余内容淡入（--sd）和按钮淡入（--fin） */
  sd: number;
  fin: number;
}

export function resultTimes(kind: ResultKind, stars: number, win: boolean): ResultTimes {
  const t = resultTiming(kind, win);
  const last = t.starStart + stars * t.starGap;
  const rollAt = last + 100;
  return { starAt: (i) => t.starStart + i * t.starGap, rollAt, flyAt: rollAt + t.flyAfterRoll, sd: last + 250, fin: rollAt + t.finAfterRoll };
}

export interface Beat { at: number; name: SfxName; pitch: number }

interface BeatOpts {
  kind: ResultKind;
  stars: number;
  win: boolean;
  /** 有战利品数字滚动（登陆战）；守岛的金币声跟着图标落进仓库，不在这里排 */
  roll: boolean;
}

/** 一局结算要放的全部声音，按时刻排好 */
export function resultBeats(o: BeatOpts): Beat[] {
  const t = resultTiming(o.kind, o.win);
  const tm = resultTimes(o.kind, o.stars, o.win);
  const out: Beat[] = [{ at: t.bannerHit, name: 'land', pitch: o.win ? 1 : t.pitch }];
  for (let i = 0; i < o.stars; i++) {
    const three = o.stars >= 3 && i === 2;
    out.push({ at: tm.starAt(i), name: three ? 'star3' : 'star', pitch: three ? 1 : STAR_PITCH_STEP ** i });
  }
  if (o.roll) for (let q = 0; q < t.coinCount; q++) out.push({ at: tm.rollAt + q * t.coinGap, name: 'coin', pitch: t.pitch });
  // 三星的号角就是胜利句，不再叠 win（同一时间只放一个大的）
  if (o.win && o.stars < 3) out.push({ at: tm.rollAt, name: 'win', pitch: 1 });
  if (!o.win) out.push({ at: t.starStart, name: 'lose', pitch: 1 });
  return out.sort((a, b) => a.at - b.at);
}
