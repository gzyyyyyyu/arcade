/**
 * 法器数值的小图标（选卡卡片、玩法页「选卡」的图例共用）：一项一个，16×16、跟字同色。
 * 卡上只写「图标 + 数」，这件法器的叫法（「几道雷」「回一层要多久」）放在悬停提示和读屏标签里。
 */
import type { StatChange, WeaponStats } from '../../content/weapons.ts';

const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const PATHS: Record<keyof WeaponStats, string> = {
  // 伤害：爆开的星
  dmg: '<path d="M8 1.5 9.6 6.2 14.5 6.4 10.6 9.4 12 14.2 8 11.4 4 14.2 5.4 9.4 1.5 6.4 6.4 6.2Z" fill="currentColor"/>',
  // 冷却：沙漏
  cd: `<path d="M3.5 2h9M3.5 14h9M4.5 2c0 3.5 7 4.5 7 6s-7 2.5-7 6M11.5 2c0 3.5-7 4.5-7 6s7 2.5 7 6" ${S}/>`,
  // 范围：靶心
  area: `<circle cx="8" cy="8" r="6" ${S}/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>`,
  // 数量：三颗点
  amount: '<circle cx="4" cy="10.5" r="2.3" fill="currentColor"/><circle cx="12" cy="10.5" r="2.3" fill="currentColor"/><circle cx="8" cy="4.5" r="2.3" fill="currentColor"/>',
  // 速度：双箭头
  speed: `<path d="M2.5 3.5 7 8l-4.5 4.5M8.5 3.5 13 8l-4.5 4.5" ${S}/>`,
  // 持续：钟
  duration: `<circle cx="8" cy="8" r="6" ${S}/><path d="M8 4.5V8l2.5 1.8" ${S}/>`,
  // 击退：推出去的箭头
  knock: `<path d="M2.5 3v10M6 8h7.5M10.5 4.5 14 8l-3.5 3.5" ${S}/>`,
  // 连打间隔：转一圈的箭头
  rehit: `<path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" ${S}/>`,
};

export function statIcon(key: keyof WeaponStats): string {
  return `<svg class="yx-stico" viewBox="0 0 16 16" aria-hidden="true">${PATHS[key]}</svg>`;
}

/** 一项数：图标 + 数（升级卡写「前→后」）；words 为真时图标后面还写叫法（第一局的简版卡） */
export function statChip(n: StatChange, words: boolean): string {
  const v = n.from === n.to ? `${n.from}` : `${n.from}→${n.to}`;
  return `<span title="${n.name}" aria-label="${n.name} ${v}${n.unit}">${statIcon(n.key)}${words ? `${n.name} ` : ''}<b>${v}</b>${n.unit}</span>`;
}

/** 图例顺序 */
export const STAT_ORDER: readonly (keyof WeaponStats)[] = ['dmg', 'cd', 'amount', 'area', 'duration', 'speed', 'knock', 'rehit'];
