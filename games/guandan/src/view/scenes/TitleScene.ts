/** 主页（标题页）：分层主视觉 + 面板（主按钮、模式卡、战绩），art-v3 PR ①。 */

import Phaser from 'phaser';
import { showA2hs } from '../common/a2hs.ts';
import { app } from '../app.ts';
import { audio } from '../common/audio.ts';
import { levelName } from '../guandan/labels.ts';
import { Session } from '../guandan/session.ts';
import { randomSeed } from '../common/seed.ts';
import type { TierId } from '../../variants/guandan/stake/index.ts';
import { LENGTH_CARD, LEVEL_CARD, STAKE_ERROR, TIER_NAME, stakeError } from '../common/stake-text.ts';
import { StakeSession, buyinStake, clearStake, loadStake, stakeExpired, stakeLeft } from '../guandan/stake.ts';
import { getDdzStats, getSettings, getStats, getVariant, loadDdzSave, loadSave, setVariant, updateSettings, type DdzDeal, type VariantId } from '../store.ts';
import { DdzSession, ddzFunOpts } from '../doudizhu/session.ts';
import { dailyPuzzleOf, startDailyPuzzle, startPuzzle } from '../doudizhu/puzzle.ts';
import { openPuzzlePicker } from '../ui/puzzles.ts';
import { DDZ_FLOW, DdzStakeSession, clearDdzStakeSave, ddzStakeExpired, ddzStakeLeft, loadDdzStakeSave } from '../doudizhu/stake.ts';
import { DDZ_DAILY_LEVEL, beijingDate, ddzDailySeed } from '../doudizhu/daily.ts';
import { DailySession } from '../guandan/daily.ts';
import { COLOR, LIGHT, RADIUS, TYPE, minHit, phoneType } from '../common/theme.ts';
import { FIGURE_SIZE, LANTERN_SIZE, homeLayout, panelRows } from '../common/home-layout.ts';
import { LOW_MEMORY } from '../common/device.ts';
import { anim, dur } from '../common/anim.ts';
import { goLobby } from '../common/lobby.ts';
import { startBackgroundBake, startWhenReady, titleBackdrop, upgradeTitleBackdrop } from '../common/textures.ts';
import { join, openMatch, openOnline } from '../online.ts';
import { currentUserId, myRoom } from '../common/room-link.ts';
import { cloudButton } from '../ui/cloud.ts';
import { Button, ModeCard, fitWidth, iconButton, modal, segmented, setHit, setTopHit, signedLine, text, toast, vGradient, worldH, worldW, type ButtonStyle, type Modal } from '../ui/kit.ts';
import { confirm, openDdzRules, openRules, openSettings, openStats } from '../ui/panels.ts';
import { openAchievements } from '../ui/achievements.ts';
import { openLevelPicker, openTierPicker } from '../ui/stake.ts';
import { detectOnce, platformKnown, standalone } from '../common/platform.ts';
import type { SoloLevel } from '../../variants/guandan/ai/venue.ts';

/** 斗地主面板的一句玩法（掼蛋面板这个位置是主按钮，不放） */
/** 右上角图标的名字（电脑上鼠标停上去冒出来） */
const ICON_LABEL: Record<string, string> = { rules: '规则', settings: '设置', stats: '战绩', achievements: '成就' };
/** 还没打过的战绩条：一句话加下一步（点这条开快速局，控件名 statsEmpty） */
// 空战绩条：右边挤着每日挑战（斗地主还有残局），话要短到 1280 宽也不用省略号截（docs/ui.md 第 10 节）
const EMPTY_STATS_LINE = '还没打过 · 去打一局 ›';
const EMPTY_STATS_SHORT = '去打一局 ›';
const PITCH_DDZ ='一个地主对两个农民，谁先出完谁那边赢';
const PITCH_DDZ_SHORT = '一个地主对两个农民';

/** screen= 只在打开页面后的第一次主页生效，回到主页不再弹 */
let screenOpened = false;

export class TitleScene extends Phaser.Scene {
  private buttons: Record<string, Phaser.GameObjects.Container> = {};
  private cloudBtn: Phaser.GameObjects.Container | null = null;
  private lobbyBtn: Button | null = null;
  /** 本机记着这个账号的房间时才有 */
  private backBtn: Button | null = null;
  overlay: Modal | null = null;

  /** 掼蛋 / 斗地主切换的两个点（冒烟点它） */
  private variantAt: Record<VariantId, { x: number; y: number }> | null = null;
  /** 主页切换的点按区下沿：主按钮的点按区从这里往下 */
  private hitTop = 0;

  constructor() {
    super('title');
  }

  /**
   * 主页（art-v3 PR ①，docs/art.md 第 4 节）：左边分层主视觉（背景、能摆的灯笼、四个人），右边一块面板：
   * 标题、一句玩法、主按钮（接着打实盘 / 继续上局 / 快速开始）、模式卡（娱乐 / 实盘 / 好友房）、战绩小条。
   * 规则、设置、战绩、成就、云存档是右上角的图标。控件名：resumeStake、continue、quick、fun、stake、online、back、lobby、rules、settings、stats、achievements、cloud、daily（每日挑战）
   */
  create(): void {
    // 启动时不等 /api/me：先按有平台画；问完发现是单独部署（没有实盘、云存档、每日挑战，"大厅"变"首页"）就重画一次
    if (!platformKnown()) void detectOnce().then(() => standalone() && this.scene.isActive() && this.scene.restart());
    this.cameras.main.setOrigin(0, 0).setZoom(this.scale.gameSize.height / worldH(this));
    const W = worldW(this);
    const L = homeLayout(W, worldH(this));
    const P = L.panel;
    const R = panelRows(P.h);
    // 灯笼晃、人物呼吸、火星：省内存设备和关了动画（anim=0、截图）时不开
    const lively = LOW_MEMORY === 0 && !anim.instant;
    this.buttons = {};
    this.overlay = null;
    this.variantAt = null;
    const bg = this.add.image(0, 0, titleBackdrop(this, W, worldH(this))).setOrigin(0, 0).setDisplaySize(W, worldH(this));
    upgradeTitleBackdrop(this, bg, W, worldH(this));

    // 灯笼轻摆、四个人轻轻起伏（错开节奏）；省内存模式只摆静图
    for (const [i, l] of L.lanterns.entries()) {
      const img = this.add.image(l.x, l.y, 'home:lantern').setOrigin(0.5, LANTERN_SIZE.pivotY / LANTERN_SIZE.h).setDisplaySize(LANTERN_SIZE.w * l.s, LANTERN_SIZE.h * l.s).setDepth(2);
      if (lively) {
        img.setAngle(-2.5);
        this.tweens.add({ targets: img, angle: 2.5, duration: 2600 + i * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 700 });
      }
    }
    for (const [i, fg] of L.figures.entries()) {
      const w = FIGURE_SIZE.w * fg.s;
      const h = FIGURE_SIZE.h * fg.s;
      const img = this.add.image(fg.x, fg.y, `home:fig:${fg.id}`).setOrigin(0.5, FIGURE_SIZE.footY / FIGURE_SIZE.h).setDisplaySize(w, h).setAngle(fg.tilt).setDepth(3 + i);
      if (lively) this.tweens.add({ targets: img, y: fg.y - 4, scaleY: img.scaleY * 1.012, duration: 1700 + i * 230, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 420 });
    }
    if (lively) {
      // 飘落的金粉，灯下的热闹
      this.add.particles(0, -10, 'particle:spark', {
        x: { min: 0, max: L.artW },
        speedY: { min: 18, max: 50 },
        speedX: { min: -12, max: 12 },
        lifespan: 14000,
        scale: { min: 0.25, max: 0.6 },
        alpha: { start: 0.8, end: 0 },
        frequency: 520,
      }).setDepth(8);
    }

    // 右边的面板：深漆底、金边
    const g = this.add.graphics().setDepth(10);
    // 卡通风格（0.27.0；0.27.1 补质感）：柔和投影、深墨下沿、暖棕面板上亮下暗、深墨描边，里面一圈金线
    g.fillStyle(0x000000, 0.25).fillRoundedRect(P.x - 6, P.y + 14, P.w + 12, P.h + 4, RADIUS.xl + 4);
    g.fillStyle(0x2b1d14, 1).fillRoundedRect(P.x, P.y + 8, P.w, P.h, RADIUS.xl);
    // 面板面：顶灯照下来，上面暖亮、下面沉到近黑（连续渐变，不再是上 35% 一块、下面一块）
    vGradient(g, P.x, P.y, P.w, P.h, RADIUS.xl, [0x5a3419, 0x34190d, 0x1a0c06]);
    // 内阴影：四边往里压一圈暗，面板像是凹进漆里的托盘，标题和主按钮落在亮处；顶边内侧一道暖白细线是光打在边上
    g.lineStyle(18, LIGHT.shadow, 0.3).strokeRoundedRect(P.x + 8, P.y + 8, P.w - 16, P.h - 16, RADIUS.xl - 4);
    // 标题后面一团暖光，把视线引到"牌馆"和主按钮上
    for (const [k, a] of [[1, 0.025], [0.85, 0.025], [0.7, 0.03], [0.55, 0.03], [0.4, 0.035]] as const) g.fillStyle(0xffc06a, a).fillEllipse(P.x + P.w / 2, P.y + R.logo + 26, P.w * 0.9 * k, 230 * k);
    g.lineStyle(3, 0x2b1d14, 1).strokeRoundedRect(P.x, P.y, P.w, P.h, RADIUS.xl);
    g.lineStyle(1.5, LIGHT.highlight, 0.5).lineBetween(P.x + RADIUS.xl, P.y + 2.5, P.x + P.w - RADIUS.xl, P.y + 2.5);
    g.lineStyle(2, COLOR.gold, 0.8).strokeRoundedRect(P.x + 8, P.y + 8, P.w - 16, P.h - 16, RADIUS.xl - 6);
    const cx = P.x + P.w / 2;
    const inner = P.w - 48;

    // 牌馆：掼蛋 + 斗地主两个玩法，标题写"牌馆"
    const logo = this.add.image(cx, P.y + R.logo, 'logo:hall').setDisplaySize(380, 161).setDepth(20);
    if (lively) {
      logo.setAlpha(0).setScale(logo.scaleX * 1.2);
      this.tweens.add({ targets: logo, alpha: 1, scale: logo.scaleX / 1.2, duration: dur(520), ease: 'Back.easeOut' });
    }
    // 掼蛋 / 斗地主的切换（docs/doudizhu.md 第 4 节），上次选的记在 guandan.variant
    const variant: VariantId = getVariant();
    // 点按区要 minHit() 高（手机横屏约 82–100），下面紧挨着主按钮：下沿对齐画出来的底边（高 44），往上伸进标题字（字点不了）
    const hitM = minHit();
    const segY = P.y + R.seg;
    const seg = segmented(this, cx - 75, segY, [{ label: '掼蛋', value: 'guandan' }, { label: '斗地主', value: 'ddz' }], variant, (v) => {
      setVariant(v as VariantId);
      this.scene.restart();
    }, 150, hitM, 22 - hitM / 2).setDepth(20);
    // 主按钮的点按区从切换的下沿往下数，不和它压着
    this.hitTop = segY + 23;
    this.variantAt = { guandan: { x: seg.x, y: seg.y }, ddz: { x: seg.x + 150, y: seg.y } };
    if (variant === 'ddz') {
      // 今日残局现算一次要几百毫秒（慢手机上一两秒）：牌桌素材烘完、主页闲着时先算好，点开选关就不卡
      void startBackgroundBake(this).then(() => this.scene.isActive() && this.time.delayedCall(800, () => dailyPuzzleOf()));
      this.buildDdzPanel(P, cx, inner, R);
      this.buildCorner(W, L.portrait);
      return;
    }

    const save = loadSave();
    // 单机实盘的存档（只在这台设备上）：过了 24 小时钱包已经原样退回，删掉说一句；没过就把主按钮换成"接着打实盘"
    // 单独部署（0.8.0）没有钱包：不摆实盘（本来也不会有实盘存档，存档跟着站点走）
    let stake = standalone() ? null : loadStake();
    if (stake && stakeExpired(stake)) {
      clearStake(stake.ref);
      stake = null;
      this.time.delayedCall(600, () => toast(this, STAKE_ERROR.expired!, W / 2, worldH(this) - 60));
    }
    const saved = save && save.state.phase !== 'gameOver' ? `第 ${save.state.dealNo} 副 · 我方 ${levelName(save.state.levels[0])} · 对方 ${levelName(save.state.levels[1])}` : null;
    const by = P.y + R.main;
    // 按钮下面一行小字：sub 里的 {0} 是要红绿的分（nums），没有就整行原样
    const primary = (key: string, label: string, sub: string, fn: () => void, nums: number[] = []): { btn: Button; line: Phaser.GameObjects.Container } => {
      const btn = new Button(this, cx, by, inner, 72, label, 'red', fn, 'play').setDepth(20);
      this.belowSeg(btn, by, inner);
      this.buttons[key] = btn;
      const line = signedLine(this, cx, by + 52, sub, nums, { size: TYPE.small, color: 0xf6e4c0, dark: true }).setDepth(20);
      return { btn, line };
    };
    if (stake) {
      const left = stakeLeft(stake);
      const { btn, line } = primary('resumeStake', stake.settle ? '结回上次的实盘' : '接着打实盘', `${TIER_NAME[stake.tier]} · 打完 ${left.dealsDone}/${left.dealsTotal} 副 · {0} 分`, () => this.resumeStake(), [left.points]);
      // 换了账号的人看不到上一个人的实盘（存档留着，那一份到期退回给原来的账号），主按钮换回"快速开始"
      const ref = stake.ref;
      const owner = stake.userId;
      void currentUserId().then((uid) => {
        if (uid === owner || !this.sys.isActive() || loadStake()?.ref !== ref) return;
        btn.destroy();
        line.destroy();
        delete this.buttons.resumeStake;
        this.addQuick(primary, saved);
      });
    } else this.addQuick(primary, saved);

    // 模式卡：娱乐（选难度）、实盘（选档）、好友房；单独部署没有实盘
    const modes: [string, string, string, ButtonStyle, string, () => void][] = [
      ['fun', '娱乐', '随便玩', 'green', 'robot', () => this.pickFun(saved)],
      ...(standalone() ? [] : [['stake', '实盘', '带一份筹码', 'gold', 'crown', () => this.pickStake()] as [string, string, string, ButtonStyle, string, () => void]]),
      ['online', '好友房', '叫朋友来', 'blue', 'cards', () => openOnline()],
    ];
    const gap = 16;
    const cw = (inner - gap * (modes.length - 1)) / modes.length;
    const cy = P.y + R.cards;
    modes.forEach(([key, name, desc, style, icon, fn], i) => {
      const card = new ModeCard(this, P.x + 24 + cw / 2 + i * (cw + gap), cy, cw, R.cardH, name, desc, style, icon, fn).setDepth(20);
      this.buttons[key] = card;
      if (lively) {
        card.setAlpha(0);
        this.tweens.add({ targets: card, alpha: 1, y: { from: cy + 24, to: cy }, duration: dur(320), delay: dur(200 + i * 80), ease: 'Cubic.easeOut' });
      }
    });

    // 战绩小条：点了打开战绩；新账号给一句空状态
    const st = getStats();
    const sy = P.y + P.h - 62;
    const strip = this.add.graphics().setDepth(19);
    strip.fillStyle(0xffffff, 0.06).fillRoundedRect(P.x + 24, sy - 30, inner, 60, RADIUS.lg);
    // 有每日挑战按钮时文字只剩 inner - 200 宽，话短一点，不用省略号截
    const daily0 = !standalone();
    const line = st.games > 0
      ? daily0
        ? `胜率 ${Math.round((st.wins / st.games) * 100)}%  ·  头游 ${st.firsts} 次`
        : `胜率 ${Math.round((st.wins / st.games) * 100)}%  ·  最高连胜 ${st.bestStreak}  ·  头游 ${st.firsts} 次`
      : EMPTY_STATS_LINE;
    // 战绩条右边是每日挑战（全服同一副牌，打完上今天的榜；单独部署没有榜，不摆）
    const daily = !standalone();
    const lx = daily ? P.x + 24 + (inner - 176) / 2 : cx;
    fitWidth(text(this, lx, sy, line, { size: TYPE.label, color: st.games > 0 ? COLOR.goldLight : 0xd8c6a6 }).setDepth(20), daily ? inner - 200 : inner - 24);
    // 条只有 60 高，手机横屏缩下来不到 44 CSS 像素：点按区按 minHit() 往上下扩（上面的模式卡底边离得够远）；有每日挑战按钮时只占左边那段
    const statsH = Math.max(60, minHit());
    const statsW = daily ? inner - 176 : inner;
    const statsHit = this.add.zone(daily ? P.x + 24 + statsW / 2 : cx, sy, statsW, statsH).setDepth(21);
    setHit(statsHit, statsW, statsH);
    // 还没有战绩时这条是"去打一局"：和快速开始同一条路径；控件名 statsEmpty（有战绩后还叫 stats 那个右上角图标，这条不进控件表）
    if (st.games > 0) statsHit.on('pointerup', () => this.openStatsPanel());
    else {
      statsHit.on('pointerup', () => (saved ? this.continueGame() : this.newGame()));
      this.buttons.statsEmpty = this.add.container(statsHit.x, statsHit.y);
    }
    if (daily) {
      // 点按区往下挪到模式卡底边以下（手机横屏要 minHit() 高，居中会伸进卡里）
      const dh = Math.max(48, minHit());
      const top = Math.max(sy - dh / 2, cy + R.cardH / 2 + 1);
      this.buttons.daily = new Button(this, P.x + 24 + inner - 88, sy, 160, 48, '每日挑战', 'gold', () => this.newGdDaily(), 'crown').setHit(160, dh, top + dh / 2 - sy).setDepth(20);
    }

    this.buildCorner(W, L.portrait);
  }

  /** 主按钮的点按区：minHit() 高，居中会压到上面的切换时整体往下挪（下面的模式卡离得够远） */
  private belowSeg(btn: Button, by: number, w: number): void {
    const h = Math.max(72, minHit());
    const top = Math.max(by - h / 2, this.hitTop);
    btn.setHit(w, h, top + h / 2 - by);
  }

  /** 手机（竖屏或手机横屏）：顶栏最多 4 个图标（docs/ui.md 第 10 节），成就收进战绩面板 */
  private compactBar(): boolean {
    return worldH(this) > worldW(this) || phoneType();
  }

  private openAchievementsPanel(): void {
    this.overlay = openAchievements(this, getVariant() === 'ddz' ? 'ddz' : 'gd');
  }

  private openStatsPanel(): void {
    this.overlay = openStats(this, this.compactBar() ? () => this.openAchievementsPanel() : undefined);
  }

  /** 右上角的图标、左上角的回大厅和回到房间、版本号、音乐（掼蛋和斗地主的主页共用） */
  private buildCorner(W: number, portrait: boolean): void {
    // 右上角：规则、设置、战绩、成就（手机上收进战绩）、云存档（图标），左上角：回大厅、回到房间
    const icons: [string, string, () => void][] = [
      ['rules', 'rules', () => (this.overlay = getVariant() === 'ddz' ? openDdzRules(this) : openRules(this))],
      ['settings', 'settings', () => (this.overlay = openSettings(this))],
      ['stats', 'stats', () => this.openStatsPanel()],
      // 成就没有专用图标，借奖杯皇冠
      ...(this.compactBar() ? [] : [['achievements', 'crown', () => this.openAchievementsPanel()] as [string, string, () => void]]),
    ];
    const step = Math.max(64, minHit() + 4);
    // 点按区从屏幕上沿往下算（setTopHit），居中的话手机横屏上伸出屏幕的一截点不到
    const topH = Math.max(60, minHit());
    let ix = W - Math.max(44, topH / 2);
    this.cloudBtn = cloudButton(this, ix, 44, 52).setDepth(20);
    setTopHit(this.cloudBtn, topH, topH);
    if (standalone()) this.cloudBtn.setVisible(false);
    else ix -= step;
    for (const [key, icon, fn] of icons) {
      const b = iconButton(this, ix, 44, icon, fn, 52, ICON_LABEL[key]).setDepth(20);
      setTopHit(b, topH, topH);
      this.buttons[key] = b;
      ix -= step;
    }
    // URL 的 screen=rules|settings|stats（截图用，params.ts）：主页起来后直接打开那个弹窗，整个页面只开一次
    const want = icons.find(([key]) => key === app.params?.screen);
    if (want && !screenOpened) {
      screenOpened = true;
      want[2]();
    }
    // 回大厅（平台首页）：主页不在对局中，直接走。单独部署没有账号和大厅：主页就是游戏首页
    this.lobbyBtn = new Button(this, 74, 40, 120, 52, '大厅', 'wood', () => goLobby(), 'home').setDepth(20);
    setTopHit(this.lobbyBtn, 120, topH);
    if (standalone()) this.lobbyBtn.setVisible(false).disableInteractive();
    // 本机记着这个账号刚才的房间（回大厅、关了页面）时左上角给"回到房间"，先问平台现在是谁，换了账号的人看不到上一个人的房间。
    // 竖屏只有 720 宽，右上角的图标排到中间了：放到"大厅"下面一行
    const bx = standalone() || portrait ? 108 : 244;
    const byy = portrait && !standalone() ? 40 + topH + 8 : 40;
    this.backBtn = null;
    void myRoom().then((back) => {
      if (!back || !this.sys.isActive() || this.backBtn) return;
      this.backBtn = new Button(this, bx, byy, 180, 52, '回到房间', 'red', () => join(back.code, back.host, null, false, back.variant ?? 'guandan'), 'cards').setDepth(20);
      setTopHit(this.backBtn, 180, topH);
    });

    text(this, W - 16, worldH(this) - 10, `v${__APP_VERSION__}`, { size: TYPE.small, color: 0xb8a690, ox: 1, oy: 1 }).setDepth(20).setAlpha(0.7);
    audio.music('title');
    showA2hs(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => showA2hs(false));
  }

  /**
   * 斗地主的面板：主按钮（接着打实盘 / 继续上局 / 快速开始）、三张卡（娱乐：选难度、快速匹配；实盘；好友房）、战绩条（右边是每日挑战）。
   */
  private buildDdzPanel(P: { x: number; y: number; w: number; h: number }, cx: number, inner: number, R: ReturnType<typeof panelRows>): void {
    // 手机横屏字号托底放大，整句放不下：删字不缩字（AGENTS 画面层约定），再按面板宽度兜底
    const phone = phoneType();
    fitWidth(text(this, cx, P.y + R.pitch, phone ? PITCH_DDZ_SHORT : PITCH_DDZ, { size: TYPE.small, color: 0xf6e4c0 }).setDepth(20), inner);
    const save = loadDdzSave();
    // {0} 是我的分（按钮下的小字红绿）；pickDdz 只看有没有
    const saved = save && save.state.phase !== 'gameOver' ? `第 ${save.state.dealNo}/${save.state.opts.deals} 副 · 我 {0} 分` : null;
    const level = getSettings().difficulty;
    const by = P.y + R.mainDdz;
    // 主按钮：有没结完的实盘先接着打（或去结算），否则有存档"继续上局"，否则"快速开始"。过期没结的那一份平台已经原样退回，存档删掉
    let stake = standalone() ? null : loadDdzStakeSave();
    if (stake && !stake.settle && ddzStakeExpired(stake)) {
      clearDdzStakeSave(stake.ref);
      stake = null;
    }
    if (stake) {
      const s = stake;
      const left = ddzStakeLeft(s);
      this.buttons.resumeStake = new Button(this, cx, by, inner, 72, s.settle ? '结回上次的实盘' : '接着打实盘', 'red', () => this.startDdzStake(DdzStakeSession.fromSave(s)), 'play').setDepth(20);
      signedLine(this, cx, by + 52, `${TIER_NAME[s.tier]} · 打完 ${left.dealsDone}/${s.state.opts.deals} 副 · {0} 分`, [left.points], { size: TYPE.small, color: 0xf6e4c0, dark: true }).setDepth(20);
    } else {
      const btn = saved
        ? new Button(this, cx, by, inner, 72, '继续上局', 'red', () => this.continueDdz(), 'play')
        : new Button(this, cx, by, inner, 72, '快速开始', 'red', () => this.newDdz(level), 'play');
      this.buttons[saved ? 'continue' : 'quick'] = btn.setDepth(20);
      const sub = saved ?? `娱乐 · ${LEVEL_CARD[level].name}${getSettings().ddzDeal === 'clump' ? ' · 不洗牌' : ''}`;
      signedLine(this, cx, by + 52, sub, save ? [save.state.scores[0]!] : [], { size: TYPE.small, color: 0xf6e4c0, dark: true }).setDepth(20);
    }
    // 模式卡（和掼蛋同一种排法）：娱乐（选难度）、实盘（选档，单独部署没有钱包不摆）、好友房
    const modes: [string, string, string, ButtonStyle, string, () => void][] = [
      ['fun', '娱乐', phone ? '随便玩' : '和稳哥、幺妹儿', 'green', 'robot', () => this.pickDdz(saved)],
      ...(standalone() ? [] : [['stake', '实盘', phone ? '带筹码' : '带一份筹码', 'gold', 'crown', () => this.pickDdzStake()] as [string, string, string, ButtonStyle, string, () => void]]),
      // 好友房：开房时带上玩法（斗地主），3 个座位
      ['online', '好友房', '叫朋友来', 'blue', 'cards', () => openOnline('ddz')],
    ];
    const gap = 16;
    const cw = (inner - gap * (modes.length - 1)) / modes.length;
    modes.forEach(([key, name, desc, style, icon, fn], i) => {
      this.buttons[key] = new ModeCard(this, P.x + 24 + cw / 2 + i * (cw + gap), P.y + R.cardsDdz, cw, R.cardH, name, desc, style, icon, fn).setDepth(20);
    });
    const st = getDdzStats();
    const sy = P.y + P.h - 62;
    const strip = this.add.graphics().setDepth(19);
    strip.fillStyle(0xffffff, 0.06).fillRoundedRect(P.x + 24, sy - 30, inner, 60, RADIUS.lg);
    const line = st.games > 0 ? `赢了 ${st.wins}/${st.games} 局` : EMPTY_STATS_SHORT;
    // 战绩条右边是"残局"（明牌闯关，不用平台）和每日挑战（全服同一副牌，打完上今天的榜；单独部署没有榜，不摆），两个并排
    const daily = !standalone();
    const pw = 108;
    const right = P.x + 24 + inner;
    const puzzleX = daily ? right - 176 - 8 - pw / 2 : right - pw / 2;
    const textW = puzzleX - pw / 2 - 8 - (P.x + 24);
    fitWidth(text(this, P.x + 24 + textW / 2, sy, line, { size: TYPE.label, color: st.games > 0 ? COLOR.goldLight : 0xd8c6a6 }).setDepth(20), textW - 8);
    // 点按区往下挪到模式卡底边以下（手机横屏要 minHit() 高，居中会伸进卡里）
    const dh = Math.max(48, minHit());
    const top = Math.max(sy - dh / 2, P.y + R.cardsDdz + R.cardH / 2 + 1);
    if (st.games === 0) {
      // 空战绩条 = "去打一局"，和主按钮同一条路径（有存档就继续上局，不覆盖）
      const zx = P.x + 24 + textW / 2;
      const zone = this.add.zone(0, 0, textW, dh).setDepth(21);
      setHit(zone, textW, dh);
      zone.setPosition(0, top + dh / 2 - sy);
      zone.on('pointerup', () => (saved ? this.continueDdz() : this.newDdz(level)));
      this.buttons.statsEmpty = this.add.container(zx, sy, [zone]).setDepth(21);
    } else {
      // 有战绩时和掼蛋一样，点战绩条打开战绩（停在斗地主页签）
      const zone = this.add.zone(P.x + 24 + textW / 2, top + dh / 2, textW, dh).setDepth(21);
      setHit(zone, textW, dh);
      zone.on('pointerup', () => this.openStatsPanel());
    }
    this.buttons.puzzles = new Button(this, puzzleX, sy, pw, 48, '残局', 'green', () => this.pickPuzzle(), 'cards').setHit(Math.max(pw, minHit()), dh, top + dh / 2 - sy).setDepth(20);
    if (daily) {
      this.buttons.daily = new Button(this, right - 88, sy, 160, 48, '每日挑战', 'gold', () => this.newDdzDaily(), 'crown').setHit(160, dh, top + dh / 2 - sy).setDepth(20);
    }
  }

  /** 斗地主残局：选关弹窗，选了就进那一关的牌桌 */
  pickPuzzle(): void {
    this.overlay = openPuzzlePicker(this, {
      onPick: (p) => {
        this.overlay = null;
        startPuzzle(p);
        startWhenReady(this, 'ddz');
      },
      onDaily: () => {
        this.overlay = null;
        startDailyPuzzle();
        startWhenReady(this, 'ddz');
      },
      onClose: () => (this.overlay = null),
    });
  }

  /** 斗地主实盘：选档位（和掼蛋同一个选档页，换成斗地主的规则和带入，多一个经典 / 不洗牌）；快速匹配排不到就转这一档、这种发牌的单机（照常带入一份） */
  pickDdzStake(): void {
    this.overlay = openTierPicker(this, (ses) => this.startDdzStake(ses), (tier, mode) => openMatch(tier, () => void this.soloDdzStake(tier, mode), 'ddz', mode === 'clump'), DDZ_FLOW);
  }

  private async soloDdzStake(tier: TierId, mode: string): Promise<void> {
    if (!this.scene.isActive()) return;
    const r = await DDZ_FLOW.buyin(tier, mode);
    if (!this.scene.isActive()) return;
    if (r.ok) this.startDdzStake(r.ses);
    else toast(this, stakeError(r.error), worldW(this) / 2, worldH(this) - 60);
  }

  startDdzStake(ses: DdzStakeSession): void {
    app.ddz = ses;
    startWhenReady(this, 'ddz');
  }

  continueDdz(): void {
    const ses = DdzSession.restore();
    if (!ses) return this.newDdz(getSettings().difficulty);
    app.ddz = ses;
    startWhenReady(this, 'ddz');
  }

  newDdz(level: SoloLevel): void {
    app.ddz = DdzSession.fresh(app.params?.seed ?? randomSeed(), level, ddzFunOpts(getSettings().ddzDeal));
    if (app.params?.autoplay) app.ddz.autoplay = true;
    startWhenReady(this, 'ddz');
  }

  /** 斗地主每日挑战：今天的种子、普通难度，不存档、不记战绩（不碰"继续上局"的那一局） */
  newDdzDaily(): void {
    const date = beijingDate(Date.now());
    const ses = DdzSession.fresh(ddzDailySeed(date), DDZ_DAILY_LEVEL, undefined, false);
    ses.daily = date;
    if (app.params?.autoplay) ses.autoplay = true;
    app.ddz = ses;
    startWhenReady(this, 'ddz');
  }

  /** 斗地主娱乐：上面一排选发牌（经典 / 不洗牌，记住上次的），下面选难度（三档，和掼蛋共用设置里的难度）；有存档时再确认一次 */
  pickDdz(saved: string | null): void {
    // 行距至少 minHit()：手机横屏上按钮的点按区要 44 CSS 像素高，行距 90 时上下压着；多出来的高度加在弹窗上
    const pitch = Math.max(90, minHit());
    const H = 600 + 3 * (pitch - 90);
    const m = modal(this, 720, H, '选难度', { onClose: () => (this.overlay = null) });
    this.overlay = m;
    const levels: SoloLevel[] = ['novice', 'normal', 'pro'];
    const fresh = (lv: SoloLevel): void => {
      if (saved) this.overlay = confirm(this, '重新开一局？现在这局的进度会丢掉', '开新局', () => this.newDdz(lv), undefined, true);
      else this.newDdz(lv);
    };
    const top = -H / 2 + 90;
    const seg = segmented(this, -120, top, [{ label: '经典洗牌', value: 'classic' }, { label: '不洗牌 · 炸弹多', value: 'clump' }], getSettings().ddzDeal, (v) => updateSettings({ ddzDeal: v as DdzDeal }), 240, Math.max(60, minHit()));
    m.body.add(seg);
    m.body.setData('seg:deal', seg);
    m.body.add(text(this, 0, top + 46, '不洗牌：牌成团地发，炸弹多、翻倍大，每副最多 48 分', { size: TYPE.small, color: COLOR.muted }));
    levels.forEach((lv, i) => {
      const b = new Button(this, 0, top + 70 + pitch / 2 + i * pitch, 420, 72, LEVEL_CARD[lv].name, lv === getSettings().difficulty ? 'red' : 'wood', () => {
        m.close();
        updateSettings({ difficulty: lv });
        fresh(lv);
      }, 'play');
      m.body.add(b);
      m.body.setData(`btn:level:${lv}`, b);
    });
    // 快速匹配（牌馆 ⑤）：排 ddz-fun 档；排不到就按现在的难度开一局单机
    const match = new Button(this, 0, top + 70 + pitch / 2 + 3 * pitch, 420, 72, '快速匹配', 'blue', () => {
      m.close();
      this.overlay = null;
      openMatch(null, () => this.scene.isActive() && fresh(getSettings().difficulty), 'ddz');
    }, 'cards');
    m.body.add(match);
    m.body.setData('btn:match', match);
  }

  /** 主按钮：有娱乐存档时"继续上局"，没有就"快速开始"（按上次选的难度直接开一局娱乐） */
  private addQuick(primary: (key: string, label: string, sub: string, fn: () => void) => unknown, saved: string | null): void {
    if (saved) primary('continue', '继续上局', saved, () => this.continueGame());
    else {
      const s = getSettings();
      primary('quick', '快速开始', `娱乐 · ${LEVEL_CARD[s.difficulty].name} · ${LENGTH_CARD[s.length].name}`, () => this.newGame());
    }
  }

  /** 弹层（规则、设置、战绩）开着时不重建画面；关掉后 root 已销毁，scene 为空 */
  canRebuild(): boolean {
    return !this.overlay?.root.scene;
  }

  continueGame(): void {
    const ses = Session.restore();
    if (!ses) {
      this.newGame();
      return;
    }
    app.session = ses;
    startWhenReady(this, 'table');
  }

  newGame(seed = randomSeed()): void {
    app.session = Session.fresh(seed);
    startWhenReady(this, 'table');
  }

  /** 娱乐：先选难度（docs/balance.md 第 3 节：新手 / 普通 / 高手），有存档时再确认一次 */
  pickFun(saved: string | null): void {
    const s = getSettings();
    const fresh = (): void => {
      if (saved) this.overlay = confirm(this, '重新开一局？现在这局的进度会丢掉', '开新局', () => this.newGame(), undefined, true);
      else this.newGame();
    };
    this.overlay = openLevelPicker(
      this,
      s.difficulty,
      s.length,
      (difficulty, length) => {
        updateSettings({ difficulty, length });
        fresh();
      },
      // 快速匹配（0.26.0）：排不到就按现在的难度、局长开一局单机
      () => openMatch(null, () => this.scene.isActive() && fresh()),
    );
  }

  /** 实盘：选档位（docs/stake.md 2.1）；快速匹配排不到就转这一档的单机（照常带入一份） */
  pickStake(): void {
    this.overlay = openTierPicker(
      this,
      (ses) => this.startStake(ses),
      (tier) => openMatch(tier, () => void this.soloStake(tier)),
    );
  }

  private async soloStake(tier: TierId): Promise<void> {
    if (!this.scene.isActive()) return;
    const r = await buyinStake(tier);
    if (!this.scene.isActive()) return;
    if (r.ok) this.startStake(r.ses);
    else toast(this, stakeError(r.error), worldW(this) / 2, worldH(this) - 60);
  }

  /** 掼蛋每日挑战：今天的种子、三个普通电脑、默认规则，不存档、不记战绩（不碰"继续上局"的那一局） */
  newGdDaily(): void {
    const ses = DailySession.start(beijingDate(Date.now()));
    if (app.params?.autoplay) ses.autoplay = true;
    app.session = ses;
    startWhenReady(this, 'table');
  }

  startStake(ses: StakeSession): void {
    app.session = ses;
    startWhenReady(this, 'table');
  }

  resumeStake(): void {
    const s = loadStake();
    if (!s) {
      this.scene.restart();
      return;
    }
    this.startStake(new StakeSession(s));
  }

  controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const [k, b] of Object.entries(this.buttons)) out[k] = { x: b.x, y: b.y };
    if (this.cloudBtn?.visible) out.cloud = { x: this.cloudBtn.x, y: this.cloudBtn.y };
    if (this.lobbyBtn?.visible) out.lobby = { x: this.lobbyBtn.x, y: this.lobbyBtn.y };
    if (this.backBtn) out.back = { x: this.backBtn.x, y: this.backBtn.y };
    if (this.variantAt) for (const [k, p] of Object.entries(this.variantAt)) out[`variant:${k}`] = p;
    // 弹层里的按钮（选模式、选档位）：坐标是弹层里的，加上弹层的位置
    const body = this.overlay?.root.scene ? this.overlay.body : null;
    for (const [k, v] of Object.entries((body?.data?.getAll() ?? {}) as Record<string, unknown>)) {
      // 选项组（局长、和电脑 / 快速匹配）：每一项叫 <名字>:<第几项>
      if (k.startsWith('seg:') && v instanceof Phaser.GameObjects.Container) {
        v.list.filter((o) => o instanceof Phaser.GameObjects.Zone).forEach((z, i) => {
          const zone = z as Phaser.GameObjects.Zone;
          out[`${k.slice(4)}:${i}`] = { x: body!.x + v.x + zone.x, y: body!.y + v.y + zone.y };
        });
        continue;
      }
      if (!k.startsWith('btn:') || !(v instanceof Button) || !v.scene || !v.enabled) continue;
      out[k.slice(4)] = { x: body!.x + v.x, y: body!.y + v.y };
    }
    return out;
  }
}

