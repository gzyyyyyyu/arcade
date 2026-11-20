import Phaser from 'phaser';
import { BUILDINGS } from '../content/index.ts';
import { islandExt, produce, rankOf } from '../core/index.ts';
import type { BuildingKind, Res } from '../core/types.ts';
import { app, pagePoint } from './app.ts';
import { artBox, ensureArt } from './textures.ts';
import { bArt, piecesFor, sTex, wArt, wTex } from './art.ts';
import { CamCtl } from './camctl.ts';
import { Particles } from './fx.ts';
import { LOW_MEMORY } from './viewport.ts';
import { startAmbient } from './ambient.ts';
import { EnvAnim } from './envfx.ts';
import { BLD_NEAR_ZOOM, BldFx } from './basebldfx.ts';
import { setWeather } from './post.ts';
import { FitCam, islandBox } from './camfit.ts';
import { bindKeys, pressNth } from './inputs.ts';
import { type CamView, keyAction } from './basefeel.ts';
import { UpgradeFx } from './upfx.ts';
import { RingMenu } from './ringmenu.ts';
import { type DecoSpr, SEA_BG, drawGround, worldBounds, scatterDeco, jitter, put, toggleDeco } from './ground.ts';
import { footCenter, iso, depthOf } from './iso.ts';
import { setAmbience } from './audio/sfx.ts';
import { type Tutorial, tutStep } from './tutorial.ts';
import { DEPTH } from './depth.ts';
import type { Node, Place } from './basecommon.ts';
import { type Cycle, newCycle } from './basepick.ts';
import { tap, hover, press, fadeFrame, lineBegin, syncPlaceUi, dragTo, placeAt, confirmPlace, placeFrame, wallMask, openBuild } from './baseplace.ts';
import { right, escapeKey, modal, keyAct, closeCtx, drawSel, closeRing, plateFrame } from './basemenu.ts';
import { occupied, fitContent, firstBaseEntry, centerOf, focusFrame, measureSafe, topOf } from './basegeom.ts';
import { buildUi, retexture, syncBubble, updateHud } from './basehud.ts';
import { reloadFromSave } from './basepanel.ts';
import { showNewHint } from './baseupgrade.ts';
import { tutRefresh } from './basenav.ts';

export class BaseScene extends Phaser.Scene {
  r = 1;
  cc!: CamCtl;
  nodes = new Map<number, Node>();
  ui!: HTMLElement;
  hud!: Record<'gold' | 'wood' | 'hq' | 'me', HTMLElement>;
  fit!: FitCam;
  /** 竖屏开场推镜演不演：这次打开游戏后第一次进基地才演（basegeom.ts 的 firstBaseEntry） */
  introOnce = false;
  ring!: RingMenu;
  /** 可见区（扣掉顶栏和操作区），操作环按它内收 */
  safe = { l: 0, r: 0, t: 0, b: 0 };
  lastSafe = 0;
  /** .hd-screen 相对画布的缩进（刘海让出的边距）：环的坐标要减掉它 */
  off = { x: 0, y: 0 };
  hoverG!: Phaser.GameObjects.Graphics;
  hoverId: number | null = null;
  /** 手指按着的建筑（按下就画占地，松手 / 拖开收） */
  pressId: number | null = null;
  /** 同一点连点循环的状态（basepick.ts） */
  cycle: Cycle = newCycle();
  /** 盖住焦点建筑的那些（半透明）、各自当前的透明度、上次重算的签名和时刻 */
  occ = new Set<number>();
  fade = new Map<number, number>();
  occSig = '';
  occAt = 0;
  dotEls = new Map<'upgrade' | 'collect' | 'attacked', HTMLElement>();
  bottom!: HTMLElement;
  sheet: HTMLElement | null = null;
  /**
   * 开建筑面板时镜头让开（panelFocus）：saved 是开面板之前的镜头，关掉后回到这里；expect 是这边最后一次摆的镜头，
   * 和它对不上说明玩家自己拖过 / 缩放过（moved），关面板时就不回去了。
   */
  pf: { saved: CamView; expect: CamView | null; moved: boolean; anim: { from: CamView; to: CamView; t: number; back: boolean } | null } | null = null;
  stopMap: (() => void) | null = null;
  place: Place | null = null;
  placeBar: HTMLElement | null = null;
  lastTick = 0;
  lastSave = 0;
  tut!: Tutorial;
  deco: DecoSpr[] = [];
  buildCards = new Map<BuildingKind, HTMLElement>();
  /** 船队面板当前看的是第几条船 */
  fleetBoat = 0;
  buildBtn!: HTMLElement;
  fleetBtn!: HTMLElement;
  mapBtn!: HTMLElement;
  lastTut = 0;
  /** 升级施工 / 完成演出、放下建筑的落地（upfx.ts） */
  upfx!: UpgradeFx;
  /** 选中的建筑（快捷键 U / I / M 作用在它上面）：点过、右键过、开过信息面板的那座 */
  sel: number | null = null;
  selG!: Phaser.GameObjects.Graphics;
  /** 电脑右键菜单 */
  ctx: HTMLElement | null = null;
  ctxOff: (() => void) | null = null;
  /** 悬停名牌（电脑）：名字 + 等级 + 能升级的小箭头 */
  plate!: HTMLElement;
  plateSig = '';
  plateAt = 0;
  /** 最近一次操作是手指（true）还是鼠标：决定摆放时用 ✓ / ✕ 还是左键直接放 */
  touch = false;
  /** 正在补烘缺的外观（refresh 发现贴图不存在时） */
  baking = false;
  /** 主寨升级演出还在播（解锁弹窗等它播完才出，徽章再等弹窗关掉） */
  celebrating = false;
  /** 主寨升级解锁了新建筑、弹窗关掉后在岛上亮一下 */
  newHint = false;
  /** 岛按主寨扩了几圈（islandExt）：地面、海岸点缀、镜头范围、摆放夹取都按它；跨档升级时 refresh 里 reland 重画 */
  ext = 0;
  ground!: Phaser.GameObjects.Image;
  stopAmbient: () => void = () => {};

  constructor() {
    super('base');
  }

  create(): void {
    setAmbience('base');
    this.r = app.r;
    this.nodes = new Map();
    this.sheet = null;
    this.stopMap = null;
    this.place = null;
    this.placeBar = null;
    this.cameras.main.setBackgroundColor(SEA_BG);
    this.ext = islandExt(app.profile.base.buildings);
    this.ground = drawGround(this, this.r, false, this.ext);
    this.stopAmbient = startAmbient(this, this.r, this.ext);
    // 升级完成的彩带、金币、光点一次就是三四十粒，池子比战斗外的其他场景大一点
    this.pt = new Particles(this, this.r, LOW_MEMORY ? 80 : 140);
    setWeather('clear');
    this.env = new EnvAnim(this, this.r, this.pt, rankOf(app.profile));
    // refresh 在 create 之前可能已经建过精灵（nodes 在上面清空了，这里不会有）；之后的建好 / 换纹理都在 refresh 里挂
    this.cc = new CamCtl(this, this.r, worldBounds(this.ext));
    this.cc.onTap = (x, y, mouse) => tap(this, x, y, mouse);
    // 电脑：悬停高亮建筑和名牌、右键菜单；放建筑时鼠标移动就是预览
    this.hoverG = this.add.graphics().setDepth(DEPTH.baseHover);
    this.selG = this.add.graphics().setDepth(DEPTH.baseSelect);
    this.hoverId = null;
    this.pressId = null;
    this.cycle = newCycle();
    this.occ = new Set();
    this.fade = new Map();
    this.occSig = '';
    this.sel = null;
    this.ctx = null;
    this.plateSig = '';
    this.touch = navigator.maxTouchPoints > 0;
    this.cc.onHover = (x, y) => hover(this, x, y);
    this.cc.onPress = (x, y) => press(this, Number.isNaN(x) ? null : x, y);
    this.cc.onRight = (wx, wy, sx, sy) => right(this, wx, wy, sx, sy);
    this.cc.drag = {
      start: (wx, wy, mouse) => {
        const pl = this.place;
        if (!pl) return false;
        this.touch = !mouse;
        if (pl.kind === 'wall' && pl.id === undefined) {
          pl.mouseLine = mouse;
          lineBegin(this, wx, wy, mouse);
          return true;
        }
        // 鼠标：左键拖动照常平移镜头，虚影跟着鼠标走（update 里按鼠标位置重放），单击放下
        if (mouse) return false;
        pl.dragging = true;
        pl.press = { x: wx, y: wy };
        pl.moved = false;
        syncPlaceUi(this);
        return true;
      },
      move: (wx, wy) => dragTo(this, wx, wy),
      end: () => {
        const pl = this.place;
        if (!pl) return;
        pl.dragging = false;
        // 手指点一下没拖：把虚影挪到点的地方（再点 ✓ 放下）
        if (pl.press && !pl.moved) placeAt(this, pl.press.x, pl.press.y, false);
        pl.press = null;
        // 鼠标拖出一排城墙：松手就放下（点一下 = 放一段）
        if (pl.mouseLine) {
          pl.mouseLine = false;
          confirmPlace(this);
          return;
        }
        syncPlaceUi(this);
      },
    };
    this.upfx = new UpgradeFx(this, this.r, this.pt, () => this.cc.z);
    this.deco = scatterDeco(this, this.r, this.ext, (gx, gy) => occupied(this, gx, gy));
    buildUi(this);
    // 镜头按岛适配：整座岛含沙滩在顶栏和操作区之间的可见区里，进场不用拖；放大是可选的（双指 / 滚轮），回到全景有按钮
    this.introOnce = firstBaseEntry();
    this.fit = new FitCam(this, this.cc, this.ui, () => islandBox(this.ext, [], 1), this.r, () => fitContent(this));
    app.api.fitInfo = () => this.fit.info();
    this.ring = new RingMenu(this.ui, () => this.safe);
    // 炮台巡视只在放大到全景的 1.3 倍以上时拆分件（basebldfx.ts 的 near）
    this.bfx = new BldFx(this, this.r, this.pt, (img) => this.upfx.busy(img), () => this.cc.z >= this.fit.home.z * BLD_NEAR_ZOOM);
    // 键盘：Esc 取消 / 关面板，空格回全景，数字键 1–4 = 底栏四个按钮，字母键见 basefeel.ts 的 BASE_KEYS（U 升级、I 信息、C 收集全部、M 移动、B 建造）
    bindKeys(this, {
      esc: () => escapeKey(this),
      space: () => this.fit.back(),
      digit: (n) => {
        if (!this.place && !this.sheet && !this.stopMap && !modal(this)) pressNth(this.bottom.children, n - 1);
      },
      key: (k) => {
        const a = keyAction(k);
        if (!a || a === 'cancel') return false;
        keyAct(this, a);
        return true;
      },
    });
    // 最近一次按下是手指还是鼠标（DOM 上的点也算）：摆放时手指用 ✓ / ✕，鼠标左键直接放
    const onDown = (e: PointerEvent): void => {
      this.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    };
    window.addEventListener('pointerdown', onDown, true);
    this.events.once('shutdown', () => window.removeEventListener('pointerdown', onDown, true));
    // 新号金矿一开始没存量，引导第 0 步没东西可收：首次进入补一点
    if (tutStep() === 0) {
      const p = app.profile;
      app.commit({ ...p, base: { ...p.base, buildings: p.base.buildings.map((b) => (b.kind === 'goldmine' ? { ...b, stored: Math.max(b.stored ?? 0, 30) } : b)) } });
    }
    this.refresh();
    this.lastTick = this.lastSave = performance.now();
    app.reload = () => reloadFromSave(this);
    this.events.once('shutdown', () => {
      // 战斗里收到云端合并时基地场景已经关了，别再往它身上画；回基地时 create 会重新读存档
      app.reload = () => {};
      this.celebrating = false;
      this.stopMap?.();
      closeCtx(this);
      this.tut.destroy();
      this.ui.remove();
      app.flush();
    });
    app.api.scene = 'base';
    app.api.home = () => this.fit.back();
    app.api.where = (kind) => {
      // 摆放中的虚影（占地中心）：冒烟脚本在电脑上直接点它放下
      if (kind === 'ghost') {
        const pl = this.place;
        if (!pl) return null;
        const f = footCenter(pl.x, pl.y, pl.size);
        const w = iso(f.gx, f.gy);
        return pagePoint(this.cc.toScreen(w.x, w.y));
      }
      if (kind === 'bubble') {
        const gm = app.profile.base.buildings.find((x) => x.kind === 'goldmine');
        const bub = gm && this.nodes.get(gm.id)?.bubble;
        return bub ? pagePoint(this.cc.toScreen(bub.x, bub.y)) : null;
      }
      // 'goldmine#1' = 第二座金矿（测试辅助，探查脚本用）
      const [kk, ii] = kind.split('#');
      const b = app.profile.base.buildings.filter((x) => x.kind === kk)[Number(ii ?? 0)];
      const n = b && this.nodes.get(b.id);
      if (!n) return null;
      const im = n.img;
      const bx = artBox(n.key) ?? { l: 0, t: 0, r: im.width, b: im.height };
      const ox = im.x - im.originX * im.displayWidth;
      const oy = im.y - im.originY * im.displayHeight;
      return pagePoint(this.cc.toScreen(ox + ((bx.l + bx.r) / 2) * im.scaleX, oy + ((bx.t + bx.b) / 2) * im.scaleY));
    };
    app.api.missing = () => {
      const out: string[] = [];
      for (const o of this.children.list) {
        const t = (o as Phaser.GameObjects.Image).texture?.key;
        if (t === '__MISSING' && (o as Phaser.GameObjects.Image).visible) out.push([...this.nodes.values()].find((n) => n.img === o)?.key ?? o.type);
      }
      return out;
    };
    app.api.focusOn = (kind, k) => {
      // 'goldmine#1' = 第二座金矿（和 where 一样）
      const [kk, ii] = kind.split('#');
      const b = app.profile.base.buildings.filter((x) => x.kind === kk)[Number(ii ?? 0)];
      const n = b && this.nodes.get(b.id);
      if (!n) return false;
      const c = centerOf(this, n);
      this.cc.setView(c.x, c.y, this.fit.home.z * k);
      this.sel = b.id;
      drawSel(this);
      return true;
    };
    // 测帧率的镜头（perf.ts 的基地场景）：世界坐标，放大倍数相对开场全岛
    app.api.lookAt = (x, y, z) => this.cc.setView(x, y, this.fit.home.z * z);
    app.api.beach = () => null;
    app.api.ready = true;
    if (app.buildOnBase) {
      app.buildOnBase = false;
      openBuild(this);
    }
  }

  override update(time: number, delta: number): void {
    focusFrame(this, Math.min(delta, 50));
    if (this.newHint && !document.querySelector('.hd-celebrate')) {
      this.newHint = false;
      showNewHint(this);
    }
    // 产出：按真实时间攒，每秒一次
    if (time - this.lastTick >= 1000) {
      // 切后台再回来和重开页面一样，最多补 12 小时（矿自身的上限）
      const dt = Math.min(12 * 3600, (time - this.lastTick) / 1000);
      this.lastTick = time;
      app.tick(produce(app.profile, dt));
      this.refresh();
    }
    if (time - this.lastSave >= 15000) {
      this.lastSave = time;
      app.flush();
    }
    if (time - this.lastTut >= 200) {
      this.lastTut = time;
      tutRefresh(this);
    }
    // 操作环跟着建筑走；可见区隔一阵重量一次（转屏、底栏显隐会变）
    if (this.ring.isOpen) {
      if (time - this.lastSafe > 400) measureSafe(this, time);
      const n = this.ring.owner === null ? undefined : this.nodes.get(this.ring.owner);
      if (n) {
        const c = centerOf(this, n);
        const sp = this.cc.toScreen(c.x, c.y);
        this.ring.follow(sp.x - this.off.x, sp.y - this.off.y);
      } else closeRing(this);
    }
    if (this.place) placeFrame(this, time, Math.min(delta, 50));
    if (this.hoverId !== null) plateFrame(this, time);
    fadeFrame(this, time, Math.min(delta, 50));
    // 气泡大小跟缩放：缩小时放大一点才看得清、点得到
    const s = Math.min(2.6, Math.max(1, 0.9 / this.cc.z));
    const bob = Math.sin(time / 260) * 2;
    const ringOn = this.ring.isOpen;
    for (const n of this.nodes.values()) {
      if (!n.bubble) continue;
      n.bubble.setScale(s);
      n.bubble.y = topOf(this, n) - 28 * s + bob;
      // 操作环的按钮压在收取气泡上时先把气泡藏起来（手机上两个都能点，叠着会点错），环收起再露出来
      let hide = false;
      if (ringOn) {
        const a = this.cc.toScreen(n.bubble.x, n.bubble.y);
        const e = this.cc.toScreen(n.bubble.x + 22 * s, n.bubble.y);
        hide = this.ring.covers(a.x - this.off.x, a.y - this.off.y, Math.abs(e.x - a.x));
      }
      n.bubble.setVisible(!hide);
    }
  }

  // ---------------------------------------------------------------- 画面同步

  /** 按存档把岛上的建筑、气泡、资源条对齐 */
  refresh(): void {
    const p = app.profile;
    const ext = islandExt(p.base.buildings);
    if (ext !== this.ext && this.scene.isActive()) this.reland(ext);
    this.env?.setRank(rankOf(p));
    const seen = new Set<number>();
    // 贴的是逐级退到已烘好的图（wTex / sTex），要不要补烘得看这一级本该用的那张烘没烘
    let unbaked = false;
    for (const b of p.base.buildings) {
      seen.add(b.id);
      const mask = b.kind === 'wall' ? wallMask(this, b) : 0;
      const art = b.kind === 'wall' ? wTex(b.level, mask) : sTex(b.kind, b.level);
      if (!unbaked && !this.textures.exists((b.kind === 'wall' ? wArt(b.level, mask) : bArt(b.kind, b.level)).key)) unbaked = true;
      let n = this.nodes.get(b.id);
      if (!n) {
        n = { img: jitter(put(this, this.r, art, 0, 0), b.kind, b.id), key: art.key };
        this.nodes.set(b.id, n);
        if (b.kind !== 'wall') this.env.dress(n.img, b.kind, b.level, b.id);
      } else if (n.key !== art.key && !this.upfx.holds(b.id)) {
        // 升级施工中先保持旧样子，演出到"换外观"那一下再换（upfx 调 morph）
        retexture(this, n, b);
      } else if (n.img.texture.key === '__MISSING' && this.textures.exists(n.key) && !this.upfx.holds(b.id)) {
        // 建图时这张外观还没烘（示范岛、宝藏箱这类按需物件），补烘完 key 没变也要重新贴一次
        n.img.setTexture(n.key).setOrigin(art.ax / art.w, art.ay / art.h);
      }
      const f = footCenter(b.x, b.y, BUILDINGS[b.kind].size);
      const s = iso(f.gx, f.gy);
      // 正在播升级 / 落地演出的建筑由演出逐帧摆位置，这里不抢
      if (!this.upfx.busy(n.img)) {
        n.img.setPosition(s.x, s.y).setAlpha(this.place?.id === b.id ? 0.35 : (this.fade.get(b.id) ?? 1));
      }
      n.img.setDepth(depthOf(f.gx, f.gy));
      // refresh 在 create 建好 bfx 之前也会被调（见 create 里的注释），那时还没有动作可挂
      if (b.kind !== 'wall') this.bfx?.sync(b.id, n.img, b.kind, b.level, s.x, s.y, n.key);
      syncBubble(this, n, b);
    }
    // 存档里有还没烘过的外观（开局只烘 1–2 级；示范岛、云存档合并、按需物件如宝藏箱）：补烘完再同步一次，任何路径都不留缺图
    if (!this.baking && unbaked) {
      this.baking = true;
      void ensureArt(this.textures, piecesFor(p.base.buildings), this.r).finally(() => {
        this.baking = false;
        if (this.scene.isActive()) this.refresh();
      });
    }
    for (const [id, n] of this.nodes) {
      if (seen.has(id)) continue;
      this.bfx?.drop(id);
      n.bubble?.destroy();
      n.img.destroy();
      this.nodes.delete(id);
    }
    toggleDeco(this.deco, (gx, gy) => occupied(this, gx, gy));
    updateHud(this);
  }

  /**
   * 岛扩圈了（主寨升级跨档、云存档合并进来更高的主寨）：地面重烘、海岸点缀和装饰重摆、镜头范围和全景跟着换；
   * 建筑都在原坐标不动。玩家放大着就不动镜头，在全景就回到新的全景。
   */
  private reland(ext: number): void {
    this.ext = ext;
    // 旧尺寸的地面图不会再用（岛只会变大），连贴图一起放掉，省显存
    const old = this.ground.texture.key;
    this.ground.destroy();
    this.textures.remove(old);
    this.ground = drawGround(this, this.r, false, ext);
    this.stopAmbient();
    this.stopAmbient = startAmbient(this, this.r, ext);
    for (const d of this.deco) d.img.destroy();
    this.deco = scatterDeco(this, this.r, ext, (gx, gy) => occupied(this, gx, gy));
    this.cc.setBounds(worldBounds(ext));
    this.fit.refit(this.fit.away());
  }

  /** 收取时数字先不动，等金币 / 木材飞到顶栏再从旧值滚到新值 */
  rolling: Partial<Record<'gold' | 'wood', boolean>> = {};
  /** 上一次顶栏显示的资源，比它少了就是花了钱（spendFx） */
  prevRes?: Res;
  shown: Partial<Record<'gold' | 'wood', number>> = {};
  pt!: Particles;
  env!: EnvAnim;
  /** 建筑的标志动作（basebldfx.ts） */
  bfx!: BldFx;

  /** 离开前的确认（有未放下的虚影时） */
  hasPending(): boolean {
    return !!this.place;
  }
}


