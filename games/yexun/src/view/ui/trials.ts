/**
 * 试炼页（DOM，docs/design-play.md 2.6）：12 关的卡（电脑 3 列、手机竖屏 2 列，放不下翻页，不滚动）+ 本周目标三条。
 * 卡上写目标、配置、词缀、我的最好和好友最好；前一档没通够的关锁着。点卡开局（main 接 onStart）。
 * 好友最好只读当前页看得见的卡，打开一次读一次（online/trials.ts）。
 */
import { CHARACTERS, CURSES } from '../../content/meta.ts';
import { MAPS } from '../../content/maps.ts';
import { RAID_TEMPLATES } from '../../content/explore.ts';
import { DANGERS, RAID_DANGERS } from '../../content/waves.ts';
import { WEEKLIES } from '../../content/weekly.ts';
import { affixTexts, goalText, TRIAL_IDS, TRIAL_OPEN_NEED, TRIAL_TIERS, TRIALS, trialScoreText, type TrialDef, type TrialId } from '../../content/trials.ts';
import type { FriendBests } from '../../online/trials.ts';
import { closeModal, openModal } from './modal.ts';
import { PAGER_CTL, Pager } from './pager.ts';
import './trials.css';
import { esc } from './screens/shared.ts';

export interface TrialsView {
  /** 每关的最好成绩（没打过没有） */
  best: Partial<Record<TrialId, number>>;
  /** 每档开了没有 */
  open: readonly boolean[];
  /** 本周目标 */
  week: readonly { text: string; need: number; prog: number; done: boolean; coins: number }[];
  /** 本周还剩几天 */
  daysLeft: number;
}

export interface TrialsOptions {
  onStart(id: TrialId): void;
  onClose(): void;
}

const n = (x: number): string => x.toLocaleString('zh-CN');

/** 配置一行：图（夜探写镇子）· 角色 · 危险 */
function setupLine(t: TrialDef): string {
  const where = t.raid ? `夜探${RAID_TEMPLATES[t.raid].name}` : MAPS[t.map].name;
  const danger = (t.mode === 'raid' ? RAID_DANGERS : DANGERS)[t.danger].name;
  return `${where} · ${CHARACTERS[t.character].name} · ${danger}`;
}

/** 词缀：咒印、夜事、新词缀，各一小句 */
function rulesLine(t: TrialDef): string {
  const parts = [...(t.curses ?? []).map((c) => CURSES[c].text), ...(t.weekly ? [WEEKLIES[t.weekly].text] : []), ...affixTexts(t)];
  return parts.length ? parts.join('；') : '没有额外规矩';
}

export class TrialsPanel {
  private readonly root: HTMLDivElement;
  private pager: Pager | null = null;
  private friends: FriendBests | null = null;
  private readonly opts: TrialsOptions;

  constructor(parent: HTMLElement, opts: TrialsOptions) {
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-trials-layer';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.yx-tr-card');
      if (card && !card.hasAttribute('disabled')) {
        this.hide();
        this.opts.onStart(card.dataset.id as TrialId);
      }
    });
  }

  show(v: TrialsView, friends: FriendBests): void {
    this.pager?.destroy();
    this.friends = friends;
    const cards = TRIAL_IDS.map((id) => {
      const t = TRIALS[id];
      const tier = TRIAL_TIERS[t.tier]!;
      const best = v.best[id];
      const open = v.open[t.tier];
      const status = !open
        ? `前一档通 ${TRIAL_OPEN_NEED} 关解锁`
        : best === undefined
          ? `第一次通关 +${n(tier.coins)} 铜钱`
          : `最好：${trialScoreText(t, best)}${best < 1e9 ? ` · 通关 +${n(tier.coins)}` : ''}`;
      return (
        `<button type="button" class="yx-tr-card t${t.tier}${best !== undefined && best >= 1e9 ? ' done' : ''}" data-id="${id}"${open ? '' : ' disabled'}>` +
        `<span class="h"><b>${esc(t.name)}</b><span class="g">${esc(goalText(t.goal))}</span><i>${tier.name}</i></span>` +
        `<small>${esc(setupLine(t))}</small>` +
        `<small class="r">${esc(rulesLine(t))}</small>` +
        `<span class="s">${esc(status)}</span>` +
        '<span class="f"></span>' +
        '</button>'
      );
    }).join('');
    const week = v.week
      .map((g) => `<li class="${g.done ? 'done' : ''}"><span>${esc(g.text)}</span><em>${g.done ? '已完成' : `${n(g.prog)}/${n(g.need)}`} · +${n(g.coins)}</em></li>`)
      .join('');
    this.root.innerHTML =
      '<div class="yx-panel yx-trials">' +
      `<div class="yx-panel-head"><b class="yx-brush">试炼</b><em>人人同一关 · 第一次通关给铜钱</em></div>` +
      `<ul class="yx-tr-week" aria-label="本周目标"><li class="hd"><span>本周目标</span><em>还剩 ${v.daysLeft} 天 · 全完成再 +500</em></li>${week}</ul>` +
      `<div class="yx-tr-grid">${cards}</div>` +
      `<div class="yx-row3 yx-pgfoot">${PAGER_CTL}<button type="button" class="yx-big ghost" data-a="close">返回</button></div>` +
      '</div>';
    this.root.querySelector<HTMLElement>('[data-a="close"]')!.onclick = () => this.close();
    this.root.style.display = '';
    const grid = this.root.querySelector<HTMLElement>('.yx-tr-grid')!;
    this.pager = new Pager({ body: grid, ctl: this.root.querySelector<HTMLElement>('.yx-pager')!, leaves: '.yx-tr-card', onPage: () => this.fillFriends(grid) });
    openModal(this.root, () => this.close(), () => this.hide());
  }

  /** 看得见、开着的卡读好友最好（每关只读一次） */
  private fillFriends(grid: HTMLElement): void {
    const fr = this.friends;
    if (!fr) return;
    for (const card of grid.querySelectorAll<HTMLElement>('.yx-tr-card:not([disabled]):not(.yx-pg-off)')) {
      if (card.dataset.fr) continue;
      card.dataset.fr = '1';
      const id = card.dataset.id as TrialId;
      void fr.get(id).then((b) => {
        if (!b || fr !== this.friends) return;
        const slot = card.querySelector<HTMLElement>('.f')!;
        slot.textContent = b.top ? `好友最好：${b.top.name} ${trialScoreText(TRIALS[id], b.top.score)}${b.myRank ? ` · 我第 ${b.myRank}` : ''}` : '';
      });
    }
  }

  hide(): void {
    this.root.style.display = 'none';
    this.pager?.destroy();
    this.pager = null;
    this.friends = null;
    closeModal(this.root);
  }

  private close(): void {
    this.hide();
    this.opts.onClose();
  }
}
