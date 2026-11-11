import { BUILDINGS, TROOPS, type LevelDef } from '../content/index.ts';
import { hqLevel, publicLayout } from '../core/index.ts';
import type { BuildingKind, Placed, TroopKind } from '../core/types.ts';
import { app } from './app.ts';
import { bArt, iconA, tArt } from './art.ts';
import { renderLayout } from './mini.ts';
import { button, el, img, uiRoot } from './ui.ts';

/** 带什么兵的建议：只读内容表和已解锁的兵，简单规则，不是规则本身 */
function advice(layout: Placed[]): string {
  const hq = hqLevel(app.profile);
  const has = (k: TroopKind): boolean => TROOPS[k].unlockHq <= hq;
  const n = (k: BuildingKind): number => layout.filter((b) => b.kind === k).length;
  const defs = layout.filter((b) => BUILDINGS[b.kind].category === 'defense').length;
  const tips: string[] = [];
  if (n('wall') >= 8 && has('bomber')) tips.push(`城墙多（${n('wall')} 段），带${TROOPS.bomber.name}炸开缺口`);
  if (n('mortar') + n('rocket') > 0) tips.push('有迫击炮、火箭塔：分开两侧登陆，别带一堆血薄的兵');
  if (n('shock') > 0) tips.push('有震荡炮：别让壮汉、船长扎堆走，分散着上，被震住的先让别人顶');
  if (n('sniper') > 0) tips.push(has('shield') ? `有狙击塔：船长、船医别走在前面，带${TROOPS.shield.name}顶在前面挡直射` : '有狙击塔：船长、船医别走在前面，先让别的兵吸引火力');
  if (defs >= 6 && has('brute')) tips.push(`防御多（${defs} 座），${TROOPS.brute.name}走在前面挡炮`);
  if (defs >= 4 && has('cannoneer')) tips.push(`${TROOPS.cannoneer.name}专打防御塔，放在后排`);
  if (!tips.length) tips.push(has('brute') ? `${TROOPS.sailor.name}加${TROOPS.brute.name}，稳扎稳打` : `${TROOPS.sailor.name}和${TROOPS.gunner.name}打头阵，别一次登陆太多`);
  return tips.slice(0, 2).join('；') + '。';
}


/** 侦察：全屏看敌岛布局（不显示地雷），可拖动缩放；点建筑看等级、血量、射程圈；首领岛写一句解法提示 */
export function openScout(lv: LevelDef): void {
  const root = el('div', 'hd-scout', undefined, uiRoot());
  const head = el('div', 'hd-scout-head', undefined, root);
  el('h2', '', `侦察：${lv.name}`, head);
  button('×', 'hd-x', () => {
    mini.destroy();
    root.remove();
  }, head);
  if (lv.boss && lv.counter) el('p', 'hd-counter', `解法：${lv.counter}`, root);
  el('p', 'hd-sub hd-scout-tip', '拖动、双指缩放；点建筑看射程。地雷和陷阱看不见。', root);
  const host = el('div', 'hd-scout-map', undefined, root);
  const info = el('div', 'hd-scout-info', undefined, root);
  const layout = publicLayout(lv.layout);
  // 没点建筑时底栏给岛的概览：看得见的防御（图标加数量）、能抢多少、带什么兵
  const idle = (): void => {
    info.textContent = '';
    const row = el('div', 'hd-scout-ov', undefined, info);
    const kinds = new Map<BuildingKind, number>();
    for (const b of layout) if (BUILDINGS[b.kind].category === 'defense' || b.kind === 'wall') kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
    const defs = [...kinds].filter(([k]) => k !== 'wall');
    el('b', '', `防御 ${defs.reduce((a, [, c]) => a + c, 0)} 座`, row);
    const chips = el('div', 'hd-scout-chips', undefined, row);
    for (const [k, c] of [...defs, ...(kinds.has('wall') ? ([['wall', kinds.get('wall')!]] as Array<[BuildingKind, number]>) : [])]) {
      const chip = el('span', 'hd-scout-chip', undefined, chips);
      chip.title = BUILDINGS[k].name;
      chip.appendChild(img(bArt(k, 1), 28));
      el('i', '', `×${c}`, chip);
    }
    const loot = el('div', 'hd-scout-loot', undefined, info);
    el('span', 'hd-sub', '最多能抢', loot);
    loot.appendChild(img(iconA('gold'), 18));
    el('b', '', String(lv.loot.gold), loot);
    loot.appendChild(img(iconA('wood'), 18));
    el('b', '', String(lv.loot.wood), loot);
    const tip = el('div', 'hd-scout-tip2', undefined, info);
    const hq = hqLevel(app.profile);
    const icon = (['brute', 'bomber', 'sailor'] as TroopKind[]).find((k) => TROOPS[k].unlockHq <= hq) ?? 'sailor';
    tip.appendChild(img(tArt(icon, 'idle'), 26));
    el('span', '', `建议：${advice(layout)}`, tip);
  };
  const mini = renderLayout(host, layout, {
    zoomToBuildings: true,
    interactive: true,
    onPick: (b) => {
      info.textContent = '';
      if (!b) {
        mini.pick(null);
        idle();
        return;
      }
      const d = BUILDINGS[b.kind];
      const l = d.levels[b.level - 1];
      mini.pick(b.id, l?.range);
      el('b', '', `${d.name}  ${b.level} 级`, info);
      const bits = [l?.hp ? `血量 ${l.hp}` : '', l?.dmg ? `伤害 ${l.dmg}` : '', l?.range ? `射程 ${l.range} 格` : '', l?.splash ? `溅射 ${l.splash} 格` : ''].filter(Boolean);
      if (bits.length) el('span', 'hd-sub', bits.join(' · '), info);
      el('span', 'hd-sub', d.desc, info);
    },
  });
  // 侦察图是可拖动缩放的取景框（岛比框大是设计），用 clip 明确它不是滚动区
  host.style.overflow = 'clip';
  idle();
  requestAnimationFrame(() => mini.fit());
}
