/**
 * 游戏主页（docs/art.md）：进来先看到茶馆的主视觉和一句玩法，一个最大的"快速一局"（一局一结；有没打完的单机就是"继续上局"），
 * 三张模式卡（娱乐 / 实盘 / 好友房）点进去才是选档，再加一张我的战绩小卡。不一进来就摆七张档位卡，那样像设置页。
 */
import { readText } from '../storage.ts';
import { homeScene, stakeIcon } from './art.ts';
import { busy, button, el } from './dom.ts';
import { GAME_NAME } from './text.ts';
import { summarize } from '../game/progress.ts';
import { DAILY_KEY, parseAll } from '../game/daily.ts';
import { loadAch } from './achieve.ts';
import { loadDex } from './dex.ts';
import { todayCN } from './daily.ts';
import { hekiriToday } from './hekiri.ts';
import { ladderLabel } from './ladder.ts';
import { tingLabel } from './ting.ts';
import { homeChoiceOf } from './variants/pages.ts';


export type HomeMode = 'fun' | 'real' | 'room';

interface HomeProps {
  /** 主页切换项的 id（玩法 id；川麻开了血流成河时是 flow，见 VariantPage.homeChoices） */
  variant: string;
  /** 快速一局按什么开（"娱乐·新手"之类，按上次选的档位和难度；规则固定一局一结） */
  quick: string;
  /** 快速一局底下的玩法切换：ids 是摆哪几个切换项（各玩法的 homeChoices），current 是选着的 */
  variants?: { ids: string[]; current: string; onPick(id: string): void };
  /** 有没打完的单机：按钮换成"继续上局"，底下一行写是哪一场、打到第几局 */
  resume: string | null;
  /** 实盘卡灰掉：卡上一行短话（label，窄的横屏手机上也不折行），点卡提示完整原因（why，钱包连不上、登录过期、没筹码）；null 是能选。单独部署没有实盘卡 */
  realOff: { label: string; why: string } | null;
  /** 点灰掉的卡时说原因（app 层的提示条） */
  onNote(text: string): void;
  standalone: boolean;
  /** 单机的战绩（本地记的）：没打过时是 null */
  record: { played: number; won: number; lost: number } | null;
  onQuick(): Promise<void>;
  onResume(): void;
  onMode(m: HomeMode): void;
  onRules(): void;
  /** 点进度卡的一项：每日挑战去娱乐选桌页，成就 / 图鉴开规则小册子对应页签 */
  onProgress(to: 'daily' | 'hekiri' | 'ting' | 'ladder' | '成就' | '图鉴'): void;
}

export function renderHome(box: HTMLElement, p: HomeProps): void {
  box.replaceChildren();
  const art = el('div', 'home-art', box);
  art.innerHTML = homeScene();
  const main = el('div', 'home-main', box);
  const head = el('div', 'home-head', main);
  el('h1', 'brand', head, GAME_NAME);
  const { page, choice } = homeChoiceOf(p.variant);
  el('div', 'variant', head, choice.name);
  el('p', 'pitch', main, choice.pitch);

  const go = p.resume
    ? button('act go big quick', main, '继续上局', p.onResume)
    : button('act go big quick', main, '快速一局', () => void busy(go, p.onQuick));
  el('small', '', go, p.resume ?? `${p.quick} · 约 2 分钟`);
  // 快速一局打哪种：血战、血流、立直，点了就换（不用进选桌页）
  if (!p.resume && p.variants) {
    const row = el('div', 'quick-variants', main);
    for (const id of p.variants.ids) {
      const on = p.variants.current === id;
      const b = button(`chip${on ? ' on' : ''}`, row, homeChoiceOf(id).choice.chip, () => !on && p.variants!.onPick(id));
      b.setAttribute('aria-pressed', String(on));
    }
  }

  // 快速一局是主角；底下一道分隔写「自己选桌」，三张模式卡是第二层
  el('div', 'home-sep', main, '自己选桌');
  const modes = el('div', 'modes', main);
  const card = (id: HomeMode, icon: 'fun' | 'lux' | 'room', name: string, line: string, off: { label: string; why: string } | null): void => {
    const b = button(`mode ${id}${off ? ' off' : ''}`, modes, '', () => (off ? p.onNote(off.why) : p.onMode(id)));
    b.insertAdjacentHTML('afterbegin', stakeIcon(icon));
    el('b', '', b, name);
    el('small', '', b, off?.label ?? line);
  };
  card('fun', 'fun', '娱乐', '不算筹码', null);
  if (!p.standalone) card('real', 'lux', '实盘', '用钱包筹码', p.realOff);
  card('room', 'room', '好友房', '叫朋友一起', null);

  // 面板底：左边战绩、右边规则链接，一行放下（没战绩又有存档时只剩规则链接）
  const foot = el('div', 'home-foot', main);
  const rec = p.record || !p.resume ? el('div', 'record', foot) : null;
  if (rec && p.record) {
    const r = p.record;
    el('span', '', rec, `打了 ${r.played} 场`);
    el('span', '', rec, `赢 ${r.won} 场`);
    if (r.lost >= 2) el('span', 'down', rec, `连输 ${r.lost}`);
  } else if (rec) el('span', '', rec, '还没打过：先来一场新手练练手');
  progressCard(art, p);
  button('link', foot, page.rulesLink, p.onRules);
  el('div', 'ver', box, `v${__MAHJONG_VERSION__}`);
}

/** 小图标（描线，跟着字色），不用 emoji：各平台的 emoji 长得不一样，有的机器还显示成方块 */
const PROG_ICON = {
  daily: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  hekiri: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3.5" width="12" height="17" rx="2.5"/><path d="M12 8v8M9.5 10.5h5"/></svg>',
  ting: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 13V9M9.5 3.5h5"/></svg>',
  ladder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4.5a2.5 2.5 0 0 0 2.6 3.5M17 6h2.5a2.5 2.5 0 0 1-2.6 3.5M12 13v3.5M8.5 20h7l-1-3.5h-5z"/></svg>',
  ach: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3l4 6 4-6"/><circle cx="12" cy="15" r="5.5"/></svg>',
  dex: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3-1.5 5.5-1.5 8 0v14c-2.5-1.5-5-1.5-8 0zM20 5.5c-3-1.5-5.5-1.5-8 0v14c2.5-1.5 5-1.5 8 0z"/></svg>',
};

/**
 * 我的进度：每日、何切、速判、擂台、成就、图鉴各一个小胶囊，图标加数字，点了直达；空数据也显示，引导去玩。
 * 放在插画底下那块空着的呢子上：按钮那一栏一屏刚好放满，再加一张卡会把"快速一局"和"规则"挤出去
 */
function progressCard(box: HTMLElement, p: HomeProps): void {
  // 读不到就当没打过
  const s = summarize(parseAll(readText(DAILY_KEY)), loadAch(), loadDex(), todayCN());
  const bar = el('div', 'progress', box);
  const pill = (icon: string, name: string, val: string, to: 'daily' | 'hekiri' | 'ting' | 'ladder' | '成就' | '图鉴'): void => {
    const b = button('prog', bar, '', () => p.onProgress(to));
    b.insertAdjacentHTML('afterbegin', icon);
    el('span', 'prog-name', b, name);
    el('b', 'prog-val', b, val);
  };
  pill(PROG_ICON.daily, '每日', s.daily.doneToday ? (s.daily.streak > 1 ? `连续 ${s.daily.streak} 天` : '已打') : '没打', 'daily');
  const hk = hekiriToday();
  pill(PROG_ICON.hekiri, '何切', hk.score === null ? '没做' : `${hk.score} 分`, 'hekiri');
  pill(PROG_ICON.ting, '速判', tingLabel(), 'ting');
  pill(PROG_ICON.ladder, '擂台', ladderLabel(), 'ladder');
  pill(PROG_ICON.ach, '成就', `${s.ach.got}/${s.ach.total}`, '成就');
  pill(PROG_ICON.dex, '图鉴', `${s.dex.got}/${s.dex.total}`, '图鉴');
}
