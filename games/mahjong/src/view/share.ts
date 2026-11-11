/**
 * 结算页的"分享"（docs/social.md 1.1，kit 的 arcade-kit/share）：一场打完给一张战绩图，系统分享或预览里存图、复制链接。
 * 图上只有公开的、自己的东西，别人的手牌、牌墙一律不进图；不上传、不写库。
 * 这里放各玩法通用的：颁奖卡、每日挑战卡、每日何切卡、预画；一场的战绩卡按玩法在 view/variants/<id>/（VariantPage.shareCard）。
 */
import { prepareShare, type PreparedShare, type ShareCard } from 'arcade-kit/share';
import type { Award } from '../game/awards.ts';
import { MARK_TEXT, markOf, QUESTIONS, POINTS } from '../game/hekiri.ts';
import { lastDays, streakOf, type DailyData, type DailyVariant } from '../game/daily.ts';
import { AWARD_NAME, awardLine, GAME_NAME, signed } from './text.ts';
import { tileSvg } from './tiles.ts';
import { pageOf } from './variants/pages.ts';

/** 卡的主题色：牌桌的墨绿呢子 */
const ACCENT = '#0f5a41';

/**
 * 好友房颁奖的分享卡：大字是头一个奖（多半是 MVP）和得奖的人，小数据是其余的奖，一句话是头一个奖的那句。
 * 只有名字和结算里公开的数；name 是分享的这个人（旁观的也能分享）
 */
export function awardsCard(list: readonly Award[], names: readonly string[], unit: string, title: string, name: string): ShareCard | null {
  const top = list[0];
  if (!top) return null;
  const who = (a: Award): string => names[a.seat] ?? '';
  return {
    game: GAME_NAME,
    title,
    accent: ACCENT,
    big: { value: who(top), label: AWARD_NAME[top.id] },
    stats: list.slice(1).map((a) => ({ label: AWARD_NAME[a.id], value: who(a) })),
    line: awardLine(top, who(top), unit),
    player: { name },
  };
}

/**
 * 每日挑战一场的分享卡（纯函数）：大字是今日成绩（练习局写"练习"），小数据是最好、连续天数和最近 7 天打卡格子（● 打过 ○ 没打）。
 * 不含牌、不含别人的名字；data 是这一场记完之后的数据，scored 是这一场算不算今日成绩
 */
export function dailyCardOf(variant: DailyVariant, data: DailyData, date: string, net: number, scored: boolean): ShareCard {
  const days = lastDays(data, date);
  const run = streakOf(data, date);
  const name = pageOf(variant).daily.cardName;
  return {
    game: GAME_NAME,
    title: `每日挑战 · ${date}`,
    accent: ACCENT,
    big: scored ? { value: signed(net), label: `${name} · 今日成绩` } : { value: '练习', label: `${name} · 不计成绩` },
    stats: [
      { label: '最好', value: data.best === null ? '—' : signed(data.best) },
      { label: '连续', value: `${run} 天` },
      { label: '近 7 天', value: days.map((d) => (d.net === null ? '○' : '●')).join('') },
    ],
    line: '同一天大家打的是同一副牌，来比比',
  };
}

/**
 * 每日何切的分享卡（纯函数）：大字是今天几分（练习写"练习"），小数据是五题的 ✓△✗、最好和连续天数。不含牌
 */
export function hekiriCardOf(date: string, score: number, scores: readonly number[], scored: boolean, best: number, run: number): ShareCard {
  return {
    game: GAME_NAME,
    title: `每日何切 · ${date}`,
    accent: ACCENT,
    big: { value: `${score} 分`, label: scored ? `满分 ${QUESTIONS * POINTS} · 今日成绩` : '练习 · 不计成绩' },
    stats: [
      { label: '五题', value: scores.map((s) => MARK_TEXT[markOf(s)]).join('') },
      { label: '最好', value: `${best} 分` },
      { label: '连续', value: `${run} 天` },
    ],
    line: '同一天大家拿到同样的五手牌，来比比牌效',
  };
}

/** 听牌速判的分享卡（纯函数）：date 非空是今日一轮（写日期），null 是练习（写"练习"，不带日期）。不含牌 */
export function tingCardOf(date: string | null, score: number, correct: number, bestStreak: number, seconds: number): ShareCard {
  return {
    game: GAME_NAME,
    title: date ? `听牌速判 · ${date}` : '听牌速判 · 练习',
    accent: ACCENT,
    big: { value: `${score} 分`, label: date ? '今日一轮' : '练习 · 不计成绩' },
    stats: [
      { label: `${seconds} 秒判了`, value: `${correct} 手` },
      { label: '最长连对', value: `${bestStreak}` },
    ],
    line: date ? '同一天大家拿到同样的清一色，来比比谁判得快' : '清一色听什么牌？来试一轮',
  };
}

/** 卡上的插画：一条（那只小鸟），程序画的牌面；画不上 kit 就不画，照常出卡。
 * 牌面的 SVG 只有 viewBox（60×84），当图片画进画布要写明宽高，不然按默认的 300×150 算、只画出一角 */
function art(): HTMLImageElement {
  const img = new Image();
  img.src = `data:image/svg+xml,${encodeURIComponent(tileSvg(18).replace('<svg ', "<svg width='240' height='336' "))}`;
  return img;
}

/**
 * 结算页一出来就先把卡画好（kit 0.12.3）：iOS 只许在点击的那一下里调系统分享，点了再画就过期了、只能出预览。
 * "分享"的点击里直接 `void p.share()`，前面别 await。url 是游戏地址（好友房带房间码）
 */
export function prepareCard(card: ShareCard, url: string): PreparedShare {
  const log = import.meta.env.DEV ? (l: string) => ((window as { __shareLog?: string[] }).__shareLog ??= []).push(l) : undefined;
  return prepareShare({ ...card, art: art() }, { url, ...(log ? { log } : {}) });
}
