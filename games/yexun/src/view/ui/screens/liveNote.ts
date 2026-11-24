import type { MapId } from '../../../content/maps.ts';
import { CHARACTERS, type CharacterId } from '../../../content/meta.ts';
import { LIVE_MAX_BP, LIVE_TIERS, liveCharOk, rushBp, vigilBp, type LiveTier } from '../../../content/live.ts';
import { RUSH_TOTAL } from '../../../content/rush.ts';
import { RAID_LIVE, raidCharCoef, type RaidLiveTemplate, type RaidLiveTier } from '../../../content/explore.ts';

/** 实盘守夜的一句话说明：天亮、尸王各结回几份按这一档的 dawnBp 算（倍数按档拟合，四档不同） */
/** 夜探实盘的说明：危险档、多少价值算一份、上限 */
/** 夜探实盘说明：角色系数乘在算好的倍数上（settle.ts），这里把它折进"多少铜钱算 1 份"和保底里，写的就是这个角色实际拿到的 */
export function raidLiveNote(tier: RaidLiveTier, tpl: RaidLiveTemplate, character: CharacterId): string {
  const c = raidCharCoef(character, tier, tpl) ?? 10_000;
  const base = Math.round((RAID_LIVE.base[tier][tpl] * 10_000) / c);
  const floor = Math.max(1, Math.floor(RAID_LIVE.floor[tier] * c) / 10_000);
  return `危险 ${RAID_LIVE.danger[tier]} · 不能用加成<br>撤出来至少拿回 1 份，待满 ${RAID_LIVE.floorRamp[tier] / 1800} 分钟再撤保底 ${Number(floor.toFixed(2))} 份；带出 ${base.toLocaleString('zh-CN')} 铜钱的宝物算 1 份，最多 ${RAID_LIVE.cap} 份；没撤出这一份就没了`;
}

/** 守夜实盘说明：按选的角色、地图算（各有实盘系数）；还写明能放技能、选的角色能不能带进来（带不进来的按小道士出战，直说，不悄悄换） */
export function liveNote(tier: LiveTier, picked: CharacterId, map: MapId): string {
  const ok = liveCharOk(picked);
  const character = ok ? picked : 'xiaodao';
  const dawn = vigilBp(tier, 0, true, false, character, map);
  const boss = vigilBp(tier, 0, true, true, character, map);
  const f = (bp: number): string => String(Number((bp / 10_000).toFixed(2)));
  // 系数大的组合（几个角色在荒庙、义庄豪华档）天亮就到封顶：打不打倒尸王都一样，直说，免得以为还能多拿
  const top = dawn >= LIVE_MAX_BP ? `天亮就封顶 <b>${f(dawn)}</b> 份` : `天亮 <b>${f(dawn)}</b> 份，打倒尸王 <b>${f(boss)}</b> 份`;
  // 各档的曲线回钱起点不同（小档 3 分钟，中档以上 2 分钟）
  const from = LIVE_TIERS[tier].shape[0]![0] / 60;
  const swap = ok ? '' : ` · <b class="yx-livewarn">${CHARACTERS[picked].name}带不进来，按小道士出战</b>`;
  return `撑过 <b>${from}</b> 分钟才开始拿回筹码，越久越多：${top}；最多输这一份<br>技能照常能放${swap}`;
}

/** 电脑宽屏右栏的实盘数字小牌：大字写数，小字写它是什么；细则放进悬停（title，就是上面那段说明去掉标签）。
 *  拿回多少直接写筹码数（试玩 11-22：「1.01 份」看不懂），未扣每天的上限 */
export interface LiveFact {
  big: string;
  small: string;
}
const chips = (tier: LiveTier, bp: number): string => Math.floor((LIVE_TIERS[tier].stake * bp) / 10_000).toLocaleString('zh-CN');
export const plainNote = (html: string): string => html.replace(/<br>/g, '；').replace(/<[^>]+>/g, '');

export function raidLiveFacts(tier: RaidLiveTier, tpl: RaidLiveTemplate, character: CharacterId): LiveFact[] {
  const c = raidCharCoef(character, tier, tpl) ?? 10_000;
  const base = Math.round((RAID_LIVE.base[tier][tpl] * 10_000) / c);
  const floor = Math.max(1, Math.floor(RAID_LIVE.floor[tier] * c) / 10_000);
  return [
    { big: chips(tier, 10_000), small: '撤出至少拿回' },
    { big: chips(tier, Math.round(floor * 10_000)), small: `待满 ${RAID_LIVE.floorRamp[tier] / 1800} 分钟再撤` },
    { big: base.toLocaleString('zh-CN'), small: `铜钱宝物换 ${chips(tier, 10_000)}` },
    { big: chips(tier, RAID_LIVE.cap * 10_000), small: '最多拿回' },
    { big: '技能', small: '照常能放' },
  ];
}

export function liveFacts(tier: LiveTier, picked: CharacterId, map: MapId): LiveFact[] {
  const ok = liveCharOk(picked);
  const character = ok ? picked : 'xiaodao';
  const dawn = vigilBp(tier, 0, true, false, character, map);
  const boss = vigilBp(tier, 0, true, true, character, map);
  const from = LIVE_TIERS[tier].shape[0]![0] / 60;
  const out: LiveFact[] = [{ big: `${from} 分钟`, small: '撑过才拿回' }];
  if (dawn >= LIVE_MAX_BP) out.push({ big: chips(tier, dawn), small: '天亮拿最多' });
  else out.push({ big: chips(tier, dawn), small: '天亮拿回' }, { big: chips(tier, boss), small: '打倒尸王' });
  // 这格写下注真要知道的数（试玩 11-23：「技能 照常能放」不是数），技能能放写在悬停说明里
  out.push({ big: chips(tier, 10_000), small: '最多输' });
  return out;
}

/** 实盘连战：按打倒几只结回（rushBp），打倒夜漏君另给；照实写数，打到终局没打倒也有 */
const share = (bp: number): string => `${Number((bp / 10_000).toFixed(2))} 份`;
export function rushLiveFacts(tier: LiveTier): LiveFact[] {
  return [
    // 小牌四格要在 390 竖屏、844 横屏放下：小字最多四个字，细说写在下面的说明里（走查 11-23 截字）
    // 试玩 11-23：「打到终局」「每只约」「一局约」读不懂，改成「打到哪、拿回多少」
    { big: chips(tier, rushBp(tier, RUSH_TOTAL, RUSH_TOTAL, true)), small: '全清拿回' },
    { big: chips(tier, rushBp(tier, RUSH_TOTAL - 1, RUSH_TOTAL, false)), small: '打到夜漏君' },
    { big: `+${chips(tier, rushBp(tier, 1, RUSH_TOTAL, false))}`, small: '每关约加' },
    { big: '15 分钟', small: '一局大约' },
  ];
}
export function rushLiveNote(tier: LiveTier): string {
  return `危险 ${LIVE_TIERS[tier].danger} · 固定小道士、推荐配装<br>没打倒夜漏君按打倒几只折算，打到终局（前 ${RUSH_TOTAL - 1} 只都打倒）${share(rushBp(tier, RUSH_TOTAL - 1, RUSH_TOTAL, false))}，天亮 ${share(rushBp(tier, RUSH_TOTAL, RUSH_TOTAL, true))}；一只没打倒这一份就没了；中途离开按已打倒的只数带回`;
}
