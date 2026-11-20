import Phaser from 'phaser';
import { garrisonRecPicks } from './garrisonrec.ts';
import type { HookFx } from './tdhookfx.ts';
import { BUILDINGS } from '../content/index.ts';
import { type TdState, type TdAction, type BuildingKind, type TdTowerKind, type WavePreview, createTd, raining, tdJammed, stepTd, tdBotActions, beijingIsoWeek, tideSetup, type Result, type TdSetup, tdHomeSetup, startTd2, TD_TIER_LEVEL, TD2_LEVEL_BY_ID, TD2_HERO_SKILL, hookable, hqLevel, tdHomeHardOpen } from '../core/index.ts';
import { StunMarks } from './stunmarks.ts';
import { SnipeLines } from './snipefx.ts';
import { UNIT, ISLAND } from '../core/types.ts';
import { app, pagePoint } from './app.ts';
import { tdPieces } from './art.ts';
import { CamCtl } from './camctl.ts';
import { FitCam, cellsBox, withRoute, type Box, type Content } from './camfit.ts';
import { bindKeys, pressNth } from './inputs.ts';
import { DyingList } from './anim.ts';
import { BarTracker } from './bars.ts';
import { type Rig, RigPool, countObjects } from './rigsprite.ts';
import { HitStop, Particles, DamageNumbers } from './fx.ts';
import { FlashPool } from './tdfx.ts';
import { startAmbient } from './ambient.ts';
import { EnvAnim } from './envfx.ts';
import { setWeather, weatherOf } from './post.ts';
import { SEA_BG, drawGround, worldBounds } from './ground.ts';
import { iso } from './iso.ts';
import { HOME_ID } from './td-ui.ts';
import type { HeldStep } from './td-ui.ts';
import type { HintItem } from './tdhint.ts';
import { fitMarks } from './tdpadguide.ts';
import { TdPlan } from './tdplan.ts';
import { ensureArt } from './textures.ts';
import { type Muzzle, Turret, turretStats, ensureTurrets } from './turret.ts';
import { Shots } from './shots.ts';
import { RigCap } from './rigcap.ts';
import { FrameFx } from './framefx.ts';
import { Occluder } from './occlude.ts';
import { NO_OCC, type Recent } from './fxlayout.ts';
import { isTurret } from './aim.ts';
import { setAmbience } from './audio/sfx.ts';
import { LOW_MEMORY } from './viewport.ts';
import { uiRoot } from './ui.ts';
import type { LiveTier } from '../core/live.ts';
import { isEscortId, escortUnlocked, escortSetup } from './escortapi.ts';
import type { EscortView } from './escortview.ts';
import { escortShipArt } from './art/escort.ts';
import { DEPTH } from './depth.ts';
import { syncRain } from './tdrain.ts';
import { type TdData, type ESpr, type TSpr, W, EDGE_MS, SHIP_FOES, TEMP_KINDS } from './tdcommon.ts';
import { drawCliffs } from './tdcliff.ts';
import { drawLayout, drawProps, drawWater, drawFog, makeHero, drawTide, fitBox, contentBox, introFocus, drawEdges, tdDirector, syncFleet } from './tdworld.ts';
import { act, tap, hover, press, cancelAll, callWave, toggleHero, rightClick, heroDrag, stepSkillQ } from './tdinput.ts';
import { newCycle } from './tdpick.ts';
import { canCall, buildUi, updateHud, togglePause, placePaused } from './tdhud.ts';
import { closeSheet, showBest, wreckOf, slotSig, renderSheet, reopenWatch } from './tdsheet.ts';
import { onEvent } from './tdevents.ts';
import { type ReasonLog, newReasonLog } from './tdreason.ts';
import { sync } from './tdsync.ts';
import { endFxLead, finish } from './tdresult.ts';
import { STEP_MS } from './motion.ts';

export class TdScene extends Phaser.Scene {
  r = 1;
  d!: TdData;
  s!: TdState;
  cc!: CamCtl;
  fit!: FitCam;
  hoverG!: Phaser.GameObjects.Graphics;
  hoverSlot = -2;
  slotCycle = newCycle();
  ui!: HTMLElement;
  acc = 0;
  speed = 1;
  pending: TdAction[] = [];
  /** 取证钩子 tdAuto 打开后由稳机器人出操作（只给截图脚本用） */
  autoBot: ((s: TdState) => TdAction[]) | null = null;
  hs = new HitStop();
  /** 英雄上次扔火药桶的拍数：爆炸事件靠它认出是不是桶 */
  kegAt = -999;
  pt!: Particles;
  env!: EnvAnim;
  /** 建筑精灵在粒子池和环境动画建好之前就贴了，先记下来，建好后统一挂环境动画 */
  envQ: Array<{ im: Phaser.GameObjects.Image; kind: BuildingKind; level: number; id: number }> = [];
  dn!: DamageNumbers;
  /** 最近飘的「+N」字（tdhud.ts 的 ftx 往里并，fxlayout.ts 的 pickMerge） */
  ftRecent: Array<Recent & { n: number; txt: Phaser.GameObjects.Text }> = [];
  bars!: Phaser.GameObjects.Graphics;
  fxG!: Phaser.GameObjects.Graphics;
  /** 屏边箭头：界面根相对父级的缩进缓存，和上次量的时刻 */
  edgeOx = 0;
  edgeOy = 0;
  edgeRectAt = -1e9;
  tideG!: Phaser.GameObjects.Graphics;
  laneG!: Phaser.GameObjects.Graphics;
  esp = new Map<number, ESpr>();
  /** 暴雨的画面（tdrain.ts），第一次下雨才建；每局开头清掉 */
  rain: HTMLElement | null = null;
  tsp = new Map<number, TSpr>();
  walls = new Map<number, { img: Phaser.GameObjects.Image; level: number; x: number; y: number }>();
  wallLevel = new Map<number, number>();
  blocks = new Map<number, Phaser.GameObjects.Image>();
  kegs = new Map<number, Phaser.GameObjects.Image>();
  /** 木台：底图、空台上的「+」 */
  pads: Array<{ img: Phaser.GameObjects.Image; plus: Phaser.GameObjects.Text }> = [];
  chests: Phaser.GameObjects.Image[] = [];
  pileSig = '';
  pileObjs: Phaser.GameObjects.GameObject[] = [];
  hero!: Rig;
  heroDownAt = -1;
  pool!: RigPool;
  fullRigs = 0;
  /** 同屏完整骨架的名额（rigcap.ts） */
  readonly rigCap = new RigCap();
  /** 序列帧特效的对象池（framefx.ts） */
  frames!: FrameFx;
  frameN = 0;
  heroPx = 0;
  heroFrom = { x: 0, y: 0 };
  heroTo = { x: 0, y: 0 };
  heroTick = -1;
  /** 被震晕的敌人头顶转的星 */
  stunMarks!: StunMarks;
  /** 狙击塔的预警线和准星 */
  snipe!: SnipeLines;
  readonly snipeEnds: Muzzle = { x: 0, y: 0, gx: 0, gy: 0, z: 0 };
  heroTurn = 1;
  heroWant = 1;
  /** 英雄上次开枪的时刻（毫秒）：走动中开枪也播攻击动作 */
  heroShotAt = -1e9;
  heroDist = 0;
  readonly ipt = { x: 0, y: 0 };
  dying = new DyingList();
  bt = new BarTracker();
  /** 测试辅助（录屏）：镜头跟住的敌人 */
  followT: { id: number; z: number; x: number; y: number } | null = null;
  heroPy = 0;
  heroRing!: Phaser.GameObjects.Ellipse;
  /** 弹道对象池（shots.ts） */
  shots!: Shots;
  /** 敌人走到建筑后面时在建筑上画剪影 */
  occ!: Occluder;
  readonly tin = { now: 0, dt: 0, has: false, tx: 0, ty: 0, aiming: false, until: Infinity, wet: false };
  tideOn = false;
  tideImgs: Phaser.GameObjects.Image[] = [];
  /** 雾区的雾团：位置（单位）、当前透明度、相位 */
  mist: Array<{ img: Phaser.GameObjects.Image; x: number; y: number; a: number; ph: number }> = [];
  fogRings: Phaser.GameObjects.Graphics[] = [];
  /** 被炸哑的塔头上的烟：塔 id → 图 */
  jamFx = new Map<number, Phaser.GameObjects.Image>();
  ended = false;
  /** 玩家点了撤退结束的（护航结算据此写「撤退」，不写「误了潮」） */
  retreated = false;
  /** 结算「原因」用的局内记录（tdevents.ts 写、tdresult.ts 读） */
  reasonLog: ReasonLog = newReasonLog();
  /** 瞄准中的技能：keg 炸药桶、barricade 拒马 */
  mode: 'none' | 'keg' | 'barricade' | 'battery' | 'hook' | 'flag' | 'reward' = 'none';
  /** 正在演的锚钩（tdhookfx.ts） */
  hooks: HookFx[] = [];
  /** 友军巡航船的图（第一次出海时建，tdworld.ts 的 syncFleet 每帧摆） */
  fleetImg: Phaser.GameObjects.Image | null = null;
  openSlot = -1;
  /** 造塔面板里手指 / 鼠标正压着的塔卡：地上预览它 1 阶的射程圈 */
  previewKind: TdTowerKind | null = null;
  /** 选中了英雄：下一次点地面让他过去，地上画他的守点迎敌范围 */
  heroSel = false;
  /** 被挡的木台点了「让英雄走开 / 等它走开」：关了面板，台子空出来（截止 until 拍）就自动重开 */
  reopen: { slot: number; until: number } | null = null;
  /** 塔开火时目标身上的 150ms 准星闪（定长池） */
  readonly flash = new FlashPool(32);
  readonly mz = { x: 0, y: 0, gx: 0, gy: 0, z: 0 };
  /** 敌人图鉴（点预告卡打开）开着 */
  bestOpen = false;
  /** 首次提示一次只弹一条，没弹的排在这里，下一波接着弹（tdhud.ts foeHint） */
  hintQ: HintItem[] = [];
  /** 敌人最近一次被盾挡下是哪一拍（伤害数字发灰用，tdevents.ts） */
  guardTick = new Map<number, number>();
  /** 「现在撤退？」确认框开着：和面板一样停住，免得想的工夫宝藏被抢 */
  askingEnd = false;
  sheet: HTMLElement | null = null;
  sheetSig = '';
  /** 卖塔要点两下：第一下按钮变红"再点一下确认"，2 秒内第二下才卖 */
  sellArmed = -1;
  sellTimer: Phaser.Time.TimerEvent | null = null;
  /** 地图上的路线和旗子；预告（下两波）和它的签名（开新一波、墙变了才重算） */
  plan!: TdPlan;
  pv: WavePreview[] = [];
  planSig = '';
  /** 上次量「已暂停」横幅位置的场景时间（placePaused 只在暂停时隔 300 毫秒量一次） */
  pausedAt = Number.NEGATIVE_INFINITY;
  /** 预告卡上定住的下一步（造哪种 / 升哪座），木台上的塔变了才重挑 */
  next: HeldStep | undefined;
  planKey = '';
  /** 顶栏下面的首领粗血条（tdhud.ts 的 syncBossBar）；id = 正在跟的首领，pct = 上次写进样式的百分比 */
  bossUi: { root: HTMLElement; name: HTMLElement; fill: HTMLElement; id: number; pct: number } | null = null;
  hud!: { treasure: HTMLElement; tpill: HTMLElement; wave: HTMLElement; count: HTMLElement; gold: HTMLElement; speed: HTMLButtonElement; call: HTMLButtonElement; keg: HTMLButtonElement; bar: HTMLButtonElement; hero: HTMLButtonElement; mech: HTMLButtonElement | null; hook: HTMLButtonElement | null; hint: HTMLElement; flash: HTMLElement; plan: HTMLElement; paused: HTMLElement; dare: HTMLElement | null };
  hudTick = -1;
  hudMode = '';
  hudSig = '';
  /** 竖屏放大时屏外敌人、空木台的边缘指示（对象池，隔 EDGE_MS 重算一次） */
  edges!: HTMLElement;
  edgeEls: Array<{ el: HTMLElement; arrow: HTMLElement; n: HTMLElement; sig: string }> = [];
  edgeT = 0;
  hintTimer: Phaser.Time.TimerEvent | null = null;
  /** 点在黄圈外的技能：英雄先走过去，够得着了自动放（tdinput.ts 的 stepSkillQ 每拍看一次） */
  skillQ: { m: 'keg' | 'barricade' | 'reward' | 'flag'; ux: number; uy: number; wx: number; wy: number; range: number; until: number } | null = null;
  /** 玩家按了暂停（顶栏的暂停钮、电脑 P 键）：和开面板一样只停画面层的推进，核心照旧只认拍数 */
  userPaused = false;
  /** 刚扔出去的火药桶落点（世界坐标），hero 事件来时画抛物线 */
  kegAim: { x: number; y: number } | null = null;
  /** 护航的画面和操作（只有护航局才有，escortview.ts） */
  esc: EscortView | null = null;

  constructor() {
    super('td');
  }

  init(data: TdData): void {
    this.d = data;
  }

  create(): void {
    setAmbience('td');
    this.r = app.r;
    this.s = createTd(this.d.setup);
    this.lightsTick = -1;
    const s = this.s;
    this.acc = 0;
    this.speed = this.d.speed;
    this.pending = [];
    this.esp = new Map();
    this.rain = null;
    this.followT = null;
    this.pool = new RigPool(this, this.r);
    this.heroDownAt = -1;
    this.dying = new DyingList();
    this.bt = new BarTracker();
    this.heroTick = -1;
    this.tsp = new Map();
    this.walls = new Map();
    this.wallLevel = new Map();
    this.blocks = new Map();
    this.kegs = new Map();
    this.pads = [];
    this.chests = [];
    this.pileSig = '';
    this.pileObjs = [];
    this.tideOn = false;
    this.tideImgs = [];
    this.mist = [];
    this.fogRings = [];
    this.jamFx = new Map();
    this.ended = false;
    this.retreated = false;
    this.reasonLog = newReasonLog();
    this.mode = 'none';
    this.openSlot = -1;
    this.previewKind = null;
    this.heroSel = false;
    this.reopen = null;
    this.bestOpen = false;
    this.askingEnd = false;
    this.hintQ = [];
    this.guardTick.clear();
    this.sellArmed = -1;
    this.pv = [];
    this.planSig = '';
    this.next = undefined;
    this.edgeEls = [];
    this.edgeT = 0;
    this.planKey = '';
    this.sheet = null;
    this.hudSig = '';
    this.hudTick = -1;
    this.ftRecent.length = 0;
    this.esc = null;
    app.inBattle = true;
    app.api.ready = true;
    this.cameras.main.setBackgroundColor(SEA_BG);
    drawGround(this, this.r, true);
    startAmbient(this, this.r);
    this.tideG = this.add.graphics().setDepth(DEPTH.tide);
    this.laneG = this.add.graphics().setDepth(DEPTH.lane);
    drawLayout(this);
    drawWater(this);
    drawCliffs(this);
    drawProps(this);
    drawFog(this);
    this.fxG = this.add.graphics().setDepth(DEPTH.hudFx);
    this.bars = this.add.graphics().setDepth(DEPTH.bars);
    this.hs = new HitStop();
    this.kegAt = -999;
    this.hooks = [];
    this.pt = new Particles(this, this.r, LOW_MEMORY ? 90 : 140);
    setWeather(weatherOf(this.s.level));
    this.env = new EnvAnim(this, this.r, this.pt);
    this.occ = new Occluder(this);
    for (const q of this.envQ) {
      this.env.dress(q.im, q.kind, q.level, q.id);
      if (!NO_OCC.has(q.kind)) this.occ.add(q.id, q.im);
    }
    this.envQ = [];
    for (const t of this.s.towers) {
      const sp = this.tsp.get(t.id);
      if (sp && isTurret(t.kind)) sp.tu = new Turret(this, this.r, this.pt, t.kind, t.level, t.id, sp.img, sp.baseX, sp.baseY);
    }
    this.shots = new Shots(this, this.r, this.pt, DEPTH.shotShadowTd);
    this.frames = new FrameFx(this, this.r);
    this.stunMarks = new StunMarks(this, this.r);
    this.snipe = new SnipeLines(this);
    this.shots.follow = (id, out) => {
      const e = this.esp.get(id);
      if (!e) return false;
      out.x = e.rig.x;
      out.y = e.rig.y;
      return true;
    };
    this.dn = new DamageNumbers(this, this.r, () => this.cameras.main.zoom / this.r);
    makeHero(this);
    drawTide(this, true);
    this.plan = new TdPlan(this, this.r);

    this.cc = new CamCtl(this, this.r, worldBounds());
    this.cc.onTap = (x, y) => tap(this, x, y);
    // 电脑：悬停高亮木台、右键取消（没什么可取消时右键地面直接指挥英雄）、Esc 取消；按住英雄拖出落点（手指也一样）；P 暂停；空格 = 开打（叫下一波，倒数里才有用，否则回全景）；
    // 数字键：建塔菜单开着时选第 n 种塔（升级面板里选第 n 条分叉），否则 1 拒马、2 炸药桶、3 叫下一波；S 卖塔、U 升级（木台面板开着时）、C 敌人图鉴和克制表、H 选中英雄（再点地面指挥他走）
    this.hoverG = this.add.graphics().setDepth(DEPTH.tdHover);
    this.hoverSlot = -2;
    this.cc.onHover = (x, y) => hover(this, x, y);
    this.cc.onPress = (x, y) => press(this, x, y);
    this.cc.onRight = (x, y) => rightClick(this, x, y);
    this.cc.drag = heroDrag(this);
    bindKeys(this, {
      esc: () => cancelAll(this),
      space: () => (canCall(this) && !this.sheet ? callWave(this) : this.fit.back()),
      digit: (n) => {
        const cards = this.sheet?.querySelectorAll('.hd-td-tower, .hd-td-branch');
        if (cards && cards.length > 0) pressNth(cards, n - 1);
        else if (!this.sheet) pressNth(this.ui.querySelectorAll('.hd-td-bottom .hd-btn:not(.hd-td-herobtn)'), n - 1);
      },
    });
    const letters = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || this.s.over) return;
      const k = e.key.toLowerCase();
      if (k === 's') this.sheet?.querySelector<HTMLButtonElement>('.hd-td-sell')?.click();
      else if (k === 'u') this.sheet?.querySelector<HTMLButtonElement>('.hd-td-up:not(:disabled)')?.click();
      else if (k === 'c') (this.bestOpen ? closeSheet(this) : showBest(this));
      else if (k === 'h' && !this.sheet) toggleHero(this);
      else if (k === 'p') togglePause(this);
    };
    window.addEventListener('keydown', letters);
    this.events.once('shutdown', () => window.removeEventListener('keydown', letters));
    buildUi(this);
    // 镜头按岛适配：整座岛、临时塔位、所有登陆口（含落潮那条）都在顶栏和操作区之间的可见区里，敌人一落地就看得见
    this.fit = new FitCam(this, this.cc, this.ui, () => this.fitIsland(), this.r, () => this.fitContent(), () => introFocus(this));
    this.fit.setDirector(tdDirector(this));
    this.events.once('shutdown', () => {
      this.ui.remove();
      app.inBattle = false;
    });
    app.api.scene = 'td';
    app.api.home = () => this.fit.back();
    app.api.fitInfo = () => this.fit.info();
    app.api.level = this.d.levelId;
    // 测试辅助：格子坐标（单位 1 格）→ 页面坐标；局面摘要
    app.api.tdPt = (gx, gy) => {
      const w = iso(gx, gy);
      // 竖屏放大时这一格可能在屏外：先把镜头移过去（和玩家拖过去一样），再给坐标
      const v = this.fit.visible();
      const p = this.cc.toScreen(w.x, w.y);
      if (p.x < v.l + 24 || p.x > v.r - 24 || p.y < v.t + 24 || p.y > v.b - 24) {
        this.fit.markUser();
        this.fit.panTo(w.x, w.y, 0);
      }
      return pagePoint(this.cc.toScreen(w.x, w.y));
    };
    app.api.tdInfo = () => ({ tick: s.tick, wave: s.wave, vault: s.vault, lost: s.lost, gold: s.gold, over: s.over, slots: s.slots.map((q) => ({ x: q.x + 1, y: q.y + 1, tower: q.tower, wreck: wreckOf(this, q) !== null, garrison: q.garrison !== undefined })), flags: this.plan.flagCount, routes: this.plan.routeCount, barricades: s.barricades?.length ?? 0, hero: { x: s.hero.x / UNIT, y: s.hero.y / UNIT, goal: s.hero.goal ? { x: s.hero.goal.x / UNIT, y: s.hero.goal.y / UNIT } : null, kind: s.hero.kind, flag: !!s.hero.flag && s.tick < s.hero.flag.until, reward: !!s.hero.reward && s.tick < s.hero.reward.until }, jammed: s.towers.filter((t) => tdJammed(s, t.id)).length, skilled: (s.internal as { skilled: Set<number> }).skilled.size, objects: countObjects(this), events: s.happen?.at ?? [], dare: s.happen?.dare ?? [], raining: raining(s) });
    app.api.units = () => s.enemies.filter((e) => e.mode === 'in' || e.mode === 'out').map((e) => ({ id: e.id, kind: e.kind, mode: e.mode, hp: e.hp, maxHp: e.maxHp, x: e.x / UNIT, y: e.y / UNIT, gx: e.gx, gy: e.gy, bounty: !!e.bounty }));
    app.api.follow = (id, z = 3) => {
      this.followT = id === null ? null : { id, z, x: 0, y: 0 };
    };
    app.api.towers = () =>
      s.towers
        .filter((t) => ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'].includes(t.kind))
        .map((t) => {
          const sp = this.tsp.get(t.id);
          const R = (BUILDINGS[t.kind].levels[t.level - 1]?.range ?? 3) * UNIT * 1.5;
          const cx = (t.x + t.size / 2) * UNIT;
          const cy = (t.y + t.size / 2) * UNIT;
          const e = s.enemies.find((q) => (q.mode === 'in' || q.mode === 'out') && Math.hypot(q.x - cx, q.y - cy) <= R);
          const w = e ? W(e.x, e.y) : { x: 0, y: 0 };
          return { id: t.id, kind: t.kind, level: t.level, slot: t.slot, aim: t.aim >= 0, near: !!e, x: sp?.baseX ?? 0, y: sp?.baseY ?? 0, tx: w.x, ty: w.y };
        });
    app.api.lookAt = (x, y, z) => {
      this.followT = { id: -1, z, x, y };
    };
    app.api.turretStats = () => ({ ...turretStats });
    app.api.snipeLive = () => this.snipe.live;
    app.api.snipeAt = () => this.snipe.mid;
    app.api.tdFx = (what) => {
      if (what === 'hook') {
        // 取证：走玩家同一条路（act → 下一拍送进核心）钩英雄够得着的、离英雄最远的那个敌人；返回敌人和英雄的画面位置，录像对准两人中间
        const h = s.hero;
        const r2 = TD2_HERO_SKILL.hook.range ** 2;
        const e = s.enemies.filter((q) => hookable(s, q) && (q.x - h.x) ** 2 + (q.y - h.y) ** 2 <= r2).sort((a, b) => (b.x - h.x) ** 2 + (b.y - h.y) ** 2 - ((a.x - h.x) ** 2 + (a.y - h.y) ** 2))[0];
        if (!e || h.hookReady === undefined || s.tick < h.hookReady) return null;
        act(this, { type: 'hook', id: e.id });
        const w = W(e.x, e.y);
        const hw = W(h.x, h.y);
        return { x: w.x, y: w.y, lx: hw.x, ly: hw.y };
      }
      if (what === 'ship' || what === 'sink') {
        // 取证：第一条在场的船画在海里的位置（停泊偏移后的）；sink 让它当场沉掉（标成死了、演沉没），录沉船用
        const b = s.enemies.find((q) => q.mode === 'in' && SHIP_FOES.has(q.kind));
        const sp = b ? this.esp.get(b.id) : undefined;
        if (!b || !sp) return null;
        const at = { x: sp.rig.x, y: sp.rig.y, lx: sp.rig.x, ly: sp.rig.y };
        if (what === 'sink') {
          b.mode = 'dead';
          onEvent(this, { type: 'die', id: b.id, kind: b.kind });
        }
        return at;
      }
      const e = s.enemies.find((q) => q.mode === 'in' && q.kind !== 'parrot');
      if (!e) return null;
      if (what === 'shield') {
        // 取证：把一个敌人换成盾兵（盾朝世界 +x，之后的 guard 事件由规则或下面手动推）
        e.kind = 'shield';
        e.gx = 100;
        e.gy = 0;
        const sp = this.esp.get(e.id);
        if (sp) {
          this.esp.delete(e.id);
          this.pool.put(sp.rig);
        }
        const w = W(e.x, e.y);
        return { x: w.x, y: w.y, lx: w.x, ly: w.y };
      }
      const dx = 4 * UNIT * (e.face < 0 ? -1 : 1);
      if (what === 'stun') {
        e.stunUntil = s.tick + 70;
        onEvent(this, { type: 'stun', id: e.id, until: e.stunUntil });
      } else {
        onEvent(this, { type: 'lob', id: e.id, x0: e.x, y0: e.y, x1: e.x + dx, y1: e.y + 2 * UNIT, t1: s.tick + 28, r: 120 });
      }
      const w = W(e.x, e.y);
      const l = W(e.x + dx, e.y + 2 * UNIT);
      return { x: w.x, y: w.y, lx: l.x, ly: l.y };
    };
    app.api.occluded = () => this.occ?.frames ?? 0;
    // 取证：让规则核心的稳机器人接着打（截后期波次的画面用，例如第四章最后一波的海盗王），手动点的操作照常一起送
    app.api.tdAuto = (on = true) => {
      this.autoBot = on ? tdBotActions('normal', this.d.setup.seed) : null;
    };
  }

  /** 飘字：位置夹在看得见的区域里（顶栏、底部按钮、安全区之外），同处同类的字合并加数 */
  stolen = 0;
  stolenEl: HTMLElement | null = null;
  stolenTimer: Phaser.Time.TimerEvent | null = null;

  // ---------------------------------------------------------------- 推进

  override update(t: number, dt: number): void {
    const s = this.s;
    this.frames.update(t);
    // 建塔 / 升级 / 卖塔 / 清障面板、敌人图鉴、撤退确认框开着时画面层不往前推：只把已经点下的操作送进核心推一拍（核心只认 stepTd，不依赖墙钟）
    const paused = (this.openSlot >= 0 || this.bestOpen || this.askingEnd || this.userPaused) && !this.ended;
    this.hud.paused.classList.toggle('on', paused);
    const pt = this.userPaused ? '已暂停 · 点「继续」接着打' : '已暂停 · 关掉面板继续';
    if (paused && this.hud.paused.textContent !== pt) this.hud.paused.textContent = pt;
    if (paused && (t - this.pausedAt > 300 || t < this.pausedAt)) {
      this.pausedAt = t;
      placePaused(this);
    }
    if (paused) {
      if (this.pending.length > 0 && !s.over) this.stepOnce();
    } else if (!this.ended && !this.hs.active) {
      this.acc += Math.min(dt, 100) * this.speed;
      let n = 0;
      while (this.acc >= STEP_MS && !s.over && n++ < 10) {
        this.acc -= STEP_MS;
        this.stepOnce();
      }
    }
    const ts = this.hs.active ? 0 : 1;
    this.pt.timeScale = ts;
    this.dn.timeScale = ts;
    this.dying.timeScale = ts;
    this.dying.step(dt);
    sync(this, dt);
    syncRain(this);
    if (this.s.fleet) syncFleet(this, this.acc / STEP_MS);
    this.esc?.frame(this.acc / STEP_MS, this.time.now);
    updateHud(this);
    fitMarks(this);
    if (this.openSlot >= 0 && slotSig(this) !== this.sheetSig) renderSheet(this);
    reopenWatch(this);
    if (this.followT) this.followCam(this.followT);
    this.edgeT += dt;
    if (this.edgeT >= EDGE_MS) {
      this.edgeT = 0;
      drawEdges(this);
    }
  }

  /** 适配的整岛盒：护航再并进航线（起点港口到终点），上沿多留一个船身高度，开场商船和旗不被屏上沿切掉 */
  fitIsland(): Box {
    const b = fitBox(this);
    return this.esc ? withRoute(b, this.esc.routeRects()) : b;
  }

  /** 竖屏适配的内容盒，加上主寨（放大档要保证它在屏内；没有主寨的图（大潮、护航）不带） */
  fitContent(): Content {
    const c = contentBox(this);
    const hq = this.d.setup.layout.find((b) => b.kind === 'hq');
    if (!hq) return c;
    const n = BUILDINGS.hq.size - 1;
    return { ...c, must: cellsBox([[hq.x, hq.y, hq.x + n, hq.y + n]], 1) };
  }

  /** 测试辅助（录屏）：镜头对准跟住的敌人（倒下后停在最后的位置） */
  followCam(f: { id: number; z: number; x: number; y: number }): void {
    const sp = this.esp.get(f.id);
    if (sp) {
      f.x = sp.rig.x;
      f.y = sp.rig.y;
    }
    if (f.x || f.y) this.cameras.main.setZoom(this.r * f.z).centerOn(f.x, f.y - 22);
  }

  stepOnce(): void {
    stepSkillQ(this);
    const acts = this.autoBot ? [...this.pending, ...this.autoBot(this.s)] : this.pending;
    this.pending = [];
    const before = this.s.wave;
    const ev = stepTd(this.s, acts);
    if (this.s.wave !== before) drawTide(this, false);
    for (const e of ev) onEvent(this, e);
    if (this.s.over && !this.ended) {
      this.ended = true;
      setTimeout(() => finish(this), 1100 - endFxLead());
    }
  }

  /** 带光的塔（灯塔分叉）：{位置, 光半径}，一拍重建一次，不再每次查询都对每座塔把分叉表过一遍 */
  lampList: { x: number; y: number; r: number }[] = [];
  lightsTick = -1;
  /** 每帧「场上还有哪些敌人」的集合，复用不新建 */
  readonly aliveBuf = new Set<number>();
}

/** 大潮无尽的入口数据（main 用）：本周的图和波次所有人一样，烘焙守岛素材再开场景 */
export async function prepareTide(tm: Phaser.Textures.TextureManager, r: number): Promise<TdData> {
  const week = beijingIsoWeek(Date.now());
  const setup = tideSetup(week);
  await Promise.all([ensureArt(tm, tdPieces(), r), ensureTurrets(tm, setup.layout, r)]).catch(() => undefined);
  return { levelId: 'tide', setup, speed: new URLSearchParams(location.search).has('fast') ? 4 : 1, tide: { week } };
}

/**
 * 一局守岛的入口数据（main 用）：战役关走 startTd2（关卡岛 + 选关页挑好的驻守塔，没挑过就按默认挑法），
 * HOME_ID 走海盗来袭（tdHomeSetup：自己的岛）；烘焙守岛素材和炮台再开场景。
 */
export async function prepareTd(levelId: string, tm: Phaser.Textures.TextureManager, r: number, pre?: { setup: TdSetup; tier: LiveTier }): Promise<{ ok: true; data: TdData } | { ok: false; error: string }> {
  const seed = (Date.now() & 0x3fffffff) | 1;
  const p = app.profile;
  const home = levelId === HOME_ID;
  const escort = isEscortId(levelId);
  let st: Result<TdSetup>;
  // 护航实盘：开局已由档位表算好（不看解锁），只负责烘焙素材、开场景
  if (pre) st = { ok: true as const, value: pre.setup };
  else if (escort) st = escortUnlocked(p, levelId) ? { ok: true as const, value: escortSetup(levelId, seed) } : { ok: false as const, error: 'locked' };
  // 加难开关是这次打开游戏的界面状态：换了账号、主寨不够时不带上（tdHomeSetup 会拒绝开局）
  else if (home) st = tdHomeSetup(p, seed, app.homeHard && tdHomeHardOpen(hqLevel(p)));
  else {
    // 没在驻守台面板选过（测试入口、旧链接直接开打）：按这一关的敌人推荐，和面板默认选中的一样
    const lv = TD2_LEVEL_BY_ID.get(levelId);
    const picks = app.tdPicksFor === levelId ? app.tdPicks : lv ? garrisonRecPicks(p, lv) : [];
    st = startTd2(p, levelId, seed, picks);
  }
  if (!st.ok) return { ok: false, error: st.error };
  const setup = st.value;
  // 炮台分件：岛上原有的塔、驻守塔按实际等级，木台上能造的按 1 阶的外观先烘（升级后的外观没烘好时退回整图后坐，不卡开场）
  const towers = [
    ...setup.layout,
    ...(setup.garrison ?? []).map((g) => ({ kind: g.kind, level: TD_TIER_LEVEL[g.tier] })),
    ...(setup.unlocked ?? TEMP_KINDS).map((k) => ({ kind: k, level: TD_TIER_LEVEL[1] })),
  ];
  await Promise.all([ensureArt(tm, escort ? [...tdPieces(), escortShipArt()] : tdPieces(), r), ensureTurrets(tm, towers, r)]).catch(() => undefined);
  void ensureTurrets(tm, (setup.unlocked ?? TEMP_KINDS).flatMap((k) => [{ kind: k, level: TD_TIER_LEVEL[2] }, { kind: k, level: TD_TIER_LEVEL[3] }]), r).catch(() => undefined);
  const data: TdData = { levelId, setup, speed: new URLSearchParams(location.search).has('fast') ? 4 : 1 };
  if (home) data.home = true;
  if (escort) data.escort = true;
  if (pre) data.escortLive = { tier: pre.tier };
  return { ok: true, data };
}
void uiRoot;
void ISLAND;

