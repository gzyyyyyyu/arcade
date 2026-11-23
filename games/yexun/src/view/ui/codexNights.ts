/**
 * 图鉴「夜事」页的数据（DESIGN.md 3.8）：地图事件、噩梦档机制、咒印。全部从内容表派生，不手抄数字；
 * 写成纯函数，方便单测，不碰 DOM。
 */
import { TICKS_PER_SECOND } from '../../content/clock.ts';
import { MAPS, MAP_IDS, type MapId } from '../../content/maps.ts';
import { CURSES, CURSE_COIN_BONUS, CURSE_IDS, MAX_CURSES } from '../../content/meta.ts';
import { MAP_EVENTS, MAP_EVENT_AT, type MapEventKind } from '../../content/mapEvents.ts';
import { BLOOD_MOON, DANGERS, ELITE_RAGE, type Danger, type DangerDef } from '../../content/waves.ts';
import { WEEKLIES, WEEKLY_ORDER, weeklyLine, type WeeklyId } from '../../content/weekly.ts';
import { weeklyFor } from '../../online/weekly.ts';
import { DAILY_DANGER } from '../../online/daily.ts';
import { affixTexts, goalText, TRIALS, type TrialId } from '../../content/trials.ts';
import { EVENT_ICON } from './eventIcons.ts';

const S = TICKS_PER_SECOND;
const pct = (x: number): number => Math.round(x * 100);

export interface NightEvent { kind: MapEventKind | 'blood'; icon: string; name: string; map: string; blurb: string }
export interface NightCurse { name: string; text: string }
export interface NightData {
  /** 地图事件的来的时间说明 */
  eventWhen: string;
  events: NightEvent[];
  nightmare: { name: string; items: string[] }[];
  curseNote: string;
  curses: NightCurse[];
  /** 本周夜事：说明和全部轮换（当前这周 now） */
  weeklyNote: string;
  weeklies: { name: string; text: string; now: boolean }[];
}

/** 高危险档（危险 5 起、噩梦档）比上一档多出来的机制，一条一句大白话 */
function newThings(d: DangerDef, prev: DangerDef | undefined): string[] {
  const out: string[] = [];
  if (d.weakKeep < 1 && !(prev && prev.weakKeep < 1)) out.push(d.weakKeep === 0 ? '怪不再怕克制：哪类法器打它都不额外疼（抵抗照旧）' : `怪怕克制的那部分只剩 ${pct(d.weakKeep)}%`);
  if (d.eliteRage && !prev?.eliteRage) out.push(`精英血掉到 ${pct(ELITE_RAGE.at)}% 以下发狂：走路快 ${pct(ELITE_RAGE.speed - 1)}%、撞人重 ${pct(ELITE_RAGE.dmg - 1)}%`);
  if (d.night > 0 && !(prev && prev.night > 0)) out.push('夜色压下来，看得更近');
  if (d.supply < 1 && !(prev && prev.supply < 1)) out.push(`肉包只剩 ${pct(d.supply)}%`);
  if (d.bloodMoon && !prev?.bloodMoon) {
    out.push(`血月：第 ${BLOOD_MOON.first / S / 60} 分钟起每 ${BLOOD_MOON.every / S / 60} 分钟来一次，持续 ${BLOOD_MOON.dur / S} 秒，怪走路快 ${pct(BLOOD_MOON.speed - 1)}%`);
  }
  return out;
}

export function nightData(today = ''): NightData {
  const nowWeekly = weeklyFor(today)?.id;
  const mins = MAP_EVENT_AT.map((t) => t / S / 60).join('、');
  const events: NightEvent[] = MAP_IDS.map((id: MapId) => {
    const e = MAP_EVENTS[id];
    return { kind: e.kind, icon: EVENT_ICON[e.kind]!, name: e.name, map: MAPS[id].name, blurb: e.blurb };
  });
  const rageTiers = (Object.values(DANGERS) as DangerDef[]).filter((d) => d.weakKeep < 1 || d.eliteRage || d.night > 0 || d.bloodMoon || d.supply < 1).sort((a, b) => a.id - b.id);
  const nightmare = rageTiers.map((d) => ({ name: d.name, items: newThings(d, DANGERS[(d.id - 1) as DangerDef['id']]) }));
  const moon = rageTiers.find((d) => d.bloodMoon);
  if (moon) events.push({ kind: 'blood', icon: EVENT_ICON.blood!, name: '血月', map: `${moon.name}起，不分地图`, blurb: moon.blurb });
  return {
    eventWhen: `第 ${mins} 分钟各来一次，提前几秒预告；只在守夜（实盘守夜也有），夜探没有`,
    events,
    nightmare,
    curseNote: `每挂一条，这局铜钱多 ${pct(CURSE_COIN_BONUS)}%；一局最多挂 ${MAX_CURSES} 条；实盘不能挂`,
    curses: CURSE_IDS.map((id) => ({ name: CURSES[id].name, text: CURSES[id].text })),
    weeklyNote: `每个北京时间自然周（周一起）一个，按这个顺序轮着来；只在主页「本周夜事」挑战里生效（固定地图、危险 ${DAILY_DANGER}、小道士，成绩只进周榜；试炼「月黑」一关也用月蚀），普通守夜、实盘、夜探、每日挑战不开`,
    weeklies: WEEKLY_ORDER.map((id) => ({ name: WEEKLIES[id].name, text: WEEKLIES[id].text, now: id === nowWeekly })),
  };
}

export interface TonightRules {
  curses: NightCurse[];
  /** 本档的高危险机制（危险 5 起才有），文案同图鉴 */
  nightmare: string[];
  /** 守夜才有（含实盘）；when 是"第 4、8、12 分钟" */
  event: { icon: string; name: string; when: string } | null;
  /** 这局开的本周夜事，「铜钱周 · 这局铜钱多 50%」 */
  weekly: string | null;
  /** 试炼：「名 · 目标；新词缀」 */
  trial: string | null;
}

/** 暂停页「今晚的规矩」：只读开局设置，都没有时返回 null。条件同 nextMapEvent / step.ts 的地图事件 */
export function tonightRules(setup: { mode: string; live?: boolean; map?: MapId; danger: Danger; curses?: readonly string[]; weekly?: WeeklyId; rush?: boolean; trial?: TrialId }): TonightRules | null {
  const curses = CURSE_IDS.filter((c) => setup.curses?.includes(c)).map((c) => ({ name: CURSES[c].name, text: CURSES[c].text }));
  const d = DANGERS[setup.danger];
  const nightmare = newThings(d, undefined);
  let event: TonightRules['event'] = null;
  // 连战只有 5 分钟，核心里地图事件不开（step.ts mapEvents）；写"第 4、8、12 分钟"就是骗人
  if (setup.mode === 'vigil' && !setup.rush) {
    const e = MAP_EVENTS[setup.map ?? 'snow'];
    event = { icon: EVENT_ICON[e.kind]!, name: e.name, when: `第 ${MAP_EVENT_AT.map((t) => t / S / 60).join('、')} 分钟` };
  }
  const weekly = setup.weekly && setup.mode === 'vigil' ? weeklyLine(WEEKLIES[setup.weekly]) : null;
  const t = setup.trial ? TRIALS[setup.trial] : null;
  const trial = t ? [`${t.name} · ${goalText(t.goal)}`, ...affixTexts(t)].join('；') : null;
  return curses.length || nightmare.length || event || weekly || trial ? { curses, nightmare, event, weekly, trial } : null;
}
