import Phaser from 'phaser';
import { BUILDINGS, CAMPAIGN } from '../content/index.ts';
import { botActions, canLand, createBattle, rankOf, stepBattle } from '../core/index.ts';
import { MAP_LAYERS, MAP_STOP_TICKS } from '../core/maptypes.ts';
import { SCOUT_TIP, holdScout } from './battlescout.ts';
import { BEACH, ISLAND, TICKS_PER_SEC, UNIT, type BattleAction, type BattleState, type BBuilding, type BUnit, type Placed, type TroopKind } from '../core/types.ts';
import { app } from './app.ts';
import { shipA, troopF } from './art.ts';
import { bakeSome } from './textures.ts';
import { CamCtl } from './camctl.ts';
import { type Content, cellsBox, FitCam, islandBox } from './camfit.ts';
import { bindKeys, pressNth } from './inputs.ts';
import { DyingList } from './anim.ts';
import { BarTracker } from './bars.ts';
import { RigPool, rigTex, type Rig } from './rigsprite.ts';
import { rigPieces } from './art/rigparts.ts';
import { bakeAtlas } from './textures.ts';
import { DamageNumbers, HitStop, Particles } from './fx.ts';
import { Turret, type Muzzle } from './turret.ts';
import { Shots } from './shots.ts';
import { Occluder } from './occlude.ts';
import { NO_OCC } from './fxlayout.ts';
import { isTurret } from './aim.ts';
import { StunMarks } from './stunmarks.ts';
import { SnipeLines } from './snipefx.ts';
import { startAmbient } from './ambient.ts';
import { EnvAnim } from './envfx.ts';
import { setWeather } from './post.ts';
import { drawGround, SEA_BG, worldBounds } from './ground.ts';
import { LOW_MEMORY } from './viewport.ts';
import { footCenter, iso } from './iso.ts';
import { sfx, setAmbience } from './audio/sfx.ts';
import { BEACH_PTS } from './battleadvice.ts';
import { takeActions } from './battleflow.ts';
import type { Tutorial } from './tutorial.ts';
import { el } from './ui.ts';
import { STEP_MS } from './battlecommon.ts';
import type { BattleData, USpr, BSpr } from './battlecommon.ts';
import { drawBuildings, renderBars, renderSnipe, renderTurrets, smokeTick } from './battlebuildings.ts';
import { onEvent } from './battleevents.ts';
import { installHooks } from './battlehooks.ts';
import { AimPreview } from './aimpreview.ts';
import { BeachGlow } from './beachfx.ts';
import { afterSelect, beachPulse, buildUi, clearSel, drawBeach, hint, hover, renderCards, SKILL_KEYS, sig, tap, updateHud } from './battleinput.ts';
import { finish } from './battleresult.ts';
import { renderProjectiles, renderUnits, syncUnits } from './battleunits.ts';
import { DEPTH } from './depth.ts';
export type { BattleData, MapStopHooks, PvpHooks } from './battlecommon.ts';

export class BattleScene extends Phaser.Scene {
  r = 1;
  d!: BattleData;
  st!: BattleState;
  cc!: CamCtl;
  fit!: FitCam;
  hoverG!: Phaser.GameObjects.Graphics;
  hoverCell = '';
  aim!: AimPreview;
  ui!: HTMLElement;
  acc = 0;
  speed = 1;
  paused = false;
  pending: BattleAction[] = [];
  botAct: BattleAction[] = [];
  botI = 0;
  /** 异步攻防：这场实际生效的操作 */
  log: BattleAction[] = [];
  ended = false;
  usp = new Map<number, USpr>();
  /** 每拍重建一次：渲染按 id 取兵不用每帧在数组里线性找（兵多时是 O(n²)） */
  ubyId = new Map<number, BUnit>();
  /** 这一帧的游戏时钟（毫秒），事件处理里记受击时刻用 */
  nowT = 0;
  bsp = new Map<number, BSpr>();
  /** 会转的炮台（turret.ts）：建筑 id → 炮台 */
  tur = new Map<number, Turret>();
  /** 弹道（shots.ts）：已经开始画的最大弹道 id（规则的弹道 id 递增），塔开火时记下的炮口位置 */
  shots!: Shots;
  stunMarks!: StunMarks;
  /** 狙击塔的预警线和准星 */
  snipe!: SnipeLines;
  /** 取证钩子：强制的盾朝向 */
  devDir: { gx: number; gy: number } | null = null;
  readonly snipeEnds: Muzzle = { x: 0, y: 0, gx: 0, gy: 0, z: 0 };
  heroMarks!: StunMarks;
  /** 兵走到建筑后面时在建筑上画他的剪影 */
  occ!: Occluder;
  projSeen = -1;
  shotFrom = new Map<number, { m: Muzzle; t: Turret | null; kind: string }>();
  bars!: Phaser.GameObjects.Graphics;
  beachG!: Phaser.GameObjects.Graphics;
  /** 沙滩外缘的脉动光带（beachfx.ts），悬停的格由 hover() 写进去 */
  beachGlow!: BeachGlow;
  /** 选中的船卡（下标进 groups）；同兵种的船合成一张卡 */
  selBoat = -1;
  groups: Array<{ troop: TroopKind; idx: number[] }> = [];
  selSkill = -1;
  cardsSig = '';
  frameN = 0;
  lastStars = 0;
  starsEl: HTMLImageElement[] = [];
  timeEl!: HTMLElement;
  scoutEl!: HTMLElement;
  pctEl!: HTMLElement;
  speedBtn!: HTMLButtonElement;
  endBtn!: HTMLButtonElement;
  cardsEl!: HTMLElement;
  hintEl!: HTMLElement;
  boatsEl!: HTMLElement;
  skillsEl!: HTMLElement;
  ruined: number[] = [];
  tut!: Tutorial;
  skillUsed = false;
  /** 这场的统计：兵倒在哪种防御旁边、登陆点、放了几次技能（失败原因用） */
  deathBy = new Map<string, number>();
  landPts: Array<{ x: number; y: number }> = [];
  casts = 0;
  fogSpr = new Map<number, Phaser.GameObjects.Image>();
  /** 驻岛英雄（规则版本 ≥ 6、有宝藏箱才有）：脚下黄圈 + 队长帧；地火；号令中被罩的塔 */
  heroImg: Rig | null = null;
  heroDownAt = -1;
  heroRing: Phaser.GameObjects.Ellipse | null = null;
  heroPx = 0;
  heroPy = 0;
  /** 英雄上一拍和这一拍的世界位置：画面按帧在两者之间插值 */
  heroFrom = { x: 0, y: 0 };
  heroTo = { x: 0, y: 0 };
  heroFace = 1;
  heroTurn = 1;
  heroDist = 0;
  readonly ipt = { x: 0, y: 0 };
  dying = new DyingList();
  pool!: RigPool;
  /** 上一帧画完整骨架的个数：多了就隔帧算部件 */
  fullRigs = 0;
  bt = new BarTracker();
  fireG!: Phaser.GameObjects.Graphics;
  rallied = new Set<number>();
  /** 命中停顿：画面层暂停 40–80 毫秒（规则的拍数不变，只是晚一点推进） */
  hs = new HitStop();
  pt!: Particles;
  env!: EnvAnim;
  /** 自己船帆的王阶涂装（0 = 原样，landfx.ts 画木筏用） */
  sailRank = 0;
  dn!: DamageNumbers;
  /** 测试辅助（录屏）：镜头跟住的兵 */
  followT: { id: number; z: number; x: number; y: number } | null = null;
  /** 航线站：每条船登陆时放下的兵（land 事件的 units），结束时数活着的；顶栏的站名条 */
  lands: number[][] = [];
  mapEl: { pts: HTMLElement; bar: HTMLElement; lastPct: number } | null = null;

  constructor() {
    super('battle');
  }

  init(data: BattleData): void {
    this.d = data;
    // 取证用（?dev&devwalls）：去掉最外面的金矿，在左边沙滩和炮台之间拉一道城墙，看手雷越墙
    const q = new URLSearchParams(location.search);
    if (q.has('dev') && q.has('devwalls')) {
      const walls: Placed[] = [];
      for (let y = 6; y <= 15; y++) walls.push({ id: 900 + y, kind: 'wall', level: 1, x: 4, y });
      this.d = { ...data, setup: { ...data.setup, layout: [...data.setup.layout.filter((b) => b.kind !== 'goldmine'), ...walls] } };
    }
  }

  create(): void {
    setAmbience('battle');
    this.r = app.r;
    this.st = createBattle(this.d.setup);
    this.acc = 0;
    this.speed = this.d.speed;
    this.paused = false;
    this.pending = [];
    this.botAct = this.d.pvp?.replay ? this.d.pvp.replay.actions.slice() : this.d.auto ? botActions(this.d.setup, 'normal') : [];
    this.botI = 0;
    this.log = [];
    this.ended = false;
    this.usp = new Map();
    this.ubyId = new Map();
    this.bsp = new Map();
    this.tur = new Map();
    this.bbyId = new Map();
    this.projSeen = -1;
    this.shotFrom = new Map();
    this.groups = [];
    this.d.setup.army.boats.forEach((b, i) => {
      const g = this.groups.find((q) => q.troop === b.troop);
      if (g) g.idx.push(i);
      else this.groups.push({ troop: b.troop, idx: [i] });
    });
    this.selBoat = this.selSkill = -1;
    this.cardsSig = '';
    this.frameN = 0;
    this.lastStars = 0;
    this.ruined = [];
    this.dying = new DyingList();
    this.pool = new RigPool(this, this.r);
    this.heroImg = null;
    this.heroDownAt = -1;
    this.bt = new BarTracker();
    this.skillUsed = false;
    this.deathBy = new Map();
    this.landPts = [];
    this.casts = 0;
    this.fogSpr = new Map();
    this.followT = null;
    this.lands = [];
    this.mapEl = null;
    app.inBattle = true;
    app.api.ready = true;
    this.cameras.main.setBackgroundColor(SEA_BG);
    drawGround(this, this.r, true);
    startAmbient(this, this.r);
    drawBuildings(this);
    this.beachG = this.add.graphics().setDepth(DEPTH.floorOverlay).setVisible(false);
    drawBeach(this);
    beachPulse(this);
    this.beachGlow = new BeachGlow(this);
    this.events.once('shutdown', () => this.beachGlow.destroy());
    this.bars = this.add.graphics().setDepth(DEPTH.bars);
    this.fireG = this.add.graphics().setDepth(DEPTH.fire);
    this.heroImg = null;
    this.heroRing = null;
    this.rallied = new Set();
    this.hs = new HitStop();
    this.pt = new Particles(this, this.r, LOW_MEMORY ? 90 : 140);
    setWeather('clear');
    this.env = new EnvAnim(this, this.r, this.pt, this.d.pvp?.rank ?? 0);
    // 自己出海的船按自己的王阶涂装；看别人进攻自己的回放时进攻的是别人，不涂
    this.sailRank = this.d.pvp?.replay ? 0 : rankOf(app.profile);
    if (this.sailRank > 0) void bakeSome(this.textures, [shipA('raft', this.sailRank)], this.r).catch(() => undefined);
    for (const b of this.st.buildings) {
      const sp = this.bsp.get(b.id);
      if (sp && b.kind !== 'wall') this.env.dress(sp.img, b.kind, b.level, b.id);
      if (sp && isTurret(b.kind)) this.tur.set(b.id, new Turret(this, this.r, this.pt, b.kind, b.level, b.id, sp.img, sp.baseX, sp.baseY));
    }
    this.shots = new Shots(this, this.r, this.pt, DEPTH.shotShadowBattle);
    this.stunMarks = new StunMarks(this, this.r);
    this.snipe = new SnipeLines(this);
    this.heroMarks = new StunMarks(this, this.r);
    this.occ = new Occluder(this);
    for (const b of this.st.buildings) if (!NO_OCC.has(b.kind)) { const sp = this.bsp.get(b.id); if (sp) this.occ.add(b.id, sp.img); }
    this.dn = new DamageNumbers(this, this.r, () => this.cameras.main.zoom / this.r);

    this.cc = new CamCtl(this, this.r, worldBounds());
    this.cc.onTap = (x, y) => tap(this, x, y);
    // 电脑：悬停高亮能登陆的沙滩格、右键取消选择、Esc 取消、空格回全景、数字键 1–9 选兵种、字母键 Q W E… 选技能
    this.hoverG = this.add.graphics().setDepth(DEPTH.floorHover);
    this.hoverCell = '';
    this.aim = new AimPreview(this);
    this.cc.onHover = (x, y) => hover(this, x, y);
    this.cc.onRight = () => clearSel(this);
    bindKeys(this, {
      esc: () => clearSel(this),
      space: () => this.fit.back(),
      // 兵种占数字键 1–9，技能用字母键 Q W E R…（编号不会超出键盘能按的范围）
      digit: (n) => pressNth(this.boatsEl.querySelectorAll('.hd-boat'), n - 1),
      key: (k) => {
        const i = SKILL_KEYS.indexOf(k.toLowerCase());
        if (k.length !== 1 || i < 0) return false;
        pressNth(this.skillsEl.querySelectorAll('.hd-skill'), i);
        return true;
      },
    });

    buildUi(this);
    // 镜头按岛适配：整座岛含四面沙滩（登陆区）都在顶栏和操作区之间的可见区里，不用拖就能点到任何登陆点
    this.fit = new FitCam(this, this.cc, this.ui, () => islandBox(BEACH_PTS), this.r, () => this.fitContent(), () => this.introFocus());
    app.api.fitInfo = () => this.fit.info();
    // 沙滩从进场就亮着（呼吸），不用先选船才知道往哪点
    afterSelect(this);
    this.time.addEvent({ delay: 760, loop: true, callback: () => smokeTick(this) });
    this.events.once('shutdown', () => {
      this.tut.destroy();
      this.ui.remove();
      app.inBattle = false;
    });
    app.api.scene = 'battle';
    app.api.level = this.d.levelId;
    this.bossIntro();
    // 装备的皮肤帧不在 allArt 里：开战前按需烘焙（没烘焙好之前用默认外观）
    const sk = app.profile.skins ?? {};
    for (const [k, v] of Object.entries(sk)) {
      if (!v) continue;
      const pcs = (['idle', 'walk', 'attack'] as const).flatMap((an) => { try { return troopF(k as TroopKind, an, v); } catch { return []; } });
      void bakeSome(this.textures, pcs, this.r);
      if (v === 'gold' || v === 'shadow' || v === 'royal') void bakeAtlas(this.textures, rigTex(`t.${k as TroopKind}`, v), rigPieces(`t.${k as TroopKind}`, v), this.r);
    }
    installHooks(this);
  }

  // ---------------------------------------------------------------- 画面

  /** 竖屏适配的内容：建筑占地外扩一圈沙滩宽（3 格，夹进登陆区），必须完整在可见区里：塔、登陆沙滩都要一进场看得见 */
  fitContent(): Content {
    const lo = -BEACH;
    const hi = ISLAND + BEACH - 1;
    const rs = this.st.buildings.map((b) => [Math.max(lo, b.x - BEACH), Math.max(lo, b.y - BEACH), Math.min(hi, b.x + b.size - 1 + BEACH), Math.min(hi, b.y + b.size - 1 + BEACH)] as const);
    // 主寨（外扩 1 格）必须在屏内：竖屏放大档、全景都按它保证，进场不再只露岛的左缘
    const hq = this.st.buildings.find((b) => b.kind === 'hq');
    return { box: cellsBox(rs, 0), whole: true, ...(hq ? { must: cellsBox([[hq.x, hq.y, hq.x + hq.size - 1, hq.y + hq.size - 1]], 1) } : {}) };
  }

  /** 竖屏开场推镜的落点（世界 x）：发光沙滩（能登陆的格）在屏幕左右哪半边多就推到那一边的最外沿；一样多推左边（引导先指左边） */
  introFocus(): number | null {
    const c = this.fitContent().box;
    const mid = (c.l + c.r) / 2;
    let ln = 0;
    let rn = 0;
    let lx = Infinity;
    let rx = -Infinity;
    for (let y = -BEACH; y < ISLAND + BEACH; y++) {
      for (let x = -BEACH; x < ISLAND + BEACH; x++) {
        if (!canLand(this.st, x * UNIT + 50, y * UNIT + 50)) continue;
        const px = iso(x + 0.5, y + 0.5).x;
        if (px < mid) {
          ln++;
          lx = Math.min(lx, px);
        } else {
          rn++;
          rx = Math.max(rx, px);
        }
      }
    }
    if (!ln && !rn) return null;
    return ln >= rn ? lx : rx;
  }

  W(x: number, y: number): { x: number; y: number } {
    return iso(x / UNIT, y / UNIT);
  }

  // ---------------------------------------------------------------- 界面

  // ---------------------------------------------------------------- 操作

  // ---------------------------------------------------------------- 推进

  /** 侦察期：玩家第一个操作前拍数停在 0（规则见 battlescout.ts / DESIGN 登陆战开场） */
  scouting(): boolean {
    return !this.st.over && holdScout({ tick: this.st.tick, replay: !!this.d.pvp?.replay, botActs: this.botAct.length, pending: this.pending.length });
  }

  stepOnce(): void {
    const s = this.st;
    if (this.scouting()) return;
    for (const u of this.usp.values()) {
      u.px = u.cx;
      u.py = u.cy;
    }
    const replay = this.d.pvp?.replay;
    if (replay) {
      // 回放：到进攻方停手的那一拍就结束；玩家点的操作不进
      if (s.tick >= replay.end) {
        s.over = true;
        return;
      }
      this.pending = [];
    }
    const tk = takeActions(this.botAct, this.botI, this.pending, s.tick);
    this.botI = tk.botI;
    const acts = tk.acts;
    this.pending = [];
    if (this.d.pvp) for (const a of acts) this.log.push({ ...a, t: s.tick });
    // 规则核心里下标会再确认一次是否已登陆；先灰掉的那条要还原，免得被当成已登陆
    for (const a of acts) if (a.type === 'land') s.landed[a.boat] = false;
    const ev = stepBattle(s, acts);
    if (this.d.map) {
      for (const e of ev) if (e.type === 'land') this.lands[e.boat] = e.units;
      // 航线一站只打 MAP_STOP_TICKS 拍，到点按这时的摧毁率结算
      if (s.tick >= MAP_STOP_TICKS) s.over = true;
    }
    if (s.hero) {
      this.heroFrom.x = this.heroTo.x;
      this.heroFrom.y = this.heroTo.y;
      this.heroTo.x = s.hero.x;
      this.heroTo.y = s.hero.y;
    }
    syncUnits(this);
    for (const e of ev) onEvent(this, e);
  }

  /** 首领登场：名字 + 机制，停 2.4 秒再开打 */
  /** 开场 3 秒俯瞰：防御射程圈淡显；首领岛顶上写首领名、机制和应对一句话；点任意处跳过。模拟在这期间暂停 */
  bossIntro(): void {
    const lv = CAMPAIGN.find((l) => l.id === this.d.levelId);
    this.paused = true;
    const g = this.add.graphics().setDepth(DEPTH.hudFx).setAlpha(0);
    for (const b of this.st.buildings) {
      if (b.destroyed || !b.revealed || b.kind === 'mine' || b.kind === 'tar' || b.kind === 'wall') continue;
      const lvl = BUILDINGS[b.kind]?.levels[b.level - 1] as { range?: number; dmg?: number } | undefined;
      if (!lvl?.range || !lvl.dmg) continue;
      const f = footCenter(b.x, b.y, b.size);
      const w = iso(f.gx, f.gy);
      g.lineStyle(3, 0xff5a4a, 0.9).fillStyle(0xff5a4a, 0.1).fillEllipse(w.x, w.y, lvl.range * 90, lvl.range * 45).strokeEllipse(w.x, w.y, lvl.range * 90, lvl.range * 45);
    }
    this.tweens.add({ targets: g, alpha: 1, duration: 500 });
    const cover = el('div', 'hd-overview', undefined, this.ui);
    cover.style.cssText = 'position:absolute;inset:0;z-index:44;touch-action:none';
    if (lv?.boss) {
      const box = el('div', 'hd-bossintro', undefined, cover);
      el('small', '', '首领岛', box);
      el('h2', '', lv.bossName ?? lv.captain, box);
      if (lv.mechanic) el('p', '', lv.mechanic, box);
      if (lv.counter) el('p', '', `打法：${lv.counter}`, box).style.cssText = 'margin-top:6px;color:#ffe885';
      sfx('crumbleBig');
      this.cameras.main.shake(300, 0.003);
    }
    if (this.d.map) {
      const box = el('div', 'hd-bossintro hd-mapintro', undefined, cover);
      el('small', '', `第 ${this.d.map.stop}/${MAP_LAYERS} 站`, box);
      el('h2', '', this.d.map.name, box);
      el('p', '', `${MAP_STOP_TICKS / TICKS_PER_SEC} 秒内拆得越多，宝分越多`, box);
    }
    hint(this, ''); // 俯瞰期间只留下面这一条提示，收起后 afterSelect 再把"先点船卡"补回来
    const tip = el('div', '', this.d.pvp?.replay || this.d.auto ? '红圈是防御的射程 · 点任意处开始' : SCOUT_TIP, cover);
    tip.style.cssText = 'position:absolute;left:0;right:0;bottom:30%;text-align:center;color:#fff;font:600 14px system-ui;text-shadow:0 1px 3px #000';
    let done = false;
    const end = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cover.remove();
      if (!this.scene.isActive()) return;
      this.tweens.add({ targets: g, alpha: 0, duration: 400, onComplete: () => g.destroy() });
      this.paused = false;
      afterSelect(this);
    };
    // 用真实时间（慢机器上游戏时钟会拖慢，不能卡住）
    const timer = setTimeout(end, 3000);
    cover.addEventListener('pointerdown', end);
    this.events.once('shutdown', () => clearTimeout(timer));
  }

  // ---------------------------------------------------------------- 每帧

  override update(time: number, delta: number): void {
    const s = this.st;
    this.nowT = time;
    const frozen = this.hs.active;
    this.tweens.timeScale = frozen ? 0.05 : 1;
    this.pt.timeScale = this.dn.timeScale = frozen ? 0 : 1;
    if (!s.over && !this.paused && !frozen) {
      this.acc += Math.min(delta, 100) * this.speed;
      let n = 0;
      while (this.acc >= STEP_MS && !s.over && n++ < 8) {
        this.acc -= STEP_MS;
        this.stepOnce();
      }
      if (n >= 8) this.acc = 0;
    }
    const frac = s.over ? 1 : this.acc / STEP_MS;
    this.dying.timeScale = frozen ? 0 : 1;
    this.dying.step(delta);
    renderUnits(this, frac, time, delta);
    this.beachGlow.update(time, this.beachG.visible, this.selBoat >= 0, this.cameras.main.zoom / this.r);
    renderTurrets(this, frac, time, frozen ? 0 : delta);
    renderSnipe(this, frac, time);
    renderProjectiles(this, frac, frozen ? 0 : delta);
    renderBars(this);
    this.frameN++;
    if (this.frameN % 5 === 0) updateHud(this);
    if (sig(this) !== this.cardsSig) renderCards(this);
    if (s.over && !this.ended) finish(this, 1300);
    if (this.followT) this.followCam(this.followT);
  }

  /** 测试辅助（录屏）：镜头对准跟住的兵（倒下后停在最后的位置） */
  followCam(f: { id: number; z: number; x: number; y: number }): void {
    const sp = this.usp.get(f.id);
    if (sp?.rig.active && sp.rig.kind) {
      f.x = sp.rig.x;
      f.y = sp.rig.y;
    }
    if (f.x || f.y) this.cameras.main.setZoom(this.r * f.z).centerOn(f.x, f.y - 22);
  }

  readonly tin = { now: 0, dt: 0, has: false, tx: 0, ty: 0, aiming: false, until: Infinity };
  bbyId = new Map<number, BBuilding>();

  // ---------------------------------------------------------------- 结算

}
