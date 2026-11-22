/**
 * 列出「娱乐有、实盘没有」的内容（实盘和娱乐对齐的待办清单）。
 *
 * 判定直接调游戏里实盘用的同一批函数和表（vigilRegion、midBossOf、liveMapOk、RAID_LIVE_TEMPLATES、liveCharOk），不手抄名单。
 * 卡池、怪表、技能实盘和娱乐走同一套规则（核心里没有实盘分支），不再逐项比。只列内容差异；永久加成、咒印、档位这类有意不对齐的规则差异不计入，单独列在 RULE_DIFFS 里。
 *
 * 命令行：node tools/live-gap.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RAID_LIVE_TEMPLATES, RAID_OPEN, RAID_TEMPLATES, type RaidTemplateId } from '../src/content/explore.ts';
import { ENEMIES, type EnemyKind } from '../src/content/enemies.ts';
import { MID_BOSS_KINDS } from '../src/content/foes.ts';
import { LIVE_CHAR_IDS, liveCharOk, liveMapOk } from '../src/content/live.ts';
import { MAP_EVENTS } from '../src/content/mapEvents.ts';
import { MAP_IDS, MAPS } from '../src/content/maps.ts';
import { CHARACTER_IDS, CHARACTERS } from '../src/content/meta.ts';
import { RAID_REGIONS, vigilRegion } from '../src/content/regions.ts';
import { midBossOf } from '../src/content/waves.ts';

export interface LiveGap {
  category: string;
  items: string[];
}

/** 有意不对齐的规则差异：是规则 / 模式不是内容，不计入差异数（来源见各条） */
export const RULE_DIFFS: readonly string[] = [
  '永久加成（perks）：实盘开局恒为空（platform/live.ts liveSetup）。有意不对齐：实盘按人人一样的起点结算',
  '咒印（curses）：实盘不带。有意不对齐：实盘按人人一样的起点结算',
  '降低伤害（assist）：实盘恒关',
  '无尽（endless）、每周挑战（weekly，normalizeSetup 对实盘局直接丢掉）、连战（rush）、每日挑战：只在娱乐',
  '危险档：实盘只有小 / 中 / 大 / 豪华四档对应危险 0 / 2 / 3 / 4；夜探实盘只有小 / 中 / 大三档',
  '实盘降难度（LIVE_EASE）：守夜中档以上远程弹伤害倍数封顶、受到伤害打折',
  '结回倍数：实盘按档位、角色、地图系数换筹码，娱乐里是铜钱',
  '夜探实盘：撤出不按价值换铜钱（settle.ts）；退出、倒下按筹码规则结',
];

const sorted = (xs: Iterable<string>): string[] => [...xs];

/** 某种玩法下，所有守夜图 / 夜探镇子里可能出现的怪（特色怪、图专属精英、中期首领、地图事件怪、镇子守卫） */
function foeKinds(towns: readonly RaidTemplateId[]): Set<EnemyKind> {
  const out = new Set<EnemyKind>();
  for (const map of MAP_IDS) {
    const r = vigilRegion(map);
    for (const m of r?.mobs ?? []) out.add(m.kind);
    for (const e of r?.elites ?? []) out.add(e.enemy);
    out.add(midBossOf(map));
    const ev = MAP_EVENTS[map].mob;
    if (ev) out.add(ev.kind);
  }
  for (const t of towns) {
    for (const m of RAID_REGIONS[t]?.mobs ?? []) out.add(m.kind);
    const guard = RAID_TEMPLATES[t].vaultGuard;
    if (guard) out.add(guard);
  }
  return out;
}

const isElite = (k: EnemyKind): boolean => MID_BOSS_KINDS.includes(k) || !!ENEMIES.find((e) => e.kind === k)?.elite || !!ENEMIES.find((e) => e.kind === k)?.boss;
/**
 * 怪的中文名在图鉴界面文件 codex.ts 的 MONSTER_INFO 里；那个文件顶层引了 css，Node 直接跑会报错，
 * 所以按文本读出名字（只取显示名，找不到就用 id）
 */
const MONSTER_NAMES: Map<string, string> = (() => {
  const text = readFileSync(fileURLToPath(new URL('../src/view/ui/codex.ts', import.meta.url)), 'utf8');
  const m = new Map<string, string>();
  for (const x of text.matchAll(/^\s+(\w+): \{ name: '([^']+)', tag:/gm)) m.set(x[1]!, x[2]!);
  return m;
})();
const foeName = (k: EnemyKind): string => `${MONSTER_NAMES.get(k) ?? k}（${k}）`;
const tag = (name: string, id: string): string => `${name}（${id}）`;

export function liveGaps(): LiveGap[] {
  // 怪 / 首领：守夜两边同一套，差在实盘开的夜探镇子
  const liveFoes = foeKinds(RAID_LIVE_TEMPLATES);
  const funFoes = foeKinds(RAID_OPEN);
  const missing = [...funFoes].filter((k) => !liveFoes.has(k));

  // 守夜地图、地图事件（事件跟着地图走，step.ts mapEvents 里没有实盘分支）
  const closedMaps = MAP_IDS.filter((m) => !liveMapOk(m));
  const closedEvents = closedMaps.map((m) => MAP_EVENTS[m]);

  // 夜探镇子：全部镇子（教学镇不算）里实盘没有的
  const towns = (Object.keys(RAID_TEMPLATES) as RaidTemplateId[]).filter((t) => t !== 'teach' && !(RAID_LIVE_TEMPLATES as readonly string[]).includes(t));

  // 角色：娱乐里能选的（摆渡人两边都收着，不算）
  const chars = CHARACTER_IDS.filter((c) => !liveCharOk('small', c) || !LIVE_CHAR_IDS.includes(c));

  const gaps: LiveGap[] = [
    { category: '怪', items: sorted(missing.filter((k) => !isElite(k)).map(foeName)) },
    { category: '首领/精英', items: sorted(missing.filter(isElite).map(foeName)) },
    { category: '地图事件', items: closedEvents.map((e) => tag(e.name, e.kind)) },
    { category: '守夜地图', items: closedMaps.map((m) => tag(MAPS[m].name, m)) },
    { category: '夜探镇子', items: towns.map((t) => tag(RAID_TEMPLATES[t].name, t)) },
    { category: '角色', items: chars.map((c) => tag(CHARACTERS[c].name, c)) },
  ];
  return gaps;
}

function main(): void {
  const gaps = liveGaps();
  let total = 0;
  console.log('娱乐有、实盘没有的内容');
  for (const g of gaps) {
    total += g.items.length;
    console.log(`\n${g.category}：${g.items.length}`);
    for (const it of g.items) console.log(`  - ${it}`);
  }
  console.log(`\n共 ${total} 项`);
  console.log('\n有意不对齐的规则差异（不计入差异数）');
  for (const r of RULE_DIFFS) console.log(`  - ${r}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
