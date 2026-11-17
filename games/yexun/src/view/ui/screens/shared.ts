import type { SchoolId } from '../../../content/guide.ts';
import type { MapId } from '../../../content/maps.ts';
import { DANGERS, type Danger } from '../../../content/waves.ts';
import type { CharacterId, CurseId } from '../../../content/meta.ts';
import type { LiveTier } from '../../../content/live.ts';
import { RAID_LIVE_TEMPLATES, type RaidLiveTemplate } from '../../../content/explore.ts';
import { RAID_PICKS, type Best, type LastMode, type RaidPick } from '../../../platform/save.ts';
import { beijingDate, daysToNightmareSunday } from '../../../online/daily.ts';

/** 锁：不用表情字符（有的设备、无头浏览器没有表情字体，显示成方框） */
export const LOCK_SVG = '<svg class="yx-lock" viewBox="0 0 12 12" aria-label="没解锁"><rect x="2" y="5.5" width="8" height="6" rx="1.2" fill="currentColor"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

export const HOME_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.5V20h12v-9.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg><span>大厅</span>';

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * 入场上滑只在切换页面时播：整屏从隐藏变显示时浏览器重播根节点的淡入（yx-scr-in），借它的开始 / 结束给根节点挂摘 yx-entering，
 * 里面的面板只在挂着时上滑。点卡片、切标签是整块 innerHTML 重画，新建的面板如果自带入场动画，每点一下都从透明重播一遍，看着就是闪一下黑。
 */
export let enterWired = false;
export function wireEnter(): void {
  if (enterWired) return;
  enterWired = true;
  const on = (e: AnimationEvent, add: boolean): void => {
    const t = e.target as HTMLElement;
    if (e.animationName === 'yx-scr-in' && t.classList.contains('yx-screen')) t.classList.toggle('yx-entering', add);
  };
  document.addEventListener('animationstart', (e) => on(e, true));
  document.addEventListener('animationend', (e) => on(e, false));
  document.addEventListener('animationcancel', (e) => on(e, false));
}

export function layer(parent: HTMLElement, cls: string): HTMLDivElement {
  wireEnter();
  const d = document.createElement('div');
  d.className = `yx-screen ${cls}`;
  d.style.display = 'none';
  parent.appendChild(d);
  return d;
}

/** 按钮的 data-a 分派 */
export function onAction(root: HTMLElement, handlers: Record<string, (el: HTMLElement) => void>): void {
  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el || !root.contains(el)) return;
    const h = handlers[el.dataset.a!];
    if (h) h(el);
  });
}

export interface Toggle {
  key: string;
  label: string;
  get: () => boolean;
  set: (on: boolean) => void;
}

export function togglesHtml(list: Toggle[]): string {
  return list
    .map((t) => `<button type="button" class="yx-toggle${t.get() ? ' on' : ''}" data-a="toggle" data-k="${t.key}" aria-pressed="${t.get()}"><i></i>${esc(t.label)}</button>`)
    .join('');
}

export function bindToggles(root: HTMLElement, list: Toggle[]): Record<string, (el: HTMLElement) => void> {
  return {
    toggle: (el) => {
      const t = list.find((x) => x.key === el.dataset.k);
      if (!t) return;
      t.set(!t.get());
      el.classList.toggle('on', t.get());
      el.setAttribute('aria-pressed', String(t.get()));
      void root;
    },
  };
}

// ───────────────────────── 开始菜单 ─────────────────────────

/** 顶栏"每日"按钮：周日噩梦日（今天守夜每日打噩梦 1）右上角挂红牌"噩梦"，平时不挂，倒数天数放进 title / aria-label。
 *  以前是主页上一条单独的胶囊，主页信息块太多（docs/ui.md 第 11 节），挪成角标 */
export function dailyButton(): string {
  const n = daysToNightmareSunday(beijingDate(Date.now()));
  const tip = n === 0 ? `每日挑战 · 今天是噩梦日，守夜每日 ${DANGERS[6].name}` : `每日挑战 · 守夜每日，周日噩梦日还有 ${n} 天`;
  return `<button type="button" class="yx-btn yx-daily" data-a="daily" title="${tip}" aria-label="${tip}">每日${n === 0 ? '<i class="yx-dbadge">噩梦</i>' : ''}</button>`;
}

/** 设置里"恢复默认"用的默认值（和 sfx.ts / music.ts / save.ts 里 readFlag 的兜底一致；没列的开关不动） */
export const TOGGLE_DEFAULTS: Record<string, boolean> = { sfx: true, music: true, shake: true, assist: false, stick: false, autoSkill: false };

export const CLOSE_SVG = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3l12 12M15 3 3 15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

export interface MenuState {
  danger: Danger;
  /** 能选的最高危险档 */
  dangerOpen: Danger;
  best: Partial<Record<Danger, Best>>;
  map: MapId;
  /** 铜钱、角色、咒印（开局准备里改，这里只显示） */
  coins: number;
  character: CharacterId;
  /** 出战角色的头像（data URL） */
  charFace?: string;
  /** 当前角色的开局配置选项和已选（只有有主修流派表的角色才有）：起手二选一（原起手 / 第二件）、心法三选一（不带 / 两个主修流派） */
  loadout?: {
    alt: boolean;
    starts: { icon: string; name: string }[];
    xinfa: SchoolId | null;
    schools: { id: SchoolId; name: string }[];
  };
  curses: CurseId[];
  /** 咒印开了没有（撑到过一次天亮） */
  cursesOpen: boolean;
  /** 实盘能不能选（有平台钱包）、上次是不是在实盘、选的档位 */
  live: { available: boolean; on: boolean; tier: LiveTier; offWhy?: string };
  /** 每张图开了没有（MAP_UNLOCK） */
  maps: Record<MapId, boolean>;
  /** 夜探：还没进过夜探（第一次固定教学镇，只有一个开始按钮） */
  raidFirst?: boolean;
  /** 夜探卡上"藏宝阁 3/45"那个按钮（没传就不显示） */
  vault?: { got: number; total: number };
  /** 上次开的模式、夜探选的镇子（主页"开始"一步直达用） */
  lastMode: LastMode;
  raidTpl: RaidPick;
  /** 图集里一帧画成小图（特色怪头像用） */
  mobIcon: (key: string, px?: number) => string;
}

/** 夜探卡能选的镇子（教学镇不在里面：第一次固定进） */
export const RAID_PICK: readonly RaidPick[] = RAID_PICKS;
/** 实盘能选的镇子（RAID_LIVE_TEMPLATES） */
export const LIVE_PICK: readonly RaidLiveTemplate[] = RAID_LIVE_TEMPLATES;
export const isLiveTown = (t: RaidPick): t is RaidLiveTemplate => (LIVE_PICK as readonly string[]).includes(t);


/** 顶上的"大厅"按钮（两屏都有，回大厅两步内到） */
export const HOME_BTN = `<button type="button" class="yx-btn yx-home" data-a="home" aria-label="回大厅">${HOME_SVG}</button>`;

export const bestText = (b: Best | undefined): { big: string; small: string } =>
  !b ? { big: '还没玩过', small: '' } : { big: b.won ? '天亮了' : mmss(b.ticks / 30), small: `斩 ${b.kills.toLocaleString('zh-CN')}` };

// ───────────────────────── 主页 ─────────────────────────

/** 主页一键开的实盘：上次选了实盘、现在开得了，夜探还要过了教学镇、选的是能开实盘的镇子；否则 null（按娱乐开） */
export function quickLive(s: MenuState): { tier: LiveTier; raid?: RaidLiveTemplate } | null {
  if (!s.live.on || !s.live.available) return null;
  if (s.lastMode !== 'raid') return { tier: s.live.tier };
  return !s.raidFirst && isLiveTown(s.raidTpl) ? { tier: s.live.tier, raid: s.raidTpl } : null;
}

/** 上次选了实盘、这次却按娱乐开的原因（主页按钮下面那行字） */
export function quickOffWhy(s: MenuState): string {
  if (!s.live.available) return s.live.offWhy ?? '现在开不了实盘';
  if (s.raidFirst) return '第一次夜探先走教学镇';
  return '教学镇不开实盘';
}


// ───────────────────────── 开始菜单（两屏的总管） ─────────────────────────

/**
 * 点了起手或心法后浮出的一条说明（触屏没有悬停，图标的提示看不到）：起手是哪件、心法这局管什么用。
 * 心法保底一张主修卡、主修进化多补一次刷新（规则 60，实盘规则 64 起也有）
 */
export function loadoutNote(l: NonNullable<MenuState['loadout']>): string {
  const start = `起手 ${l.starts[l.alt ? 1 : 0]?.name ?? ''}`;
  const x = l.schools.find((s) => s.id === l.xinfa);
  if (!x) return `${start} · 不带心法`;
  return `${start} · 心法 ${x.name}：每次升级保底一张${x.name}的卡，${x.name}的法器进化多补一次刷新`;
}
