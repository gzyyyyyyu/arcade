import type { MapId } from '../../../content/maps.ts';
import { CHARACTERS, type CharacterId } from '../../../content/meta.ts';
import { LIVE_MAX_BP, LIVE_SKILL_SHAPE, liveCharOk, liveSkillOpen, VIGIL_SHAPE, vigilBp, type LiveTier } from '../../../content/live.ts';
import { RAID_LIVE, raidCharCoef, type RaidLiveTemplate, type RaidLiveTier } from '../../../content/explore.ts';

/** 实盘守夜的一句话说明：天亮、尸王各结回几份按这一档的 dawnBp 算（倍数按档拟合，四档不同） */
/** 夜探实盘的说明：危险档、多少价值算一份、上限 */
/** 夜探实盘说明：角色系数乘在算好的倍数上（settle.ts），这里把它折进"多少铜钱算 1 份"和保底里，写的就是这个角色实际拿到的 */
export function raidLiveNote(tier: RaidLiveTier, tpl: RaidLiveTemplate, character: CharacterId): string {
  const c = raidCharCoef(character, tier, tpl) ?? 10_000;
  const base = Math.round((RAID_LIVE.base[tier][tpl] * 10_000) / c);
  const floor = Math.max(1, Math.floor(RAID_LIVE.floor[tier] * c) / 10_000);
  return `危险 ${RAID_LIVE.danger[tier]} · 不带加成<br>撤出来至少拿回 1 份，待满 ${RAID_LIVE.floorRamp[tier] / 1800} 分钟再撤保底 ${Number(floor.toFixed(2))} 份；带出 ${base.toLocaleString('zh-CN')} 铜钱的宝物算 1 份，最多 ${RAID_LIVE.cap} 份；没撤出这一份就没了`;
}

/** 守夜实盘说明：按选的角色、地图算（各有实盘系数）；还写明这一格能不能放技能、选的角色能不能带进来（带不进来的按小道士出战，直说，不悄悄换） */
export function liveNote(tier: LiveTier, picked: CharacterId, map: MapId): string {
  const ok = liveCharOk(tier, picked, map);
  const character = ok ? picked : 'xiaodao';
  const dawn = vigilBp(tier, 0, true, false, character, map);
  const boss = vigilBp(tier, 0, true, true, character, map);
  const f = (bp: number): string => String(Number((bp / 10_000).toFixed(2)));
  // 系数大的组合（几个角色在荒庙、义庄豪华档）天亮就到封顶：打不打倒尸王都一样，直说，免得以为还能多拿
  const top = dawn >= LIVE_MAX_BP ? `天亮就封顶 <b>${f(dawn)}</b> 份` : `天亮 <b>${f(dawn)}</b> 份，打倒尸王 <b>${f(boss)}</b> 份`;
  const open = liveSkillOpen(tier, map, undefined, character);
  const skill = open ? '能放技能' : '不能放技能';
  // 开了技能的中档以上用按档的曲线，回钱起点不是 3 分钟
  const from = ((open ? LIVE_SKILL_SHAPE[tier]?.shape : undefined) ?? VIGIL_SHAPE)[0]![0] / 60;
  const swap = ok ? '' : ` · <b class="yx-livewarn">${CHARACTERS[picked].name}带不进来，按小道士出战</b>`;
  return `撑过 <b>${from}</b> 分钟开始回钱，越久越多：${top}；最多输这一份<br>${skill}${swap}`;
}

/** 电脑宽屏右栏的实盘数字小牌：大字写数，小字写它是什么；细则放进悬停（title，就是上面那段说明去掉标签） */
export interface LiveFact {
  big: string;
  small: string;
}
export const plainNote = (html: string): string => html.replace(/<br>/g, '；').replace(/<[^>]+>/g, '');

export function raidLiveFacts(tier: RaidLiveTier, tpl: RaidLiveTemplate, character: CharacterId): LiveFact[] {
  const c = raidCharCoef(character, tier, tpl) ?? 10_000;
  const base = Math.round((RAID_LIVE.base[tier][tpl] * 10_000) / c);
  const floor = Math.max(1, Math.floor(RAID_LIVE.floor[tier] * c) / 10_000);
  return [
    { big: '1 份', small: '撤出至少' },
    { big: `${Number(floor.toFixed(2))} 份`, small: `待满 ${RAID_LIVE.floorRamp[tier] / 1800} 分钟再撤` },
    { big: base.toLocaleString('zh-CN'), small: '铜钱宝物算 1 份' },
    { big: `${RAID_LIVE.cap} 份`, small: '最多' },
    { big: '不能', small: '放技能' },
  ];
}

export function liveFacts(tier: LiveTier, picked: CharacterId, map: MapId): LiveFact[] {
  const ok = liveCharOk(tier, picked, map);
  const character = ok ? picked : 'xiaodao';
  const dawn = vigilBp(tier, 0, true, false, character, map);
  const boss = vigilBp(tier, 0, true, true, character, map);
  const f = (bp: number): string => `${Number((bp / 10_000).toFixed(2))} 份`;
  const open = liveSkillOpen(tier, map, undefined, character);
  const from = ((open ? LIVE_SKILL_SHAPE[tier]?.shape : undefined) ?? VIGIL_SHAPE)[0]![0] / 60;
  const out: LiveFact[] = [{ big: `${from} 分钟`, small: '后开始回钱' }];
  if (dawn >= LIVE_MAX_BP) out.push({ big: f(dawn), small: '天亮封顶' });
  else out.push({ big: f(dawn), small: '天亮' }, { big: f(boss), small: '打倒尸王' });
  out.push({ big: open ? '能' : '不能', small: '放技能' });
  return out;
}
