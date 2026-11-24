/**
 * 入口：错误兜底 → 竖屏提示 → 读设置和 URL 参数 → 准备会话 → 起 Phaser。
 */
import Phaser from 'phaser';
import { reportErrors } from 'arcade-kit/report';
import { mountBridge } from './debug/bridge.ts';
import { jumpToAce, jumpToTribute } from './debug/jump.ts';
import { parseParams } from './debug/params.ts';
import { createGame } from './variants/guandan/core/index.ts';
import { anim } from './view/common/anim.ts';
import { app } from './view/app.ts';
import { audio } from './view/common/audio.ts';
import { CloudSync } from './view/common/cloud.ts';
import { DDZ_FUN_OPTS, DdzSession } from './view/doudizhu/session.ts';
import { onWebglLoss, watchViewport } from 'arcade-kit/viewport';
import { LOW_MEMORY, appBox, fitAppToViewport, isIOS, markForeground, markRenderLost, setFitted, webglUsable, zoomedIn } from './view/common/device.ts';
import { hideErrorPanel, installErrorHandler, showErrorPanel } from './view/common/errors.ts';
import { installIdleLimiter } from './view/common/idle.ts';
import { goLobby, inOnlineGame, leaveText, mountLobbyOverlay, savedGameInProgress } from './view/common/lobby.ts';
import { autoJoin, forgetRoom, lobbySession, openOnline } from './view/online.ts';
import { mountRotateHint, setAtTable, setRotateLobbyLabel } from './view/common/orientation.ts';
import { detectOnce, lobbyName, standalone, timed } from './view/common/platform.ts';
import { mountSocialOnce } from './view/common/social.ts';
import { BootScene } from './view/scenes/BootScene.ts';
import { DdzScene } from './view/scenes/DdzScene.ts';
import { TableScene } from './view/scenes/TableScene.ts';
import { TitleScene } from './view/scenes/TitleScene.ts';
import { Session } from './view/guandan/session.ts';
import { randomSeed } from './view/common/seed.ts';
import { EMPTY_STATS, KEYS, backupKey, SYNC_SLOTS, getSettings, getStats, loadDdzSave, loadSave, onSyncedChange, rawStore, tutorialDone, type SyncSlot } from './view/store.ts';
import { GAME_HEIGHT, RENDER_SCALE, worldSizeFor, worldWidthFor } from './view/common/theme.ts';
import { dropBackdrops, ensureBackdrops, titleBackdrop } from './view/common/textures.ts';
import { applyAudio } from './view/common/audio.ts';

installErrorHandler();
// 没人接住的报错报给平台（kit 0.22：只发报错文字、调用栈、路径、版本，不带账号；同一条一页只报一次）。兜底面板也给玩家看
reportErrors({ game: 'guandan', version: __APP_VERSION__ });
// 有没有平台（单独部署时没有）：开场景、进房、云存档都等它（kit 默认最多等 2.5 秒）
const platform = detectOnce();
// 竖屏提示层里的"大厅"：牌桌被盖住，有打到一半的存档（或好友房正在打）时用浏览器自带的确认框
mountRotateHint(() => {
  if ((app.net || app.ddzNet ? inOnlineGame() : savedGameInProgress()) && !window.confirm(leaveText())) return;
  goLobby();
}, () => {
  const sc = game.scene.getScenes(true).find((s): s is TableScene | DdzScene => s instanceof TableScene || s instanceof DdzScene);
  if (sc?.homeAsks()) return '这一局要确认才能离开：横过来点右上角的返回';
  sc?.onHome();
  return null;
});

const params = parseParams(window.location.search);
app.params = params;
if (params.anim === false) anim.instant = true;
if (params.speed) anim.forcedSpeed = params.speed;

// URL 指定了开局（调试 / 自动化）：直接进牌桌。已有存档时这一局不写存档，免得覆盖玩家进度。
// 带 ddz=1 时开的是斗地主单机（jump 只有掼蛋有）
if (params.ddz && params.seed !== null) {
  const ses = DdzSession.fresh(params.seed, params.difficulty ?? getSettings().difficulty, DDZ_FUN_OPTS, !loadDdzSave());
  ses.autoplay = params.autoplay;
  app.ddz = ses;
} else if (params.seed !== null || params.jump !== null) {
  const seed = params.seed ?? randomSeed();
  const rules = getSettings().rules;
  const start = params.jump === 'tribute' ? jumpToTribute(seed, rules) : params.jump === 'ace' ? jumpToAce(seed, rules) : createGame(seed, rules);
  const ses = new Session(start.state, start.events, params.difficulty ?? getSettings().difficulty);
  ses.scored = false;
  ses.persist = !loadSave();
  ses.autoplay = params.autoplay;
  ses.save();
  app.session = ses;
}

// 云存档：战绩和教程标记（登录了才发请求）
const cloud = new CloudSync({
  fetch: (url, init) => window.fetch(url, timed(init)),
  hasLoginHint: () => /(?:^|;\s*)__Host-arcade_li=/.test(document.cookie),
  read: (slot: SyncSlot) => (slot === 'stats' ? getStats() : { v: 1, done: tutorialDone() }),
  write: (slot, data) => rawStore.write(SYNC_SLOTS[slot], data),
  // 写完读回核对：存储满了 setItem 会失败（rawStore 吞掉了异常），换号时靠这个判断能不能清空本地
  backup: (slot, tag, data) => {
    rawStore.write(backupKey(slot, tag), data);
    return JSON.stringify(rawStore.read(backupKey(slot, tag))) === JSON.stringify(data);
  },
  readBackup: (slot, tag) => rawStore.read(backupKey(slot, tag)),
  dropBackup: (slot, tag) => rawStore.remove(backupKey(slot, tag)),
  empty: (slot) => (slot === 'stats' ? { ...EMPTY_STATS } : { v: 1, done: false }),
  loadMeta: () => rawStore.read(KEYS.cloud),
  saveMeta: (m) => rawStore.write(KEYS.cloud, m),
  forgetRoom,
});
app.cloud = cloud;
onSyncedChange((slot) => cloud.markDirty(slot));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') cloud.flushOnHide();
  else void cloud.resume();
});
// 两个窗口并排时切回来不一定有 visibilitychange：拿到焦点也确认一次身份（resume 自己限 1 分钟一次）
window.addEventListener('focus', () => void cloud.resume());
// 同时开了几个标签页：别的页传完或换了账号，这边跟着更新元数据
window.addEventListener('storage', (e) => {
  if (e.key === KEYS.cloud) cloud.onExternalMeta();
});
// 有的浏览器关页、刷新时不发 visibilitychange；两边都触发也只会传一次（同一个槽在途时不重发）
window.addEventListener('pagehide', () => cloud.flushOnHide());
// 单独部署没有账号，云存档不启动（没有登录提示 cookie 时它本来也一个请求都不发，这里说清楚）
void platform.then(() => {
  if (standalone()) setRotateLobbyLabel(lobbyName());
  else void cloud.start();
  // 报位置、收好友邀请：单独部署、没登录 mountSocialOnce 自己不挂（也要调：好友房面板读好友列表等它有结论）
  void mountSocialOnce(() => app.net ?? app.ddzNet ?? lobbySession());
});

applyAudio();
const unlock = (): void => audio.unlock();
window.addEventListener('pointerdown', unlock, true);
// DOM 层（好友房面板、kit 的叫人面板、出错面板……）上的按下不冒到 window：Phaser 在 window 上收到"目标不是画布"的按下也照坐标点画布
// （为了拖出画布外也收得到抬起，抬起照常冒），点 DOM 按钮会连带点到正下方的画布按钮——手机横屏好友房的"加入"压在"快速开始"上，点了开出单机
for (const t of ['mousedown', 'touchstart'] as const) {
  document.addEventListener(t, (e) => {
    if (e.target !== app.game?.canvas) e.stopPropagation();
  });
}
window.addEventListener('keydown', unlock, true);
document.addEventListener('visibilitychange', () => audio.setPaused(document.hidden));

// iOS 防崩溃标记：前台时记着，切后台或正常离开就清（device.ts）
document.addEventListener('visibilitychange', () => markForeground(document.visibilityState === 'visible'));
window.addEventListener('pagehide', () => markForeground(false));
window.addEventListener('pageshow', () => markForeground(true));

// 画面容器钉在实际可见区域（扣掉安全区），世界宽度也按它算
const host = document.getElementById('app')!;
fitAppToViewport(host);
const box0 = appBox();
{
  // 启动先进主页（竖屏时是竖屏世界）；带种子、邀请链接直接进牌桌的，进的时候 toTableWorld 再换成横屏
  const s0 = worldSizeFor(box0.w, box0.h);
  app.width = s0.w;
  app.height = s0.h;
}
/** 现在的世界宽度是按横屏还是竖屏排的（触屏设备只在转屏时重排） */
let laidLandscape = box0.w >= box0.h;

const config: Phaser.Types.Core.GameConfig = {
  type: webglUsable() ? Phaser.WEBGL : Phaser.CANVAS,
  parent: host,
  width: app.width * RENDER_SCALE,
  height: app.height * RENDER_SCALE,
  backgroundColor: '#123a2b',
  banner: false,
  fps: { panicMax: 12 },
  // 自动化浏览器（冒烟、截图，无头 Chrome 用 SwiftShader 软件渲染）只用一个纹理单元：SwiftShader 下多纹理合批会让
  // 一些精灵整块取错纹理、显示成透明的方块（主页的人物复现过，GL 只上传过一次，画布本身是完整的）。真机不受影响，照常合批
  // 多重采样的缓冲按画布像素 ×4 份算；iOS 2 倍渲染时边缘锯齿本来就看不出，省下这块内存
  render: { maxTextures: navigator.webdriver ? 1 : -1, antialiasGL: LOW_MEMORY === 0 && !(isIOS() && RENDER_SCALE >= 2) },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, TableScene, DdzScene],
};
let game: Phaser.Game;
try {
  game = new Phaser.Game(config);
} catch (err) {
  // 预检拿到了 WebGL，Phaser 自己建上下文却失败：清掉半截画布，换 Canvas 渲染再来一次
  console.warn('WebGL 启动失败，改用 Canvas 渲染', err);
  host.replaceChildren();
  game = new Phaser.Game({ ...config, type: Phaser.CANVAS });
}
app.game = game;
// 牌桌在跑时竖屏才盖"请横过来"（主页竖屏能用）
game.events.once(Phaser.Core.Events.READY, () => {
  for (const key of ['table', 'ddz']) {
    const sc = game.scene.getScene(key);
    sc.events.on(Phaser.Scenes.Events.START, () => setAtTable(true));
    sc.events.on(Phaser.Scenes.Events.SHUTDOWN, () => setAtTable(false));
  }
});
mountLobbyOverlay(game);
installIdleLimiter(game);

// WebGL 上下文被系统收回（iOS 内存紧张时会这样）：Phaser 会等它恢复。2 秒还没恢复先提示重新载入；
// 恢复了就收起提示、不降档。只有一直没恢复（20 秒，或者没恢复就离开页面）才记一次降档，下次打开换省内存的画法；
// 短暂丢失又恢复的不算，免得来回几次就一路降到 Canvas。计时和"同一时间只一条"由 kit 的 onWebglLoss 管
onWebglLoss(game.canvas, {
  showAfterMs: 2000,
  show: () => {
    showErrorPanel(new Error('画面被系统收回了（多半是内存不够），点"重新载入"，会换一种更省内存的画法'));
    return hideErrorPanel;
  },
  giveUpMs: 20_000,
  giveUpOnHide: true,
  onGiveUp: markRenderLost,
});

// 可见区域变了（转屏、Safari 地址栏收放、调整窗口）：先把容器贴回可见区域，真变了才让 Phaser 重新缩放（FIT 留边）；
// 需要时再换世界宽度、重建当前画面（画面全部由状态重建，不丢进度），换完删掉旧宽度的背景大图。
// 重建会丢掉选着的牌、动画、弹层，所以：触屏设备只在转屏时重建（地址栏一收一放只是比例小变，留边就够）；
// 电脑上窗口宽度差 40 以上才重建；牌桌在播动画、有弹层或选着牌时推迟到空闲再做。
let resizeTimer = 0;
const coarse = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
/** 这个画面该用的世界尺寸：牌桌只认横屏（竖着拿时被"请横过来"盖着，按横过来以后排），主页和启动页按现在的方向 */
const wantSize = (b: { w: number; h: number }, key: string | undefined): { w: number; h: number } =>
  key === 'table' || key === 'ddz' ? { w: b.w >= b.h ? worldWidthFor(b.w, b.h) : worldWidthFor(b.h, b.w), h: GAME_HEIGHT } : worldSizeFor(b.w, b.h);
const setWorld = (s: { w: number; h: number }): void => {
  app.width = s.w;
  app.height = s.h;
  game.scale.setGameSize(s.w * RENDER_SCALE, s.h * RENDER_SCALE);
};
const settle = (): void => {
  window.clearTimeout(resizeTimer);
  const b = appBox();
  const active = game.scene.getScenes(true)[0] as (Phaser.Scene & { canRebuild?: () => boolean }) | undefined;
  const want = wantSize(b, active?.scene.key);
  const landscape = b.w >= b.h;
  // 尺寸刚好没变也记下转到了哪个方向，不然竖过去再横回来会被当成没转屏
  if (want.w === app.width && want.h === app.height) {
    laidLandscape = landscape;
    return;
  }
  // 触屏只在转屏时重建（地址栏一收一放只是比例小变，留边就够）；电脑上宽度差 40 以上、或者横竖换了才重建
  const turned = landscape !== laidLandscape;
  if (coarse() ? !turned : !turned && Math.abs(want.w - app.width) < 40 && Math.abs(want.h - app.height) < 40) return;
  // 还在加载（iOS 工具栏常在这时收放）或者牌桌正忙：等进了标题页或牌桌、空下来再换，不然尺寸一直停在旧值
  if (!app.ready || !active || active.scene.key === 'boot' || active.canRebuild?.() === false) {
    resizeTimer = window.setTimeout(settle, 500);
    return;
  }
  laidLandscape = landscape;
  setWorld(want);
  void ensureBackdrops(active, want.w, want.h).then(() => {
    active.events.once(Phaser.Scenes.Events.CREATE, () => dropBackdrops(active, app.width, app.height));
    active.scene.restart();
  });
};
// 竖屏主页点开局：牌桌要横屏世界，进之前换好（牌桌背景按横过来以后的宽度烘过，textures.ts 的 tableW）
app.toTableWorld = () => {
  const want = wantSize(appBox(), 'table');
  if (want.w !== app.width || want.h !== app.height) setWorld(want);
};
// 反过来：竖着拿时从牌桌回主页（盖着"请横过来"时一局被结束、好友房散了），主页换回竖屏世界，不然整页缩在横屏世界里、字只剩几像素。
// START 在 create 之前，主页按新尺寸排；这个尺寸的背景没烘过（横着打开、竖着回来）就烘好再重开一次
game.events.once(Phaser.Core.Events.READY, () => {
  const title = game.scene.getScene('title');
  title.events.on(Phaser.Scenes.Events.START, () => {
    const b = appBox();
    const want = wantSize(b, 'title');
    if (want.w === app.width && want.h === app.height) return;
    laidLandscape = b.w >= b.h;
    setWorld(want);
    if (!title.textures.exists(titleBackdrop(title, want.w, want.h))) void ensureBackdrops(title, want.w, want.h).then(() => title.scene.restart());
  });
});

// 跟着可见区走（kit 的 watchViewport）：每次转屏、地址栏收放、窗口变化当下把 #app 贴回可见区（扣安全区），真变了才让 Phaser 重新缩放；
// 250 毫秒后再量一次、看要不要换世界宽度。阈值用牌馆自己的：只认放大（> 1.01）、不 scrollTo、不写 --app-h、也听 visualViewport 的 scroll
watchViewport({
  pin: host,
  isZoomed: zoomedIn,
  settleMs: 250,
  scrollTop: false,
  // kit 开始时先量一次：和启动时 fitAppToViewport 钉的一样就不算、不 refresh（和迁移前一样，只有尺寸真变了才数）
  onChange: (b) => {
    if (!setFitted(b)) return;
    app.fits++;
    game.scale.refresh();
  },
  onSettle: settle,
});

if (import.meta.env.DEV || params.debug) mountBridge(game);

// 邀请链接 ?online=1&room=xxxxxx（或只带 room=）：启动后直接进房间；只带 ?online=1（平台大厅的好友房入口）：直接打开好友房面板。
// 大厅画在 DOM 层，不等 Phaser
void platform.then(() => {
  if (params.room) void autoJoin(params.room);
  else if (params.online) openOnline();
});
