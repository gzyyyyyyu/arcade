/**
 * 守夜的对局画面（DESIGN.md 5.3）：
 * - 核心按每秒 30 拍走（累加真实时间，一帧可能走 0–3 拍），画面每帧在两拍之间插值；
 * - 主角本地预测：摇杆一动，主角的画面位置当帧就按新方向挪（手感验收 ②），核心下一拍算出来的位置自然接上；
 * - 打击停顿（hit-stop）只是暂停送拍，核心照样按拍走，不影响确定性；
 * - 怪、子弹、掉落按槽位一一对应一个精灵，槽位的 gen 变了就是换了一只，重设外观。
 * 画面只读核心的状态和事件（w.ev），不自己算规则。
 *
 * 相对独立的绘制已拆成 paint-*.ts（弹幕、掉落、竹林、死亡余势、场地底和点缀）、foes.ts、fx*.ts、items.ts、town.ts、rush.ts，这里每帧按原顺序调它们。
 * 留在这里的：怪的精灵（drawMobs / onMob / 画皮）、夜探（drawRaid / 鬼市摊子 / 指引）、事件分发（readEvents）、主角和镜头、HUD 同步——
 * 它们和 hold / freeze / now / 事件处理纠缠在一起，拆出去要传一大把状态，反而更难读。
 */
import { fmtClock } from '../../content/clock.ts';
import { XINFA_FX, XINFA_TEXT } from '../../content/xinfa.ts';
import Phaser from 'phaser';
import { DROWN, ENEMIES, ENEMY_BY_KIND, HOP_AIR, HOP_PERIOD, HUAPI, JUEMU, SPROUT, WATER } from '../../content/enemies.ts';
import { CHAR_FX, CHARACTERS } from '../../content/meta.ts';
import { ARENA, xpNeed } from '../../content/player.ts';
import { MAPS } from '../../content/maps.ts';
import { BEAST, DAWN_RED, DAWN_WARN, GATE, RAID_DAWN, RAID_LATE } from '../../content/explore.ts';
import { MARKET_GOODS, MARKET_NAME, NIGHT_MARKET } from '../../content/market.ts';
import { TIERS, TIER_INFO, TREASURES } from '../../content/treasures.ts';
import { edgeArrow, walkSecs } from '../../explore/view/guide-hud.ts';
import { guide, newGuide } from '../../explore/guide.ts';
import { Role, type Raid } from '../../explore/raid.ts';
import { DANGERS, DAWN_TICK } from '../../content/waves.ts';
import { WEEKLIES, WEEKLY_FX } from '../../content/weekly.ts';
import { MAP_EVENTS, MAP_EVENT_KINDS, nextMapEvent } from '../../content/mapEvents.ts';
import { newNightLog, noteNight, type NightLog } from '../ui/eventIcons.ts';
import { MERGES, PASSIVE_IDS, PASSIVES, WEAPON_IDS, WEAPONS } from '../../content/weapons.ts';
import { autoSkillSetting, wantAutoSkill } from './autoskill.ts';
import { BOSS_TIP, ELITE_TIP, PHASE_BANNER } from './banners.ts';
import { Drop, Ev, MAX_ENEMIES, MERGE_CODE, skillCooldown, skillOf, skillReady, step, TICKS_PER_SECOND, yinyangSide, type World } from '../../core/index.ts';
import { COS, SIN } from '../../core/dirs.ts';
import { HERO_TEX, MOB_TEX, RAID_TEX, makeIcons, peekHeroAtlas, type Atlas, type Frame } from '../art/atlas.ts';
import { faceKey, heroKey } from '../art/heroes.ts';
import { LookAura } from './lookAura.ts';
import { playSkillFx, SK, type SkillFxCtx } from '../art/skills.ts';
import { GROUND_TINT } from '../art/terrain.ts';
import { treasureIconKey } from '../art/sprites-raid.ts';
import { music } from '../audio/music.ts';
import { sfx, type SfxName } from '../audio/sfx.ts';
import '../audio/sfx-skills.ts';
import { browserHaptics } from '../haptics.ts';
import type { Banners } from '../ui/banner.ts';
import { COIN_PICK_TEXT, type Cards, describe } from '../ui/cards.ts';
import { upgradeNeed } from '../ui/mergeHint.ts';
import type { Hud, HudArrow, HudSlot } from '../ui/hud.ts';
import { RaidHud } from '../ui/raidhud.ts';
import { LOW_MEMORY } from '../viewport.ts';
import { DamageNumbers, Fx } from './fx.ts';
import { ArmsFxView } from './fx-arms.ts';
import { Arms2FxView } from './fx-arms2.ts';
import { Items } from './items.ts';
import { BambooView } from './paint-bamboo.ts';
import { DropsView } from './paint-drops.ts';
import { DeathGhosts } from './paint-ghosts.ts';
import { GroundPainter } from './paint-ground.ts';
import { ShotsView } from './paint-shots.ts';
import { FoeView } from './foes.ts';
import { MARKET_ICON, type StallItem, StallsView } from './stalls.ts';
import { isFoeBoss } from '../../core/foes/index.ts';
import { weaponLook } from './look.ts';
import { Town } from './town.ts';
import { FireView } from './fire.ts';
import { RushShow } from './rush.ts';
import { Bump, drawArenaWall } from './wall.ts';
import type { Input } from './input.ts';

const TICK_MS = 1000 / TICKS_PER_SECOND;
const pad2 = (n: number): string => String(n).padStart(2, '0');
/** 夜探提示里的时刻一律按 HUD 顶上的"离天亮"倒计时写（和 HUD 一样向上取整）：写已过时间（"8:00 以后"）所有者按倒计时理解，早到了打不开宝库（0.3.10） */
const raidClock = (tick: number): string => {
  const s = Math.max(0, Math.ceil((RAID_DAWN - tick) / TICKS_PER_SECOND));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
};
/** 还差多少拍 → m:ss（向上取整，和倒计时对得上） */
const waitClock = (ticks: number): string => fmtClock(Math.ceil(ticks / TICKS_PER_SECOND));
/** 只在 dev 构建里认 ?slowmo=N（截图预览用），正式构建恒为 1 */
const SLOWMO = import.meta.env.DEV ? Math.max(1, Number(new URLSearchParams(location.search).get('slowmo') ?? 1) || 1) : 1;
/** 慢动作时拍子推得多慢（只改画面推拍的快慢，规则照常一拍一拍走） */
const SLOW_K = 0.3;

/** 怪种类编号 → 图集帧（没画好的先借相近的） */
const MOB_FRAME = ENEMIES.map((e) => e.kind as string);
// 戏子的假身画得和真身一样（只差头顶的红丝）；挡路的空棺用敞着盖的那张
MOB_FRAME[ENEMY_BY_KIND.hongyiclone.code] = 'hongyi';
MOB_FRAME[ENEMY_BY_KIND.coffin.code] = 'coffinopen';
const MOB_FALLBACK: Record<string, string> = {
  fox: 'wisp', shishi: 'jiangshi_big', general: 'jiangshi_big', boss: 'jiangshi_big',
  horse: 'paper', water: 'wisp', bone: 'paper', bat: 'wisp', scarecrow: 'jiangshi', weasel: 'fox', snow: 'wisp', whitefox: 'fox', palanquin: 'shishi', ice: 'fireball', lord: 'boss', money: 'coin',
};
const WATER_CODE = ENEMY_BY_KIND.water.code;
const SPROUT_CODE = ENEMY_BY_KIND.bamsprout.code;
const DROWN_CODE = ENEMY_BY_KIND.drown.code;
const JUEMU_CODE = ENEMY_BY_KIND.juemu.code;
const SNAKE_CODE = ENEMY_BY_KIND.snakespirit.code;
const PUPPET_CODE = ENEMY_BY_KIND.puppet.code;
const HUAPI_CODE = ENEMY_BY_KIND.huapi.code;
const XUETONG_CODE = ENEMY_BY_KIND.xuetong.code;
const GUANDING_CODE = ENEMY_BY_KIND.guandingui.code;
const HURRIER_CODE = ENEMY_BY_KIND.hurrier.code;
const DIVER_CODES = new Set((['shuihou', 'shuoshu'] as const).map((k) => ENEMY_BY_KIND[k].code));
const HUAPISKIN_CODE = ENEMY_BY_KIND.huapiskin.code;
/** 混迹中的画皮借这张常规怪的图（放大 HUAPI.disguiseScale 画）：放在怪群里认不出来 */
const HUAPI_DISGUISE = 'paper';

/** 子弹种类 → 图集帧（光波画在 Graphics 上，这里给个占位） */

const FIRE_SFX: Partial<Record<string, SfxName>> = { sword: 'sword', talisman: 'talisman', coins: 'coins', flysword: 'flysword', thunder: 'thunder', bell: 'bell', mirror: 'mirror', gourd: 'fire', rope: 'rope', petals: 'petal', crane: 'crane', zhibing: 'talisman', spring: 'petal', tide: 'mirror', flag: 'armFlag', chain: 'armChain', pole: 'armPole', lamp: 'armLamp', dart: 'armDart', abacus: 'armAbacus', banner: 'armBanner', brush: 'armBrush', cracker: 'armCracker' };

export interface GameDeps {
  world: World;
  atlas: Atlas;
  /** 夜探用的第二张图集（buildRaidAtlas）；夜探必传，守夜不用 */
  raidAtlas?: Atlas;
  /** 各地区特色怪的图集（buildMobAtlas），守夜、夜探都要 */
  mobAtlas: Atlas;
  hud: Hud;
  cards: Cards;
  banners: Banners;
  input: Input;
  zoom: number;
  icon: (key: string) => string;
  /** 第一局：卡片上带一行说明 */
  firstRun: boolean;
  onEnd: (w: World) => void;
  /** 每推一拍（含选卡）的前后：录像在前面记输入，成就计数在后面读事件 */
  beforeStep?: (w: World, dir: number, choice: number, skill: number) => void;
  afterStep?: (w: World) => void;
  /** 设置里的"震屏"开关（手感清单第 2 条：能关） */
  shake: () => boolean;
  /** 开了宝箱（引导用：第一次开宝箱时提示进化） */
  onChest?: () => void;
  /** 这局技能钮第一次出现（回放不调）：main 按角色弹一次"怎么放、做什么"的提示 */
  onSkillShown?: (w: World) => void;
  /** 冒烟、截图用：由机器人代替输入 */
  autopilot?: (w: World) => { dir: number; choice: number };
  /** 回放：时间、选卡都交给它推（录像驱动、可变速），每推一拍回调一次 each；场景自己不推 */
  drive?: (dtMs: number, each: () => void) => void;
  /** 外观「脚下光圈」的颜色（content/meta.ts LOOKS）；没穿不传 */
  aura?: { color: string; edge: string };
}

interface MobView {
  gen: number;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  res: number;
  flash: number;
  /** 上一次白闪开始的时刻（this.now）：持续挨打的怪隔一会儿才再闪，不然一直是白的 */
  flashAt: number;
  kind: number;
  /** 现在用的图集帧名（画皮混迹 / 现形换图时对比） */
  look: string;
  /** 出现的时刻（this.now）：人皮分身淡入用 */
  born: number;
  /** 受击后退：1 → 0 带缓出；方向是远离主角 */
  kb: number;
  kx: number;
  ky: number;
}


export class GameScene extends Phaser.Scene {
  private d!: GameDeps;
  private w!: World;
  private acc = 0;
  private freeze = 0;
  /** 慢动作还剩几毫秒（连战打倒首领时）：这段时间里拍子按 SLOW_K 倍的速度推 */
  private slow = 0;
  private rushShow: RushShow | null = null;
  /** 冰屑的间隔计时 */
  private frost = 0;
  /** 演出（宝箱、进化、升级光柱）中不送拍 */
  private hold = 0;
  private paused = false;
  private frames!: Map<string, Frame>;
  private hero!: Phaser.GameObjects.Image;
  private heroBack!: Phaser.GameObjects.Image;
  /** 开局头上冒一次的台词气泡（角色的 line）；到点收掉 */
  private bubble: Phaser.GameObjects.Text | null = null;
  private bubbleUntil = 0;
  private heroShadow!: Phaser.GameObjects.Image;
  private lookAura: LookAura | null = null;
  private aura!: Phaser.GameObjects.Image;
  private mobs: (MobView | null)[] = [];
  private shotsView!: ShotsView;
  private dropsView!: DropsView;
  private groundPainter!: GroundPainter;
  private bambooView!: BambooView;
  /** 义庄的棺材：第几块 → 它的图（打碎了删） */
  private readonly coffins = new Map<number, Phaser.GameObjects.Image>();
  /** 怪的死亡余势（paint-ghosts.ts） */
  private readonly ghosts = new DeathGhosts(this);
  private fx!: Fx;
  private foeView!: FoeView;
  private stalls!: StallsView;
  private ground!: Fx;
  private nums!: DamageNumbers;
  /** 摆设、符咒炸弹、开箱光效、铜钱袋飘字（items.ts） */
  private items!: Items;
  /** 上次看到的铜钱袋累计铜钱：铜钱袋的数额在核心里现掷，事件里没有，靠累计差值得到 */
  private purseSeen = 0;
  private gfx!: Phaser.GameObjects.Graphics;
  /** 2.0 第一批法器（阵旗、勾魂锁、竹篙、长明灯）和搭配的特效（fx-arms.ts） */
  private arms!: ArmsFxView;
  /** 2.0 第二批法器（铜钱镖、算盘、招魂幡、判官笔、鞭炮）、套件和搭配的特效（fx-arms2.ts） */
  private arms2!: Arms2FxView;
  private bolts: { pts: number[]; life: number }[] = [];
  /** 缚妖索的绳子：一串点（从主角开始） */
  private ropes: { pts: number[]; life: number }[] = [];
  private shieldImg!: Phaser.GameObjects.Image;
  private telegraphs: { x: number; y: number; r: number; life: number; max: number; round?: boolean; color?: number }[] = [];
  // ───── 夜探 ─────
  private raid: Raid | null = null;
  private town: Town | null = null;
  private rhud: RaidHud | null = null;
  private guardXY: number[] = [];
  private arenaW = ARENA.w;
  private bump = new Bump();
  /** 香火区：这局提示过没有、上次冒金点的时间 */
  /** 火区的画面（只有乱葬岗、窑镇有） */
  private fireView: FireView | null = null;
  private fireTold = false;
  private incenseTold = false;
  private incenseFx = 0;
  private arenaH = ARENA.h;
  /** 地面层的圈（门圈）：画在影子下面，站在圈里的主角和怪盖在它上面 */
  private rg!: Phaser.GameObjects.Graphics;
  private chestViews: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image | null; open: boolean }[] = [];
  private gateViews: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; open: boolean }[] = [];
  private gd = newGuide();
  /** 鬼市的三个摊子（开市时建，收市时拆）：棚、货的图标、价钱、灯笼光 */
  /** 宝库的封条（金箱上的交叉符纸） */
  private sealImg: Phaser.GameObjects.Image | null = null;
  /** 宝库上方的一行字：还差多久开封 / 可以搜了 / 要钥匙（走近了才显示） */
  private sealText: Phaser.GameObjects.Text | null = null;
  private gdAt = -99;
  private gdMask = -1;
  private trailG: Phaser.GameObjects.Graphics | null = null;
  private trailHinted = false;
  /** 守卫头上的"!"：跟着那只怪走 */
  private alerts: { slot: number; gen: number; life: number; img: Phaser.GameObjects.Image }[] = [];
  /** 捡到宝物的飘字（图标 + 名字） */
  private floats: { img: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; x: number; y: number; life: number }[] = [];
  private bossShown = false;
  private renderX = 0;
  private renderY = 0;
  private walk = 0;
  private stepAcc = 0;
  private footSide = 1;
  private comboN = 0;
  private comboAt = 0;
  private milestone = 0;
  private pickupChain = 0;
  private pickupAt = 0;
  private lowBeat = 0;
  /** 技能：教学局里按钮出现时说过一句了；上一帧是不是好了（好了响一声用） */
  private skillTold = false;
  private skillWasReady = true;
  private hitSfxAt = 0;
  private lastMinute = -1;
  private bossOn = false;
  /** 画皮：缠丝圈（画在地面层）、混迹时头顶的红丝、这一帧有没有画红丝、挨第一下后的红闪截止时刻、提示过没有 */
  private silkG: Phaser.GameObjects.Graphics | null = null;
  private silkImg: Phaser.GameObjects.Image | null = null;
  private huapiSilkSeen = false;
  private huapiRedUntil = 0;
  private huapiHinted = false;
  /** 这一局弹过卡片了（第一局只有第一次带说明） */
  private cardsSeen = false;
  private now = 0;

  /** 本局经历的夜事，结算页「今晚」一行读它 */
  readonly nightLog: NightLog = newNightLog();

  constructor() {
    super('game');
  }

  init(d: GameDeps): void {
    this.d = d;
    this.w = d.world;
  }

  /** 手机震动：跟「震屏」开关，只在触屏且页面可见时震 */
  /** 主角起步 / 停步的挤压拉伸：突变后指数回 0（正 = 拉长，负 = 压扁） */
  private squashV = 0;
  private wasWalking = false;

  private haptics = browserHaptics(() => this.d.shake());

  private shake(ms: number, k: number): void {
    if (this.d.shake()) this.cameras.main.shake(ms, k);
  }

  /** 出战角色的对局图名 */
  private get heroFrame(): string {
    return heroKey(this.w.setup.character ?? 'xiaodao');
  }

  private frame(key: string): Frame {
    return this.frames.get(key) ?? this.frames.get(MOB_FALLBACK[key] ?? 'glow')!;
  }

  private img(key: string, x = 0, y = 0, scale = 1): Phaser.GameObjects.Image {
    const f = this.frame(key);
    return this.add.image(x, y, f.tex ?? 'atlas', f.key).setOrigin(f.ox, f.oy).setScale(scale / f.res);
  }

  create(): void {
    this.raid = this.w.raid;
    this.arenaW = this.w.arenaW;
    this.arenaH = this.w.arenaH;
    this.frames = new Map(this.d.atlas.frames);
    const tex = this.textures.exists('atlas') ? this.textures.get('atlas') : this.textures.addCanvas('atlas', this.d.atlas.canvas)!;
    for (const f of this.frames.values()) if (!tex.has(f.key)) tex.add(f.key, 0, f.x, f.y, f.w, f.h);
    const tm = this.textures.exists(MOB_TEX) ? this.textures.get(MOB_TEX) : this.textures.addCanvas(MOB_TEX, this.d.mobAtlas.canvas)!;
    for (const f of this.d.mobAtlas.frames.values()) {
      this.frames.set(f.key, f);
      if (!tm.has(f.key)) tm.add(f.key, 0, f.x, f.y, f.w, f.h);
    }
    const ha = peekHeroAtlas();
    if (ha) {
      const th = this.textures.exists(HERO_TEX) ? this.textures.get(HERO_TEX) : this.textures.addCanvas(HERO_TEX, ha.canvas)!;
      for (const f of ha.frames.values()) {
        this.frames.set(f.key, f);
        if (!th.has(f.key)) th.add(f.key, 0, f.x, f.y, f.w, f.h);
      }
    }
    if (this.raid && this.d.raidAtlas) {
      const t8 = this.textures.exists(RAID_TEX) ? this.textures.get(RAID_TEX) : this.textures.addCanvas(RAID_TEX, this.d.raidAtlas.canvas)!;
      for (const f of this.d.raidAtlas.frames.values()) {
        this.frames.set(f.key, f);
        if (!t8.has(f.key)) t8.add(f.key, 0, f.x, f.y, f.w, f.h);
      }
    }
    const cam = this.cameras.main;
    cam.setZoom(this.d.zoom);
    cam.setBackgroundColor('#dfe4ee');
    cam.setBounds(-200, -200, this.arenaW + 400, this.arenaH + 400);

    // 雪地：一张可平铺的贴图铺满场地，四周一圈压暗当边界
    const gtex = this.textures.get('ground').getSourceImage() as HTMLCanvasElement;
    // 夜探的街和院子全由 Town 铺满，不再多铺一层雪地（少一次全屏绘制，镇子外圈露出背景的雪色）
    const mapDef = MAPS[this.w.setup.map ?? 'snow'];
    this.groundPainter = new GroundPainter(this, this.w, this.raid, this.arenaW, this.arenaH, { img: (k, x, y, sc) => this.img(k, x, y, sc), hasFrame: (k) => this.frames.has(k), onStreet: (x, y) => this.town?.onStreet(x, y) ?? false });
    this.bambooView = new BambooView(this, this.w);
    // 省内存设备（手机 GPU 弱）上有地形的图：雪地和地形先合成一张不透明的图，整屏只画一遍；其余照旧平铺雪地 + 地形叠层
    if (!this.raid && !(LOW_MEMORY && this.groundPainter.paintBakedGround(gtex, mapDef))) {
      this.add.tileSprite(this.arenaW / 2, this.arenaH / 2, this.arenaW + 400, this.arenaH + 400, 'ground').setTileScale(512 / gtex.width).setDepth(-1000).setTint(GROUND_TINT[mapDef.tone ?? 'snow']);
      this.groundPainter.paintTerrainLayer();
    }
    this.rg = this.add.graphics().setDepth(-500);
    if (!this.raid) drawArenaWall(this, this.arenaW, this.arenaH, mapDef);
    if (this.raid) {
      this.setupRaid(this.raid);
      this.rhud = new RaidHud(this.d.hud.root, this.d.hud.bagBox, makeIcons(this.d.raidAtlas ?? this.d.atlas), this.raid.map);
      this.events.once(Phaser.Scenes.Events.DESTROY, () => {
        this.rhud?.destroy();
        this.town?.destroy();
      });
      // 第一次夜探（教学镇）：开局一句话说清要干什么，几秒后自己收起
      if (this.raid.teach) {
        // 先说清这是练手的小镇子（所有者试玩时觉得夜探太小），再说玩法
        setTimeout(() => this.d.banners.say('教学镇', 'gold', 3000, '小镇子练手，下一局是 6,400 见方的大镇子'), 500);
        setTimeout(() => this.d.banners.say('搜宝箱 · 躲巡夜将 · 天亮前走门撤离', 'gold', 7000, '没撤出去背包全丢（教学镇例外：不丢）'), 3900);
      }
    }
    this.groundPainter.scatterDecor();
    this.drawBlocks();
    // 火区（乱葬岗的磷火地、窑镇的窑口）：没有火区的局不建
    if (this.w.fire.length) this.fireView = new FireView({ scene: this, frame: (k) => this.frame(k), lowMem: LOW_MEMORY }, this.w, this.raid ? 'kiln' : 'ghost');

    this.ground = new Fx(this, this.d.atlas, LOW_MEMORY ? 60 : 140);
    this.fx = new Fx(this, this.d.atlas, LOW_MEMORY ? 180 : 420);
    this.nums = new DamageNumbers(this, this.d.atlas, 30);
    this.foeView = new FoeView({
      scene: this,
      fx: this.fx,
      lowMem: LOW_MEMORY,
      telegraph: (x, y, r, ticks, color) => this.telegraphs.push({ x, y, r, life: 0, max: ticks * TICK_MS, round: true, color }),
      burst: (x, y, tint, size) => this.burst(x, y, tint, size),
      shake: (ms, k) => this.shake(ms, k),
      say: (title, sub) => this.d.banners.say(title, 'warn', 1800, sub),
      img: (key, x, y, scale) => this.img(key, x, y, scale),
    });
    this.stalls = new StallsView({
      scene: this,
      img: (key, x, y, scale) => this.img(key, x, y, scale),
      frame: (k) => this.frame(k),
      coins: () => this.w.coins,
      now: () => this.now,
    });
    if (window.matchMedia('(pointer: coarse)').matches) this.nums.scaleK = 1.2;
    this.gfx = this.add.graphics().setDepth(8000);
    this.arms = new ArmsFxView(this, this.fx, LOW_MEMORY);
    this.arms2 = new Arms2FxView(this, this.fx, LOW_MEMORY);
    this.items = new Items({
      scene: this,
      frame: (k) => this.frame(k),
      fx: this.fx,
      ground: this.ground,
      shake: (ms, k) => this.shake(ms, k),
      whiteFlash: () => this.d.banners.whiteFlash(),
      freeze: (ms) => {
        this.freeze = Math.max(this.freeze, ms);
      },
    });
    this.purseSeen = this.w.coinBy.purse;
    if (import.meta.env.DEV) this.debugItems();
    // 首领连战的演出（view/game/rush.ts）
    if (this.w.rush) {
      const show = new RushShow(
        {
          hudRoot: this.d.hud.root,
          banners: this.d.banners,
          haptics: this.haptics,
          shake: (ms, k) => this.shake(ms, k),
          freeze: (ms) => (this.freeze = Math.max(this.freeze, ms)),
          slow: (ms) => (this.slow = Math.max(this.slow, ms)),
          burst: (x, y, tint, size) => this.burst(x, y, tint, size),
        },
        this.w,
      );
      this.rushShow = show;
      this.events.once(Phaser.Scenes.Events.DESTROY, () => show.destroy());
    }
    // 本周夜事挑战：计时下面挂一块小牌，打着的时候也看得出是挑战局、这周是什么规矩（原来只有暂停面板里写）
    const weekly = this.w.setup.weekly;
    if (weekly) {
      const chip = document.createElement('div');
      chip.className = 'yx-weekchip';
      chip.innerHTML = `<b>本周夜事</b><span>${WEEKLIES[weekly].name}</span>`;
      this.d.hud.root.append(chip);
      this.events.once(Phaser.Scenes.Events.DESTROY, () => chip.remove());
    }

    this.aura = this.img('aura', 0, 0, 1).setAlpha(0.9);
    this.heroShadow = this.img('shadow', 0, 0, 1.1).setAlpha(0.9);
    this.lookAura = this.d.aura ? new LookAura(this, this.d.aura.color, this.d.aura.edge) : null;
    // 主角外面再描一圈：同一张图涂成墨色、放大一点垫在后面，轮廓更粗、在怪堆里一眼找得到
    this.heroBack = this.img(this.heroFrame).setTint(0x17131c).setTintMode(Phaser.TintModes.FILL);
    this.hero = this.img(this.heroFrame);
    const line = CHARACTERS[this.w.setup.character ?? 'xiaodao'].line;
    // 中文没有空格，默认按空格折行等于不折：要 useAdvancedWrap 才按字折；宽 160 是 390 竖屏主角居中时右边不碰法器栏的上限
    this.bubble = this.add
      .text(0, 0, line, { fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#2a1f14', backgroundColor: '#fff6dc', padding: { x: 8, y: 5 }, wordWrap: { width: 160, useAdvancedWrap: true }, align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(9300);
    this.bubbleUntil = this.now + 3600;
    this.d.hud.setFace(this.d.icon(faceKey(this.w.setup.character ?? 'xiaodao')));
    // 金钟罩：有护盾时罩在主角身上（半透明，前面）
    this.shieldImg = this.img('goldbell', 0, 0, 1).setVisible(false);
    this.mobs = new Array(MAX_ENEMIES).fill(null);
    this.shotsView = new ShotsView({ scene: this, frame: (k) => this.frame(k), hasFrame: (k) => this.frames.has(k), fx: this.fx });
    this.dropsView = new DropsView({ scene: this, frame: (k) => this.frame(k) });
    this.renderX = this.w.x;
    this.renderY = this.w.y;
    cam.centerOn(this.w.x, this.w.y);
    music.start('night');
    music.setIntensity(0);
  }

  /**
   * 开发预览（只在 dev 构建里有，截图 / 调试用）：?debugitems=row 在主角旁摆一排新图标；
   * =bomb / purse / prop0 / prop1 / chest1 / chest3 / chest5 / chest57（进化 + 合成 + 升级同箱）在开局 1.5 秒后触发对应演出（不动核心状态，只放画面）。
   */
  private debugItems(): void {
    const what = new URLSearchParams(location.search).get('debugitems');
    if (!what) return;
    const { x, y } = this.w;
    if (what === 'row') {
      const put = (key: string, dx: number, dy: number, sc = 1): void => {
        this.img(key, x + dx, y + dy, sc).setDepth(y + dy);
      };
      put('drop_bomb', -120, -80);
      put('drop_purse', -60, -80);
      put('prop_lantern', 40, -80, 0.85);
      put('prop_paper', 120, -80, 0.85);
      put('chest', -90, 40, 1.2);
      put('coin', -40, 40);
      put('bun', 0, 40);
      return;
    }
    // &debugat=毫秒：等多久再放（默认 1.5 秒；截图脚本在开局约 3.5 秒后截，机器慢时可以调）
    this.time.delayedCall(Number(new URLSearchParams(location.search).get('debugat') ?? 1500), () => {
      if (what === 'bomb') this.items.bombBlast(x, y, 520);
      else if (what === 'purse') {
        sfx.play('purse');
        this.items.floatText(x, y - 74, '+19 铜钱', '#ffd23a');
        this.burst(x, y - 30, 0xffc928, 1.3);
      } else if (what === 'prop0' || what === 'prop1') this.items.propBreak(x + 60, y - 30, what === 'prop0' ? 0 : 1, 3);
      else if (what.startsWith('chest')) {
        // chest57：一个箱子结出 1 个进化 + 2 个合成 / 双修 + 3 个升级（规则 57 的样子）
        const mix = what === 'chest57';
        const n = mix ? 3 : Number(what.slice(5));
        this.items.chestBig(x, y, n);
        const codes = mix ? [0, MERGE_CODE + 24, MERGE_CODE + 0, 1, 100, 2] : n >= 5 ? [0, 1, 100, 101, 2] : n >= 3 ? [0, 100, 2] : [0];
        this.onChests(codes, n, codes.map((_, k) => mix && k === 0));
      }
    });
  }

  /** 地图上挡路的东西（义庄的墙、棺材、正堂）：墙按段拼，最后一段压缩到刚好对齐；深度按脚底 */
  private drawBlocks(): void {
    // 夜探的院墙、房子、台阶墙、摊子由 Town 按样式画（town.ts）
    if (this.town) {
      this.town.drawBlocks();
      return;
    }
    this.bambooView.build();
    for (const b of this.w.blocks) {
      if (b.look === 'wall_h') {
        const n = Math.max(1, Math.round(b.w / 80));
        const step = b.w / n;
        for (let k = 0; k < n; k++) this.img('wall_h', b.x + step * (k + 0.5), b.y + b.h).setScale(step / 80 / this.frame('wall_h').res, 1 / this.frame('wall_h').res).setDepth(b.y + b.h);
      } else if (b.look === 'wall_v') {
        const n = Math.max(1, Math.round(b.h / 80));
        const step = b.h / n;
        for (let k = 0; k < n; k++) this.img('wall_v', b.x + b.w / 2, b.y + step * (k + 1)).setScale(1 / this.frame('wall_v').res, step / 80 / this.frame('wall_v').res).setDepth(b.y + step * (k + 1));
      } else if (b.look === 'coffin') this.coffins.set(this.w.allBlocks.indexOf(b), this.img('coffin', b.x + b.w / 2, b.y + b.h + 4).setDepth(b.y + b.h));
      else if (b.look === 'stall') this.img('stall', b.x + b.w / 2, b.y + b.h + 4).setDepth(b.y + b.h);
      else if (b.look === 'gstall') this.img('gstall', b.x + b.w / 2, b.y + b.h + 6).setDepth(b.y + b.h);
      // 乱葬岗的坟包：两种（插木牌、立石碑）按位置轮换，一半左右翻
      else if (b.look === 'grave') {
        const v = (b.x * 7 + b.y * 13) | 0;
        this.img(v % 3 === 0 ? 'grave2' : 'grave', b.x + b.w / 2, b.y + b.h + 4).setDepth(b.y + b.h).setFlipX(v % 2 === 0);
      }
      else if (b.look === 'terrace') {
        const n = Math.max(1, Math.round(b.w / 80));
        const step = b.w / n;
        const f = this.frame('terrace_h');
        for (let k = 0; k < n; k++) this.img('terrace_h', b.x + step * (k + 0.5), b.y + b.h).setScale(step / 80 / f.res, 1 / f.res).setDepth(b.y + b.h);
      } else if (b.look === 'river') continue;
      else if (b.look === 'bamboo') continue;
      else if (b.look === 'censer') {
        const f = this.frame('censer');
        this.img('censer', b.x + b.w / 2, b.y + b.h + 6).setScale(1 / f.res).setDepth(b.y + b.h);
      } else if (b.look === 'rock') {
        const f = this.frame('rock');
        this.img('rock', b.x + b.w / 2, b.y + b.h + 6).setScale(Math.max(b.w, 56) / 60 / f.res, 1 / f.res).setDepth(b.y + b.h);
      } else this.img('hall', b.x + b.w / 2, b.y + b.h).setDepth(b.y + b.h);
    }
  }


  /** 夜探场地的地面：街和院子的铺地、河、桥由 Town 分块预渲染；这里摆宝箱和门 */
  private setupRaid(raid: Raid): void {
    this.town = new Town(this, raid, { img: (key, x, y, scale) => this.img(key, x, y, scale), res: (key) => this.frame(key).res, lowMem: LOW_MEMORY });
    this.town.prepare(this.w.x, this.w.y);
    const sh = this.frame('shadow');
    for (const c of raid.map.chests) {
      this.add.image(c.x, c.y + 14, 'atlas', 'shadow').setScale(0.8 / sh.res).setDepth(-400).setAlpha(0.8);
      const img = this.img(`chest_${c.tier}`, c.x, c.y + 14).setDepth(c.y + 14);
      const glow = c.tier === 'wood' ? null : this.img('haze', c.x, c.y - 4, c.tier === 'gold' ? 2 : 1.4).setTint(c.tier === 'gold' ? 0xffd860 : 0xffa860).setDepth(c.y + 13);
      this.chestViews.push({ img, glow, open: false });
    }
    if (raid.vault >= 0) {
      const c = raid.map.chests[raid.vault]!;
      this.sealImg = this.img('seal', c.x, c.y + 4).setDepth(c.y + 16);
      this.sealText = this.add
        .text(c.x, c.y - 70, '', { fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffe08a', stroke: '#17131c', strokeThickness: 6 })
        .setOrigin(0.5, 1)
        .setResolution(2)
        // 压在特效上面（法器的光圈、火团很大，按 y 排会被盖住看不清）
        .setDepth(1_000_000)
        .setVisible(false);
    }
    for (const g of raid.map.gates) {
      const foot = g.y - 50;
      const img = this.img('gate_closed', g.x, foot).setDepth(foot);
      const glow = this.img('haze', g.x, foot - 56, 4.4).setTint(0xffe08a).setDepth(foot - 1).setVisible(false);
      const label = this.add
        .text(g.x, foot - 112, g.name, { fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#f6efdc', stroke: '#17131c', strokeThickness: 6 })
        .setOrigin(0.5, 1)
        .setResolution(2)
        .setDepth(9100);
      this.gateViews.push({ img, glow, label, open: false });
    }
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.d.input.reset();
  }

  /** 每帧脚本耗时（毫秒，滑动平均），冒烟里读 */
  cost = 0;

  override update(_t: number, delta: number): void {
    const t0 = performance.now();
    this.frameUpdate(delta);
    this.cost += (performance.now() - t0 - this.cost) * 0.05;
  }

  private frameUpdate(delta: number): void {
    // dev 预览：&slowmo=N 把画面时间放慢 N 倍，机器慢、截图间隔长时能截到特效的各个阶段
    const dt = Math.min(delta, 100) / SLOWMO;
    this.now += dt;
    if (this.d.drive) {
      if (!this.paused && this.w.phase !== 'over') this.d.drive(dt, () => this.readEvents());
    } else if (!this.paused && !this.d.cards.open) {
      if (this.freeze > 0) this.freeze -= dt;
      else if (this.hold > 0) this.hold -= dt;
      else if (this.w.phase === 'play') {
        if (this.slow > 0) this.slow -= dt;
        this.acc += this.slow > 0 ? dt * SLOW_K : dt;
        let n = 0;
        while (this.acc >= TICK_MS && n < 4) {
          this.acc -= TICK_MS;
          n++;
          this.tick();
          if (this.w.phase !== 'play' || this.freeze > 0 || this.hold > 0) {
            this.acc = Math.min(this.acc, TICK_MS);
            break;
          }
        }
      } else if (this.w.phase === 'choose') this.openCards();
    }
    // 选卡开着时还剩几次可能变（选的那一拍又吸到魂火）：标题跟着改
    if (this.d.cards.open) this.d.cards.setLeft(this.w.pendingLevels);
    this.draw(dt);
  }

  private tick(): void {
    const a = this.d.autopilot?.(this.w);
    const dir = a ? a.dir : this.d.input.dir();
    // 技能键：教学局（第一局还没升过级）不开，回放不走这里
    // 手按的照常取走（清掉标记）；"自动放技能"开着、就绪且附近有怪时当作按了（回放不走这里）
    // 锁着时也要取走按键，否则 skillLatch 留着，一解锁就自己放出去
    const wanted = this.d.input.takeSkill();
    // 还没解锁就按了键：技能位闪一下「2 级解锁」，别让人以为按键坏了
    if (wanted && !a && this.skillLocked()) this.d.hud.flashSkillLocked();
    let skill = a || this.skillLocked() ? 0 : wanted;
    if (!skill && !a && !this.d.drive && !this.skillLocked() && wantAutoSkill(this.w, autoSkillSetting.on)) skill = 1;
    this.bump.before(this.w, dir);
    this.advance(dir, -1, skill);
    if (!a) this.onBump(this.bump.after(this.w, this.time.now, this.w.stats.speed));
    this.onIncense();
    this.readEvents();
    if (this.w.phase === 'choose') {
      // 升级演出：先"叮 + 光柱" 0.3 秒再弹卡片（手感清单第 5 条）
      this.hold = 300;
    }
    if (this.w.phase === 'over') {
      music.stop();
      this.time.delayedCall(this.w.won ? 1200 : 900, () => this.d.onEnd(this.w));
    }
  }

  /** 顶着墙走：接触点冒一小撮火星、亮一圈，轻震一下（震屏开关照旧管） */
  private onBump(b: { x: number; y: number; cx: number; cy: number } | null): void {
    if (!b) return;
    for (let n = 0; n < (LOW_MEMORY ? 3 : 6); n++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn({ frame: 'spark', x: b.x, y: b.y - 16, life: 260, vx: -b.cx * 120 + Math.cos(a) * 90, vy: -b.cy * 120 + Math.sin(a) * 90, s0: 0.9, s1: 0.2, tint: 0xffd36a, rot: Math.random(), depth: 60 });
    }
    this.fx.spawn({ frame: 'ring', x: b.x, y: b.y - 16, life: 260, s0: 0.15, s1: 0.45, a0: 0.9, a1: 0, tint: 0xfff1c0, depth: 60 });
    this.shake(70, 0.0025);
  }

  /** 站在香火区里：第一次进来说一句规矩，之后每隔一会儿从脚下冒几点金光（回血看得见） */
  private onIncense(): void {
    if (!this.w.inIncense) return;
    if (!this.incenseTold) {
      this.incenseTold = true;
      this.d.banners.say('香火', 'gold', 2200, '站着慢慢回血，可香火会引来更多怪');
    }
    const now = this.time.now;
    if (now < this.incenseFx) return;
    this.incenseFx = now + 450;
    for (let n = 0; n < (LOW_MEMORY ? 1 : 3); n++) this.fx.spawn({ frame: 'mote', x: this.w.x + (Math.random() - 0.5) * 40, y: this.w.y - 10, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 40, life: 700, s0: 0.9, s1: 0.3, tint: 0xffc84a, depth: 55 });
  }

  /** 推一拍：所有 step 都从这里走，前后钩子才不会漏 */
  private advance(dir: number, choice: number, skill = 0): void {
    this.d.beforeStep?.(this.w, dir, choice, skill);
    step(this.w, dir, choice, skill);
    this.d.afterStep?.(this.w);
  }

  private openCards(): void {
    if (this.d.cards.open) return;
    // 选卡时按下的技能键作废（不然关了卡片立刻放出去）
    this.d.input.takeSkill();
    const w = this.w;
    if (this.d.autopilot) {
      this.advance(0, this.d.autopilot(w).choice);
      this.readEvents();
      return;
    }
    this.d.cards.show(
      w.chestPicks > 0 ? 'chest' : w.level - (w.pendingLevels - w.chestPicks) + 1,
      w.choices.map((c) => describe(w, c)),
      this.d.firstRun && !this.cardsSeen,
      !!w.setup.firstRun,
      { rerolls: w.rerolls, bans: w.bans, left: w.pendingLevels },
      (i) => {
        this.cardsSeen = true;
        sfx.play('choose');
        this.advance(0, i);
        this.readEvents();
      },
    );
  }

  // ───────────────────────── 事件 → 特效和声音 ─────────────────────────

  private readEvents(): void {
    const ev = this.w.ev;
    this.arms.begin();
    this.arms2.begin();
    let hits = 0;
    const chestCodes: number[] = [];
    /** 和 chestCodes 一一对应：这一条是不是进化（同一件先升级后进化时，只有紧跟 Evolve 事件的那条算） */
    const chestEvo: boolean[] = [];
    let lastEvo = -9;
    let bigN = 0;
    for (let i = 0; i < ev.n; i++) {
      const x = ev.x[i]!;
      const y = ev.y[i]!;
      switch (ev.type[i]) {
        case Ev.Hit: {
          const b = ev.b[i]!;
          const crit = (b & 1) === 1;
          const slot = ev.c[i]!;
          const m = this.mobs[slot];
          if (m) this.onMobHit(m, slot, x, y);
          // 克制：打在怕的地方数字发橙红，被扛住发灰（不用读说明也看得出这怪吃不吃这一套）
          const tint = b & 2 ? 0xff6a2a : b & 4 ? 0x9a9aa8 : undefined;
          this.nums.show(x, y - 30 * (this.w.eSize[slot] ?? 1) - 14, ev.a[i]!, crit, tint, slot);
          if (crit) this.spark(x, y - 20, 0xffcf2e, 0.8);
          hits++;
          break;
        }
        case Ev.Kill:
          this.onKill(x, y, ev.a[i]!, ev.b[i] === 1, ev.c[i]!);
          break;
        case Ev.Block:
          this.spark(x, y, 0xf2c94c, 0.9);
          break;
        case Ev.Steal:
          // 黄鼠狼叼走铜钱：金色一闪 + 一声，追上打死双倍还
          sfx.play('coin');
          this.spark(x, y - 20, 0xf2c94c, 1);
          break;
        case Ev.Slash:
          this.slash(x, y, ev.a[i]!, ev.b[i]!, ev.c[i] === 1);
          break;
        case Ev.Thunder:
          this.thunder(x, y, ev.b[i]!, ev.c[i] === 1);
          break;
        case Ev.Chain:
          // 连锁雷：两只怪之间拉一道横着的电弧
          this.bolts.push({ pts: this.jagged(x, y - 20, ev.b[i]!, ev.c[i]! - 20, 6, 26), life: 220 });
          break;
        case Ev.Bell:
          this.fx.spawn({ frame: 'ring', x, y: y - 10, life: 420, s0: (ev.b[i]! * 2) / 128 * 0.6, s1: (ev.b[i]! * 2) / 128, a0: 0.75, a1: 0, tint: 0xe2b54a, depth: 50 });
          break;
        case Ev.Burst:
          // a = 2：试炼「怪死爆裂」，红色
          this.burst(x, y, ev.a[i] === 2 ? 0xd6452e : 0xf5b52e, ev.b[i]! / 34);
          break;
        case Ev.Wave:
          if (ev.a[i] === 0) this.ground.spawn({ frame: 'bagua', x, y, life: 600, s0: 0.6, s1: 1.5, a0: 0.9, a1: 0, rot: 0, spin: 2, ground: true });
          break;
        case Ev.Flame:
          this.flame(x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.Bind: {
          const n = ev.a[i]!;
          if (n === 0 || this.ropes.length === 0) this.ropes.push({ pts: [this.renderX, this.renderY - 24], life: 420 });
          this.ropes[this.ropes.length - 1]!.pts.push(x, y - 16);
          this.fx.spawn({ frame: 'ring', x, y: y - 10, life: 300, s0: 0.25, s1: 0.5, a0: 1, a1: 0, tint: 0xf2c94c });
          break;
        }
        case Ev.Petal:
          this.burst(x, y - 6, 0xff6fa8, 1.1);
          if (!LOW_MEMORY) for (let k = 0; k < 3; k++) this.fx.spawn({ frame: 'petal', x, y: y - 6, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 60, g: 300, life: 420, s0: 1.2, s1: 0.6, rot: Math.random() * 6, spin: 8 });
          break;
        case Ev.Shield:
          if (ev.a[i] === 0) {
            sfx.play('shieldBreak');
            this.fx.spawn({ frame: 'ring', x, y: y - 20, life: 450, s0: 0.4, s1: (ev.b[i]! * 2.2) / 128, a0: 1, a1: 0, tint: 0xf2c94c, depth: 60 });
            this.fx.spawn({ frame: 'goldbell', x, y: y + 6, life: 300, s0: 1, s1: 1.5, a0: 0.8, a1: 0, depth: this.renderY + 2 });
          } else {
            sfx.play('shieldUp', { volume: 0.5 });
            this.fx.spawn({ frame: 'ring', x, y: y - 20, life: 300, s0: 0.3, s1: 0.8, a0: 0.8, a1: 0, tint: 0xf2c94c });
          }
          break;
        case Ev.SkillUse:
        case Ev.SkillBeat:
        case Ev.SkillEnd:
          this.skillEvent(ev.type[i]!, x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.Fire: {
          const id = WEAPON_IDS[ev.a[i]!];
          const name = id ? FIRE_SFX[id] : undefined;
          if (name) sfx.play(name, { volume: 0.6 });
          break;
        }
        case Ev.Pickup:
          this.onPickup(x, y, ev.a[i]!, ev.b[i]!);
          break;
        case Ev.LevelUp:
          sfx.play('levelup');
          this.fx.spawn({ frame: 'pillar', x: this.w.x, y: this.w.y + 6, life: 600, s0: 0.6, s1: 1.2, a0: 1, a1: 0, depth: 7000, follow: undefined });
          this.fx.spawn({ frame: 'ring', x: this.w.x, y: this.w.y - 10, life: 500, s0: 0.3, s1: 2.2, a0: 1, a1: 0, tint: 0xffe08a, depth: 7000 });
          break;
        case Ev.Hurt:
          sfx.play('hurt');
          this.haptics.hurt();
          // 被围时每隔一会儿就挨一下，震屏会变成一直抖；改成主角红闪 + 屏幕边缘红晕
          this.d.banners.hurt();
          this.hero.setTint(0xff5a4a);
          this.time.delayedCall(150, () => this.hero.clearTint());
          // 只有单次伤害超过最大血 8% 的重击才给手感（60 毫秒顿帧 + 很小的震屏，跟随震屏开关）；小伤不变，免得被围时一直抖
          if (this.d.shake() && ev.a[i]! > this.w.stats.hpMax * 0.08) {
            this.freeze = Math.max(this.freeze, 60);
            this.shake(110, 0.003);
          }
          break;
        case Ev.ChestBig:
          // 先放光（档位由件数决定），升了什么由紧跟着的 Chest 事件收齐，循环结束后一起演
          bigN = ev.a[i]!;
          this.items.chestBig(x, y, bigN);
          break;
        case Ev.Evolve:
          lastEvo = ev.a[i]!;
          // 进化的圆圈在下面的 case 里画，这里只记下"紧跟着的那个 Chest 是进化"
          this.shake(180, 0.004);
          this.fx.spawn({ frame: 'ring', x: this.w.x, y: this.w.y - 20, life: 600, s0: 0.4, s1: 3, a0: 1, a1: 0, tint: 0xffd860, depth: 7000 });
          break;
        case Ev.Chest:
          chestCodes.push(ev.a[i]!);
          chestEvo.push(ev.a[i] === lastEvo);
          lastEvo = -9;
          break;
        case Ev.Prop:
          this.items.propBreak(x, y, ev.a[i]!, ev.b[i]!);
          break;
        case Ev.Chop:
          if (this.w.allBlocks[ev.a[i]!]?.look === 'coffin') this.coffinChop(ev.a[i]!, x, y, ev.c[i] === 1);
          else this.bambooView.chop(ev.a[i]!, x, y, ev.b[i]!, ev.c[i] === 1, this.fx);
          break;
        case Ev.Bomb:
          this.items.bombBlast(x, y, ev.b[i]!);
          break;
        case Ev.Merge: {
          // 合成：用这个合成自己的颜色炸一圈（三个双修各一种）
          const tint = parseInt(MERGES[ev.a[i]!]!.color.slice(1), 16);
          this.fx.spawn({ frame: 'ring', x, y: y - 20, life: 700, s0: 0.5, s1: 7, a0: 1, a1: 0, tint, depth: 60 });
          this.burst(x, y - 30, tint, 2.2);
          break;
        }
        case Ev.Paper: {
          // 纸兵倒下：碎纸片飘散；撒豆成兵炸开一圈金黄，鸣兵荡开一圈铃声
          const kind = ev.a[i]!;
          if (kind === 0) {
            for (let n = 0; n < (LOW_MEMORY ? 2 : 5); n++) this.fx.spawn({ frame: 'shard', x, y: y - 16, vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 80, g: 300, life: 480, s0: 1, s1: 0.6, tint: 0xf4d675, rot: Math.random() * 6, spin: 6 });
          } else {
            const tint = kind === 1 ? 0xf2c94c : 0x7fc0ff;
            this.fx.spawn({ frame: 'ring', x, y: y - 10, life: 320, s0: 0.3, s1: (ev.b[i]! * 2) / 128, a0: 0.9, a1: 0, tint, depth: 60 });
            if (kind === 1) this.burst(x, y - 12, 0xf4d675, ev.b[i]! / 40);
            else sfx.play('bell', { volume: 0.25, pitch: 1.3 });
          }
          break;
        }
        case Ev.Seal:
          if (ev.a[i] === 0) {
            // 贴符：怪头上一枚朱红小印
            this.spark(x, y - 28, 0xd0362e, 1.2);
          } else {
            this.burst(x, y - 14, 0xff5a4a, ev.b[i]! / 34);
            this.fx.spawn({ frame: 'ring', x, y: y - 10, life: 300, s0: 0.3, s1: (ev.b[i]! * 2) / 128, a0: 0.9, a1: 0, tint: 0xd0362e });
          }
          break;
        case Ev.Spring: {
          // 寒泉：冒出来一圈蓝；寒潭干了迸一圈冰碴；雷雨时电在泉面上乱窜
          const r = ev.b[i]!;
          const kind = ev.a[i]!;
          if (kind === 0) this.fx.spawn({ frame: 'ring', x, y, life: 360, s0: 0.2, s1: (r * 2) / 128, a0: 0.9, a1: 0, tint: 0x2f8fff, depth: 60 });
          else if (kind === 1) {
            this.burst(x, y - 6, 0x8fd8ff, r / 40);
            if (!LOW_MEMORY) for (let n = 0; n < 6; n++) this.fx.spawn({ frame: 'shard', x, y: y - 8, vx: (Math.random() - 0.5) * 260, vy: -80 - Math.random() * 120, g: 360, life: 460, s0: 1.1, s1: 0.6, tint: 0xcfefff, rot: Math.random() * 6, spin: 8 });
          } else {
            for (let n = 0; n < (LOW_MEMORY ? 2 : 4); n++) {
              const a = Math.random() * Math.PI * 2;
              this.bolts.push({ pts: this.jagged(x, y, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, 4, 12), life: 200 });
            }
            this.fx.spawn({ frame: 'ring', x, y, life: 300, s0: (r * 1.6) / 128, s1: (r * 2.2) / 128, a0: 0.9, a1: 0, tint: 0x55c8ff, depth: 60 });
          }
          break;
        }
        case Ev.FireRing:
          this.fx.spawn({ frame: 'ring', x, y: y - 8, life: 380, s0: ((ev.b[i]! * 2) / 128) * 0.8, s1: (ev.b[i]! * 2) / 128, a0: 0.8, a1: 0, tint: 0xff8a2a, depth: 60 });
          break;
        case Ev.Arrive:
          // 夜探里守卫开局就在场上，出场横幅和 Boss 音乐不放（守卫发现主角时由"!"和石兽的预警说话）
          // 连战的关底上场由 Ev.Rush 统一报（一关几只只报一次）
          if (!this.raid && !this.w.rush) this.onArrive(ev.a[i]!);
          break;
        case Ev.Rush:
          this.rushShow?.onEvent(this.w, x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.Huapi:
          this.onHuapi(x, y, ev.a[i]!, ev.b[i]!);
          break;
        case Ev.Foe:
          this.foeView.onEvent(x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.GateOpen:
          this.onGateOpen(x, y, ev.a[i]!);
          break;
        case Ev.GateClose:
          this.d.banners.say(`${this.raid!.map.gates[ev.a[i]!]!.name}关了`, 'ink', 1600);
          break;
        case Ev.ChestOpen:
          this.onChestOpen(x, y, ev.b[i]!);
          break;
        case Ev.Loot:
          this.onLoot(x, y, ev.a[i]!, ev.b[i]!);
          break;
        case Ev.Escape:
          sfx.play('extract');
          this.fx.spawn({ frame: 'ring', x, y, life: 700, s0: 0.5, s1: (GATE.r * 2.4) / 128, a0: 1, a1: 0, tint: 0xf2c94c, depth: 6000 });
          this.d.banners.say('撤出了', 'gold', 2400);
          break;
        case Ev.Dawn:
          if (ev.a[i] === 0) this.d.banners.say('还剩 1 分钟天亮', 'warn', 2400, '找到开着的门，撤出去');
          else {
            sfx.play('heartbeat', { volume: 0.8 });
            this.d.banners.say('最后 30 秒', 'warn', 2000, '天亮还在镇里，就迷失了');
          }
          break;
        case Ev.Lost:
          sfx.play('death');
          this.haptics.down();
          this.d.banners.say('天亮了 · 没能撤出去', 'warn', 2400);
          break;
        case Ev.Alert:
          this.onAlert(ev.a[i]!, ev.c[i]!);
          break;
        case Ev.Beast:
          this.onBeast(x, y, ev.a[i]!, ev.b[i]!);
          break;
        case Ev.Restock:
          this.onRestock(x, y, ev.a[i]!, ev.b[i]!);
          break;
        case Ev.Goblin:
          this.onGoblin(x, y, ev.a[i]!);
          break;
        case Ev.Skip: {
          // 跳过选卡拿到的小奖飘一句（content/picks.ts 的顺序）
          const n = ev.b[i]!;
          const say = [`铜钱 +${n}`, `回血 +${n}`, '下次升级多一张卡', '刷新 +1'][ev.a[i]!];
          if (say) this.d.banners.say(say, 'gold', 1600, '跳过的小奖');
          break;
        }
        case Ev.Reroll:
          this.d.banners.say('刷新 +1', 'gold', 1400, ev.a[i] === 0 ? '进化补一次' : ev.a[i] === 2 ? `攒满 ${CHAR_FX.huolangRerollEvery} 枚铜钱` : '打倒精英补一次');
          break;
        case Ev.NightMarket:
          this.onNightMarket(x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.Market:
          this.onMarket(x, y, ev.a[i]!, ev.b[i]!);
          break;
        case Ev.Key:
          sfx.play('pickup');
          this.burst(this.w.x, this.w.y - 40, 0xffd23a, 1.4);
          this.d.banners.say('拿到宝库钥匙', 'gold', 2600, this.w.tick < RAID_LATE.vault.at ? `离天亮 ${raidClock(RAID_LATE.vault.at)} 宝库开封，到时去贴着封条的金箱` : '去贴着封条的金箱，站一会儿就能搜');
          break;
        case Ev.Vault:
          sfx.play('gateOpen', { volume: 0.8 });
          this.fx.spawn({ frame: 'ring', x, y, life: 900, s0: 0.5, s1: 3, a0: 1, a1: 0, tint: 0xffd23a, depth: 60 });
          if (ev.b[i] === 1) this.d.banners.say('宝库开封了', 'gold', 2600, '去贴着封条的金箱，站一会儿就能搜');
          else this.d.banners.say('宝库开封了', 'warn', 3000, '要钥匙：打倒精英或守卫掉');
          break;
        case Ev.Roamer:
          this.onRoamer(x, y);
          break;
        case Ev.Boss:
          this.onBoss(x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.Mob:
          this.onMob(x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.MapEvent:
          noteNight(this.nightLog, Ev.MapEvent, ev.a[i]!, MAP_EVENT_KINDS[ev.b[i]!]);
          this.onMapEvent(ev.a[i]!, ev.b[i]!, ev.c[i]!);
          break;
        case Ev.BloodMoon: {
          const a = ev.a[i]!;
          noteNight(this.nightLog, Ev.BloodMoon, a);
          if (a === 0) this.d.banners.say('血月', 'warn', 2600, '怪一阵阵发疯', 'blood');
          else {
            this.d.banners.setBlood(a === 1);
            if (a === 1) {
              this.shake(260, 0.004);
              sfx.play('bloodMoon');
              this.haptics.alert();
            }
          }
          break;
        }
        case Ev.EliteRage:
          noteNight(this.nightLog, Ev.EliteRage, 0);
          this.onRage(x, y);
          break;
        case Ev.End:
          if (this.raid) {
            // 夜探：撤出、迷失的提示在 Escape / Lost 里放过了，这里只补倒下的声音
            if (ev.a[i] !== 1 && this.raid.outcome === 'dead') {
              sfx.play('death');
              this.shake(320, 0.008);
              this.haptics.down();
            }
            break;
          }
          if (this.w.rush) {
            // 连战：全清的演出在 Ev.Rush 里放过了，这里只补倒下、到点的声音
            if (ev.a[i] !== 1) {
              sfx.play('death');
              this.haptics.down();
              this.d.banners.say(this.w.hp <= 0 ? '倒下了' : '时间到', 'warn', 2400, `连战 ${this.w.rushDown}/${this.w.rush.total}`);
            }
            break;
          }
          sfx.play(ev.a[i] === 1 ? 'dawn' : 'death');
          if (ev.a[i] !== 1) this.shake(320, 0.008);
          if (ev.a[i] !== 1) this.haptics.down();
          else if (ev.b[i] === 1) this.haptics.big();
          if (ev.a[i] === 1) this.d.banners.say(ev.b[i] === 1 ? '尸王伏诛 · 天亮了' : '天亮了', 'gold', 2400);
          break;
        default:
          // 2.0 第一批法器和搭配的事件（编号 80 起）
          if (!this.arms.handle(ev.type[i]!, x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!, this.renderX, this.renderY)) this.arms2.handle(ev.type[i]!, x, y, ev.a[i]!, ev.b[i]!, ev.c[i]!, this.renderX, this.renderY);
      }
    }
    if (chestCodes.length > 0) this.onChests(chestCodes, bigN, chestEvo);
    // 命中音：一拍最多一个（几百只同时挨打也不吵），暴击单独
    if (hits > 0 && this.now - this.hitSfxAt > 45) {
      sfx.play('hit', { volume: Math.min(1, 0.4 + hits * 0.05) });
      this.hitSfxAt = this.now;
    }
  }

  private onKill(x: number, y: number, code: number, elite: boolean, slot: number): void {
    this.ghosts.spawn(this.frame(MOB_FRAME[code]!), x, y, this.w.eSize[slot] ?? 1, this.renderX);
    const tint = ENEMIES[code]?.tint ?? 0xffffff;
    const big = elite || code === 7;
    const n = LOW_MEMORY ? 4 : big ? 18 : 8;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (big ? 160 : 90) + Math.random() * 90;
      this.fx.spawn({
        frame: 'shard',
        x,
        y: y - 18,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.7 - 80,
        g: 420,
        life: 520 + Math.random() * 220,
        s0: big ? 2.2 : 1.5,
        s1: 0.8,
        a0: 1,
        a1: 0.2,
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 18,
        tint,
      });
    }
    this.ground.spawn({ frame: `ink${Math.floor(Math.random() * 3)}`, x, y, life: 2200, s0: big ? 1.6 : 0.7, s1: big ? 1.8 : 0.85, a0: 0.45, a1: 0, rot: Math.random() * 6, ground: true });
    this.burst(x, y - 16, tint, big ? 2 : 0.8);
    sfx.play('kill', { volume: 0.5 });
    // 精英常有，只留一小下顿帧；真正的大怪（code 7）才震屏
    if (big) {
      // 尸王倒下震得久一点；精英只轻轻一下
      this.shake(code === 7 ? 420 : 90, code === 7 ? 0.008 : 0.0025);
      this.freeze = Math.max(this.freeze, code === 7 ? 90 : 40);
    }
    // 连斩：2 秒内接着杀就一直涨
    if (this.now - this.comboAt > 2000) this.comboN = 0;
    this.comboN++;
    this.comboAt = this.now;
    if (this.comboN >= 10) this.d.hud.setCombo(this.comboN);
    const k = this.w.kills;
    // 里程碑只报跨过的最高一档（一拍里连杀很多时不会一口气弹好几条）
    let hit = 0;
    for (const m of [100, 500, 1000, 2000, 5000]) if (k >= m && this.milestone < m) hit = m;
    if (hit) {
      this.milestone = hit;
      this.d.banners.say(`${hit} 斩`, 'gold', 1500);
    }
  }

  private onPickup(x: number, y: number, kind: number, val: number): void {
    if (kind === Drop.Soul) {
      // 连吃音调递增（手感清单第 4 条）；停 0.6 秒以上从头来
      if (this.now - this.pickupAt > 600) this.pickupChain = 0;
      this.pickupAt = this.now;
      this.pickupChain = Math.min(this.pickupChain + 1, 24);
      sfx.play('pickup', { volume: 0.45, pitch: 1 + this.pickupChain * 0.04 });
      this.fx.spawn({ frame: 'mote', x, y, life: 180, s0: 0.8, s1: 0.2, tint: 0x8ff0c8 });
      // 被吸魂珠的拖尾：沿来路（背离主角）留三粒渐小渐淡的光点；省内存设备不画
      if (!LOW_MEMORY) {
        const dx = x - this.w.x;
        const dy = y - this.w.y;
        const d = Math.hypot(dx, dy) || 1;
        for (let k = 1; k <= 3; k++) {
          this.fx.spawn({ frame: 'mote', x: x + (dx / d) * k * 9, y: y + (dy / d) * k * 9, life: 150 + k * 60, s0: 0.7 - k * 0.12, s1: 0.1, a0: 0.8, tint: 0x8ff0c8 });
        }
      }
    } else if (kind === Drop.Coin) sfx.play('coin');
    else if (kind === Drop.Bun) {
      sfx.play('heal');
      // 回血数字飘在主角头上（绿色），不占屏幕中间的横幅
      this.nums.show(this.w.x, this.w.y - 70, val, false, 0x5fd38a);
    } else if (kind === Drop.Purse) {
      // 一串叮当 + 头上飘"+N 铜钱"；N 是核心现掷的，靠铜钱袋累计的差值得到
      sfx.play('purse');
      const got = this.w.coinBy.purse - this.purseSeen;
      this.purseSeen = this.w.coinBy.purse;
      if (got > 0) this.items.floatText(this.w.x, this.w.y - 74, `+${got} 铜钱`, '#ffd23a');
      this.burst(this.w.x, this.w.y - 30, 0xffc928, 1.3);
    } else if (kind === Drop.Bomb) {
      // 爆炸的音效、冲击圈、白闪、震屏都跟着同一拍的 Ev.Bomb 放，这里只给捡起一下的小反馈
      this.spark(this.w.x, this.w.y - 30, 0xff7a2a, 1.4);
    } else if (kind === Drop.Scroll) {
      sfx.play('pickup', { pitch: 1.6 });
      this.fx.spawn({ frame: 'ring', x: this.w.x, y: this.w.y, life: 600, s0: 0.5, s1: 8, a0: 0.8, a1: 0, tint: 0x8ff0c8, depth: 6000 });
    }
  }

  /** 一件结出来的东西：evo 进化、merge 双修 / 合成、up 升级（含被动和铜钱）；整屏演出和成组列表共用 */
  private chestInfo(code: number, evo: boolean): { icon: string; title: string; sub: string; kind: 'evo' | 'merge' | 'up'; tint?: string } {
    const w = this.w;
    if (code >= MERGE_CODE) {
      const m = MERGES[code - MERGE_CODE]!;
      const kind = m.dual ? '双修' : '合成';
      // 两段式：初成写打折和升大成还差什么；大成（一步到位或初成升上来）才空法器格
      if (w.mergeHalf.includes(m.id)) {
        const left = upgradeNeed(w, m);
        return { icon: m.icon, title: `${m.name}·初成`, sub: `${kind}初成！${m.desc}（效果减半）。${left.length ? `还差 ${left.join('、')} 升大成` : '下个宝箱升大成'}`, kind: 'merge', tint: m.color };
      }
      return { icon: m.icon, title: `${m.name}·大成`, sub: `${kind}大成！${m.desc}。空出一个法器格`, kind: 'merge', tint: m.color };
    }
    if (code >= 100) {
      const p = PASSIVES[PASSIVE_IDS[code - 100]!];
      return { icon: p.icon, title: p.name, sub: `Lv ${w.passives[p.id] ?? 0} · ${p.text}`, kind: 'up' };
    }
    if (code >= 0) {
      const id = WEAPON_IDS[code]!;
      const o = w.weapons.find((x) => x.id === id);
      const def = WEAPONS[id];
      if (evo && def.evolve) return { icon: def.evolve.icon, title: def.evolve.name, sub: `进化！${def.evolve.desc}`, kind: 'evo' };
      return { icon: def.icon, title: def.name, sub: o?.evolved ? '升了一级' : `升到 Lv ${o?.level ?? 1}`, kind: 'up' };
    }
    return { icon: 'coin', title: '铜钱一袋', sub: COIN_PICK_TEXT, kind: 'up' };
  }

  /**
   * 一个精英宝箱结出的东西。只有一件：整屏演出（点一下或 1.3 秒结束，期间不送拍）；
   * 两件以上：同一个展示里按进化 / 双修合成 / 升级分组列全，依次弹出排一排，不拦点击，只停一小会儿给光柱让位（核心不暂停）。
   */
  private onChests(codes: number[], big: number, evos: boolean[]): void {
    const infos = codes.map((c, k) => this.chestInfo(c, evos[k] === true));
    if (infos.length === 1) {
      sfx.play('chest');
      const it = infos[0]!;
      const grand = it.kind !== 'up';
      if (grand) {
        sfx.play('evolve');
        this.haptics.big();
        this.d.banners.whiteFlash();
      }
      if (this.d.autopilot) return;
      this.hold = 1e9;
      this.d.banners.reveal(this.d.icon(it.icon), it.title, it.sub, grand, () => {
        this.hold = 0;
        this.d.onChest?.();
      }, it.tint);
      return;
    }
    const tier = codes.length >= 5 ? 5 : 3;
    const of = (kind: 'evo' | 'merge' | 'up') => infos.filter((it) => it.kind === kind);
    const evo = of('evo'), mer = of('merge'), up = of('up');
    const mk = (list: typeof infos) => list.map((it) => ({ icon: this.d.icon(it.icon), name: it.title, tint: it.tint }));
    // 光效按核心说的件数（big），列表按实际收到的件数；一个箱子里有进化 / 合成时标题只说开箱
    const title = big >= 5 ? '五连宝箱！' : big >= 3 ? '三连宝箱' : '宝箱';
    this.d.banners.chestRow(
      [
        { kind: 'evo', label: `进化 ${evo.length} 件`, items: mk(evo) },
        { kind: 'merge', label: `双修 / 合成 ${mer.length} 个`, items: mk(mer) },
        { kind: 'up', label: `升级 ${up.length} 件`, items: mk(up) },
      ],
      title,
      tier,
    );
    // 每弹出一件叮一声，音调逐件升高；进化 / 合成再加一下（先进化、再合成、再升级，和列表的顺序一致）
    [...evo, ...mer, ...up].forEach((it, k) => {
      this.time.delayedCall(k * (tier === 5 ? 190 : 230) + 120, () => {
        sfx.play('pickup', { volume: 0.7, pitch: 1.2 + k * 0.14 });
        if (it.kind !== 'up') {
          sfx.play('evolve', { volume: 0.7 });
          this.d.banners.whiteFlash();
        }
      });
    });
    // 光柱出来的头一会儿停一停（件数多更久），再放开；演出本身继续留在屏幕上方
    if (!this.d.autopilot) this.hold = Math.max(this.hold, tier === 5 ? 520 : 300);
    this.d.onChest?.();
  }

  // ───────────────────────── 夜探的事件 ─────────────────────────

  /** 撤离指引：主角前方一段小箭头沿路线往门流动。画在地面层（depth −200，在屋顶、墙顶之下），点往离墙远的一侧推开 44px（墙的画面比碰撞脚印宽） */
  private drawTrail(raid: Raid, gd: ReturnType<typeof newGuide>): void {
    const g = (this.trailG ??= this.add.graphics().setDepth(-200));
    g.clear();
    const lit = this.town?.trail;
    if (lit) lit.length = 0;
    if (gd.gate < 0 || gd.trailN < 2) return;
    if (!this.trailHinted) {
      this.trailHinted = true;
      this.d.banners.say(`跟着箭头去${raid.map.gates[gd.gate]!.name}撤离`, 'gold', 3200);
    }
    const tr = gd.trail;
    const near = Math.max(0.85, Math.min(1, 1.3 - gd.dist / 1600));
    // 脚印点隔得远（约 3 格），沿折线每 STEP 单位摆一个箭头；相位按 dt 累加的时间走，朝门流动
    const STEP = LOW_MEMORY ? 110 : 80;
    const span = LOW_MEMORY ? 480 : 760;
    const phase = ((this.now * 0.05) % STEP) / STEP;
    const blocks = raid.map.blocks;
    // 折线从主角脚下开始，接上第一个脚印点
    let px0 = this.renderX, py0 = this.renderY;
    let walked = 0;
    let next = phase * STEP;
    for (let i = 0; i < gd.trailN && walked < span; i++) {
      const x1 = tr[i * 2]!, y1 = tr[i * 2 + 1]!;
      const dx = x1 - px0, dy = y1 - py0;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ux = dx / len, uy = dy / len;
      for (; next < len && walked + next < span; next += STEP) {
        let x = px0 + ux * next, y = py0 + uy * next;
        const dist = walked + next;
        for (const b of blocks) {
          if (x < b.x - 50 || x > b.x + b.w + 50 || y < b.y - 50 || y > b.y + b.h + 50) continue;
          const cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h));
          let ox = x - cx, oy = y - cy;
          const d = Math.hypot(ox, oy);
          if (d >= 44) continue;
          if (d < 0.5) { ox = x - (b.x + b.w / 2); oy = y - (b.y + b.h / 2); }
          const m = Math.hypot(ox, oy) || 1;
          const base = d < 0.5 ? 0 : d;
          x += (ox / m) * (44 - base);
          y += (oy / m) * (44 - base);
        }
        // 头尾淡入淡出，越靠近门越亮越大
        const fade = Math.min(1, dist / 60, (span - dist) / 160);
        // 填色不打折（打折后压在石板上发灰，和门牌的亮黄对不上），只在头尾淡出；越近门越大
        const a = Math.max(0, fade);
        const sz = (LOW_MEMORY ? 16 : 14 + 6 * (1 - dist / span)) * near;
        const px = -uy, py = ux;
        lit?.push(x, y, a);
        for (const [col, grow, al] of [[0x17131c, 3, 0.9], [0xffd23a, 0, 1]] as const) {
          const s2 = sz + grow;
          g.fillStyle(col, al * a);
          // 飞镖形：尖、左后角、尾凹、右后角
          const tx = x + ux * s2, ty = y + uy * s2;
          const lx = x - ux * s2 * 0.8 + px * s2 * 0.85, ly = y - uy * s2 * 0.8 + py * s2 * 0.85;
          const rx = x - ux * s2 * 0.8 - px * s2 * 0.85, ry = y - uy * s2 * 0.8 - py * s2 * 0.85;
          const nx = x - ux * s2 * 0.2, ny = y - uy * s2 * 0.2;
          g.fillTriangle(tx, ty, lx, ly, nx, ny);
          g.fillTriangle(tx, ty, nx, ny, rx, ry);
        }
      }
      next -= len;
      walked += len;
      px0 = x1;
      py0 = y1;
    }
  }

  private onGateOpen(x: number, y: number, k: number): void {
    sfx.play('gateOpen');
    this.d.banners.say(`${this.raid!.map.gates[k]!.name}开了`, 'gold', 2600, '站进门圈里 3 秒就能撤出去');
    this.fx.spawn({ frame: 'ring', x, y, life: 900, s0: 0.5, s1: (GATE.r * 2.6) / 128, a0: 1, a1: 0, tint: 0xf2c94c, depth: 60 });
    this.fx.spawn({ frame: 'pillar', x, y, life: 1100, s0: 1, s1: 1.3, a0: 0.9, a1: 0, tint: 0xffe08a, depth: 61 });
  }

  private onChestOpen(x: number, y: number, tier: number): void {
    sfx.play('chest', { volume: 0.8 });
    const tint = tier === 2 ? 0xffd860 : tier === 1 ? 0xffa860 : 0xe8d8b0;
    this.burst(x, y - 10, tint, tier === 2 ? 2 : tier === 1 ? 1.4 : 1);
    this.fx.spawn({ frame: 'ring', x, y, life: 420, s0: 0.3, s1: 1.8 + tier * 0.5, a0: 1, a1: 0, tint, depth: 60 });
  }

  /** 捡到宝物：图标和名字从箱子上飘起来，颜色按档；一次开出好几件就错开排 */
  private onLoot(x: number, y: number, code: number, tierIdx: number): void {
    const t = TREASURES[code]!;
    const info = TIER_INFO[TIERS[tierIdx]!];
    const hex = `#${info.color.toString(16).padStart(6, '0')}`;
    const n = this.floats.length;
    const f = this.frame(treasureIconKey(t.icon));
    const oy = -64 - n * 30;
    const img = this.add.image(x - 4, y + oy, f.tex ?? 'atlas', f.key).setScale(1.15 / f.res).setDepth(9200);
    const text = this.add
      .text(x + 8, y + oy, t.name, { fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', fontSize: '20px', fontStyle: 'bold', color: hex, stroke: '#17131c', strokeThickness: 5 })
      .setOrigin(0, 0.5)
      .setResolution(2)
      .setDepth(9200);
    this.floats.push({ img, text, x, y: y + oy, life: 1600 });
    sfx.play('coin', { pitch: 1 + tierIdx * 0.18 });
    this.burst(x, y + oy, info.color, 0.7 + tierIdx * 0.3);
    if (tierIdx === 3) this.d.banners.say(`绝品 · ${t.name}`, 'gold', 2200, t.blurb);
  }

  private onRestock(x: number, y: number, c: number, n: number): void {
    if (c < 0) {
      sfx.play('chest', { volume: 0.5 });
      this.d.banners.say(`补货了：${n} 个箱子又满了`, 'gold', 2400);
      return;
    }
    this.burst(x, y - 10, 0xffd860, 1);
    this.fx.spawn({ frame: 'ring', x, y, life: 500, s0: 0.3, s1: 1.6, a0: 1, a1: 0, tint: 0xffd860, depth: 60 });
  }

  private onGoblin(x: number, y: number, a: number): void {
    if (a === 0) {
      sfx.play('elite');
      this.d.banners.say('宝妖出来了', 'gold', 2600, '背着宝袋，追上打倒掉两件好宝物');
      this.fx.spawn({ frame: 'ring', x, y, life: 800, s0: 0.4, s1: 2.4, a0: 1, a1: 0, tint: 0xffc83a, depth: 60 });
    } else if (a === 1) {
      this.d.banners.say('宝妖钻地跑了', 'ink', 2000);
      this.burst(x, y, 0xb57d12, 1.4);
    } else {
      sfx.play('chestGold');
      this.burst(x, y - 10, 0xffc83a, 1.8);
      this.fx.spawn({ frame: 'ring', x, y, life: 600, s0: 0.3, s1: 2.2, a0: 1, a1: 0, tint: 0xffc83a, depth: 60 });
      this.d.banners.say('打倒宝妖！', 'gold', 2000);
    }
  }

  private onMarket(x: number, y: number, a: number, stall: number): void {
    if (a === 0) {
      sfx.play('bell');
      this.d.banners.say(`鬼市开了（离天亮 ${raidClock(RAID_LATE.market.to)} 收市）`, 'gold', 3000, '镇中心，拿身上的铜钱买宝物');
    } else if (a === 1) {
      this.d.banners.say('鬼市收了', 'ink', 2000);
    } else {
      sfx.play('purse');
      this.priceFloat(x, y, this.raid!.stallPrice[stall] ?? 0);
    }
  }

  /** 屏幕外的目标 (x, y)（世界坐标）→ 屏幕边上的箭头；在屏幕内返回 null */
  private edgeArrowTo(x: number, y: number, label: string): HudArrow | null {
    const cam = this.cameras.main;
    const cssW = this.scale.displaySize.width;
    const cssH = this.scale.displaySize.height;
    const k = cssW / (cam.width / cam.zoom);
    const gx = (x - cam.midPoint.x) * k, gy = (y - cam.midPoint.y) * k;
    const margin = 84;
    const hw = cssW / 2 - margin, hh = cssH / 2 - margin;
    if (gx > -hw && gx < hw && gy > -hh && gy < hh) return null;
    const len = Math.hypot(gx, gy) || 1;
    const dx = gx / len, dy = gy / len;
    const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
    return { x: cssW / 2 + dx * t, y: cssH / 2 + dy * t, dx, dy, label };
  }

  /** 守夜夜市（核心的 mk* 字段）：预告时摆虚影 + 屏幕边箭头，开市时摆摊、读条，临时增益小标签 */
  private drawNightMarket(): void {
    const w = this.w;
    if (this.raid) return;
    const secs = (n: number): number => Math.max(0, Math.ceil(n / 30));
    if (w.mkPhase === 0 || w.mkX.length === 0) {
      this.stalls.sync(null);
      this.d.hud.setMarketArrow(null);
      return;
    }
    const ghost = w.mkPhase === 1;
    const items: StallItem[] = [];
    for (let k = 0; k < w.mkX.length; k++) {
      const g = MARKET_GOODS[w.mkGood[k]!]!;
      items.push({ x: w.mkX[k]!, y: w.mkY[k]!, icon: MARKET_ICON[g], price: w.mkPrice[k]!, sold: w.mkSold[k] === 1, ghost, name: ghost ? undefined : MARKET_NAME[g] });
    }
    this.stalls.sync(items);
    if (!ghost && w.mkStall >= 0) {
      const p = w.mkHold / NIGHT_MARKET.hold;
      if (p > 0) this.progressBar(w.mkX[w.mkStall]!, w.mkY[w.mkStall]! - 108, Math.min(1, p), 0xffd23a);
    }
    // 摆在中间那一摊上，离屏幕太远时边上指个方向
    const mid = Math.min(1, w.mkX.length - 1);
    const left = ghost ? NIGHT_MARKET.at[w.mkIndex]! - w.tick : w.mkEnd - w.tick;
    this.d.hud.setMarketArrow(this.edgeArrowTo(w.mkX[mid]!, w.mkY[mid]!, ghost ? `夜市 · ${secs(left)} 秒后开` : `夜市 · 还剩 ${secs(left)} 秒`));
  }

  /** 义庄的棺材挨打：抖一下；碎了炸木片、删图（坐起的跳尸是核心刷的怪，自己会画） */
  private coffinChop(k: number, x: number, y: number, fell: boolean): void {
    const img = this.coffins.get(k);
    if (!img) return;
    if (!fell) {
      this.tweens.add({ targets: img, x: { from: img.x - 3, to: img.x }, duration: 120, ease: 'Sine.easeOut' });
      sfx.play('propWood', { pitch: 0.8, volume: 0.45 });
      return;
    }
    this.coffins.delete(k);
    img.destroy();
    sfx.play('coffinSmash');
    for (let n = 0; n < (LOW_MEMORY ? 3 : 8); n++) this.fx.spawn({ frame: 'shard', x: x + (Math.random() - 0.5) * 50, y: y - 14, vx: (Math.random() - 0.5) * 180, vy: -80 - Math.random() * 90, g: 320, life: 520, s0: 1, s1: 0.6, tint: 0x85613c, rot: Math.random() * 6, spin: 6 });
  }

  /** 夜市买的临时增益还剩多久，给顶栏小标签 */
  private buffText(): string | null {
    const w = this.w;
    const parts: string[] = [];
    if (w.mightUntil > w.tick) parts.push(`伤害 +${Math.round(NIGHT_MARKET.might * 100)}% ${Math.ceil((w.mightUntil - w.tick) / 30)} 秒`);
    if (w.speedUntil > w.tick) parts.push(`移速 +${Math.round(NIGHT_MARKET.speed * 100)}% ${Math.ceil((w.speedUntil - w.tick) / 30)} 秒`);
    const xf = this.xinfaText();
    if (xf) parts.push(xf);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  /** 心法特色这一拍起没起作用（只显示跟着你的状态走的那几种；剑意、逐浪、燎原看打的是哪只怪，不显示） */
  private xinfaText(): string | null {
    const w = this.w;
    const xf = w.xinfa;
    if (!xf) return null;
    const s = w.xf;
    const name = XINFA_TEXT[xf].name;
    const pct = (x: number): number => Math.round(x * 100);
    switch (xf) {
      case 'talisman':
        return s.stack > 0 ? `${name} +${pct(s.stack * XINFA_FX.talisman.step)}%` : null;
      case 'wood':
        return s.stack > 0 ? `${name} +${pct(s.stack * XINFA_FX.wood.step)}%` : null;
      case 'wealth':
        return s.stack > 0 ? `${name} +${pct(s.stack * XINFA_FX.wealth.step)}%` : null;
      case 'ward':
        return s.still >= XINFA_FX.ward.still ? name : null;
      case 'array':
        return s.inZone ? name : null;
      case 'paper':
        return s.papers > 0 ? `${name} 挨打 −${pct(Math.min(XINFA_FX.paper.max, s.papers * XINFA_FX.paper.step))}%` : null;
      case 'ghost':
        return w.hp <= w.stats.hpMax * XINFA_FX.ghost.hp ? name : null;
      default:
        return null;
    }
  }

  /** 买下后头上飘的"-价钱"（鬼市和夜市共用；同时有几条就往上错开） */
  private priceFloat(x: number, y: number, price: number): void {
    const n = this.floats.length;
    const oy = -64 - n * 30;
    const f = this.frame('coin');
    const img = this.add.image(x - 4, y + oy, f.tex ?? 'atlas', f.key).setScale(1.3 / f.res).setDepth(9200);
    const text = this.add
      .text(x + 8, y + oy, `-${price}`, { fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#ff7a5a', stroke: '#17131c', strokeThickness: 5 })
      .setOrigin(0, 0.5)
      .setResolution(2)
      .setDepth(9200);
    this.floats.push({ img, text, x, y: y + oy, life: 1600 });
  }

  private onNightMarket(x: number, y: number, a: number, stall: number, good: number): void {
    const S = TICKS_PER_SECOND;
    if (a === 0) {
      sfx.play('bell');
      this.d.banners.say('夜市要开了', 'gold', 3000, `${NIGHT_MARKET.warn / S} 秒后开，顺着屏幕边的箭头去，带够铜钱`);
    } else if (a === 1) {
      this.d.banners.say('夜市开了', 'gold', 2600, `${NIGHT_MARKET.open / S} 秒，站在摊前一会儿就买下`);
    } else if (a === 2) {
      this.d.banners.say('夜市收了', 'ink', 2000);
    } else {
      sfx.play('purse');
      this.priceFloat(x, y, this.w.mkPrice[stall] ?? 0);
      this.burst(this.w.x, this.w.y - 30, 0xffc928, 1.3);
      const g = MARKET_GOODS[good];
      // 求签：说清楚签指的是哪个搭配（买下那一拍核心已经定了 w.omen；-1 是没有缺料的搭配，换成了刷新）
      const omen = g === 'omen' ? (this.w.omen >= 0 ? `下次升级必出「${MERGES[this.w.omen]!.name}」的料` : '没有差料的搭配，换成刷新 +2') : undefined;
      if (g) this.d.banners.say(`买到了：${MARKET_NAME[g]}`, 'gold', omen ? 2600 : 1800, omen);
    }
  }

  private onAlert(role: number, slot: number): void {
    const w = this.w;
    if (!w.eAlive[slot]) return;
    if (this.alerts.some((a) => a.slot === slot && a.life > 0)) return;
    const img = this.img('alert', w.eX[slot]!, w.eY[slot]!).setDepth(9300);
    this.alerts.push({ slot, gen: w.eGen[slot]!, life: 1100, img });
    // 铜箱的精英常见，只有巡夜将和石兽才发声
    if (role >= 1) {
      sfx.play('elite', { volume: 0.45 });
      this.haptics.alert();
    }
  }

  /** 石兽：0 扑击预警（落点）1 扑下 2 甩尾预警 3 甩尾 4 进二段 */
  private onBeast(x: number, y: number, a: number, r: number): void {
    const tick = 1000 / TICKS_PER_SECOND;
    if (a === 0) this.telegraphs.push({ x, y, r, life: 0, max: BEAST.pounce.warn * tick, round: true, color: 0xd23a2a });
    else if (a === 2) this.telegraphs.push({ x, y, r, life: 0, max: BEAST.sweep.warn * tick, round: true, color: 0xe27a1a });
    else if (a === 1) {
      sfx.play('bossStomp');
      this.shake(220, 0.01);
      this.freeze = Math.max(this.freeze, 80);
      this.fx.spawn({ frame: 'ring', x, y, life: 500, s0: 0.4, s1: (r * 2.4) / 128, a0: 1, a1: 0, tint: 0x6a7890, depth: 60 });
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2;
        this.fx.spawn({ frame: 'haze', x: x + Math.cos(ang) * r * 0.6, y: y + Math.sin(ang) * r * 0.5, life: 650, s0: 0.6, s1: 1.4, a0: 0.7, a1: 0, tint: 0xc8d0dc });
      }
    } else if (a === 3) {
      sfx.play('bossBreath');
      this.shake(160, 0.007);
      this.fx.spawn({ frame: 'ring', x, y, life: 420, s0: 0.5, s1: (r * 2.2) / 128, a0: 1, a1: 0, tint: 0xe27a1a, depth: 60 });
    } else if (a === 4) {
      sfx.play('boss');
      this.shake(360, 0.008);
      this.d.banners.say('石兽发怒', 'warn', 1800, '扑得更勤，扫得更大');
    }
  }

  /** 游荡的巡夜将出来了：提示它从哪个方向来（相对主角） */
  private onRoamer(x: number, y: number): void {
    const dx = x - this.w.x;
    const dy = y - this.w.y;
    const ew = Math.abs(dx) > Math.abs(dy) * 0.45 ? (dx > 0 ? '东' : '西') : '';
    const ns = Math.abs(dy) > Math.abs(dx) * 0.45 ? (dy > 0 ? '南' : '北') : '';
    sfx.play('elite');
    this.d.banners.say('巡夜将出来了', 'warn', 2200, `从${ns}${ew}边的街上过来，别让它撞见`);
  }

  private onArrive(code: number): void {
    const def = ENEMIES[code]!;
    // 画皮混迹时玩家不知道它是首领：出场不报、不换曲，现形（Ev.Huapi a=2）才报
    if (def.kind === 'huapi') return;
    if (def.boss) {
      sfx.play(isFoeBoss(code) ? (`${def.kind}Arrive` as SfxName) : 'boss');
      this.d.banners.say(`${def.name}来了`, 'warn', 2600, BOSS_TIP[def.kind] ?? BOSS_TIP.boss!);
      this.shake(400, 0.006);
      music.start('boss');
      this.bossOn = true;
    } else {
      sfx.play('elite');
      const tip = ELITE_TIP[def.kind];
      this.d.banners.say(tip ? def.name : '精英', 'warn', 1600, tip ?? '打倒掉宝箱');
    }
  }

  /** 特色怪的技能（Ev.Mob 的子类见 events.ts）：预警画地上的圈，落下时一圈冲击加碎屑 */
  private onMob(x: number, y: number, a: number, r: number, ticks: number): void {
    const tick = 1000 / TICKS_PER_SECOND;
    const warn = (color: number): void => {
      this.telegraphs.push({ x, y, r, life: 0, max: ticks * tick, round: true, color });
    };
    const ring = (tint: number, k = 2.4): void => {
      this.fx.spawn({ frame: 'ring', x, y, life: 460, s0: 0.4, s1: (r * k) / 128, a0: 1, a1: 0, tint, depth: 60 });
    };
    switch (a) {
      case 0: // 竹精预警
        warn(0x3fae5a);
        break;
      case 1: // 竹精出土
        ring(0x3fae5a);
        this.burst(x, y - 10, 0x7fc45a, 1.2);
        for (let k = 0; k < (LOW_MEMORY ? 3 : 7); k++) this.fx.spawn({ frame: 'shard', x, y, vx: (Math.random() - 0.5) * 160, vy: -90 - Math.random() * 90, g: 420, life: 520, s0: 1.4, s1: 0.7, tint: 0x85613c, rot: Math.random() * 6, spin: 8 });
        sfx.play('bossStomp', { volume: 0.35 });
        break;
      case 2: // 溺鬼抓住了（b > 0）或刚冒出来（b = 0）
        if (r > 0) {
          ring(0x6a8c98, 1.1);
          sfx.play('hurt', { volume: 0.3, pitch: 0.7 });
        } else this.burst(x, y - 6, 0x9fd0e0, 0.8);
        break;
      case 3: // 冰傀碎裂
        this.burst(x, y - 14, 0xbfe6fa, 1.5);
        sfx.play('bell', { volume: 0.3, pitch: 1.5 });
        break;
      case 4: // 冰刺预警
        warn(0x4aa8ff);
        break;
      case 5: // 冰刺落下
        ring(0x4aa8ff, 2);
        this.burst(x, y - 12, 0xeaf8ff, 1.3);
        sfx.play('talisman', { volume: 0.35, pitch: 0.6 });
        break;
      case 6: // 蛇精窜出
        this.burst(x, y - 8, 0xa6dc72, 0.7);
        break;
      case 7: // 河伯涨潮
        ring(0x5fa9c0, 1.4);
        sfx.play('bossBreath', { volume: 0.5 });
        break;
      case 8: // 冰魄预警
        warn(0x7fd0ff);
        break;
      case 9: // 冰魄霜环
        ring(0x7fd0ff, 2.2);
        this.burst(x, y - 14, 0xeaf8ff, 2);
        sfx.play('bossStomp', { volume: 0.5 });
        break;
      case 10: // 更夫敲梆
        sfx.play('propWood', { volume: 0.5 });
        this.fx.spawn({ frame: 'ring', x, y, life: 420, s0: 0.3, s1: 1.4, a0: 1, a1: 0, tint: 0xe0a030, depth: 60 });
        break;
      case 11: // 石僧预警
        warn(0xb4b8bf);
        break;
      case 12: // 石僧掌击
        ring(0x9a9ea8, 2);
        this.burst(x, y - 8, 0xc8ccd4, 1.4);
        sfx.play('bossStomp', { volume: 0.45 });
        break;
      case 14: // 庙祝鬼撒香灰：灰圈预警
        warn(0x8a8478);
        break;
      case 15: // 香灰落地
        ring(0x9a948a, 2);
        this.burst(x, y - 8, 0xcfc8bc, 1.4);
        sfx.play('propWood', { volume: 0.3, pitch: 0.7 });
        break;
      case 13: // 竹王破土
        sfx.play('boss', { volume: 0.5 });
        this.shake(200, 0.006);
        break;
      case 16: // 皮影鬼闪走：原地一股灰烟
        this.burst(x, y - 14, 0x6a5a7a, 0.7);
        break;
      case 17: // 皮影鬼闪到：落点一圈暗红
        this.fx.spawn({ frame: 'ring', x, y, life: 300, s0: 0.2, s1: 0.6, a0: 0.9, a1: 0, tint: 0xb0303a, depth: 60 });
        sfx.play('talisman', { volume: 0.2, pitch: 1.4 });
        break;
      case 18: // 鬼市主撒铜钱
        this.fx.spawn({ frame: 'ring', x, y, life: 420, s0: 0.4, s1: 1.6, a0: 1, a1: 0, tint: 0xe0b040, depth: 60 });
        sfx.play('purse', { volume: 0.5, pitch: 0.8 });
        break;
    }
  }

  /** 地图事件：预告用横幅（名字 · 一句话），开始时震一下；白毛风、涨潮进行中给天气层 */
  private onMapEvent(a: number, b: number, c: number): void {
    const kind = MAP_EVENT_KINDS[b];
    const def = kind ? MAP_EVENTS[this.w.setup.map ?? 'snow'] : undefined;
    if (!kind || !def) return;
    if (a === 0) {
      this.d.banners.say(`${def.name} · ${def.blurb}`, 'warn', 2800, undefined, kind);
      this.haptics.alert();
      return;
    }
    if (a === 1) {
      this.shake(300, 0.006);
      sfx.play(kind === 'wind' ? 'windGust' : kind === 'bell' ? 'morningBell' : 'alert');
      // 鬼火齐燃：所有磷火一起腾起来，补一声呼的火响
      if (kind === 'allfire') sfx.play('fire', { volume: 0.7, pitch: 0.7 });
    }
    // 白毛风第 1、3 次往右吹，第 2 次往左（c 从 0 数，偶数往右）
    if (kind === 'wind') this.d.banners.setWind(a === 1 ? (c % 2 === 0 ? 1 : -1) : 0);
    else if (kind === 'tide') this.d.banners.setTide(a === 1);
  }

  /** 精英发狂：头顶冒一个红色「怒」字，往上飘一下消失 */
  private onRage(x: number, y: number): void {
    const t = this.add.text(x, y - 40, '怒', { fontFamily: 'YxBrush, serif', fontSize: '44px', color: '#ff2a1a', stroke: '#17131c', strokeThickness: 6 }).setOrigin(0.5).setDepth(9000);
    this.tweens.add({ targets: t, y: y - 100, alpha: 0, scale: 1.4, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
    sfx.play('rage');
  }

  /** 噩梦 2 起的夜色：半径按相机缩放换成屏幕像素，跟着主角（镜头钉在主角身上，主角在屏幕中心偏下 20 个世界单位） */
  private updateNight(): void {
    // 月蚀周：娱乐守夜全程一圈松得多的夜色；噩梦 2 起自带的夜色更紧，取小的那个
    const dn = DANGERS[this.w.setup.danger].night;
    const moon = this.w.setup.weekly === 'moon' ? WEEKLY_FX.moonRadius : 0;
    const night = dn > 0 && moon > 0 ? Math.min(dn, moon) : dn || moon;
    if (night <= 0 || this.raid) return;
    const cam = this.cameras.main;
    const k = this.scale.displaySize.width / (cam.width / cam.zoom);
    this.d.banners.setNight(night * k, 20 * k);
  }

  private onBoss(x: number, y: number, a: number, r: number, c: number): void {
    if (a === 4) {
      // 进下一段：吼一声 + 横幅
      const [title, sub] = PHASE_BANNER[ENEMIES[c]!.kind]?.[r] ?? ['', ''];
      sfx.play(isFoeBoss(c) ? 'rageRoar' : 'boss');
      this.shake(360, 0.008);
      if (title) this.d.banners.say(title, 'warn', 1800, sub);
      return;
    }
    if (a === 5) return sfx.play('bossSummon');
    if (a === 6) return sfx.play('bossBreath');
    if (a === 0) {
      // 跳砸警告：落点一个红圈，越收越紧
      this.telegraphs.push({ x, y, r, life: 0, max: 1000 });
    } else if (a === 1) {
      sfx.play('bossStomp');
      this.shake(260, 0.012);
      this.freeze = Math.max(this.freeze, 100);
      this.fx.spawn({ frame: 'ring', x, y, life: 500, s0: 0.4, s1: (r * 2.4) / 128, a0: 1, a1: 0, tint: 0x8a5a2a, depth: 60 });
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * Math.PI * 2;
        this.fx.spawn({ frame: 'haze', x: x + Math.cos(ang) * r * 0.6, y: y + Math.sin(ang) * r * 0.4, life: 700, s0: 0.6, s1: 1.4, a0: 0.7, a1: 0, tint: 0xc8c0b0 });
      }
    } else if (a === 2) sfx.play('bossSummon');
    else sfx.play('bossBreath');
  }

  /** 桃木剑一道斩：半径跟着法器的范围走（主线：月牙半径 ~120 一次两三道），进化后金红色更大 */
  /** 角色技能的特效和声音：画法在 art/skills.ts，这里只接事件、配音 */
  private skillEvent(type: number, x: number, y: number, a: number, b: number, c: number): void {
    const ctx: SkillFxCtx = {
      fx: this.fx,
      ground: this.ground,
      hero: () => ({ x: this.renderX, y: this.renderY }),
      depth: this.renderY,
      low: LOW_MEMORY,
      shake: (ms, k) => this.shake(ms, k),
    };
    playSkillFx(ctx, type, x, y, a, b, c);
    if (type === Ev.SkillUse) {
      const name = a === SK.sweep ? 'skillSweep' : a === SK.volley ? 'skillVolley' : a === SK.dash ? 'skillDash' : a === SK.iron ? 'skillIron' : a === SK.spring ? 'skillSpring' : a === SK.paper ? 'skillPaper' : a === SK.ferry ? 'skillFerry' : a === SK.fortune ? 'skillFortune' : a === SK.array ? 'skillArray' : null;
      if (name) sfx.play(name);
      // 采药女满血放回春（规则 66）：回不进去的血换成了药香伤害，飘字写多少倍，让人看出伤害来自药香；白字深描边（浅绿在雪地上偏淡）
      const herb = a === SK.spring ? this.w.skill.store : 0;
      if (herb > 0) this.items.floatText(x, y - 74, `药香伤害 ×${((1000 + herb) / 1000).toFixed(1)}`, '#ffffff');
    } else if (type === Ev.SkillBeat) {
      if (a === SK.clap) sfx.play('skillClap');
      else if (a === SK.spring) sfx.play('skillSpringTick');
      else if (a === SK.array) {
        sfx.play('skillArray');
        this.d.hud.flashYinyang();
        // 白字深描边（和伤害数字一样）：浅紫字落在同色的八卦圈上看不清
        this.items.floatText(x, y - 74, '阴阳互换 · 定身', '#ffffff');
      }
    } else if (a === SK.iron) sfx.play('skillIronEnd');
    else if (a === SK.array) sfx.play('skillArrayEnd');
  }

  /** 技能键还不能用：第一局（教学局）升到 2 级之前。回放没有这条线 */
  private skillLocked(): boolean {
    return this.d.firstRun && this.w.level < 2;
  }

  private slash(x: number, y: number, dirIdx: number, r: number, evolved: boolean): void {
    // 斩痕画在主角身后（深度低于主角），满级、进化后范围很大，太实会把主角整个盖住。
    // 等级越高斩痕越长越亮（主线 2b 意见）：外面多一层金色的光，弧再拉长一点
    const o = this.w.weapons.find((x) => x.id === 'sword');
    const k = o ? Math.min(1, (o.evolved ? 9 : o.level) / 8) : 0;
    const scale = r / 72;
    const rot = Math.atan2(SIN[dirIdx]!, COS[dirIdx]!);
    const d = this.renderY - 1;
    const sx = 1 + 0.35 * k;
    const cx = x + COS[dirIdx]! * 6;
    const cy = y - 24 + SIN[dirIdx]! * 6;
    if (k > 0.4) this.fx.spawn({ frame: 'slash', x: cx, y: cy, life: 300, s0: scale * 0.95, s1: scale * 1.35, a0: 0.35 + 0.35 * k, a1: 0, rot: rot - 0.06, sx, tint: evolved ? 0xff5a2a : 0xffd34a, depth: d - 0.5 });
    this.fx.spawn({ frame: 'slash', x: cx, y: cy, life: 220 + 60 * k, s0: scale * 0.8, s1: scale * 1.15, a0: evolved ? 0.85 : 1, a1: 0, rot, sx, tint: evolved ? 0xff8a5a : undefined, depth: d });
    // 第二层：细一点的白锋，晚一点出来，看起来是"刷"的一下
    this.fx.spawn({ frame: 'slash', x: x + COS[dirIdx]! * 10, y: y - 24 + SIN[dirIdx]! * 10, life: 170 + 40 * k, s0: scale * 0.95, s1: scale * 1.2, a0: 0.55 + 0.3 * k, a1: 0, rot: rot + 0.08, sx, tint: 0xffffff, depth: d + 0.5 });
  }

  /** 从 (x0, y0) 到 (x1, y1) 的折线，中间 n 段随机抖 amp */
  private jagged(x0: number, y0: number, x1: number, y1: number, n: number, amp: number): number[] {
    const pts: number[] = [];
    for (let k = 0; k <= n; k++) {
      const j = k > 0 && k < n ? (Math.random() - 0.5) * amp : 0;
      pts.push(x0 + (x1 - x0) * (k / n) + j, y0 + (y1 - y0) * (k / n) + j * 0.4);
    }
    return pts;
  }

  /** 天雷落点；chained：连锁跳过来的那几下不从天上劈（电弧由 Chain 事件画），天雷是常驻法器，不震屏也不顿帧（顿帧会让走位一卡一卡） */
  private thunder(x: number, y: number, r: number, chained = false): void {
    if (!chained) {
      const x0 = x + (Math.random() - 0.5) * 80;
      this.bolts.push({ pts: this.jagged(x0, y - 560, x, y - 20, 10, 46), life: 260 });
    }
    // 落点闪光圈（主线第 1 条）
    this.fx.spawn({ frame: 'ring', x, y, life: 360, s0: 0.2, s1: (r * 2.6) / 128, a0: 1, a1: 0, tint: 0x3a8fe0, depth: 60 });
    this.fx.spawn({ frame: 'haze', x, y: y - 10, life: 260, s0: r / 30, s1: r / 18, a0: 0.9, a1: 0, tint: 0xbfe6ff, depth: 61 });
    this.burst(x, y - 10, 0x55c8ff, chained ? 0.9 : 1.4);
    if (chained) return;
  }

  /** 火葫芦的一口火：沿扇面撒几团火苗往外飞 */
  private flame(x: number, y: number, dirIdx: number, range: number, half: number): void {
    const n = LOW_MEMORY ? 3 : 7;
    for (let k = 0; k < n; k++) {
      const a = Math.atan2(SIN[dirIdx]!, COS[dirIdx]!) + ((Math.random() * 2 - 1) * half * Math.PI * 2) / 256;
      const v = range * (2.2 + Math.random() * 1.2);
      this.fx.spawn({ frame: 'flame', x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 300 + Math.random() * 120, s0: 1, s1: 2.4, a0: 1, a1: 0, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 6 });
    }
  }

  private burst(x: number, y: number, tint: number, size: number): void {
    this.fx.spawn({ frame: 'haze', x, y, life: 220, s0: 0.8 * size, s1: 1.6 * size, a0: 0.8, a1: 0, tint });
    if (LOW_MEMORY) return;
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 * size + Math.random() * 60;
      this.fx.spawn({ frame: 'mote', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 260, s0: 0.6 * size, s1: 0.1, tint });
    }
  }

  private spark(x: number, y: number, tint: number, size: number): void {
    if (LOW_MEMORY) return;
    this.fx.spawn({ frame: 'spark', x, y, life: 200, s0: size * 1.6, s1: 0.2, tint, rot: Math.random() });
  }

  // ───────────────────────── 每帧画 ─────────────────────────

  private draw(dt: number): void {
    const w = this.w;
    const alpha = Math.min(1, this.acc / TICK_MS);
    const inter = (p: number, c: number): number => p + (c - p) * alpha;
    // 主角：始终在核心给的上一拍和这一拍之间插值，和怪、弹幕同一套时间轴。
    // 以前移动时用"预测"（现在的输入往前推）、停下时用插值，起停那一帧两套结果差约一拍，看上去一顿一跳；
    // 代价是比输入晚最多一拍（33 ms），换整条运动曲线连续
    const moving = !this.paused && !this.d.cards.open && this.freeze <= 0 && this.hold <= 0 && w.phase === 'play';
    const dir = moving ? (this.d.autopilot ? 0 : this.d.input.dir()) : 0;
    const slowed = w.tick < w.slowUntil;
    this.renderX = inter(w.px, w.x);
    this.renderY = inter(w.py, w.y);
    const hx = this.renderX;
    const hy = this.renderY;
    const walking = w.moving || dir !== 0;
    if (walking && moving) this.walk += dt * 0.012;
    const bob = walking ? Math.abs(Math.sin(this.walk)) : 0;
    const f = this.frame(this.heroFrame);
    const face = COS[w.face]! < -0.1 ? -1 : COS[w.face]! > 0.1 ? 1 : this.hero.scaleX < 0 ? -1 : 1;
    // 走路基本是平移：只留不到 1 像素的起伏和极小的挤压，当脚步感（幸存者类走位多，大幅上下晃会让人觉得在抖）
    // 起步轻拉长、停步轻压扁（预备和余势），60 帧下逐帧衰减
    const wk = walking && moving;
    if (wk !== this.wasWalking) {
      this.squashV = wk ? 0.05 : -0.07;
      this.wasWalking = wk;
    }
    this.squashV *= Math.exp(-dt / 90);
    const sq = Math.abs(this.squashV) < 0.001 ? 0 : this.squashV;
    const sx = (1 / f.res) * (1 + (1 - bob) * 0.012 * (walking ? 1 : 0) - sq * 0.8) * face;
    const sy = (1 / f.res) * (1 + sq - (walking ? (1 - bob) * 0.012 - bob * 0.008 : Math.sin(this.now * 0.004) * 0.015));
    const blink = w.invuln > 0 && Math.floor(this.now / 60) % 2 === 0;
    // 主角比按 y 排再往前 40：贴身围上来、站得略低的怪不再把主角盖住（受击时找不到自己）；
    // 不整个提到最上层，房屋、墙、竹子也按 y 排，提到最上层会盖在房顶上
    const hd = hy + 40;
    this.hero.setPosition(hx, hy - bob * 0.8).setScale(sx, sy).setRotation(0).setDepth(hd).setAlpha(blink ? 0.7 : 1);
    this.heroBack.setPosition(hx, hy - bob * 0.8 + 1).setScale(sx * 1.07, sy * 1.05).setRotation(this.hero.rotation).setDepth(hd - 0.1).setAlpha(this.hero.alpha);
    this.heroShadow.setPosition(hx, hy).setDepth(-400);
    this.lookAura?.update(hx, hy, walking && moving, this.now);
    if (this.bubble) {
      // 选卡一打开就收：A4 以后新号最快 3 秒就升级，台词压在卡上（竖屏还被法器栏切掉一截）
      if (this.now > this.bubbleUntil || this.w.phase === 'choose') {
        this.bubble.destroy();
        this.bubble = null;
      } else this.bubble.setPosition(hx, hy - 82).setAlpha(Math.min(1, (this.bubbleUntil - this.now) / 500));
    }
    // 被冰锥、水鬼拖慢：脚下冒冰屑
    if (slowed && !LOW_MEMORY && (this.frost += dt) > 90) {
      this.frost = 0;
      this.fx.spawn({ frame: 'mote', x: hx + (Math.random() - 0.5) * 30, y: hy - 4, vy: -30, life: 420, s0: 1.2, s1: 0.2, tint: 0x8fd0f0, rot: 0 });
    }
    if (w.shield > 0) {
      const sf = this.frame('goldbell');
      this.shieldImg
        .setVisible(true)
        .setPosition(hx, hy + 8)
        .setScale((0.95 + Math.sin(this.now * 0.004) * 0.03) / sf.res)
        .setAlpha(0.28 + 0.08 * Math.min(3, w.shield))
        .setDepth(hd + 1);
    } else this.shieldImg.setVisible(false);
    this.aura.setPosition(hx, hy).setDepth(-450).setAlpha(0.75 + Math.sin(this.now * 0.004) * 0.15);
    // 脚印：走着的时候每隔一段在身后留一个
    if (walking && moving) {
      this.stepAcc += dt;
      if (this.stepAcc > 170) {
        this.stepAcc = 0;
        this.footSide = -this.footSide;
        const px = -SIN[w.face]! * 6 * this.footSide;
        const py = COS[w.face]! * 4 * this.footSide;
        this.ground.spawn({ frame: 'footprint', x: hx + px, y: hy + py + 2, life: 3200, a0: 0.8, a1: 0, rot: Math.atan2(SIN[w.face]!, COS[w.face]!), ground: true });
      }
    }
    // 镜头：紧跟主角（幸存者类的标准做法）。以前每帧追 15% 并朝面向方向前瞻 40px：追的快慢跟帧率有关，
    // 转向时前瞻点一跳镜头就荡一下；主角本身已经按拍插值，镜头直接钉在他身上，屏幕上主角就不会晃
    const cam = this.cameras.main;
    cam.centerOn(hx, hy - 20);

    this.gfx.clear();
    this.shotsView.waves.length = 0;
    this.shotsView.petalMarks.length = 0;
    this.bambooView.fadeOverHero(hx, hy, dt);
    this.drawMobs(inter, dt);
    if (this.fireView) {
      const vw = cam.width / cam.zoom;
      const vh = cam.height / cam.zoom;
      const lit = this.fireView.update({ x: hx - vw / 2, y: hy - 20 - vh / 2, right: hx + vw / 2, bottom: hy - 20 + vh / 2 }, this.now);
      // 第一次看见火区要烧：说一句打法（和香火区一样只说一次）
      if (lit && !this.fireTold) {
        this.fireTold = true;
        this.d.banners.say(this.raid ? '窑口喷火' : '磷火', 'warn', 2400, '地上一闪就要烧起来：把怪引进去，自己别站');
      }
    }
    this.foeView.draw(w, this.now, inter);
    this.shotsView.draw(w, this.now, inter);
    this.dropsView.draw(w, this.now, inter);
    this.arms.update(dt);
    this.arms2.update(dt);
    this.items.drawProps(w, dt);
    if (this.raid) {
      this.drawRaid(dt);
      this.town?.update(cam, this.renderX, this.renderY);
    }
    this.drawGfx(dt);
    this.fx.update(dt);
    this.ground.update(dt);
    this.nums.setHero(this.renderX, this.renderY);
    this.nums.update(dt);
    this.ghosts.update(dt);
    this.items.update(dt);
    this.drawNightMarket();
    this.updateNight();
    this.drawHud();
  }

  /**
   * 画皮这一帧的特殊画法。混迹：头顶飘一缕红丝（光靠它手机上看不清，所以另有 Ev.Huapi a=1 的横幅 + 红闪）；
   * 现形：脚下一圈暗红的缠丝圈，半径 HUAPI.silkR，加粗墨边，雪地上看得见。
   */
  private drawHuapi(m: MobView, x: number, y: number, disguised: boolean, size: number): void {
    // 挨第一下之后红闪一阵：整张图在红色剪影和原样之间交替
    if (this.huapiRedUntil > 0) {
      if (this.now < this.huapiRedUntil) {
        if (m.flash <= 0) {
          if (Math.floor(this.now / 90) % 2 === 0) m.img.setTint(0xff3a3a).setTintMode(Phaser.TintModes.FILL);
          else m.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        }
      } else {
        this.huapiRedUntil = 0;
        if (m.flash <= 0) m.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
    }
    if (disguised) {
      const f = this.frame('redsilk');
      const img = (this.silkImg ??= this.img('redsilk'));
      img
        .setVisible(true)
        .setPosition(x + Math.sin(this.now * 0.004) * 3, y - 50 * size + 4)
        .setScale(1.1 / f.res)
        .setRotation(Math.sin(this.now * 0.005 + 1) * 0.18)
        .setDepth(y + 1);
      this.huapiSilkSeen = true;
      return;
    }
    const g = (this.silkG ??= this.add.graphics().setDepth(-320));
    const R = HUAPI.silkR;
    const N = 44;
    const ring = (): void => {
      g.beginPath();
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        const r = R * (1 + 0.025 * Math.sin(a * 7 + this.now * 0.003));
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    };
    g.fillStyle(0x9a1624, 0.1);
    ring();
    g.fillPath();
    g.lineStyle(9, 0x17131c, 0.5);
    ring();
    g.strokePath();
    g.lineStyle(4.5, 0xc01830, 0.8);
    ring();
    g.strokePath();
  }

  /** Ev.Huapi：a 0 出场（混迹，什么都不报）/ 1 混迹时第一次被打中 / 2 现形 / 3 甩出分身（b 个）/ 4 倒下 */
  private onHuapi(x: number, y: number, a: number, b: number): void {
    if (a === 1) {
      // 现形前唯一一次明确提示：红光一闪 + 一行字（红丝手机上看不清）
      if (this.huapiHinted) return;
      this.huapiHinted = true;
      sfx.play('elite');
      this.huapiRedUntil = this.now + 700;
      this.fx.spawn({ frame: 'haze', x, y: y - 30, life: 500, s0: 1.6, s1: 3.2, a0: 0.9, a1: 0, tint: 0xff2a2a, depth: 60 });
      this.fx.spawn({ frame: 'ring', x, y, life: 500, s0: 0.3, s1: 1.2, a0: 1, a1: 0, tint: 0xe02a3a, depth: 60 });
      this.d.banners.say('有东西混在怪里！', 'warn', 1900);
    } else if (a === 2) {
      // 人皮炸开：粉、红、深紫三色碎片四散，盖章大字，换曲
      sfx.play('boss');
      this.shake(500, 0.008);
      this.d.banners.whiteFlash();
      this.haptics.big();
      this.d.banners.stamp('画皮 现形', '青面獠牙，打倒它', 1700);
      this.burst(x, y - 40, 0xf08a9a, 2.2);
      this.fx.spawn({ frame: 'ring', x, y, life: 600, s0: 0.4, s1: (HUAPI.silkR * 2.2) / 128, a0: 1, a1: 0, tint: 0xc01830, depth: 60 });
      const tints = [0xf08a9a, 0xc01830, 0x6a3a5a];
      for (let n = 0; n < (LOW_MEMORY ? 5 : 20); n++) {
        const ang = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 200;
        this.fx.spawn({ frame: 'shard', x, y: y - 40, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v * 0.6 - 120, g: 380, life: 700, s0: 1.6, s1: 0.8, tint: tints[n % 3]!, rot: Math.random() * 6, spin: 8 });
      }
      music.start('boss');
      this.bossOn = true;
    } else if (a === 3) {
      sfx.play('bossSummon');
      this.fx.spawn({ frame: 'ring', x, y, life: 420, s0: 0.4, s1: 1.6 + b * 0.1, a0: 0.9, a1: 0, tint: 0xf08a9a, depth: 60 });
    } else if (a === 4) {
      if (LOW_MEMORY) return;
      for (let n = 0; n < 14; n++) {
        const ang = Math.random() * Math.PI * 2;
        const v = 80 + Math.random() * 160;
        this.fx.spawn({ frame: 'shard', x, y: y - 30, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v * 0.6 - 100, g: 380, life: 650, s0: 1.4, s1: 0.6, tint: n % 2 ? 0xf08a9a : 0xc01830, rot: Math.random() * 6, spin: 8 });
      }
    }
  }

  private drawMobs(inter: (p: number, c: number) => number, dt: number): void {
    const w = this.w;
    this.huapiSilkSeen = false;
    this.silkG?.clear();
    for (let i = 0; i < MAX_ENEMIES; i++) {
      let m = this.mobs[i];
      if (!w.eAlive[i]) {
        if (m?.img.visible) {
          m.img.setVisible(false);
          m.shadow.setVisible(false);
          m.glow?.setVisible(false);
        }
        continue;
      }
      const code = w.eKind[i]!;
      if (!m || m.gen !== w.eGen[i] || m.kind !== code) m = this.mobs[i] = this.dressMob(i, m ?? null);
      const def = ENEMIES[code]!;
      // 画皮：混迹时借常规怪的图，现形（eS 变 1）换成自己的图和首领的紫光
      const disguised = code === HUAPI_CODE && w.eS[i] === 0;
      if (code === HUAPI_CODE) {
        const want = disguised ? HUAPI_DISGUISE : 'huapi';
        if (m.look !== want) {
          const nf = this.frame(want);
          m.img.setTexture(nf.tex ?? 'atlas', nf.key).setOrigin(nf.ox, nf.oy);
          m.res = nf.res;
          m.look = want;
          m.glow?.setVisible(!disguised);
        }
      }
      // 2.0：雪童子隐在雪里只露眼、躺着的棺钉鬼是一副棺材（eAX / eS 由核心填）
      if (code === XUETONG_CODE || code === GUANDING_CODE) {
        const want = code === XUETONG_CODE ? (w.eAX[i] === 1 ? 'xuetongeyes' : 'xuetong') : w.eS[i] === 0 ? 'coffin' : 'guandingui';
        if (m.look !== want) {
          const nf = this.frame(want);
          m.img.setTexture(nf.tex ?? 'atlas', nf.key).setOrigin(nf.ox, nf.oy);
          m.res = nf.res;
          m.look = want;
        }
      }
      // 规则 55：催命鬼催命时（核心把 eS 置 1）换成通体发红的那张
      if (code === HURRIER_CODE) {
        const want = w.eS[i] === 1 ? 'hurrierrage' : 'hurrier';
        if (m.look !== want) {
          const nf = this.frame(want);
          m.img.setTexture(nf.tex ?? 'atlas', nf.key).setOrigin(nf.ox, nf.oy);
          m.res = nf.res;
          m.look = want;
        }
      }
      const x = inter(w.ePX[i]!, w.eX[i]!);
      const y = inter(w.ePY[i]!, w.eY[i]!);
      let lift = 0;
      if (def.kind === 'jiangshi' || def.kind === 'general') {
        const t = w.eT[i]! % HOP_PERIOD;
        lift = t < HOP_AIR ? Math.sin((t / HOP_AIR) * Math.PI) * (def.kind === 'general' ? 16 : 11) : 0;
      } else if (def.kind === 'wisp' || def.kind === 'lantern' || def.kind === 'lampghost') lift = 8 + Math.sin(this.now * 0.005 + i) * 4;
      else if (def.kind === 'bat') lift = 14 + Math.sin(this.now * 0.02 + i * 2.3) * 5;
      else if (code === HUAPISKIN_CODE) lift = 12 + Math.sin(this.now * 0.006 + i * 1.9) * 5;
      else if (def.kind === 'boss' && w.eS[i] === 1) lift = Math.sin((1 - w.eT[i]! / 30) * Math.PI) * 120;
      // 水鬼从地里冒出来：先沉在地下，慢慢升上来
      // 竹精、溺鬼、掘墓鬼同理（竹精出土前还在地下）
      const sink = w.eT[i]! > 0 ? (code === WATER_CODE ? w.eT[i]! / WATER.emerge : code === SPROUT_CODE ? w.eT[i]! / SPROUT.warn : code === DROWN_CODE ? w.eT[i]! / DROWN.emerge : code === JUEMU_CODE ? w.eT[i]! / JUEMU.emerge : 0) : 0;
      if (sink > 0) lift = -sink * 34;
      const size = w.eSize[i]! * (disguised ? HUAPI.disguiseScale : 1);
      const flip = this.renderX < x ? -1 : 1;
      // 被捆住的发抖
      const bound = w.eBind[i]! > w.tick;
      // 走路的小动作：纸人晃、落地压扁（混迹的画皮学纸人晃，人皮分身飘着摆）
      const wob = def.kind === 'paper' || disguised ? Math.sin(this.now * 0.012 + i * 1.7) * 0.06 : code === HUAPISKIN_CODE ? Math.sin(this.now * 0.005 + i * 2.1) * 0.12 : 0;
      let squash = lift === 0 && (def.kind === 'jiangshi' || def.kind === 'general') ? 0.94 : 1;
      let kx = 0;
      let ky = 0;
      if (m.kb > 0) {
        m.kb = Math.max(0, m.kb - dt / 140);
        // 缓出：一下推开，越往后越慢地回位；同时被打扁一点点
        const k = m.kb * m.kb;
        kx = m.kx * k;
        ky = m.ky * k;
        squash *= 1 - k * 0.07;
      }
      m.img
        .setPosition(x + kx + (bound ? Math.sin(this.now * 0.09 + i) * 1.8 : 0), y - lift + ky)
        .setScale((flip * size * (2 - squash)) / m.res, (size * squash) / m.res)
        .setRotation(wob)
        // 蛇精藏着半透明；皮影鬼要闪之前一闪一闪
        .setAlpha(DIVER_CODES.has(code) && w.eS[i] === 1 ? 0 : code === SNAKE_CODE && w.eS[i] === 0 ? 0.4 : code === PUPPET_CODE && w.eS[i] === 1 ? (Math.floor(this.now / 70) % 2 === 0 ? 0.25 : 0.9) : (1 - sink * (code === SPROUT_CODE ? 1 : 0.75)) * (code === HUAPISKIN_CODE ? Math.min(1, (this.now - m.born) / 350) : 1))
        .setDepth(y);
      if (m.flash > 0) {
        m.flash -= dt;
        m.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        if (m.flash <= 0) m.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      if (code === HUAPI_CODE) this.drawHuapi(m, x, y - lift, disguised, size);
      const sf = this.frames.get('shadow')!;
      m.shadow.setPosition(x, y).setScale(((w.eR[i]! / 20) * (1 - Math.min(0.5, lift * 0.004))) / sf.res).setDepth(-400);
      if (m.glow) m.glow.setPosition(x, y - lift - w.eR[i]! * 1.4).setDepth(y - 1).setAlpha(def.elite || def.boss ? 0.5 + Math.sin(this.now * 0.006) * 0.12 : 0.4);
    }
    if (!this.huapiSilkSeen) this.silkImg?.setVisible(false);
    // Boss 血条。暂停时不动它：结算前 banners.clear() 收掉了，认输时首领还活着，再画一帧就会挂在结算面板后面
    const b = w.bossSlot;
    if (this.paused) {
      // 暂停面板盖着，留着暂停前那一帧
    } else if (this.rushShow) this.rushShow.bar(w);
    else if (this.raid) {
      // 夜探：只有镇门石兽有血条，主角走近了（它在追或要扑）才亮
      const near = b >= 0 && !!w.eAlive[b] && w.phase !== 'over' && ['beast', 'hongyi', 'shuoshu'].includes(ENEMIES[w.eKind[b]!]!.kind) && (w.eX[b]! - w.x) ** 2 + (w.eY[b]! - w.y) ** 2 < 640 * 640;
      if (near) this.d.banners.setBoss(ENEMIES[w.eKind[b]!]!.name, w.eHp[b]! / w.eHpMax[b]!);
      if (near !== this.bossShown) {
        this.bossShown = near;
        if (!near) this.d.banners.setBoss(null);
      }
    } else if (b >= 0 && w.eAlive[b] && w.phase !== 'over') {
      const bk = ENEMIES[w.eKind[b]!]!.kind;
      // 画皮混迹时不出血条（玩家不知道它是首领），现形以后才出
      if (bk === 'huapi' && w.eS[b] === 0) this.d.banners.setBoss(null);
      else this.d.banners.setBoss(ENEMY_BY_KIND[bk].name, w.eHp[b]! / w.eHpMax[b]!);
    } else if (this.bossOn) {
      this.d.banners.setBoss(null);
      this.bossOn = false;
      // 纸扎老爷倒了：换回夜里的音乐
      if (w.phase === 'play') music.start('night');
    }
  }

  /** 挨打：白闪（普通 2 帧，精英 / 大怪更久）、被推开一小步再缓缓回位。不放粒子：命中数量大，拖帧 */
  private onMobHit(m: MobView, slot: number, x: number, y: number): void {
    const def = ENEMIES[this.w.eKind[slot]!];
    const big = !!def && (def.elite || def.boss);
    // 光环、寒泉这类每隔几拍打一下的，会把首领一直刷成白剪影、认不出是谁：同一只怪闪完至少隔一会儿才再闪
    if (this.now - m.flashAt >= (big ? 260 : 160)) {
      m.flash = big ? 110 : 40;
      m.flashAt = this.now;
    }
    const dx = x - this.w.x;
    const dy = y - this.w.y;
    const d = Math.hypot(dx, dy) || 1;
    // 大怪几乎不动（不然 Boss 被打得满屏飘）
    const amp = def?.boss ? 1 : big ? 2.5 : 5;
    m.kb = 1;
    m.kx = (dx / d) * amp;
    m.ky = (dy / d) * amp * 0.7;
  }

  private dressMob(i: number, old: MobView | null): MobView {
    const code = this.w.eKind[i]!;
    const def = ENEMIES[code]!;
    const key = MOB_FRAME[code]!;
    const f = this.frame(key);
    const img = old?.img ?? this.add.image(0, 0, f.tex ?? 'atlas', f.key);
    img.setTexture(f.tex ?? 'atlas', f.key).setOrigin(f.ox, f.oy).setVisible(true).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    // 没画好专属造型的怪先用相近的图换个颜色
    if (!this.frames.has(key)) img.setTint(ENEMIES[code]!.tint);
    const shadow = old?.shadow ?? this.img('shadow');
    shadow.setVisible(true).setAlpha(0.8);
    let glow = old?.glow ?? null;
    const glowTint = def.kind === 'goblin' ? 0xffc83a : def.elite || def.boss ? 0xa050ff : def.kind === 'lantern' ? 0xff8a3a : def.kind === 'lampghost' ? 0xffc24a : def.kind === 'wisp' ? 0x5fd3f0 : null;
    if (glowTint !== null) {
      glow ??= this.img('haze');
      const hf = this.frames.get('haze')!;
      glow.setVisible(true).setTint(glowTint).setScale((def.elite || def.boss ? 2.6 : 1.1) / hf.res);
    } else glow?.setVisible(false);
    // 画皮混迹中：换成常规怪的图、不带首领的紫光（drawMobs 里跟着阶段换）
    if (code === HUAPI_CODE && this.w.eS[i] === 0) {
      const df = this.frame(HUAPI_DISGUISE);
      img.setTexture(df.tex ?? 'atlas', df.key).setOrigin(df.ox, df.oy);
      glow?.setVisible(false);
      return { gen: this.w.eGen[i]!, img, shadow, glow, res: df.res, flash: 0, flashAt: -1e9, kind: code, look: HUAPI_DISGUISE, born: this.now, kb: 0, kx: 0, ky: 0 };
    }
    return { gen: this.w.eGen[i]!, img, shadow, glow, res: f.res, flash: 0, flashAt: -1e9, kind: code, look: key, born: this.now, kb: 0, kx: 0, ky: 0 };
  }

  /** 夜探每帧要画的：门（换图、光圈）、开过的宝箱、搜箱和撤离的读条、撤离指引（脚印、屏幕边的箭头）、"!"、飘字 */
  private drawRaid(dt: number): void {
    const raid = this.raid!;
    const w = this.w;
    const rg = this.rg;
    const g = this.gfx;
    rg.clear();
    // 宝箱：开了就换成开着的图，光晕收掉
    raid.map.chests.forEach((c, i) => {
      const v = this.chestViews[i]!;
      const open = raid.chestOpen[i] === 1;
      if (open !== v.open) {
        v.open = open;
        v.img.setFrame(`chest_${c.tier}${open ? '_open' : ''}`);
        v.glow?.setVisible(!open);
      } else if (!open && v.glow) v.glow.setAlpha(0.45 + Math.sin(this.now * 0.004 + i) * 0.15);
    });
    // 门：开着的门发光，圈里站着读条
    raid.map.gates.forEach((gt, k) => {
      const v = this.gateViews[k]!;
      const open = raid.gateOpen[k] === 1;
      if (open !== v.open) {
        v.open = open;
        v.img.setFrame(open ? 'gate_open' : 'gate_closed');
        v.glow.setVisible(open);
      }
      if (open) {
        const pulse = 0.5 + 0.5 * Math.sin(this.now * 0.005 + k);
        rg.fillStyle(0xffd860, 0.24 + pulse * 0.12);
        rg.fillCircle(gt.x, gt.y, GATE.r);
        rg.lineStyle(9, 0x17131c, 0.55);
        rg.strokeCircle(gt.x, gt.y, GATE.r);
        rg.lineStyle(5, 0xe8a820, 1);
        rg.strokeCircle(gt.x, gt.y, GATE.r);
        v.glow.setAlpha(0.5 + pulse * 0.25);
      } else {
        rg.fillStyle(0x4a5060, 0.08);
        rg.fillCircle(gt.x, gt.y, GATE.r);
        rg.lineStyle(4, 0x4a5060, 0.3);
        rg.strokeCircle(gt.x, gt.y, GATE.r);
      }
    });
    // 撤离读条：门圈里一圈金色，主角头上一条
    const hx = this.renderX;
    const hy = this.renderY;
    const ep = raid.exitProgress();
    if (ep > 0 && raid.exitGate >= 0) {
      const gt = raid.map.gates[raid.exitGate]!;
      g.lineStyle(14, 0x17131c, 0.9);
      g.beginPath();
      g.arc(gt.x, gt.y, GATE.r - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ep);
      g.strokePath();
      g.lineStyle(8, 0xffd23a, 1);
      g.beginPath();
      g.arc(gt.x, gt.y, GATE.r - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ep);
      g.strokePath();
      this.progressBar(hx, hy - 84, ep, 0xffd23a);
    }
    // 搜箱读条
    const sp = raid.searchProgress();
    if (sp > 0 && raid.searchChest >= 0) {
      const c = raid.map.chests[raid.searchChest]!;
      this.progressBar(c.x, c.y - 56, sp, c.tier === 'gold' ? 0xffd23a : c.tier === 'copper' ? 0xff9a3a : 0xf0e0b0);
    }
    this.drawLate(raid);
    // 撤离指引：每 4 帧重算一次（最短路场按开着的门缓存），脚印画在地上，门在屏幕外时边上一个箭头
    if (raid.outcome === 'none') {
      if (this.gdMask !== raid.gateMask || this.now - this.gdAt > 120) {
        this.gdMask = raid.gateMask;
        this.gdAt = this.now;
        guide(raid, w.x, w.y, this.gd);
      }
      const gd = this.gd;
      this.drawTrail(raid, gd);
      const cam = this.cameras.main;
      const cssW = this.scale.displaySize.width;
      const cssH = this.scale.displaySize.height;
      const k = cssW / (cam.width / cam.zoom);
      const gate = gd.gate >= 0 ? raid.map.gates[gd.gate]! : null;
      const arrow = gate ? edgeArrow(raid, gd, (gate.x - cam.midPoint.x) * k, (gate.y - cam.midPoint.y) * k, cssW, cssH, 84) : null;
      this.d.hud.setArrow(arrow && !arrow.onScreen ? arrow : null);
      this.feedRaidHud(raid, gate ? { name: gate.name, secs: walkSecs(gd.dist) } : null);
    } else this.d.hud.setArrow(null);
    // 守卫头上的"!"
    for (const a of this.alerts) {
      a.life -= dt;
      const i = a.slot;
      if (a.life <= 0 || !w.eAlive[i] || w.eGen[i] !== a.gen) {
        a.life = 0;
        a.img.destroy();
        continue;
      }
      const born = Math.min(1, (1100 - a.life) / 140);
      const f = this.frame('alert');
      a.img.setPosition(w.eX[i]!, w.eY[i]! - w.eR[i]! * 2.4 - 28 - Math.sin(this.now * 0.02) * 2).setScale((1.1 * (0.4 + 0.6 * born)) / f.res).setAlpha(Math.min(1, a.life / 250));
    }
    this.alerts = this.alerts.filter((a) => a.life > 0);
    // 捡到宝物的飘字
    for (const fl of this.floats) {
      fl.life -= dt;
      const t = 1 - fl.life / 1600;
      const y = fl.y - t * 46;
      const al = fl.life < 400 ? Math.max(0, fl.life / 400) : 1;
      fl.img.setPosition(fl.x - 4 - fl.text.width / 2 - 8, y).setAlpha(al);
      fl.text.setPosition(fl.x - fl.text.width / 2 + 8, y).setAlpha(al);
      if (fl.life <= 0) {
        fl.img.destroy();
        fl.text.destroy();
      }
    }
    this.floats = this.floats.filter((fl) => fl.life > 0);
  }

  /** 宝妖在场上的槽位（没有是 −1） */
  private goblinSlot(raid: Raid): number {
    const w = this.w;
    for (let g = 0; g < raid.gUsed; g++) {
      const i = raid.gSlot[g]!;
      if (raid.gRole[g] === Role.goblin && i >= 0 && w.eAlive[i] && w.eGen[i] === raid.gGen[g]) return i;
    }
    return -1;
  }

  /** 后半段规则的画面：鬼市摊子、宝库封条、宝妖的屏幕边箭头 */
  private drawLate(raid: Raid): void {
    const w = this.w;
    // 鬼市：开市期间三个摊子，价钱不够标红，卖掉的空着，站在摊前买的读条画在摊子上方（和守夜夜市共用 syncStalls）
    if (raid.marketOpen === 1) {
      const items: StallItem[] = [];
      for (let k = 0; k < raid.stallX.length; k++) {
        const t = TREASURES[raid.stallItem[k]!]!;
        items.push({ x: raid.stallX[k]!, y: raid.stallY[k]!, icon: treasureIconKey(t.icon), price: raid.stallPrice[k]!, sold: raid.stallSold[k] === 1, ghost: false });
      }
      this.stalls.sync(items);
    } else this.stalls.sync(null);
    if (raid.marketOpen === 1 && raid.buyStall >= 0) {
      const bp = raid.buyProgress();
      if (bp > 0) this.progressBar(raid.stallX[raid.buyStall]!, raid.stallY[raid.buyStall]! - 108, bp, 0xffd23a);
    }
    // 宝库：没开封（时辰没到或没钥匙）且没开过，金箱上贴着封条
    if (this.sealImg) {
      const sealed = raid.chestOpen[raid.vault] !== 1 && !raid.vaultReady(w.tick);
      this.sealImg.setVisible(sealed);
    }
    if (this.sealText) {
      const c = raid.map.chests[raid.vault]!;
      const near = raid.chestOpen[raid.vault] !== 1 && raid.outcome === 'none' && Math.hypot(c.x - w.x, c.y - w.y) < 420;
      let text = '';
      if (near) text = w.tick < RAID_LATE.vault.at ? `还差 ${waitClock(RAID_LATE.vault.at - w.tick)} 开封` : raid.hasKey === 1 ? '可以搜了：站一会儿' : '要钥匙：打倒精英或守卫掉';
      if (this.sealText.text !== text) this.sealText.setText(text).setColor(text.startsWith('要钥匙') ? '#ff8a6a' : '#ffe08a');
      this.sealText.setVisible(near);
    }
    // 宝妖在屏幕外：屏幕边上一个橙色箭头
    const gi = raid.outcome === 'none' ? this.goblinSlot(raid) : -1;
    const ga = gi >= 0 ? this.edgeArrowTo(w.eX[gi]!, w.eY[gi]!, `宝妖 · ${walkSecs(Math.hypot(w.eX[gi]! - w.x, w.eY[gi]! - w.y))} 秒`) : null;
    this.d.hud.setGoblinArrow(ga);
  }

  /** 夜探 HUD 的数据：目标条（最近的门、下一批门）、背包、小地图 */
  private feedRaidHud(raid: Raid, gate: { name: string; secs: number } | null): void {
    if (!this.rhud) return;
    const w = this.w;
    let next: { names: string; secs: number } | null = null;
    if (!gate) {
      const win = raid.windows.find((x) => x.from > w.tick);
      if (win) next = { names: win.gates.length > 2 ? `${win.gates.length} 座门` : win.gates.map((g) => raid.map.gates[g]!.name).join('、'), secs: Math.ceil((win.from - w.tick) / 30) };
    }
    const xy = this.guardXY;
    xy.length = 0;
    let gob: [number, number] | null = null;
    for (let g = 0; g < raid.gUsed; g++) {
      const i = raid.gSlot[g]!;
      if (i < 0 || !w.eAlive[i] || w.eGen[i] !== raid.gGen[g]) continue;
      if (raid.gRole[g] === Role.goblin) gob = [w.eX[i]!, w.eY[i]!];
      else xy.push(w.eX[i]!, w.eY[i]!);
    }
    this.rhud.update({
      gate,
      next,
      level: w.tick >= DAWN_RED ? 2 : w.tick >= DAWN_WARN ? 1 : 0,
      teach: raid.teach,
      bag: raid.bag,
      boost: w.setup.live ? null : w.raidBoost,
      hx: this.renderX,
      hy: this.renderY,
      chestOpen: raid.chestOpen,
      gateOpen: raid.gateOpen,
      guards: xy,
      goblin: gob,
      market: raid.marketOpen === 1 && raid.stallX.length > 0 ? [raid.stallX[1] ?? raid.stallX[0]!, raid.stallY[1] ?? raid.stallY[0]!] : null,
      vault: raid.vault >= 0 && raid.chestOpen[raid.vault] !== 1 && !raid.vaultReady(w.tick) ? raid.vault : -1,
      hasKey: raid.hasKey === 1,
    });
  }

  /** 头上或箱子上的读条：深色边、金色（或档色）填充 */
  private progressBar(x: number, y: number, p: number, color: number): void {
    const g = this.gfx;
    const wd = 64;
    g.fillStyle(0x17131c, 0.9);
    g.fillRoundedRect(x - wd / 2 - 4, y - 8, wd + 8, 16, 6);
    g.fillStyle(0x4a4350, 1);
    g.fillRoundedRect(x - wd / 2, y - 4, wd, 8, 3);
    g.fillStyle(color, 1);
    g.fillRoundedRect(x - wd / 2, y - 4, Math.max(2, wd * p), 8, 3);
  }

  private drawGfx(dt: number): void {
    const g = this.gfx;
    // 八卦镜的光波：深靛外圈 + 亮青内圈，越往外越淡
    const wv = this.shotsView.waves;
    for (let k = 0; k < wv.length; k += 5) {
      const a = Math.max(0.35, 1 - wv[k + 2]! / wv[k + 3]!);
      const style = wv[k + 4]!;
      const [edge, core] = style === 1 ? [0x17131c, 0x6a6470] : style === 2 ? [0x17131c, 0xffffff] : [0x1f3a78, 0x7fe0ff];
      const r = wv[k + 2]!;
      // 里面铺一层淡色，圈本身加粗：雪地上静帧里也要一眼看见
      g.fillStyle(core, a * 0.16);
      g.fillCircle(wv[k]!, wv[k + 1]!, r);
      g.lineStyle(16, edge, a * 0.8);
      g.strokeCircle(wv[k]!, wv[k + 1]!, r);
      g.lineStyle(8, core, a);
      g.strokeCircle(wv[k]!, wv[k + 1]!, r);
      g.lineStyle(2.5, 0xffffff, a * 0.9);
      g.strokeCircle(wv[k]!, wv[k + 1]!, r - 2);
    }
    // 桃花雨的落点：粉圈 + 深玫瑰边，越近越实
    const pm = this.shotsView.petalMarks;
    for (let k = 0; k < pm.length; k += 3) {
      const t = pm[k + 2]!;
      g.fillStyle(0xff8fb8, 0.2 + t * 0.35);
      g.fillEllipse(pm[k]!, pm[k + 1]!, 34 + t * 14, 20 + t * 8);
      g.lineStyle(3, 0xb8325f, 0.45 + t * 0.4);
      g.strokeEllipse(pm[k]!, pm[k + 1]!, 34 + t * 14, 20 + t * 8);
    }
    pm.length = 0;
    // 缚妖索：金绳加墨边，一串连起来
    for (const r of this.ropes) {
      r.life -= dt;
      const a = Math.min(1, r.life / 200);
      for (const [wd, c] of [[7, 0x17131c], [3.5, 0xf2c94c]] as const) {
        g.lineStyle(wd, c, a);
        g.beginPath();
        g.moveTo(r.pts[0]!, r.pts[1]!);
        for (let k = 2; k < r.pts.length; k += 2) g.lineTo(r.pts[k]!, r.pts[k + 1]!);
        g.strokePath();
      }
    }
    this.ropes = this.ropes.filter((r) => r.life > 0);
    // 闪电：外面深靛蓝、中间亮蓝、白芯（雪地上要有深色边才看得见）
    for (const b of this.bolts) {
      b.life -= dt;
      const a = Math.max(0, b.life / 260);
      for (const [wd, c] of [[10, 0x23306a], [5.5, 0x55c8ff], [2.2, 0xffffff]] as const) {
        g.lineStyle(wd, c, a);
        g.beginPath();
        g.moveTo(b.pts[0]!, b.pts[1]!);
        for (let k = 2; k < b.pts.length; k += 2) g.lineTo(b.pts[k]!, b.pts[k + 1]!);
        g.strokePath();
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
    // 尸王跳砸的落点：红圈，越收越紧
    for (const t of this.telegraphs) {
      t.life += dt;
      const k = Math.min(1, t.life / t.max);
      const col = t.color ?? 0xd23a2a;
      if (t.round) {
        // 石兽的圈按真实的受击范围画成正圆；外圈深色边，里面从圆心往外涨满就是落下的时候
        g.fillStyle(col, 0.06);
        g.fillCircle(t.x, t.y, t.r);
        g.lineStyle(9, 0x17131c, 0.6);
        g.strokeCircle(t.x, t.y, t.r);
        g.lineStyle(5, col, 0.95);
        g.strokeCircle(t.x, t.y, t.r);
        g.fillStyle(col, 0.1 + k * 0.2);
        g.fillCircle(t.x, t.y, t.r * k);
        continue;
      }
      g.lineStyle(4, 0xd23a2a, 0.9);
      g.strokeEllipse(t.x, t.y, t.r * 2, t.r * 1.3);
      g.fillStyle(0xd23a2a, 0.12 + k * 0.2);
      g.fillEllipse(t.x, t.y, t.r * 2 * k, t.r * 1.3 * k);
    }
    this.telegraphs = this.telegraphs.filter((t) => t.life < t.max);
  }

  /** 技能按钮：回放里收起；教学局升到 2 级才出现；第一次出现时交给 main 弹提示（每个角色一次）；冷却好了响一声 */
  private drawSkillButton(): void {
    const w = this.w;
    const def = skillOf(w);
    const replay = !!this.d.drive;
    const locked = this.skillLocked();
    if (!replay && !locked && !this.skillTold) {
      this.skillTold = true;
      this.d.onSkillShown?.(w);
    }
    const total = skillCooldown(w);
    const ready = skillReady(w);
    if (ready && !this.skillWasReady && !replay && w.skill.uses > 0) sfx.play('skillReady', { volume: 0.7 });
    this.skillWasReady = ready;
    this.d.hud.setSkill({
      show: !replay && !locked,
      icon: def.icon,
      name: def.name,
      cd: w.skill.cd <= 0 ? 1 : Math.max(0, 1 - w.skill.cd / total),
      active: def.dur > 0 && w.skill.active > 0 ? w.skill.active / def.dur : 0,
      left: w.skill.cd > 0 ? Math.ceil(w.skill.cd / TICKS_PER_SECOND) : 0,
      key: 'Q',
    });
  }

  private drawHud(): void {
    const w = this.w;
    const slots: HudSlot[] = w.weapons.map((o, k) => {
      const s = w.wstats[k]!;
      const cd = Math.max(4, Math.round(s.cd * w.stats.cdMul));
      const look = weaponLook(w, o);
      return { icon: look.icon, ...(look.half ? { half: true } : {}), level: o.evolved ? 9 : o.level, cd: o.id === 'flysword' || o.id === 'coins' || o.id === 'crane' || o.id === 'shield' ? 1 : Math.max(0, Math.min(1, 1 - o.timer / cd)) };
    });
    const raid = this.raid;
    this.drawSkillButton();
    this.d.hud.setBuffs(raid ? this.xinfaText() : this.buffText());
    this.d.hud.update({
      rush: !!w.rush,
      hp: Math.max(0, w.hp),
      hpMax: w.stats.hpMax,
      shield: w.shield,
      shieldMax: w.shieldMax,
      level: w.level,
      xp: w.xp / xpNeed(w.level, !!w.raid),
      left: w.rush ? RushShow.left(w) : ((raid ? RAID_DAWN : DAWN_TICK) - w.tick) / 30,
      event: raid || w.rush ? null : nextMapEvent(w.tick, w.setup),
      raid: raid ? { label: w.tick >= DAWN_WARN ? '天亮' : '离天亮', level: w.tick >= DAWN_RED ? 2 : w.tick >= DAWN_WARN ? 1 : 0, bag: raid.bag.length, value: raid.bag.reduce((a, id) => a + TREASURES[id]!.value, 0), boost: w.raidBoost } : undefined,
      kills: w.kills,
      coins: w.coins,
      slots,
      passives: PASSIVE_IDS.filter((id) => w.passives[id] !== undefined).map((id) => ({ icon: PASSIVES[id].icon, level: w.passives[id]! })),
      yy: yinyangSide(w),
    });
    // 低血：屏幕边红框 + 心跳（手感清单第 9 条）
    // 夜探最后 30 秒也用这层红框和心跳催人
    const low = ((w.hp > 0 && w.hp < w.stats.hpMax * 0.3) || (raid !== null && raid.outcome === 'none' && w.tick >= DAWN_RED)) && w.phase === 'play' && !this.paused;
    this.d.banners.setLow(low);
    if (low && this.now - this.lowBeat > 1000) {
      sfx.play('heartbeat', { volume: 0.7 });
      this.lowBeat = this.now;
    }
    // 音乐随时间加层：每 4 分钟一层
    const minute = Math.floor(w.tick / 1800);
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      if (!this.bossOn) music.setIntensity(Math.min(3, Math.floor(minute / 4)) as 0 | 1 | 2 | 3);
    }
  }
}
