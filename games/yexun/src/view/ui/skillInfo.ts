/**
 * 角色技能和被动的完整说明（角色页宽卡、对局里长按 / 悬停技能钮、暂停页「角色」一栏共用）。
 * 数字从 core/skills.ts 的 SKILL_FX、SKILLS 和 content 里的表直接取，改数值不用再改这里的字。
 */
import { CHARACTER_POOLS } from '../../content/pools.ts';
import { SCHOOLS } from '../../content/guide.ts';
import { CHARACTERS, type CharacterId } from '../../content/meta.ts';
import { WEAPONS } from '../../content/weapons.ts';
import { SKILL_FX, SKILLS } from '../../core/skills.ts';
import { TICKS_PER_SECOND } from '../../core/state.ts';

const sec = (ticks: number): string => {
  const s = ticks / TICKS_PER_SECOND;
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
};
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** 每个技能的完整效果（带数值）；一句话版本是 SKILLS[id].text */
const DETAIL: Record<CharacterId, string> = {
  xiaodao: `面前约 150° 的扇面、${SKILL_FX.sweep.r} 远以内的怪，各挨桃木剑当前伤害的 ${SKILL_FX.sweep.mul} 倍，并被推开`,
  fushi: `一口气射出 ${SKILL_FX.volley.n} 张追踪符，各找 ${SKILL_FX.volley.find} 以内不同的怪，打中爆开（半径 ${SKILL_FX.volley.r}）`,
  jianxia: `沿面向冲出 ${SKILL_FX.dash.dist}，路上的怪挨飞剑伤害的 ${SKILL_FX.dash.mul} 倍；冲的时候和冲完 ${sec(SKILL_FX.dash.invuln)} 秒不挨打`,
  pang: `${sec(SKILLS.pang.dur)} 秒内挨打只掉 ${pct(SKILL_FX.iron.hurtMul)}；结束时把 ${SKILL_FX.iron.r} 以内的怪震开`,
  gengfu: `${sec(SKILLS.gengfu.dur)} 秒里每 ${sec(SKILL_FX.clapper.every)} 秒敲一下：${SKILL_FX.clapper.r} 以内的怪退一步，受 ${SKILL_FX.clapper.dmg} + ${SKILL_FX.clapper.perLevel} × 等级的伤害`,
  caiyao: `立刻回血量上限的 ${pct(SKILL_FX.spring.burst)}，之后 ${sec(SKILLS.caiyao.dur)} 秒每秒回 ${pct(SKILL_FX.spring.perSec)}；这段时间身边 ${SKILL_FX.spring.slowR} 以内的怪走得慢一半`,
  zhijiang: `身边立刻剪出 ${SKILL_FX.paper.n} 个纸兵，${sec(SKILL_FX.paper.life)} 秒后散；不占纸兵的上限，伤害跟着纸兵法器的等级`,
  baidu: `脚下展开半径 ${SKILL_FX.ferry.r} 的水域 ${sec(SKILLS.baidu.dur)} 秒，跟着你走：里面你快 ${pct(SKILL_FX.ferry.speed - 1)}，怪慢四成`,
  huolang: `全屏的魂珠和铜钱飞到身上；之后 ${sec(SKILLS.huolang.dur)} 秒打倒的怪多掉 ${SKILL_FX.fortune.extra} 枚铜钱`,
  yinyang: `脚下布一座半径 ${SKILL_FX.array.r} 的阵 ${sec(SKILLS.yinyang.dur)} 秒：阵里的怪先定住 ${sec(SKILL_FX.array.bind)} 秒，之后慢四成`,
};

export interface SkillInfo {
  /** 技能名、图标、一句话、完整效果、冷却秒数 */
  name: string;
  icon: string;
  text: string;
  detail: string;
  cd: number;
  /** 被动的名字和说明 */
  perkName: string;
  perk: string;
  /** 适合的流派（主修）和起手法器 */
  fit: string;
  start: string;
}

export function skillInfo(id: CharacterId): SkillInfo {
  const sk = SKILLS[id];
  const c = CHARACTERS[id];
  return {
    name: sk.name,
    icon: sk.icon,
    text: sk.text,
    detail: DETAIL[id],
    cd: Math.round(sk.cd / TICKS_PER_SECOND),
    perkName: c.perkName,
    perk: c.perk,
    fit: CHARACTER_POOLS[id].schools.map((k) => SCHOOLS[k].name).join('、'),
    start: WEAPONS[c.start].name,
  };
}

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** 对局里悬停 / 长按技能钮弹出的完整说明 */
export function skillTipHtml(id: CharacterId): string {
  const k = skillInfo(id);
  return (
    `<b>${esc(k.name)}</b> · ${k.cd} 秒一次<p>${esc(k.detail)}</p>` +
    `<p>被动「${esc(k.perkName)}」：${esc(k.perk)}</p><small>适合 ${esc(k.fit)}</small>`
  );
}

/** 每个角色第一次在局里拿到技能时的提示：做什么、怎么放（touch：触屏设备） */
export function skillFirstTip(id: CharacterId, touch: boolean): string {
  const k = skillInfo(id);
  const how = touch ? '点右下角的技能钮放，<b>按住</b>它看详细说明' : '按 <b>空格</b> 或 <b>Q</b> 放，鼠标停在右下角的技能钮上看详细说明';
  return `<b>技能「${esc(k.name)}」</b>${esc(k.text)}（${k.cd} 秒一次）<br>${how}`;
}
