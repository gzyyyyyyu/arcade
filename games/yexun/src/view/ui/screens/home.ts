import { MAPS } from '../../../content/maps.ts';
import { DANGERS, type Danger } from '../../../content/waves.ts';
import { CHARACTERS } from '../../../content/meta.ts';
import { LIVE_TIERS } from '../../../content/live.ts';
import { RAID_TEMPLATES } from '../../../content/explore.ts';
import { beijingDate } from '../../../online/daily.ts';
import { weeklyEntry } from '../weekly.ts';
import { esc, layer, onAction, type Toggle, togglesHtml, bindToggles, dailyButton, TOGGLE_DEFAULTS, CLOSE_SVG, type MenuState, HOME_BTN, bestText, quickLive, quickOffWhy } from './shared.ts';
import { TitleArt } from './titleArt.ts';
import { raidDanger } from './select.ts';
import type { Menu } from './menu.ts';

/** 第一屏：标题 + 大"开始"（用上次的模式和地图，一步直达）+ 去选模式/地图 + 战绩小卡。第一次进来只有一个大按钮（13.7） */
export class Home {
  readonly root: HTMLDivElement;
  private readonly ui: HTMLDivElement;
  private readonly art: TitleArt;
  private readonly toggles: Toggle[];

  private readonly m: Menu;

  constructor(parent: HTMLElement, toggles: Toggle[], m: Menu) {
    this.m = m;
    this.root = layer(parent, 'yx-menu yx-homescreen');
    this.ui = document.createElement('div');
    this.ui.className = 'yx-menu-ui';
    this.art = new TitleArt(this.root);
    this.root.append(this.art.canvas, this.ui);
    this.toggles = toggles;
    onAction(this.root, {
      ...bindToggles(this.root, toggles),
      quick: () => this.m.quick(),
      select: () => this.m.openSelect(),
      settings: () => this.root.classList.toggle('show-settings'),
      closeset: () => this.closeSettings(),
      resetset: () => {
        for (const t of this.toggles) {
          const d = TOGGLE_DEFAULTS[t.key];
          if (d !== undefined && t.get() !== d) t.set(d);
        }
        const box = this.root.querySelector('.yx-settings');
        if (box) box.innerHTML = this.settingsHtml();
      },
      codex: () => this.m.onCodex(),
      guide: () => this.m.onGuide(),
      boards: () => this.m.onBoards(),
      replays: () => this.m.onReplays(),
      daily: () => this.m.onDaily(),
      weekly: () => this.m.onWeekly(),
      rush: () => this.m.onRush(),
      trials: () => this.m.onTrials(),
      home: () => {
        location.href = '/';
      },
    });
    this.root.addEventListener('click', (e) => {
      // 点设置面板外面也关（齿轮自己有切换，不在这里处理）
      // 用事件路径判断：点"恢复默认"会重画设置面板，target 已脱离文档，closest 找不到祖先
      const inside = e.composedPath().some((n) => n instanceof HTMLElement && (n.classList.contains('yx-settings') || n.dataset.a === 'settings'));
      if (this.root.classList.contains('show-settings') && !inside) this.closeSettings();
    });
  }

  get shown(): boolean {
    return this.root.style.display !== 'none';
  }

  /** 设置开着就关掉并返回 true（给 Esc 用：先关设置，再谈别的） */
  closeSettings(): boolean {
    if (!this.root.classList.contains('show-settings')) return false;
    this.root.classList.remove('show-settings');
    return true;
  }

  private settingsHtml(): string {
    return (
      `<div class="yx-sethead"><b>设置</b><button type="button" class="yx-setclose" data-a="closeset" aria-label="关闭">${CLOSE_SVG}</button></div>` +
      togglesHtml(this.toggles) +
      '<button type="button" class="yx-setreset" data-a="resetset">恢复默认</button>'
    );
  }

  show(s: MenuState): void {
    const top =
      HOME_BTN +
      `<button type="button" class="yx-btn yx-gear" data-a="settings" aria-label="设置"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-.1-1.3 2-1.6-2-3.4-2.4.9a8 8 0 0 0-2.2-1.3L15 2.8h-4l-.4 2.5a8 8 0 0 0-2.2 1.3L6 5.7 4 9.1l2 1.6L5.9 12l.1 1.3-2 1.6 2 3.4 2.4-.9a8 8 0 0 0 2.2 1.3l.4 2.5h4l.4-2.5a8 8 0 0 0 2.2-1.3l2.4.9 2-3.4-2-1.6.1-1.3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>` +
      `<div class="yx-settings" role="dialog" aria-label="设置">${this.settingsHtml()}</div>` +
      '<div class="yx-more">' +
      dailyButton() +
      '<button type="button" class="yx-btn" data-a="rush">连战</button>' +
      '<button type="button" class="yx-btn" data-a="trials">试炼</button>' +
      '<button type="button" class="yx-btn" data-a="boards">排行</button>' +
      '<button type="button" class="yx-btn" data-a="replays">回放</button>' +
      '<button type="button" class="yx-btn" data-a="codex">图鉴</button>' +
      '<button type="button" class="yx-btn" data-a="guide">玩法</button>' +
      '</div>';
    const title = '<div class="yx-title"><b>夜巡</b><span>道士夜巡雪夜古镇 · 撑到天亮</span></div>';
    // 新老玩家同一版主页（所有者 10-18：新手专用首屏只有"开始守夜"，找不到夜探和实盘）。
    // 新玩家的"上次选择"是存档默认值（守夜 · 雪原 · 危险 0），第一局的引导照旧由局里管
    {
      const d = Math.min(s.danger, s.dangerOpen) as Danger;
      const q = quickLive(s);
      const fun = s.lastMode === 'raid' && !s.raidFirst ? `夜探 · ${RAID_TEMPLATES[s.raidTpl].name} · 危险 ${raidDanger(d)}` : s.lastMode === 'raid' ? '夜探 · 教学镇' : `守夜 · ${MAPS[s.maps[s.map] ? s.map : 'snow'].name} · ${DANGERS[d].name}`;
      // 上次是实盘：按钮上写清带入多少，一点就带入；开不了实盘就按娱乐开，并说为什么
      const plan = q ? `${q.raid ? `夜探${RAID_TEMPLATES[q.raid].name}` : `守夜${MAPS[s.maps[s.map] ? s.map : 'snow'].name}`} · ${LIVE_TIERS[q.tier].name}档 ${LIVE_TIERS[q.tier].stake.toLocaleString('zh-CN')}` : fun;
      const why = q || !s.live.on ? '' : `${quickOffWhy(s)}，这次按娱乐开`;
      const b = bestText(s.best[d]);
      this.ui.innerHTML =
        top +
        title +
        '<div class="yx-quick">' +
        `<button type="button" class="yx-big yx-go" data-a="quick"><span>${q ? '开始实盘' : '开始'}</span><small>${plan}</small></button>` +
        (why ? `<div class="yx-mwhy">${esc(why)}</div>` : '') +
        // 和"开始"一样大：守夜、夜探、实盘都从这里进
        `<button type="button" class="yx-big ghost yx-go yx-pick" data-a="select"><span>选模式</span><small>${s.live.available ? '守夜 · 夜探 · 实盘' : '守夜 · 夜探'}</small></button>` +
        '</div>' +
        // 每日的看点在顶栏"每日"按钮的角标上；这里只留可点的本周夜事入口
        weeklyEntry(beijingDate(Date.now())) +
        '<div class="yx-stats">' +
        `<div><span>危险 ${d} 最好</span><b>${b.big}</b><small>${b.small}</small></div>` +
        `<div><span>铜钱</span><b><i class="yx-coin"></i>${s.coins.toLocaleString('zh-CN')}</b><small>${s.character === 'xiaodao' ? '' : CHARACTERS[s.character].name}</small></div>` +
        '</div>';
    }
    this.root.style.display = '';
    this.art.setCharacter(s.character);
    this.art.start();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.root.classList.remove('show-settings');
    this.art.stop();
  }
}

// ───────────────────────── 选模式 / 地图 ─────────────────────────
