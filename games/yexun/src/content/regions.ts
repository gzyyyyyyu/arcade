/**
 * 各地区的特色怪（DESIGN.md 3.5）：哪张守夜图、哪个夜探镇有哪些特色怪、从第几分钟起占多少刷怪、图专属精英什么时候出。
 * 特色怪是"从原来的刷怪里分一块出来"，不额外加量：每次补怪先按本分钟的合计占比抽一次，抽中了刷特色怪，没抽中走原来的分钟表，
 * 所以总量和节奏不变。没登记的地图一次额外的随机数都不抽（雪原、义庄也各有一种，只剩教学场景之类没登记）。
 * 怪的行为在 `core/step.ts` 的 mobAct，数值在 `enemies.ts`。
 */
import { TICKS_PER_SECOND } from './clock.ts';
import type { EnemyKind } from './enemies.ts';
import type { RaidTemplateId } from './explore.ts';
import type { MapId } from './maps.ts';

const S = TICKS_PER_SECOND;

export interface RegionMob {
  kind: EnemyKind;
  /** [从第几分钟起, 占刷怪的比例]，按分钟升序；到了某一档就用那一档的比例，直到下一档 */
  share: readonly (readonly [number, number])[];
}

export interface RegionElite {
  /** 第几拍出（守夜；危险档的"精英晚到"同样生效） */
  at: number;
  enemy: EnemyKind;
  count: number;
}

export interface Region {
  mobs: readonly RegionMob[];
  /** 图专属精英（夜探没有） */
  elites?: readonly RegionElite[];
}

/** 没有图专属精英的图（雪原、义庄）在 6:30、11:00 补的精英，和别的图同一节奏 */
const PLAIN_ELITES: readonly RegionElite[] = [
  { at: 390 * S, enemy: 'shishi', count: 1 },
  { at: 660 * S, enemy: 'whitefox', count: 1 },
];

/** 守夜：三张新图 */
export const VIGIL_REGIONS: Partial<Record<MapId, Region>> = {
  // 雪原：雪童子（白毛风里隐在雪中，近了才现身冲刺）；义庄：棺钉鬼（躺在棺旁，走近坐起钉三枚棺钉，远程所以占比压低）。
  // 这两张图在 6:30、11:00 也来精英（别的图这两个时间是图专属精英），5:00→7:30、10:00→12:00 不再空着
  snow: { mobs: [{ kind: 'xuetong', share: [[2, 0.08], [7, 0.1]] }], elites: PLAIN_ELITES },
  yizhuang: { mobs: [{ kind: 'guandingui', share: [[2, 0.015], [7, 0.02]] }], elites: PLAIN_ELITES },
  // 竹林：竹精从地里钻出来（先冒圈）、蛇精藏着窜出来；竹王 6:30 和 11:00 各一次
  bamboo: {
    mobs: [
      { kind: 'bamsprout', share: [[1, 0.144], [5, 0.216]] },
      { kind: 'snakespirit', share: [[3, 0.1], [7, 0.14]] },
    ],
    elites: [
      { at: 390 * S, enemy: 'bambooking', count: 1 },
      { at: 660 * S, enemy: 'bambooking', count: 1 },
    ],
  },
  // 河滩：溺鬼拖住人、河蟹横着走；河伯 6:30 和 11:00 各一次
  riverbank: {
    mobs: [
      { kind: 'drown', share: [[1, 0.1], [5, 0.15]] },
      { kind: 'crab', share: [[3, 0.1], [7, 0.14]] },
    ],
    elites: [
      { at: 390 * S, enemy: 'hebo', count: 1 },
      { at: 660 * S, enemy: 'hebo', count: 1 },
    ],
  },
  // 冰湖：冰傀碎成两个、冰凌预告冰刺；冰魄 6:30 和 11:00 各一次
  icelake: {
    mobs: [
      { kind: 'icegolem', share: [[2, 0.1], [6, 0.14]] },
      { kind: 'icicle', share: [[4, 0.04], [8, 0.055]] },
    ],
    elites: [
      { at: 390 * S, enemy: 'frostsoul', count: 1 },
      { at: 660 * S, enemy: 'frostsoul', count: 1 },
    ],
  },
  // 荒庙：庙祝鬼远远撒香灰、石僧拍地；石狮 6:30 和 11:00 各一次（守庙的）
  temple: {
    mobs: [
      { kind: 'templeghost', share: [[2, 0.04], [6, 0.06]] },
      { kind: 'stonemonk', share: [[7, 0.03], [10, 0.05]] },
    ],
    elites: [
      { at: 390 * S, enemy: 'shishi', count: 1 },
      { at: 660 * S, enemy: 'shishi', count: 1 },
    ],
  },
  // 鬼市：皮影鬼一闪一闪往前蹦、鬼贩躲着人丢钱袋（远程，和庙祝鬼一样压低占比）；鬼市主 6:30 和 11:00 各一次
  guishi: {
    mobs: [
      { kind: 'puppet', share: [[1, 0.12], [5, 0.18]] },
      { kind: 'peddler', share: [[3, 0.04], [7, 0.06]] },
    ],
    elites: [
      { at: 390 * S, enemy: 'marketboss', count: 1 },
      { at: 660 * S, enemy: 'marketboss', count: 1 },
    ],
  },
  // 乱葬岗：掘墓鬼从脚边土里钻出来（怕火，往火区里引）；尸将 6:30 和 11:00 各一次
  luanzang: {
    mobs: [{ kind: 'juemu', share: [[1, 0.14], [5, 0.22]] }],
    elites: [
      { at: 390 * S, enemy: 'general', count: 1 },
      { at: 660 * S, enemy: 'general', count: 1 },
    ],
  },
};

/** 夜探：每个镇一种特色怪（教学镇没有） */
export const RAID_REGIONS: Partial<Record<RaidTemplateId, Region>> = {
  // 2.0：戏楼镇的戏班鬼影（另有戏台开场时成队冒出来）、粮仓镇的鼠妖（一刷一小群，占比按"群"算）
  xilou: { mobs: [{ kind: 'troupe', share: [[2, 0.3], [6, 0.48]] }] },
  liangcang: { mobs: [{ kind: 'ratdemon', share: [[1, 0.25], [5, 0.4]] }] },
  guzhen: { mobs: [{ kind: 'nightwatch', share: [[2, 0.1], [6, 0.15]] }] },
  dukou: { mobs: [{ kind: 'drown', share: [[2, 0.12], [6, 0.18]] }] },
  shansi: { mobs: [{ kind: 'stonemonk', share: [[3, 0.12], [7, 0.18]] }] },
  // 窑镇：陶俑（扛刀剑、怕水），窑口是火区
  yaozhen: { mobs: [{ kind: 'taoyong', share: [[2, 0.12], [6, 0.18]] }] },
};

/**
 * 河滩、荒庙另加的两种特色怪（DESIGN 3.5）：克制站桩近身控场的镇守流派。刷怪时接在 VIGIL_REGIONS 的原表后面（选图页只列原表的）
 */
const VIGIL_REGIONS_55: Partial<Record<MapId, readonly RegionMob[]>> = {
  riverbank: [
    { kind: 'crossbow', share: [[2, 0.06], [6, 0.09]] },
    { kind: 'hurrier', share: [[3, 0.075], [7, 0.105]] },
  ],
  temple: [
    { kind: 'crossbow', share: [[2, 0.06], [6, 0.09]] },
    { kind: 'hurrier', share: [[3, 0.075], [7, 0.105]] },
  ],
};
const MERGED_55: Partial<Record<MapId, Region>> = Object.fromEntries(
  Object.entries(VIGIL_REGIONS_55).map(([id, extra]) => [id, { ...VIGIL_REGIONS[id as MapId]!, mobs: [...VIGIL_REGIONS[id as MapId]!.mobs, ...extra!] }]),
);

/** 这一局这张图刷怪用的特色怪表（原表加 VIGIL_REGIONS_55） */
export function vigilRegion(map: MapId): Region | undefined {
  return MERGED_55[map] ?? VIGIL_REGIONS[map];
}

function shareOf(m: RegionMob, minute: number): number {
  let s = 0;
  for (const [from, v] of m.share) if (minute >= from) s = v;
  return s;
}

/** 这一分钟特色怪合计占刷怪的比例 */
export function regionTotal(r: Region, minute: number): number {
  let t = 0;
  for (const m of r.mobs) t += shareOf(m, minute);
  return t;
}

/** r（0 到 regionTotal 之间的一个随机数）落在哪种特色怪上 */
export function regionKind(r: Region, minute: number, x: number): EnemyKind {
  let last = r.mobs[0]!.kind;
  for (const m of r.mobs) {
    const s = shareOf(m, minute);
    if (s <= 0) continue;
    last = m.kind;
    x -= s;
    if (x < 0) return last;
  }
  return last;
}

/** 钻地出场的怪：刷在主角附近（不是屏幕外的一圈），自己带出场的预警 */
export const EMERGE_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['water', 'bamsprout', 'drown', 'juemu']);
