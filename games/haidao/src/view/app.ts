import type Phaser from 'phaser';
import type { LiveTier } from '../core/live.ts';
import type { TdSetup } from '../core/tdtypes.ts';
import type { TdGarrisonPick } from '../core/td2types.ts';
import type { BattleSetup, Profile } from '../core/types.ts';
import { writeSave } from '../platform/save.ts';
import type { Save } from '../platform/sync.ts';
import type { MapStopHooks, PvpHooks } from './BattleScene.ts';

/** 画面层的共享状态（一个页面一个）：存档、渲染倍数、当前场景名、给冒烟用的钩子 */
export interface Api {
  ready: boolean;
  /** 测试辅助：当前战斗的关卡 id */
  level?: string;
  scene: 'base' | 'map' | 'battle' | 'result' | 'boot' | 'td';
  battle(levelId: string, auto: boolean): void;
  /** 测试辅助：某种建筑（或 'bubble' = 金矿头上的收取气泡）在页面上的 CSS 坐标，没有为 null */
  where(kind: string): { x: number; y: number } | null;
  /** 测试辅助：战斗里第 i 个合法海滩登陆点的页面 CSS 坐标 */
  beach(i: number): { x: number; y: number } | null;
  /** 测试辅助（战斗）：当前拍、能量、船登陆情况，perf.ts / 截图脚本按拍数对齐操作和截图时刻 */
  battleInfo?(): { tick: number; energy: number; over: boolean; landed: boolean[]; units: number; /** 已经倒塌的建筑个数 */ ruined: number; /** 场景里的显示对象个数 */ objects: number };
  /** 测试辅助：相机回到开场视角（beach 会把屏外的沙滩平移到屏内） */
  home?(): void;
  /** 测试辅助：竖屏适配的内容盒投到页面上的范围（CSS 像素）和视口，量内容盒占屏高百分之几、有没有被裁 */
  fitInfo?(): { box: { l: number; r: number; t: number; b: number } | null; w: number; h: number };
  /** 测试辅助（连拍）：取一个单位 / 建筑在页面上的位置（unit 不给 id 时挑一个正在走或打的，之后用返回的 id 跟着它），没有为 null */
  probe?(what: 'unit' | 'enemy' | 'building', idOrKind?: number | string): { id: number; x: number; y: number } | null;
  /** 测试辅助（录屏）：场上的兵 / 守岛敌人（登陆战是兵，守岛是敌人） */
  units?(): Array<{ id: number; kind: string; mode: string; hp: number; maxHp: number; front?: boolean; /** 盾兵的盾朝向（世界坐标 ×100） */ gx?: number; gy?: number; /** 这一拍在减速里（踩了焦油等） */ slow?: boolean }>;
  /** 测试辅助（录屏）：镜头跟住一个兵 / 敌人（倒下的也跟到消失），zoom 是镜头缩放；传 null 停止跟随 */
  follow?(id: number | null, zoom?: number): void;
  /** 测试辅助（60 帧录屏）：停掉浏览器的帧循环，按固定的 ms 手动推 n 帧（画面、补间、规则都按这个时间走）；frameEnd 恢复 */
  frameStep?(n: number, ms: number): void;
  /** 测试辅助（录炮台）：场上会转的塔：规则正瞄着人没有（aim）、有没有兵 / 敌人进了 1.5 倍射程（near）、塔和那个兵 / 敌人脚下的世界坐标；镜头定在一点 */
  towers?(): Array<{ id: number; kind: string; level: number; slot: number; aim: boolean; near: boolean; x: number; y: number; tx: number; ty: number }>;
  lookAt?(x: number, y: number, zoom: number): void;
  /** 测试辅助（基地）：镜头对准某种建筑（第一座）并选中它（快捷键作用在它上面），缩放 = 全景的 k 倍；找不到返回 false */
  focusOn?(kind: string, k: number): boolean;
  /** 测试辅助（基地）：场景里正在显示缺图（Phaser 的 __MISSING）的对象，列出它本该用的贴图名；应为空 */
  missing?(): string[];
  /** 测试辅助：炮台开火次数、开火时还差角度一次补完的次数和最大补了多少（弧度） */
  turretStats?(): { shots: number; snaps: number; maxSnap: number };
  /** 取证钩子：在第一个敌人身上演一次震晕 / 手雷（只改画面状态，冒烟和截图用） */
  tdFx?(what: 'stun' | 'lob' | 'shield'): { x: number; y: number; lx: number; ly: number } | null;
  /** 取证钩子：狙击预警线现在有几条在画（连拍等到预警出现再开拍） */
  snipeLive?(): number;
  /** 取证钩子（只在 ?dev）：强制所有盾兵的盾朝向（世界坐标 ×100），不传 / null 恢复规则给的朝向；用来拍盾换边 */
  devShieldDir?(gx?: number, gy?: number): void;
  /** 取证钩子：第一条狙击预警线的炮口—目标中点（世界坐标），给 lookAt 对镜头 */
  snipeAt?(): { x: number; y: number } | null;
  /** 画过遮挡剪影的帧数（累计） */
  occluded?(): number;
  frameEnd?(): void;
  /** 测试辅助（连拍）：把某种建筑的血量改成最大血量的 frac 倍（只改内存里的状态，让受损阶段、倒塌能在固定画面里拍到） */
  poke?(kind: string, frac: number): void;
  /** 测试辅助（守岛）：格子坐标 → 页面坐标；局面摘要 */
  tdPt?(gx: number, gy: number): { x: number; y: number };
  tdInfo?(): { tick: number; wave: number; vault: number; lost: number; gold: number; over: boolean; slots: Array<{ x: number; y: number; tower: number; wreck: boolean; garrison: boolean }>; /** 地图上插着的预告旗、画着的路线条数 */ flags: number; routes: number; barricades: number; /** goal：英雄正往哪走（没有为 null）；截图脚本据此分清「玩家点的」和守点 AI 自己走的 */ hero: { x: number; y: number; goal: { x: number; y: number } | null }; /** 现在哑火的塔数、发过技能的首领数（第三章的新机制，截图脚本等它出现） */ jammed: number; skilled: number; objects: number };
  /** 测试辅助：音效触发统计和最近触发的声音（名字、时刻、是否放出） */
  sfxStats?(): { counts: Record<string, { req: number; played: number; gap: number; cap: number; silent: number }>; recent: Array<{ name: string; at: number; ok: boolean }> };
  sfxStatsReset?(): void;
  /** 只在 ?dev 时有：直接给资源和星数（内存里改，不写存档） */
  dev?: { give(gold: number, wood: number, stars: number): void; /** 主寨升到 hq 级，摆一座带塔、墙、宝藏箱的守岛示范岛（守岛战役各关各给 1 星，全部解锁）；branch：塔选上分叉（一档、两档交替） */ td(hq: number, branch?: boolean): void };
}

/** 存档和游戏实例在 main.ts 启动时才有；之前读会抛清楚的错，而不是拿到 null 当对象用 */
let curSave: Save | null = null;
let curGame: Phaser.Game | null = null;

export const app = {
  get save(): Save {
    if (!curSave) throw new Error('app.save 还没初始化（要等 main.ts 载入存档之后）');
    return curSave;
  },
  set save(v: Save) {
    curSave = v;
  },
  r: 1,
  get game(): Phaser.Game {
    if (!curGame) throw new Error('app.game 还没初始化（要等 main.ts 建好 Phaser 之后）');
    return curGame;
  },
  set game(v: Phaser.Game) {
    curGame = v;
  },
  /** Phaser 已经建好（可以安全读 game） */
  get booted(): boolean {
    return curGame !== null;
  },
  /** 冒烟/自动战斗时不写存档 */
  volatile: false,
  fast: false,
  /** 战斗进行中（点"大厅"要先确认） */
  inBattle: false,
  dirty: false,
  api: { ready: false, scene: 'boot', battle: () => undefined, where: () => null, beach: () => null } as Api,
  /** 点"大厅"：离开前补传云存档，由 main 接 */
  leave: (): void => undefined,
  /** 云存档合并了新数据后，基地重读重画 */
  reload: (): void => undefined,
  goBase: (): void => undefined,
  /** 守岛：开一局（读自己的岛，烘焙素材后进 td 场景） */
  startTdLevel: (_levelId: string): void => undefined,
  /** 悬赏守岛（实盘）：用固定的悬赏岛开一局，不读自己的岛、不发本岛守岛奖励 */
  startTdLive: (_setup: TdSetup, _tier: LiveTier): void => undefined,
  /** 护航实盘：用这一档固定的护航关开一局（levelId 是 `<图>-<难度>`，不看自己的解锁），结束走筹码结回，不进护航星数和奖励 */
  startEscortLive: (_levelId: string, _setup: TdSetup, _tier: LiveTier): void => undefined,
  /** 守岛 2.0：选关页的驻守台面板挑好的塔（开局时 prepareTd 交给 startTd2；"再守一次"沿用），tdPicksFor 是挑给哪一关的 */
  tdPicks: [] as TdGarrisonPick[],
  tdPicksFor: '',
  /** 大潮无尽：开本周这一局（图和波次所有人一样） */
  startTdTide: (): void => undefined,
  startBattle: (_levelId: string, _auto: boolean, _setup?: BattleSetup, _opts?: { bounty?: boolean }): void => undefined,
  /** 异步攻防：打玩家的岛 / 看防守回放（src/view/pvp.ts 调，main 接） */
  startPvp: (_setup: BattleSetup, _hooks: PvpHooks): void => undefined,
  /** 寻宝航线：打一站（src/view/maproute.ts 调，main 接） */
  startMapStop: (_setup: BattleSetup, _hooks: MapStopHooks): void => undefined,

  get profile(): Profile {
    return this.save.profile;
  },
  /** 改了档：立刻存 */
  commit(p: Profile): void {
    this.save.profile = p;
    this.save.lastSeen = Date.now();
    this.dirty = false;
    if (!this.volatile) writeSave(this.save);
  },
  /** 产出这类每秒都在变的：只记内存，隔一阵由 flush 存 */
  tick(p: Profile): void {
    this.save.profile = p;
    this.save.lastSeen = Date.now();
    this.dirty = true;
  },
  flush(): void {
    if (this.dirty && !this.volatile) writeSave(this.save);
    this.dirty = false;
  },
};

/** 数字带千分位 */
export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

/** 画布内的 CSS 坐标 → 页面坐标（测试辅助用） */
export function pagePoint(css: { x: number; y: number }): { x: number; y: number } {
  const r = app.game.canvas.getBoundingClientRect();
  return { x: Math.round(r.left + css.x), y: Math.round(r.top + css.y) };
}
