/**
 * 列出「娱乐有、实盘没有」的内容（实盘和娱乐对齐的待办清单）。
 *
 * 判定直接调游戏里实盘用的同一批函数和表（liveAllows、LIVE_OWN_ARMS、vigilRegion、midBossOf、liveMapOk、
 * RAID_LIVE_TEMPLATES、liveCharOk，以及开一个实盘局读 World.oldPool / legacyFoes / liveNoSkill），不手抄名单。
 * 只列内容差异；永久加成、咒印、档位这类有意不对齐的规则差异不计入，单独列在 RULE_DIFFS 里。
 *
 * 命令行：node tools/live-gap.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RAID_LIVE_TEMPLATES, RAID_OPEN, RAID_TEMPLATES, type RaidTemplateId } from '../src/content/explore.ts';
import { ENEMIES, type EnemyKind } from '../src/content/enemies.ts';
import { MID_BOSS_KINDS } from '../src/content/foes.ts';
import { LIVE_CHAR_IDS, LIVE_TIER_IDS, LIVE_TIERS, liveCharOk, liveMapOk, liveSkillOpen } from '../src/content/live.ts';
import { MAP_EVENTS } from '../src/content/mapEvents.ts';
import { MAP_IDS, MAPS } from '../src/content/maps.ts';
import { PICK_CHAR_IDS, CHARACTERS, type CharacterId } from '../src/content/meta.ts';
import { inPool } from '../src/content/pools.ts';
import { RAID_REGIONS, vigilRegion } from '../src/content/regions.ts';
import { midBossOf } from '../src/content/waves.ts';
import { LIVE_OWN_ARMS, liveAllows, MERGES, PASSIVE_IDS, PASSIVES, WEAPON_IDS, WEAPONS } from '../src/content/weapons.ts';
import { createWorld, type Setup } from '../src/core/index.ts';
import '../src/explore/register.ts';

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

const SEED = 1;
const sorted = (xs: Iterable<string>): string[] => [...xs];

/** 开一个实盘局和一个娱乐局，读它们自己的状态（legacyFoes 决定走哪套首领 / 刷怪表） */
function foeFlags(): { live: boolean; fun: boolean } {
  const base: Setup = { seed: SEED, mode: 'vigil', danger: 2, map: 'snow', character: 'xiaodao', perks: {}, assist: false };
  return { live: createWorld({ ...base, live: true }).legacyFoes, fun: createWorld(base).legacyFoes };
}

/** 某种玩法下，所有守夜图 / 夜探镇子里可能出现的怪（特色怪、图专属精英、中期首领、地图事件怪、镇子守卫） */
function foeKinds(legacy: boolean, towns: readonly RaidTemplateId[]): Set<EnemyKind> {
  const out = new Set<EnemyKind>();
  for (const map of MAP_IDS) {
    const r = vigilRegion(map, legacy);
    for (const m of r?.mobs ?? []) out.add(m.kind);
    for (const e of r?.elites ?? []) out.add(e.enemy);
    out.add(midBossOf(map, legacy));
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

/** 实盘局这个角色是不是还走老卡池（开一个实盘局读 World.oldPool；规则 51 起是否，和娱乐同池） */
const oldPool = (ch: CharacterId): boolean => createWorld({ seed: SEED, mode: 'vigil', danger: 2, map: 'snow', character: ch, perks: {}, assist: false, live: true }).oldPool;
/** 实盘局这个角色拿不拿得到（和 core/step.ts cardAllowed 同一套判断） */
const liveHas = (ch: CharacterId, id: string): boolean => (oldPool(ch) ? liveAllows(true, id) || !!LIVE_OWN_ARMS[ch]?.includes(id) : inPool(ch, id, 61));

export const CHAR_CATEGORIES = ['法器', '被动', '进化', '合成'] as const;

/** 按角色比：这个角色娱乐局能拿到（角色池 inPool）、实盘局拿不到的法器、被动、进化、合成 */
export function charGaps(ch: CharacterId): Record<(typeof CHAR_CATEGORIES)[number], string[]> {
  const weapons = WEAPON_IDS.filter((id) => inPool(ch, id, 61) && !liveHas(ch, id));
  const passives = PASSIVE_IDS.filter((id) => inPool(ch, id, 61) && !liveHas(ch, id));
  const evolves = WEAPON_IDS.filter((id) => {
    const e = WEAPONS[id].evolve;
    return !!e && inPool(ch, id, 61) && inPool(ch, e.with, 61) && !(liveHas(ch, id) && liveHas(ch, e.with));
  });
  const merges = MERGES.filter((m) => (!m.only || m.only.split(',').includes(ch)) && inPool(ch, m.a, 61) && inPool(ch, m.b, 61) && !(liveAllows(oldPool(ch), m.id) && liveHas(ch, m.a) && liveHas(ch, m.b)));
  return {
    法器: weapons.map((id) => tag(WEAPONS[id].name, id)),
    被动: passives.map((id) => tag(PASSIVES[id].name, id)),
    进化: evolves.map((id) => tag(WEAPONS[id].evolve?.name ?? id, id)),
    合成: merges.map((m) => tag(m.name, m.id)),
  };
}

export function liveGaps(): LiveGap[] {
  const perChar = Object.fromEntries(CHAR_CATEGORIES.map((c) => [c, [] as string[]])) as Record<(typeof CHAR_CATEGORIES)[number], string[]>;
  for (const ch of LIVE_CHAR_IDS) {
    const g = charGaps(ch);
    for (const c of CHAR_CATEGORIES) for (const it of g[c]) perChar[c].push(`${CHARACTERS[ch].name}（${ch}）：${it}`);
  }

  // 怪 / 首领：实盘局 legacyFoes 为真时走老表
  const flags = foeFlags();
  const liveFoes = foeKinds(flags.live, RAID_LIVE_TEMPLATES);
  const funFoes = foeKinds(flags.fun, RAID_OPEN);
  const missing = [...funFoes].filter((k) => !liveFoes.has(k));

  // 守夜地图、地图事件（事件跟着地图走，step.ts mapEvents 里没有实盘分支）
  const closedMaps = MAP_IDS.filter((m) => !liveMapOk(m));
  const closedEvents = closedMaps.map((m) => MAP_EVENTS[m]);

  // 夜探镇子：全部镇子（教学镇不算）里实盘没有的
  const towns = (Object.keys(RAID_TEMPLATES) as RaidTemplateId[]).filter((t) => t !== 'teach' && !(RAID_LIVE_TEMPLATES as readonly string[]).includes(t));

  // 角色：娱乐里能选的（摆渡人两边都收着，不算）
  const chars = PICK_CHAR_IDS.filter((c) => !liveCharOk('small', c) || !LIVE_CHAR_IDS.includes(c));

  // 技能：实盘守夜每个「档位 × 地图」开不开，用实盘局自己的 liveNoSkill；夜探实盘一律读局内状态
  const skills: string[] = [];
  for (const tier of LIVE_TIER_IDS) {
    for (const map of MAP_IDS) {
      const w = createWorld({ seed: SEED, mode: 'vigil', danger: LIVE_TIERS[tier].danger, map, character: 'xiaodao', perks: {}, assist: false, live: true });
      if (w.liveNoSkill || !liveSkillOpen(tier, map)) skills.push(`守夜 ${LIVE_TIERS[tier].name}档 × ${MAPS[map].name}（${map}）`);
    }
  }
  const raidWorld = createWorld({ seed: SEED, mode: 'raid', danger: 0, raid: { template: 'guzhen', live: 'small' }, character: 'xiaodao', perks: {}, assist: false, live: true });
  if (raidWorld.liveNoSkill) skills.push('夜探实盘（所有镇子）');

  const gaps: LiveGap[] = [
    ...CHAR_CATEGORIES.map((category) => ({ category: category as string, items: perChar[category] })),
    { category: '怪', items: sorted(missing.filter((k) => !isElite(k)).map(foeName)) },
    { category: '首领/精英', items: sorted(missing.filter(isElite).map(foeName)) },
    { category: '地图事件', items: closedEvents.map((e) => tag(e.name, e.kind)) },
    { category: '守夜地图', items: closedMaps.map((m) => tag(MAPS[m].name, m)) },
    { category: '夜探镇子', items: towns.map((t) => tag(RAID_TEMPLATES[t].name, t)) },
    { category: '角色', items: chars.map((c) => tag(CHARACTERS[c].name, c)) },
    { category: '技能', items: skills },
  ];
  return gaps;
}

function main(): void {
  const gaps = liveGaps();
  let total = 0;
  console.log('娱乐有、实盘没有的内容');
  console.log('\n【按角色】娱乐局角色池里有、实盘局拿不到的（合成按两件都拿得到算）');
  for (const ch of LIVE_CHAR_IDS) {
    const g = charGaps(ch);
    const n = CHAR_CATEGORIES.reduce((a, c) => a + g[c].length, 0);
    total += n;
    console.log(`\n${CHARACTERS[ch].name}（${ch}）：${n}　${CHAR_CATEGORIES.map((c) => `${c} ${g[c].length}`).join(' / ')}`);
    for (const c of CHAR_CATEGORIES) if (g[c].length) console.log(`  ${c}：${g[c].join('、')}`);
  }
  console.log('\n【全局】');
  for (const g of gaps.filter((x) => !(CHAR_CATEGORIES as readonly string[]).includes(x.category))) {
    total += g.items.length;
    console.log(`\n${g.category}：${g.items.length}`);
    for (const it of g.items) console.log(`  - ${it}`);
  }
  console.log(`\n共 ${total} 项（角色 × 项 + 全局项）`);
  console.log('\n有意不对齐的规则差异（不计入差异数）');
  for (const r of RULE_DIFFS) console.log(`  - ${r}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
