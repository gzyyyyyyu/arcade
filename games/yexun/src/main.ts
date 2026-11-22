/**
 * 入口：开始菜单 → 守夜一局 → 结算（再来一局 / 换难度 / 大厅）。第一次打开只有一个大按钮，第一局带最多 3 条引导。
 * 画布按 CSS 尺寸 × 渲染倍数开，再用 CSS 缩回去：手机上不糊，省内存设备倍数封顶 2（viewport.ts）。
 * 调试参数：?seed=123 固定种子，?danger=0–8，?play 跳过菜单直接开局，?auto 让机器人代打、?warp=9000 先快进到第 9000 拍、&choose 停在选卡、?give=mirror:8,gourd:8 开局换法器（这几个只在开发服务器里有，冒烟截图用），?sheet 看图集。
 */
import type Phaser from 'phaser';
import { DAWN_TICK, type Danger } from './content/waves.ts';
import { COIN_EXCHANGE, CURSE_IDS, LOOKS, MAX_CURSES } from './content/meta.ts';
import type { Setup, World } from './core/index.ts';
import { autoSkillSetting } from './view/game/autoskill.ts';
import { buyChar, buyLook, buyPerk, dangerOpen, loadoutSetup, loadSave, mapOpen, payKits, refundPerks, saveHooks, setLoadout, settings, trialTierOpen, wearLook, weekGoalView, writeSave } from './platform/save.ts';
import { ExchangeClient } from './platform/exchange.ts';
import type { ExchangeView } from './view/ui/prepShop.ts';
import { SCHOOLS } from './content/guide.ts';
import { hasLoginHint, startCloud } from './platform/cloud.ts';
import { createLive, liveSetup } from './platform/live.ts';
import { liveCharOk, LIVE_TIERS, liveMapOk, type LiveTier } from './content/live.ts';
import { loadRecords, RunTally } from './meta/records.ts';
import { AchievementToast, Codex } from './view/ui/codex.ts';
import { Guide } from './view/ui/guide.ts';
import { Recorder } from './replay/recorder.ts';
import { loadReplays } from './replay/store.ts';
import { ReplayList } from './replay/view/list.ts';
import { ReplayBar } from './replay/view/bar.ts';
import type { ReplayRecord } from './replay/format.ts';
import { BoardsPanel } from './online/view/boards.ts';
import { createSocial } from './online/social.ts';
import { mountSocial } from 'arcade-kit/social';
import { createSubmitter } from './online/submit.ts';
import { beijingDate, dailyPlan } from './online/daily.ts';
import { weekDaysLeft, weekIndex } from './online/weekly.ts';
import { FriendBests } from './online/trials.ts';
import { TrialsPanel } from './view/ui/trials.ts';
import { goalText, isTrialId, TRIALS, type TrialId } from './content/trials.ts';
import { weeklyPlan } from './online/weekly.ts';
import { rushDaily } from './online/rush.ts';
import { RUSH } from './content/rush.ts';
import { Prep } from './view/ui/prep.ts';
import type { MapId } from './content/maps.ts';
import { buildAtlas, buildGround, buildHeroAtlas, buildMobAtlas, buildRaidAtlas, HERO_TEX, MOB_TEX } from './view/art/atlas.ts';
import { Vault } from './view/ui/vault.ts';
import { closeTopModal, modalOpen } from './view/ui/modal.ts';
import { RAID_LIVE, raidOpen, type RaidLiveTemplate, type RaidTemplateId } from './content/explore.ts';
import { music } from './view/audio/music.ts';
import { sfx } from './view/audio/sfx.ts';
import type { GameScene } from './view/game/GameScene.ts';
import type { Engine } from './app/engine.ts';
import { Input } from './view/game/input.ts';
import { Banners } from './view/ui/banner.ts';
import { Cards } from './view/ui/cards.ts';
import { Hud } from './view/ui/hud.ts';
import { tonightRules } from './view/ui/codexNights.ts';
import { Confirm, Menu, Pause, Result, Tips, type Toggle } from './view/ui/screens.ts';
import { skillFirstTip, skillTipHtml } from './view/ui/skillInfo.ts';
import { LOW_MEMORY, TOUCH, fitViewport, renderScale, worldZoom } from './view/viewport.ts';
import { reportErrors } from 'arcade-kit/report';
import { createFinisher, type Session } from './app/finish.ts';
import { buildRows, setLines } from './app/buildRows.ts';
import { mountFpsMeter } from './app/fpsMeter.ts';
import { iconMaker } from './app/icons.ts';
import { buyinWhy } from './app/liveText.ts';
import { createMenuViews } from './app/menuViews.ts';
import { readStartQuery } from './app/startQuery.ts';

// 页面里没人接住的报错发给平台（共用包 0.22）：只带报错、调用栈、路径、游戏和版本；单独部署没有平台时发不出去也不影响玩
reportErrors({ game: 'yexun', version: __APP_VERSION__ });

const q = new URLSearchParams(location.search);

async function boot(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const app = document.getElementById('app')!;
  const r = renderScale();
  /**
   * 把游戏句柄、当前世界、画质档挂到 window.__yx。生产构建也必须挂：tools/shot.ts、smoke.ts、feel.ts 和线上验收脚本
   * 靠它读世界状态、等游戏起来，不要加 DEV 守卫。进入主页时 world 为 null，开局后换成当前局。
   */
  function exposeDebug(world: World | null): void {
    (window as unknown as { __yx: unknown }).__yx = { game, world, lowmem: LOW_MEMORY, res, zoom, r, music, save };
  }
  const css = (): { w: number; h: number } => ({ w: app.clientWidth || window.innerWidth, h: app.clientHeight || window.innerHeight });
  const size = css();
  const zoom = worldZoom(size.w, size.h, size.h > size.w);
  // 图集的清晰度跟着屏幕：每世界单位的像素数 = 世界缩放 × 渲染倍数，取整到 2 或 3
  const res = Math.max(2, Math.min(3, Math.ceil(zoom * r)));
  // 毛笔字体先载好再出横幅（font-display: block 也挡不住第一帧用后备字体量尺寸）
  await document.fonts?.load('40px YxBrush').catch(() => undefined);
  const atlas = buildAtlas(res);
  const mobAtlas = buildMobAtlas(res);
  const heroAtlas = buildHeroAtlas(res);
  const ground = buildGround(512);
  if (q.has('sheet')) {
    // ?sheet 看主图集，?sheet=mob 看特色怪的图集
    const sheet = q.get('sheet') === 'mob' ? mobAtlas : atlas;
    sheet.canvas.style.cssText = 'position:absolute;left:0;top:0;background:#e4e8f0';
    document.body.style.overflow = 'auto';
    document.body.appendChild(sheet.canvas);
    return;
  }
  const icon = iconMaker(atlas);

  // 层次（下 → 上）：画布、暗角、摇杆层、HUD、横幅、卡片、结算、暂停、菜单、确认框
  const vignette = document.createElement('div');
  vignette.className = 'yx-vignette';
  stage.appendChild(vignette);
  const stickLayer = document.createElement('div');
  stickLayer.className = 'yx-touch';
  stage.appendChild(stickLayer);
  const input = new Input(stickLayer);
  const hud = new Hud(stage, (k) => icon(k), icon('face', 120));
  hud.onSkill = () => input.pressSkill();
  const banners = new Banners(stage);
  const cards = new Cards(stage, (k) => icon(k));

  // 声音要在用户手势里解锁（iOS）
  const unlock = (): void => sfx.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const save = loadSave();
  // 云存档（DESIGN.md 5.5）：没登录、单独部署时它自己不调接口；云端的进度并进本机后，内存里这份按新存档重读，菜单开着就重画
  const cloud = startCloud({
    onApplied: () => {
      Object.assign(save, loadSave());
      if (menu.visible) menu.show(menuState());
    },
  });
  saveHooks.onWrite = () => cloud.touch('profile');
  // 实盘（DESIGN.md 第 4 节）：进行中那一份记在 yexun.live；上次没结完的（中途关页面）开页时按输结回
  const live = createLive();
  void live.resume();
  addEventListener('online', () => void live.resume());
  // 铜钱换筹码（DESIGN 3.8a）：没结的（铜钱先扣着）开页、联网、回到前台时用同一个 op 重发
  const xc = new ExchangeClient({ save, fetch: (u, i) => fetch(u, i) });
  const xcView: ExchangeView = { unavailable: false, quota: null, pending: save.xc.length, busy: false, msg: '' };
  const xcResume = (): void => {
    if (!save.xc.length) return;
    void xc.resume().then((n) => {
      xcView.pending = save.xc.length;
      if (n > 0) refreshPrep();
    });
  };
  const sess: Session = { liveRun: null, rec: null, dailyDate: null, weeklyDate: null, lastLive: null, liveTier: 'small', ended: false, records: loadRecords(), tally: new RunTally() };
  /** 菜单上开了"无尽"（再来一局沿用上一局的） */
  let wantEndless = false;
  const submitter = createSubmitter({ fetch: (u, i) => fetch(u, i) });
  // 好友在线和邀请横条（kit 的 arcade-kit/social）：没平台、没登录就不挂。打到一半点"去"先确认
  const social = createSocial({
    mount: mountSocial,
    confirmLeave: (go) => confirm.ask('这一局不会保存，确定离开吗？', '离开', '接着打', (ok) => ok && go()),
  });
  const toggles: Toggle[] = [
    { key: 'sfx', label: '音效', get: () => sfx.enabled, set: (on) => sfx.setEnabled(on) },
    { key: 'music', label: '音乐', get: () => music.enabled, set: (on) => music.setEnabled(on) },
    { key: 'shake', label: TOUCH ? '震屏和震动' : '震屏', get: () => settings.shake, set: (on) => (settings.shake = on) },
  ];
  // 连死以后开的"降低伤害"（13.2）：设置里随时能关，开着时成绩不进总榜
  toggles.push({ key: 'assist', label: '降低伤害', get: () => save.assist, set: (on) => { save.assist = on; writeSave(save); } });
  toggles.push({ key: 'autoSkill', label: '自动放技能', get: () => autoSkillSetting.on, set: (on) => (autoSkillSetting.on = on) });
  if (TOUCH) toggles.push({ key: 'stick', label: '固定摇杆', get: () => settings.fixedStick, set: (on) => { settings.fixedStick = on; input.setFixed(on); } });
  input.setFixed(TOUCH && settings.fixedStick);
  const menu = new Menu(stage, toggles);
  const pause = new Pause(stage, toggles, (k) => icon(k));
  const result = new Result(stage, (k) => icon(k));
  const confirm = new Confirm(stage);
  const tips = new Tips(stage);
  const prep = new Prep(stage, (k, px) => icon(k, px));
  const codex = new Codex(stage, (k) => icon(k), () => sess.records);
  const toast = new AchievementToast(stage);
  codex.onClose = () => {
    codex.hide();
    menu.show(menuState());
  };
  // 玩法说明：主页和暂停面板都能开；从主页开的关掉回主页，从暂停开的关掉回暂停面板（它一直在底下）
  const guide = new Guide(stage, (k, px) => icon(k, px));
  let guideFromMenu = false;
  guide.onClose = () => {
    guide.hide();
    if (guideFromMenu) menu.show(menuState());
  };
  /** 流水 id 的随机后缀：两台设备同时买同一样东西也不会撞成一条（画面层，不进规则核心） */
  const nonce = (): string => Math.random().toString(36).slice(2, 10);
  const { prepState, menuState } = createMenuViews(save, live, icon, () => xcView);
  const refreshPrep = (): void => {
    writeSave(save);
    prep.update(prepState());
  };
  prep.onPickChar = (c) => {
    save.character = c;
    refreshPrep();
  };
  prep.onBuyChar = (c) => {
    if (buyChar(save, c, nonce())) sfx.play('click');
    refreshPrep();
  };
  prep.onToggleCurse = (c) => {
    save.curses = save.curses.includes(c) ? save.curses.filter((x) => x !== c) : CURSE_IDS.filter((x) => x === c || save.curses.includes(x)).slice(0, MAX_CURSES);
    refreshPrep();
  };
  prep.onBuyPerk = (id) => {
    if (buyPerk(save, id, nonce())) sfx.play('click');
    refreshPrep();
  };
  prep.onToggleKit = (k) => {
    save.kits = save.kits.includes(k) ? save.kits.filter((x) => x !== k) : [...save.kits, k];
    refreshPrep();
  };
  prep.onBuyLook = (id) => {
    if (buyLook(save, id, nonce())) sfx.play('click');
    refreshPrep();
  };
  prep.onWearLook = (id) => {
    wearLook(save, LOOKS[id].slot, save.wear[LOOKS[id].slot] === id ? null : id);
    refreshPrep();
  };
  prep.onOpenExchange = () => {
    void xc.quota().then((q) => {
      xcView.quota = q;
      xcView.unavailable = xc.unavailable;
      refreshPrep();
    });
  };
  prep.onExchange = (amount) => {
    xcView.busy = true;
    xcView.msg = '';
    refreshPrep();
    void xc.exchange(amount).then((r) => {
      xcView.busy = false;
      xcView.pending = save.xc.length;
      xcView.unavailable = xc.unavailable;
      if (r.kind === 'ok' || r.kind === 'reject') {
        if (r.left !== null && xcView.quota) xcView.quota = { ...xcView.quota, left: r.left };
      }
      xcView.msg = xcMsg(r);
      if (r.kind === 'ok' && r.credited > 0) sfx.play('click');
      refreshPrep();
    });
  };
  // 回调里要用 refreshPrep，等它定义好再开始重发
  xcResume();
  addEventListener('online', xcResume);
  document.addEventListener('visibilitychange', () => !document.hidden && xcResume());
  prep.onRefund = () => {
    refundPerks(save, nonce());
    refreshPrep();
  };
  prep.onClose = () => {
    prep.hide();
    menu.show(menuState());
  };
  // 菜单层（z 50）压在角色页（z 30）上面，不先收起菜单，角色页开了也看不见（"选不了角色"，0.3.8）；关掉时 onClose 再把菜单（停在选模式屏）打开
  menu.onPrep = (tab) => {
    menu.hide();
    prep.show(tab, prepState());
  };
  // 选模式屏上点起手 / 心法：存进这个角色的配置，重绘（和角色页、实盘面板是同一份）
  menu.onLoadout = (patch) => {
    setLoadout(save, menuState().character, patch);
    writeSave(save);
    menu.show(menuState());
  };
  menu.onCodex = () => {
    menu.hide();
    codex.show(undefined, menuState().character);
  };
  menu.onGuide = () => {
    menu.hide();
    guideFromMenu = true;
    guide.show(undefined, menuState().character);
  };
  menu.onClick = () => sfx.play('click');

  /**
   * 画面引擎（Phaser）等主页画出来再起：动态 import，下载、解析、开 WebGL 都不挡首屏；开局、回放先等它好
   * （主页点得比引擎起得快时，菜单多停一会儿）。起好后趁空闲把三张常驻图集传上显卡
   */
  let game: Phaser.Game | null = null;
  /**
   * 一次开局或回放正在路上（实盘买入、等引擎）：先到先得，路上再点的「开始」一律忽略，
   * 保证进了 startRun 的那次一定开出来（实盘先扣筹码再开局，不能被后来的点击顶掉）
   */
  let starting = false;
  const engine: Promise<Engine> = new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)))
    .then(() => import('./app/engine.ts'))
    .then((m) => {
      const s0 = css();
      return m.startEngine({ parent: app, width: s0.w * r, height: s0.h * r, r, ground, preload: [['atlas', atlas.canvas], [MOB_TEX, mobAtlas.canvas], [HERO_TEX, heroAtlas.canvas]] });
    })
    .then((e) => {
      game = e.game;
      exposeDebug(world);
      return e;
    });
  // 动态 import 失败（断网、发了新版旧块没了）：控制台记一笔，点开始时提示刷新（ready 里）
  engine.catch((e: unknown) => console.error('[yexun] 画面引擎没加载好', e));
  /** 占住开局并等引擎；已经有一次在路上回 null。引擎起不来给一句可见的提示让刷新 */
  const ready = async (): Promise<Engine | null> => {
    if (starting) return null;
    starting = true;
    try {
      return await engine;
    } catch {
      confirm.ask('画面没加载好，刷新一下再试', '刷新', '回菜单', (ok) => (ok ? location.reload() : menu.show(menuState())));
      return null;
    } finally {
      starting = false;
    }
  };

  let scene: GameScene | null = null;
  /** 当前这局的刷怪圈是不是竖屏那圈（转屏重算缩放时用） */
  let viewTall = false;
  let world: World | null = null;
  let autopilot: ((w: World) => { dir: number; choice: number }) | undefined;
  /** 对局界面（HUD、摇杆）只在打的时候显示 */
  const showPlay = (on: boolean): void => {
    hud.root.style.display = on ? '' : 'none';
    stickLayer.style.display = on ? '' : 'none';
    vignette.style.display = on ? '' : 'none';
  };
  showPlay(false);

  const tipDone = (id: string): boolean => save.tipsOff || save.tips.includes(id);
  const markTip = (id: string): void => {
    if (!save.tips.includes(id)) save.tips.push(id);
    writeSave(save);
  };
  tips.onOff = () => {
    save.tipsOff = true;
    writeSave(save);
  };

  const setPaused = (on: boolean): void => {
    scene?.setPaused(on);
    input.enabled = !on;
    // 暂停时整个声音停下（音乐也停），继续时接着放
    const ctx = sfx.ctx;
    if (ctx) void (on ? ctx.suspend() : ctx.resume()).catch(() => undefined);
  };
  const openPause = (): void => {
    if (!world || sess.ended || pause.open || confirm.open) return;
    setPaused(true);
    tips.hide();
    pause.show(buildRows(world), Math.max(0, ((world.rush ? RUSH.limit : DAWN_TICK) - world.tick) / 30), setLines(world), tonightRules(world.setup), world.setup.character ?? 'xiaodao', world.xinfa ? SCHOOLS[world.xinfa].name : undefined);
  };
  pause.onResume = () => {
    pause.hide();
    setPaused(false);
  };
  const askHome = (): void => {
    if (!pause.open) setPaused(true);
    confirm.ask('这一局不会保存，确定回大厅吗？', '回大厅', '接着打', (ok) => {
      if (ok) {
        // 离开前把待上传的云存档补传一次（keepalive，页面走了也能发完）
        cloud.hidden(true);
        location.href = '/';
      } else if (!pause.open) setPaused(false);
    });
  };
  pause.onHome = askHome;
  pause.onGuide = () => {
    guideFromMenu = false;
    guide.show(undefined, world?.setup.character);
  };
  pause.onQuit = () =>
    confirm.ask('认输就算这一局结束，确定吗？', '认输', '接着打', (ok) => {
      if (ok && world) {
        pause.hide();
        finish(world, true);
      }
    });
  hud.pauseBtn.addEventListener('click', openPause);
  hud.homeBtn.addEventListener('click', askHome);
  // 切到后台自动暂停（手机来电、切应用）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !autopilot) openPause();
  });
  window.addEventListener('keydown', (e) => {
    const typing = (document.activeElement as HTMLElement | null)?.matches('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape') {
      // Esc 只关最上面一层：确认框 → 主页面板 → 设置层 → 暂停；什么都没开又不在对局中就不动（不能借 Esc 离开游戏，docs/ui.md 第 1 节）
      if (confirm.open) confirm.close(false);
      else if (closeTopModal()) return;
      else if (menu.closeSettings()) return;
      else if (pause.open) pause.onResume();
      else openPause();
    } else if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
      // p 只管暂停；确认框或面板开着时不在它们底下再开暂停
      if (confirm.open || modalOpen()) return;
      if (pause.open) pause.onResume();
      else openPause();
    } else if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 打开快捷键说明；对局进行中先暂停，免得一边看表一边挨打
      if (confirm.open || guide.open || cards.open) return;
      // 在主页或主页的面板上按的：关掉玩法说明要回主页，不然图鉴被它顶掉以后屏幕是空的；结算页、对局里不回
      const fromMenu = menu.visible || modalOpen();
      openPause();
      guideFromMenu = fromMenu;
      if (fromMenu) menu.hide();
      guide.showKeys();
      e.preventDefault();
    } else if (banners.skipReveal()) e.preventDefault();
  });
  stage.addEventListener('pointerdown', () => banners.skipReveal());

  const { finish } = createFinisher({ sess, save, live, submitter, social, result, confirm, tips, banners, toast, scene: () => scene, setPaused, showPlay, nonce });

  /** fixed：实盘、每日挑战用固定配置（kind 说是哪一种）；别的按菜单选的来 */
  const startRun = async (picked: Danger, map: MapId = save.map, debug = false, fixed?: Setup, kind: 'live' | 'daily' | 'weekly' | 'rush' | 'trial' | null = null): Promise<void> => {
    const e = await ready();
    if (!e) return;
    const { game: g, GameScene, createWorld } = e;
    g.loop.wake();
    sess.liveRun = kind === 'live' && fixed ? { seed: fixed.seed } : null;
    if (kind !== 'live') sess.lastLive = null;
    // 每日连战也是"今天的"一局：日期跟着走，交每日连战榜
    sess.dailyDate = kind === 'daily' || kind === 'rush' ? beijingDate(Date.now()) : null;
    sess.weeklyDate = kind === 'weekly' ? beijingDate(Date.now()) : null;
    // 第一局锁危险 0；没解锁的档、角色不让选（存档被改过、链接参数）。调试参数直接开局的不卡
    const danger = (debug ? picked : Math.min(picked, dangerOpen(save))) as Danger;
    if (!fixed) {
      save.danger = danger;
      save.map = map;
      writeSave(save);
    }
    menu.hide();
    result.hide();
    sess.ended = false;
    sess.tally = new RunTally();
    if (scene) g.scene.remove('game');
    banners.clear();
    input.reset();
    const seed = fixed?.seed ?? (q.has('seed') ? Number(q.get('seed')) >>> 0 : (Math.random() * 0x100000000) >>> 0);
    // 这台设备上的第一局：3 分钟前不会死（DESIGN.md 13.2）；实盘用固定配置
    const ms = menuState();
    // 竖屏开的局刷怪圈转 90°（Setup.tall），录进录像；实盘、每日挑战的固定配置也按这台设备补上
    const tall = css().h > css().w ? { tall: true } : {};
    // 局前锦囊：只有菜单开的娱乐守夜、夜探带（实盘、每日、本周夜事、连战、教学镇不带），开局这一下扣铜钱
    const kits = kind === null && !debug && fixed?.raid?.template !== 'teach' && save.kits.length ? payKits(save, fixed?.seed ?? seed, nonce()) : [];
    const w = createWorld({ ...(fixed ?? { seed, mode: 'vigil', danger, map, firstRun: save.runs === 0, character: ms.character, ...loadoutSetup(save, ms.character), curses: ms.curses, perks: save.perks, assist: save.assist, ...(wantEndless ? { endless: true } : {}) }), ...(kits.length ? { kits } : {}), ...tall });
    world = w;
    autopilot = undefined;
    social.setWhere(w.raid ? 'raid' : 'vigil');
    // 调试参数改过开局、快进过的局不录（录像要从第 0 拍逐拍记）
    sess.rec = q.has('give') || q.has('warp') ? null : new Recorder(w.setup, Date.now());
    // 调试开局只在开发服务器里动态加载：它静态引 core/debug → step，静态 import 会把整个规则核心拖进首屏
    const dbg = import.meta.env.DEV ? await import('./app/debugStart.ts') : null;
    autopilot = dbg ? await dbg.applyDebugStart(q, w, sess.tally, seed) : undefined;
    const firstRun = save.runs === 0;
    showPlay(true);
    setPaused(false);
    // 外观（DESIGN 3.8a）：头像框在 HUD，脚下光圈在场景；实盘也照穿（只改画面）
    const frame = save.wear.frame ? LOOKS[save.wear.frame] : null;
    hud.setFrame(frame ? { color: frame.color, edge: frame.edge } : null);
    const aura = save.wear.aura ? LOOKS[save.wear.aura] : null;
    g.scene.add('game', GameScene, true, {
      ...(aura ? { aura: { color: aura.color, edge: aura.edge } } : {}),
      world: w,
      atlas,
      mobAtlas,
      ...(w.raid ? { raidAtlas: buildRaidAtlas(res) } : {}),
      hud,
      cards,
      banners,
      input,
      zoom: worldZoom(css().w, css().h, (viewTall = !!w.setup.tall)) * r,
      icon: (k: string) => icon(k, 128),
      firstRun: firstRun && !tipDone('cards'),
      autopilot,
      shake: () => settings.shake,
      onChest: () => {
        // 引导第 3 条：第一次开宝箱讲进化
        if (tipDone('chest')) return;
        markTip('chest');
        tips.show('法器<b>满级</b> + 对应的<b>被动</b>，宝箱里会开出<b>进化</b>', 6000);
      },
      onSkillShown: (x: World) => {
        const id = x.setup.character ?? 'xiaodao';
        hud.setSkillInfo(skillTipHtml(id));
        // 每个角色第一次拿到技能讲一次（老玩家换新角色也讲）；关了提示的不讲
        if (autopilot || tipDone(`skill.${id}`)) return;
        markTip(`skill.${id}`);
        tips.show(skillFirstTip(id, TOUCH), 9000);
      },
      onEnd: (x: World) => finish(x, false),
      beforeStep: (x: World, dir: number, choice: number, skill: number) => sess.rec?.before(x, dir, choice, skill),
      afterStep: (x: World) => {
        sess.tally.feed(x);
        dbg?.lateMerge(q, x);
        if (sess.liveRun && x.tick % 300 === 0) live.progress(sess.liveRun.seed, x.tick);
      },
    });
    scene = g.scene.getScene('game') as unknown as GameScene;
    // 引导第 1 条：开局"拖动走位"，一动就收起（0–10 秒）
    if (!tipDone('moved') && !autopilot) {
      input.moved = false;
      tips.show(TOUCH ? '<b>按住屏幕拖动</b>走位，法器会自己出手；2 级解锁右下角技能钮' : '<b>WASD</b> 或<b>方向键</b>走位，法器会自己出手；<b>Q</b> / <b>空格</b>放技能（2 级解锁）', 10000);
      const watch = window.setInterval(() => {
        if (input.moved || sess.ended) {
          window.clearInterval(watch);
          tips.hide();
          if (input.moved) markTip('moved');
        }
      }, 200);
    }
    exposeDebug(w);
  };
  cards.onShow = (first) => {
    // 引导第 2 条记在卡片自己的说明里，第一次升级以后就不再带
    if (first) markTip('cards');
  };

  menu.onStart = (d, m, endless) => {
    save.lastMode = 'vigil';
    wantEndless = endless;
    void startRun(d, m);
  };
  // 每日挑战（DESIGN.md 5.7）：今天的守夜挑战，配置全服一样；夜探的每日等夜探接进来再开
  const startDaily = (): Promise<void> => {
    const plan = dailyPlan(beijingDate(Date.now()), 'vigil');
    return startRun(plan.setup.danger, plan.setup.map ?? 'snow', true, plan.setup, 'daily');
  };
  menu.onDaily = () => void startDaily();
  // 本周夜事挑战（DESIGN.md 5.8）：固定配置（本周事件、轮到的图、危险 2、小道士），种子每局随机，成绩只交周榜
  const startWeekly = (): Promise<void> => {
    const plan = weeklyPlan(beijingDate(Date.now()), (Math.random() * 0x100000000) >>> 0);
    return startRun(plan.setup.danger, plan.setup.map ?? 'snow', true, plan.setup, 'weekly');
  };
  menu.onWeekly = () => void startWeekly();
  // 每日首领连战（DESIGN.md 2.5）：今天的构筑和首领顺序全服一样
  const startRush = (): Promise<void> => {
    const plan = rushDaily(beijingDate(Date.now()));
    return startRun(plan.setup.danger, plan.setup.map ?? 'snow', true, plan.setup, 'rush');
  };
  menu.onRush = () => void startRush();
  // 试炼（docs/design-play.md 2.6）：配置按表展开（核心 normalizeSetup），种子每局随机；好友最好每次打开页读一次
  const startTrial = (id: TrialId): Promise<void> => {
    const t = TRIALS[id];
    const seed = (Math.random() * 0x100000000) >>> 0;
    return startRun(t.danger, t.map, true, { seed, mode: t.mode, danger: t.danger, trial: id }, 'trial').then(() => {
      if (world?.trial?.id === id) tips.show(`<b>试炼「${t.name}」</b>${goalText(t.goal)}`, 5000);
    });
  };
  const trials = new TrialsPanel(stage, { onStart: (id) => void startTrial(id), onClose: () => menu.show(menuState()) });
  menu.onTrials = () => {
    menu.hide();
    const today = beijingDate(Date.now());
    trials.show(
      { best: save.trials, open: ([0, 1, 2] as const).map((t) => trialTierOpen(save, t)), week: weekGoalView(save, weekIndex(today)), daysLeft: weekDaysLeft(today) },
      new FriendBests({ fetch: (u, i) => fetch(u, i) }),
    );
  };
  const boards = new BoardsPanel(stage, { deps: { fetch: (u, i) => fetch(u, i) }, today: () => beijingDate(Date.now()), onClose: () => menu.show(menuState()) });
  menu.onBoards = () => {
    menu.hide();
    boards.show();
  };
  const replays = new ReplayList(stage, { onPlay: (r0) => void startReplay(r0), onClose: () => menu.show(menuState()) });
  menu.onReplays = () => {
    menu.hide();
    replays.show(loadReplays());
  };
  /** 回放：同一个对局场景，输入换成录像（不录、不交分、不发铜钱；ended 先置上，暂停面板和结算都不出） */
  const startReplay = async (record: ReplayRecord): Promise<void> => {
    const e = await ready();
    if (!e) return;
    const { game: g, GameScene, ReplayPlayer } = e;
    g.loop.wake();
    const player = ReplayPlayer.from(record);
    if (!player) {
      confirm.ask('这段录像坏了，放不了', '知道了', '回菜单', () => menu.show(menuState()));
      return;
    }
    menu.hide();
    sess.ended = true;
    sess.liveRun = null;
    sess.lastLive = null;
    sess.rec = null;
    if (scene) g.scene.remove('game');
    banners.clear();
    input.reset();
    world = player.world;
    showPlay(true);
    setPaused(false);
    const bar = new ReplayBar(stage, player, {
      onExit: () => {
        bar.destroy();
        g.scene.remove('game');
        scene = null;
        g.loop.sleep();
        world = null;
        showPlay(false);
        music.stop();
        menu.show(menuState());
      },
    });
    g.scene.add('game', GameScene, true, {
      world: player.world,
      atlas,
      mobAtlas,
      hud,
      cards,
      banners,
      input,
      zoom: worldZoom(css().w, css().h, (viewTall = !!player.world.setup.tall)) * r,
      icon: (k: string) => icon(k, 128),
      firstRun: false,
      shake: () => settings.shake,
      onEnd: () => undefined,
      drive: (dt: number, each: () => void) => {
        player.onStep = each;
        player.advance(dt);
        bar.update();
      },
    });
    scene = g.scene.getScene('game') as unknown as GameScene;
  };
  menu.onLiveMode = (on, tier) => {
    save.liveOn = on;
    save.liveTier = tier;
    writeSave(save);
  };
  const startLive = async (tier: LiveTier, raid?: RaidLiveTemplate, pickMap?: MapId, fallback?: () => void): Promise<void> => {
    // 实盘带已解锁的角色和地图（0.3.6），没解锁的退回小道士、雪原；加成、咒印照旧不带
    const picked = menuState().character;
    const map = !raid && pickMap && mapOpen(save, pickMap) && liveMapOk(pickMap) ? pickMap : 'snow';
    const character = liveCharOk(tier, picked, map, !!raid) ? picked : 'xiaodao';
    const seed = (Math.random() * 0x100000000) >>> 0;
    // 先等引擎再买入：引擎起不来就不扣筹码；买入期间占着开局，别的「开始」点了不算。
    // 买到了紧接着同步进 startRun（中间不让出线程），那里的 ready() 拿到已好的引擎，这局一定开出来
    if (!(await ready())) return;
    starting = true;
    let r: Awaited<ReturnType<typeof live.buyin>>;
    try {
      r = await live.buyin(tier, seed, raid, character, map);
    } finally {
      starting = false;
    }
    if (r.ok) {
      sess.liveTier = tier;
      sess.lastLive = raid ? { tier, raid } : { tier, map };
      // 记下这次的完整选择，主页"开始"下次照它一键开
      save.lastMode = raid ? 'raid' : 'vigil';
      if (raid) save.raidTpl = raid;
      else save.map = map;
      writeSave(save);
      const danger = raid ? (RAID_LIVE.danger[tier] as Danger) : LIVE_TIERS[tier].danger;
      return startRun(danger, map, true, liveSetup(tier, seed, raid, character, map, loadoutSetup(save, character)), 'live');
    }
    const why = buyinWhy(r.outcome);
    // 主页一键开的：说明原因，给一个"按娱乐开"
    if (fallback) return confirm.ask(`${why}，这次按娱乐开吧`, '按娱乐开', '回菜单', (ok) => (ok ? fallback() : menu.show(menuState())));
    confirm.ask(why, '知道了', '回菜单', () => menu.show(menuState()));
  };
  menu.onLive = (tier, map, fallback) => void startLive(tier, undefined, map, fallback);
  menu.onRaidLive = (tier, tpl, fallback) => void startLive(tier, tpl, undefined, fallback);
  // 夜探（第 6 步）：第一次固定教学镇、危险 0；之后选模板和危险档。带角色和加成，不带咒印
  menu.onRaid = (template: RaidTemplateId, picked: Danger) => {
    // 收起的镇子线上不开局（链接参数、手改存档、再来一局都走这里）；开发服务器里照开，截图和配平要用
    if (!raidOpen(template, import.meta.env.DEV)) return menu.show(menuState());
    const ms = menuState();
    const teach = template === 'teach';
    const danger = (teach ? 0 : Math.min(picked, dangerOpen(save))) as Danger;
    save.lastMode = 'raid';
    if (!teach) save.raidTpl = template;
    writeSave(save);
    const seed = (Math.random() * 0x100000000) >>> 0;
    void startRun(danger, save.map, false, { seed, mode: 'raid', danger, raid: { template }, character: ms.character, ...loadoutSetup(save, ms.character), perks: save.perks, assist: save.assist });
  };
  const vault = new Vault(stage, (k) => icon(k), () => save.vault);
  vault.onClose = () => {
    vault.hide();
    menu.show(menuState());
  };
  menu.onVault = () => {
    menu.hide();
    vault.show();
  };
  result.onAgain = () => {
    if (sess.lastLive) return void startLive(sess.lastLive.tier, sess.lastLive.raid, sess.lastLive.map);
    if (world?.setup.trial) return void startTrial(world.setup.trial);
    if (world?.setup.mode === 'raid') return menu.onRaid(world.setup.raid?.template ?? 'guzhen', world.setup.danger);
    if (world?.setup.rush) return void startRush();
    if (sess.dailyDate) return void startDaily();
    if (sess.weeklyDate) return void startWeekly();
    wantEndless = !!world?.setup.endless;
    void startRun(world?.setup.danger ?? save.danger, world?.setup.map ?? save.map);
  };
  result.onBigTown = () => menu.onRaid('guzhen', save.danger);
  result.onMenu = () => {
    // 回主页：对局画面被菜单盖住，帧循环睡着（下次开局再叫醒）
    game?.loop.sleep();
    result.hide();
    // 试炼打完回试炼页（接着挑下一关）
    if (world?.setup.trial) return menu.onTrials();
    menu.show(menuState(), 'home');
  };

  // 主页先出来（引擎在后台起，见上面的 engine）
  document.getElementById('boot')?.remove();
  mountFpsMeter(q, () => world);
  // 冒烟、机器人代打不挂 social（它会去问平台）
  if (hasLoginHint() && !q.has('auto')) void social.start();
  const { danger: qd, map: qm } = readStartQuery(q, save);
  // ?raid=guzhen|dukou|shansi|xilou|teach 直接开一局夜探（冒烟截图用；可带 &auto 机器人代打）。只开娱乐：实盘必须在菜单里选档位。
  // 线上只认能进的镇子，收起的粮仓镇只在开发服务器里能进（raidOpen）
  const qr = q.get('raid');
  // ?rush 直接开今天的首领连战（冒烟截图用；可带 &auto）
  if (q.has('rush')) void startRush();
  // ?trial=<id> 直接开这关试炼；?trials 打开试炼页（冒烟截图用）
  else if (isTrialId(q.get('trial'))) void startTrial(q.get('trial') as TrialId);
  else if (q.has('trials')) menu.onTrials();
  else if (raidOpen(qr, import.meta.env.DEV)) menu.onRaid(qr, qd ?? 2);
  else if (import.meta.env.DEV && q.has('prep')) prep.show('char', prepState());
  else if (q.has('auto') || q.has('warp') || q.has('play') || q.has('give')) void startRun(qd ?? 2, qm ?? 'snow', true);
  else {
    if (qd !== null) save.danger = qd;
    if (qm) save.map = qm;
    menu.show(menuState());
  }
  fitViewport(() => {
    const s = css();
    game?.scale.resize(s.w * r, s.h * r);
    game?.scale.setZoom(1 / r);
    scene?.cameras.main.setZoom(worldZoom(s.w, s.h, viewTall) * r);
  });
}

void boot();

/** 换筹码的结果，一句话（换筹码页底下那行） */
function xcMsg(r: Awaited<ReturnType<ExchangeClient['exchange']>>): string {
  const rate = COIN_EXCHANGE.rate;
  if (r.kind === 'ok') return r.credited > 0 ? `换到 ${r.credited.toLocaleString('zh-CN')} 筹码，花了 ${(r.credited * rate).toLocaleString('zh-CN')} 铜钱` : '今天换满了，铜钱都退回来了';
  if (r.kind === 'pending') return r.why === 'login' ? '要先登录；铜钱先扣着，登录后自动补上' : '网不好，铜钱先扣着，过会儿自动重发';
  if (r.kind === 'skip') return r.why === 'coins' ? '铜钱不够' : '';
  if (r.error === 'exchange_cap') return '今天换满了，铜钱都退回来了';
  if (r.error === 'limit') return '今天操作次数到顶了，铜钱都退回来了';
  return '没换成，铜钱都退回来了';
}
