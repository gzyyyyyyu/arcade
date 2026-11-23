import type { SchoolId } from '../../../content/guide.ts';
import type { MapId } from '../../../content/maps.ts';
import type { Danger } from '../../../content/waves.ts';
import type { LiveTier } from '../../../content/live.ts';
import type { RaidLiveTemplate, RaidTemplateId } from '../../../content/explore.ts';
import { type Toggle, type MenuState, quickLive } from './shared.ts';
import { Home } from './home.ts';
import { raidDanger, Select } from './select.ts';

/** 主页 → 选模式/地图 → 对局。对外的回调和以前的一页菜单一样，main.ts 只接线 */
export class Menu {
  onStart: (d: Danger, map: MapId, endless: boolean) => void = () => undefined;
  onBoards: () => void = () => undefined;
  onReplays: () => void = () => undefined;
  onDaily: () => void = () => undefined;
  /** 本周夜事挑战开局 */
  onWeekly: () => void = () => undefined;
  /** 每日首领连战 */
  onRush: () => void = () => undefined;
  /** 打开试炼页 */
  onTrials: () => void = () => undefined;
  /** 夜探开局：镇子（第一次是 'teach'）和危险档（教学镇固定 0；其余用选的档） */
  onRaid: (template: RaidTemplateId, danger: Danger) => void = () => undefined;
  /** 打开藏宝阁 */
  onVault: () => void = () => undefined;
  /** 实盘开局（档位定危险档；地图选的、角色用存档里的，不带加成和咒印）；fallback：主页一键开时带入失败，玩家选"按娱乐开"走这里 */
  onLive: (tier: LiveTier, map: MapId, fallback?: () => void) => void = () => undefined;
  /** 夜探实盘开局（档位、镇子；角色用存档里的，不带加成） */
  onRaidLive: (tier: LiveTier, template: RaidLiveTemplate, fallback?: () => void) => void = () => undefined;
  onRushLive: (tier: LiveTier) => void = () => undefined;
  /** 切娱乐 / 实盘、换档位（main 记进存档） */
  onLiveMode: (on: boolean, tier: LiveTier) => void = () => undefined;
  /** 打开开局准备（角色、咒印、加成） */
  onPrep: (tab: 'char' | 'curse' | 'perk') => void = () => undefined;
  /** 选模式屏上点起手（alt）或心法（xinfa，null = 不带）：main 记进当前角色的配置后重绘 */
  onLoadout: (patch: { alt?: boolean; xinfa?: SchoolId | null }) => void = () => undefined;
  onClick: () => void = () => undefined;
  /** 图鉴和成就 */
  onCodex: () => void = () => undefined;
  onGuide: () => void = () => undefined;

  private readonly home: Home;
  private readonly select: Select;
  private screen: 'home' | 'select' = 'home';
  private state: MenuState | null = null;

  constructor(parent: HTMLElement, toggles: Toggle[]) {
    this.home = new Home(parent, toggles, this);
    this.select = new Select(parent, this);
  }

  get visible(): boolean {
    return this.home.shown || this.select.shown;
  }

  /** 设置开着就关掉并返回 true，没开返回 false（main 的 Esc 先问它） */
  closeSettings(): boolean {
    return this.home.closeSettings();
  }

  /** 显示哪一屏；不指定就回到上次停的那一屏（角色页、图鉴关掉后回到原处） */
  show(s: MenuState, to: 'home' | 'select' = this.screen): void {
    this.state = s;
    this.screen = to;
    if (to === 'home') {
      this.select.hide();
      this.home.show(s);
    } else {
      this.home.hide();
      this.select.show(s);
    }
  }

  hide(): void {
    this.home.hide();
    this.select.hide();
  }

  openSelect(): void {
    this.select.enter();
    this.show(this.state!, 'select');
  }

  /** 主页的"开始"：一步直达，按上次的完整选择（娱乐 / 实盘、模式、镇子或地图、档位）；实盘开不了或带入失败就按娱乐开 */
  quick(): void {
    const q = quickLive(this.state!);
    const fun = (): void => this.quickFun();
    if (!q) return fun();
    if (q.raid) this.onRaidLive(q.tier, q.raid, fun);
    else this.onLive(q.tier, this.state!.maps[this.state!.map] ? this.state!.map : 'snow', fun);
  }

  private quickFun(): void {
    const s = this.state!;
    const d = Math.min(s.danger, s.dangerOpen) as Danger;
    if (s.lastMode === 'raid') return this.onRaid(s.raidFirst ? 'teach' : s.raidTpl, raidDanger(d));
    this.onStart(d, s.maps[s.map] ? s.map : 'snow', false);
  }
}

// ───────────────────────── 暂停 ─────────────────────────
