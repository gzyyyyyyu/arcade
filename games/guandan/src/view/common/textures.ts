/**
 * 把美术模块生成的 SVG 字符串烘焙成 Phaser 纹理：按 RENDER_SCALE 倍的像素尺寸栅格化（SVG 根节点的 width/height
 * 直接改成目标像素，浏览器按矢量重画，不是位图放大），再 addCanvas。显示时用 setDisplaySize 回到世界尺寸。
 */
import type Phaser from 'phaser';
import {
  avatarSvg,
  cardBackSvg,
  cardFaceSvg,
  homeFigureSvg,
  iconSvg,
  lanternArtSvg,
  levelMarkSvg,
  logoSvg,
  particleSvg,
  stampSvg,
  tableSvg,
  titleArtSvg,
  wildMarkSvg,
  type AvatarId,
  type IconName,
  type Mood,
} from '../art/index.ts';
import { app } from '../app.ts';
import { FIGURE_SIZE, LANTERN_SIZE } from './home-layout.ts';
import { withSvgFont } from './fonts.ts';
import { appBox } from './device.ts';
import { showErrorPanel } from './errors.ts';
import { COLOR, GAME_HEIGHT, RENDER_SCALE, TYPE, isPortrait, worldWidthFor } from './theme.ts';
import { text, worldW } from '../ui/kit.ts';

/** 牌的烘焙尺寸（世界单位）；手牌约 92 宽，略大一点烘焙，缩小显示更锐利。 */
export const CARD_W = 100;
export const CARD_H = 140;

const AVATARS: AvatarId[] = ['me', 'laozhang', 'xiaomei', 'aqiang', 'wengge', 'yaomeir'];
/** 主页大图只给掼蛋的四个人烘焙 */
const HOME_FIGS = ['me', 'laozhang', 'xiaomei', 'aqiang'] as const;
const MOODS: Mood[] = ['normal', 'happy', 'sad', 'think', 'smug'];
/** 主页上每个人的表情 */
const HOME_MOOD: Record<(typeof HOME_FIGS)[number], Mood> = { laozhang: 'smug', xiaomei: 'normal', aqiang: 'happy', me: 'happy' };
const ICONS: IconName[] = [
  'play', 'pass', 'hint', 'sort', 'undo', 'settings', 'rules', 'sound', 'mute', 'back',
  'stats', 'home', 'close', 'check', 'crown', 'bomb', 'cards', 'robot', 'speed', 'restart',
  'cloudOff', 'cloudCheck', 'cloudSync', 'cloudUp', 'cloudMerge', 'chat', 'invite', 'smile', 'share',
];
const STAMPS: Record<string, string> = {
  头游: '#c8202a',
  二游: '#b0702a',
  三游: '#5a6a7a',
  末游: '#5a5550',
  接风: '#c8202a',
  抗贡: '#7a2a9a',
};
const PARTICLES = ['spark', 'petal', 'coin', 'confetti', 'star', 'smoke'] as const;

export function cardKey(c: number): string {
  const i = c % 54;
  if (i === 52) return 'card:16';
  if (i === 53) return 'card:17';
  return `card:${(i % 13) + 2}:${Math.floor(i / 13)}`;
}

function sized(svg: string, pw: number, ph: number): string {
  // 改根节点的 width/height，保留 viewBox，让浏览器按目标像素矢量栅格化
  return svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const rest = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${rest} width="${pw}" height="${ph}">`;
  });
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('SVG 解码失败'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

interface Job {
  key: string;
  svg: () => string;
  w: number;
  h: number;
  /** 大图限制像素尺寸（部分手机最大纹理 4096） */
  maxPx?: number;
  /** 渲染倍数的上限（主页背景首帧只烘 1 倍） */
  maxScale?: number;
}

/** 正在烘焙的纹理：主页先烘、后台再烘，同一张被两边同时要时只做一次 */
const inflight = new Map<string, Promise<void>>();

function bake(scene: Phaser.Scene, job: Job): Promise<void> {
  if (scene.textures.exists(job.key)) return Promise.resolve();
  let p = inflight.get(job.key);
  if (!p) {
    p = bakeNow(scene, job).finally(() => inflight.delete(job.key));
    inflight.set(job.key, p);
  }
  return p;
}

async function bakeNow(scene: Phaser.Scene, job: Job): Promise<void> {
  let s = Math.min(RENDER_SCALE, job.maxScale ?? RENDER_SCALE);
  if (job.maxPx) s = Math.min(s, job.maxPx / Math.max(job.w, job.h));
  const pw = Math.max(1, Math.round(job.w * s));
  const ph = Math.max(1, Math.round(job.h * s));
  const img = await loadImage(withSvgFont(sized(job.svg(), pw, ph)));
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d 不可用');
  ctx.drawImage(img, 0, 0, pw, ph);
  if (scene.textures.exists(job.key)) return;
  scene.textures.addCanvas(job.key, canvas);
}

/** 主页（标题页）要用的：logo、灯笼、四个人、图标、火星粒子，以及设置/教程面板里的头像（开心脸） */
function jobsHome(): Job[] {
  const jobs: Job[] = [];
  for (const i of ICONS) jobs.push({ key: `icon:${i}`, svg: () => iconSvg(i, '#ffffff'), w: 48, h: 48 });
  jobs.push({ key: 'particle:spark', svg: () => particleSvg('spark'), w: 32, h: 32 });
  for (const a of AVATARS) jobs.push({ key: `avatar:${a}:happy`, svg: () => avatarSvg(a, 'happy'), w: 128, h: 128 });
  // 主页标题"牌馆"（logo 上不盖印章）
  jobs.push({ key: 'logo:hall', svg: () => logoSvg(false, '牌馆'), w: 520, h: 220 });
  // 主页（art-v3）：能动的灯笼和四个人，按显示尺寸烘焙（人物显示约 1.62 倍）
  jobs.push({ key: 'home:lantern', svg: () => lanternArtSvg(), w: LANTERN_SIZE.w, h: LANTERN_SIZE.h });
  for (const a of HOME_FIGS) jobs.push({ key: `home:fig:${a}`, svg: () => homeFigureSvg(a, HOME_MOOD[a]), w: Math.round(FIGURE_SIZE.w * 1.62), h: Math.round(FIGURE_SIZE.h * 1.62) });
  return jobs;
}

/** 牌桌（掼蛋、斗地主）一开局就要的：牌背、标记、牌面。烘完这些（加当前宽度的牌桌背景）就能进牌桌 */
function jobsTableCore(): Job[] {
  const jobs: Job[] = [];
  jobs.push({ key: 'back:0', svg: () => cardBackSvg(0), w: CARD_W, h: CARD_H });
  jobs.push({ key: 'back:1', svg: () => cardBackSvg(1), w: CARD_W, h: CARD_H });
  jobs.push({ key: 'mark:level', svg: () => levelMarkSvg(), w: CARD_W, h: CARD_H });
  jobs.push({ key: 'mark:wild', svg: () => wildMarkSvg(), w: CARD_W, h: CARD_H });
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) jobs.push({ key: `card:${r}:${s}`, svg: () => cardFaceSvg(r, s), w: CARD_W, h: CARD_H });
  jobs.push({ key: 'card:16', svg: () => cardFaceSvg(16, -1), w: CARD_W, h: CARD_H });
  jobs.push({ key: 'card:17', svg: () => cardFaceSvg(17, -1), w: CARD_W, h: CARD_H });
  return jobs;
}

/**
 * 牌桌上过一会儿才用到的：头像表情、名次印章、特效粒子。进牌桌后接着在后台烘；
 * 万一烘完之前就要用（开局就炸、头像变脸），画面经 texOr 换成已有的替身，不出缺纹理的方块
 */
function jobsTableExtra(): Job[] {
  const jobs: Job[] = [];
  for (const a of AVATARS) for (const m of MOODS) if (m !== 'happy') jobs.push({ key: `avatar:${a}:${m}`, svg: () => avatarSvg(a, m), w: 128, h: 128 });
  for (const [t, c] of Object.entries(STAMPS)) jobs.push({ key: `stamp:${t}`, svg: () => stampSvg(t, c), w: 150, h: 150 });
  for (const p of PARTICLES) if (p !== 'spark') jobs.push({ key: `particle:${p}`, svg: () => particleSvg(p), w: 32, h: 32 });
  return jobs;
}

/**
 * 推后烘的纹理（jobsTableExtra）还没烘好时用替身：头像表情换成开心脸（主页就烘了）、粒子换成火星、印章换成透明的空图。
 * 只给这几类用；牌面、牌背、牌桌背景进牌桌前一定烘好了，不走这里
 */
export function texOr(scene: Phaser.Scene, key: string): string {
  if (scene.textures.exists(key)) return key;
  if (key.startsWith('avatar:')) return `${key.slice(0, key.lastIndexOf(':'))}:happy`;
  if (key.startsWith('particle:')) return 'particle:spark';
  return '__DEFAULT';
}

async function bakeJobs(scene: Phaser.Scene, jobs: Job[], batch: number, onProgress: (p: number) => void, yieldBetween = false): Promise<void> {
  let done = 0;
  const step = async (j: Job): Promise<void> => {
    await bake(scene, j);
    done++;
    onProgress(done / jobs.length);
  };
  // 分批并发，避免一次塞几百个解码任务卡住主线程
  for (let i = 0; i < jobs.length; i += batch) {
    await Promise.all(jobs.slice(i, i + batch).map(step));
    // 后台烘焙每批之间让出一下，点按钮、动画不被解码挤住
    if (yieldBetween) await new Promise<void>((r) => setTimeout(r, 0));
  }
}

/**
 * 主页背景整屏大图，分两档：首帧只烘 1 倍（`title:<宽>x<高>`，像素是 2 倍的四分之一，解码快得多，手机物理分辨率下基本一样清楚），
 * 标题页出来、牌桌素材烘完后再烘全倍数的 `title:<宽>x<高>:hi` 换上（titleBackdrop / upgradeTitleBackdrop）。渲染倍数本来就是 1 时只有前一档。
 * key 带高：竖屏的主页世界高度随屏幕比例变（theme.ts 的 worldSizeFor）
 */
function titleKey(w: number, h: number, hi: boolean): string {
  return `title:${w}x${h}${hi ? ':hi' : ''}`;
}

function titleJob(w: number, h: number, hi: boolean): Job {
  return { key: titleKey(w, h, hi), svg: () => titleArtSvg(w, h), w, h, maxPx: 4096, maxScale: hi ? undefined : 1 };
}

/** 标题页该用哪张背景：全倍数的烘好了就用它，否则用首帧的 1 倍图 */
export function titleBackdrop(scene: Phaser.Scene, w: number, h: number): string {
  return scene.textures.exists(titleKey(w, h, true)) ? titleKey(w, h, true) : titleKey(w, h, false);
}

/** 标题页的背景图换成全倍数的：等牌桌素材烘完（别和它抢主线程），烘好后直接换纹理，不闪；出错只留着 1 倍图 */
export function upgradeTitleBackdrop(scene: Phaser.Scene, img: Phaser.GameObjects.Image, w: number, h: number): void {
  if (RENDER_SCALE <= 1 || img.texture.key.endsWith(':hi')) return;
  void (async () => {
    await startBackgroundBake(scene).catch(() => undefined);
    await bake(scene, titleJob(w, h, true));
    const hi = titleKey(w, h, true);
    if (!img.scene || !img.active || scene.textures.exists(hi) === false) return;
    const lo = img.texture.key;
    img.setTexture(hi).setDisplaySize(w, h);
    // 1 倍图用不着了（场景重开时 titleBackdrop 直接取全倍数的）
    if (lo !== img.texture.key) dropTexture(scene, lo);
  })().catch((err) => console.warn('主页背景升级失败，沿用 1 倍图', err));
}

function dropTexture(scene: Phaser.Scene, key: string): void {
  if (!scene.textures.exists(key)) return;
  const src = scene.textures.get(key).getSourceImage();
  scene.textures.remove(key);
  // WebKit 的画布内存要等垃圾回收才还，先把尺寸清零让它马上还
  if (src instanceof HTMLCanvasElement) src.width = src.height = 0;
}

/** 启动时烘焙主页要用的小素材和主页背景（BootScene 等这一步）；onProgress 0..1。牌桌的素材见 startBackgroundBake */
export async function bakeHome(scene: Phaser.Scene, w: number, h: number, onProgress: (p: number) => void): Promise<void> {
  const jobs = jobsHome();
  const title = bake(scene, titleJob(w, h, false)).then(() => performance.mark('gd:title-bg'));
  await Promise.all([bakeJobs(scene, jobs, 12, (p) => onProgress(p * 0.9)).then(() => performance.mark('gd:home-jobs')), title]);
  onProgress(1);
}

let tablePart: Promise<void> | null = null;
let corePart: Promise<void> | null = null;
let tableDone = 0;
let tableTotal = 1;
let coreTotal = 1;

/**
 * 标题页出来后在后台烘焙牌桌的素材（整套约 100 张）。只启动一次，分两段：
 * 先烘一开局就要的（jobsTableCore 加当前宽度的牌桌背景，gd:table-core），烘完就能进牌桌；再烘表情、印章、粒子（gd:table-bake），进了牌桌也接着烘。
 * 不等整套烘完：主页一出来马上点开局的话要干等（手机无头约 10 秒）。URL 带 bake=all 时等整套（冒烟留着这条路）
 */
export function startBackgroundBake(scene: Phaser.Scene): Promise<void> {
  if (!tablePart) {
    const core = jobsTableCore();
    const extra = jobsTableExtra();
    coreTotal = core.length + 1;
    tableTotal = coreTotal + extra.length;
    corePart = (async () => {
      await bakeJobs(scene, core, 6, (p) => (tableDone = Math.round(p * core.length)), true);
      // 当前宽度的牌桌背景也在这里先烘：等点了开局才烘这一张整屏大图的话，手机上要干等 2 秒多
      await bake(scene, tableJob(tableW()));
      tableDone = coreTotal;
      performance.mark('gd:table-core');
    })();
    tablePart = corePart.then(async () => {
      let n = 0;
      for (const j of extra) {
        // 进牌桌时先让发牌动画走完（releaseExtraBake），之后每张只在空闲的那一小段里烘一张，不和出牌动画抢主线程
        await extraGate;
        await idleSlot();
        await bake(scene, j);
        tableDone = coreTotal + ++n;
      }
      performance.mark('gd:table-bake');
    });
  }
  return tablePart;
}

/**
 * 主页的规则页（牌型示例）要用牌面：一进主页就点开时后台还没烘完（大小王排在最后），先画出来的是缺纹理方块。
 * 牌面都在了返回 null；没烘完返回烘完时兑现的 Promise，规则页等它重画一次
 */
export function cardsPending(scene: Phaser.Scene): Promise<void> | null {
  if (scene.textures.exists('card:17')) return null;
  startBackgroundBake(scene);
  return corePart;
}

/** 后段烘焙的闸：进牌桌时关上，发牌动画走完（牌桌第一次播完一批事件）或 15 秒兜底后打开；在主页上一直开着 */
let extraGate: Promise<void> = Promise.resolve();
let openGate: (() => void) | null = null;

function holdExtraBake(): void {
  // bake=all 进牌桌前要等整套烘完，这时不能关闸（不然要干等 15 秒兜底）
  if (openGate || tableDone >= tableTotal || app.params?.bakeAll) return;
  extraGate = new Promise<void>((r) => {
    const t = window.setTimeout(() => releaseExtraBake(), 15_000);
    openGate = () => {
      window.clearTimeout(t);
      r();
    };
  });
}

/** 牌桌播完第一批事件（发牌动画）时调：放开后段烘焙 */
export function releaseExtraBake(): void {
  const f = openGate;
  openGate = null;
  f?.();
}

/**
 * 等一段空闲再烘下一张：有 requestIdleCallback 就等至少 5 毫秒的空闲（最多等 1 秒）；
 * 没有的（iOS Safari）等这一帧画完再动手，一帧只烘一张（一张头像表情、印章、粒子都是小图）
 */
function idleSlot(): Promise<void> {
  const ric = (window as { requestIdleCallback?: (cb: (d: { timeRemaining(): number; didTimeout: boolean }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) {
    return new Promise<void>((r) => {
      const wait = (): void => {
        ric((d) => (d.timeRemaining() >= 5 || d.didTimeout ? r() : wait()), { timeout: 1000 });
      };
      wait();
    });
  }
  return new Promise<void>((r) => requestAnimationFrame(() => window.setTimeout(r, 0)));
}

/** 进牌桌要等到哪一段：默认只等一开局就要的；URL 带 bake=all 时等整套（旧路径） */
function readyNeed(): number {
  return app.params?.bakeAll ? tableTotal : coreTotal;
}

/** 牌桌背景（整屏大图，key 带世界宽度） */
function tableJob(w: number): Job {
  return { key: `table:${w}`, svg: () => tableSvg(w, GAME_HEIGHT), w, h: GAME_HEIGHT, maxPx: 4096 };
}

/** 牌桌的世界宽度：竖屏时按横过来以后的可见区算（主页是竖屏世界，牌桌只在横屏打） */
function tableW(): number {
  const b = appBox();
  return isPortrait(b.w, b.h) ? worldWidthFor(b.h, b.w) : worldWidthFor(b.w, b.h);
}

/** 牌桌要用的纹理是否都已就绪（含牌桌宽度的背景） */
function texturesReady(scene: Phaser.Scene): boolean {
  return tablePart !== null && tableDone >= readyNeed() && scene.textures.exists(`table:${tableW()}`);
}

/** 等牌桌的素材烘完；onProgress 0..1。世界宽度换过时顺便补烘当前宽度的牌桌背景 */
export async function ensureTextures(scene: Phaser.Scene, onProgress: (p: number) => void = () => undefined): Promise<void> {
  const timer = window.setInterval(() => onProgress(Math.min(1, tableDone / readyNeed())), 100);
  try {
    const all = startBackgroundBake(scene);
    await (app.params?.bakeAll ? all : corePart);
    await bake(scene, tableJob(tableW()));
    onProgress(1);
  } finally {
    window.clearInterval(timer);
  }
}

const waiting = new WeakSet<Phaser.Scene>();

/**
 * 进牌桌（'table'、'ddz'）的统一入口，代替直接 scene.start：素材齐了就立刻进；
 * 没烘完（手机上标题页出来后几秒内点得快）就在原地显示进度，烘完再进，不会出现缺纹理。
 */
export function startWhenReady(scene: Phaser.Scene, key: 'table' | 'ddz'): void {
  // 进牌桌各段用时：点开局（gd:enter）→ 素材就绪、开场景（gd:enter-start）
  performance.mark('gd:enter');
  holdExtraBake();
  if (texturesReady(scene)) {
    performance.mark('gd:enter-start');
    app.toTableWorld?.();
    scene.scene.start(key);
    return;
  }
  if (waiting.has(scene)) return;
  waiting.add(scene);
  const W = worldW(scene);
  const label = text(scene, W / 2, GAME_HEIGHT / 2, '正在洗牌…', { size: TYPE.big, bold: true, color: COLOR.goldLight }).setDepth(100000);
  const veil = scene.add.rectangle(0, 0, W, GAME_HEIGHT, 0x000000, 0.45).setOrigin(0, 0).setDepth(99999).setInteractive();
  // 等的这一会儿场景可能被重开（换宽度、单独部署重画），这行字跟着销毁、进度计时器还在跑：对销毁的 Text 调 setText 会抛 null.drawImage
  void ensureTextures(scene, (p) => label.active && label.setText(`正在洗牌… ${Math.round(p * 100)}%`))
    .then(() => {
      waiting.delete(scene);
      performance.mark('gd:enter-start');
      if (!scene.scene.isActive()) return;
      app.toTableWorld?.();
      scene.scene.start(key);
    })
    .catch((err) => {
      waiting.delete(scene);
      label.destroy();
      veil.destroy();
      showErrorPanel(err);
    });
}

/**
 * 背景大图随世界尺寸变化，按需烘焙（key 带尺寸）：牌桌背景按牌桌宽度（竖屏时是横过来以后的），主页背景按现在的世界宽高。
 * iOS Safari 地址栏一收一放、转屏都会换尺寸，旧尺寸的不删就越攒越多（2 倍渲染时一套约 28 MB），换完画面后用 dropBackdrops 删掉。
 */
export async function ensureBackdrops(scene: Phaser.Scene, w: number, h: number): Promise<void> {
  const tw = tableW();
  await Promise.all([bake(scene, tableJob(tw)), bake(scene, titleJob(w, h, false))]);
}

/** 删掉不是现在这套尺寸的背景大图（场景已经换用新尺寸之后再调） */
export function dropBackdrops(scene: Phaser.Scene, w: number, h: number): void {
  const keepTable = `table:${tableW()}`;
  for (const key of scene.textures.getTextureKeys()) {
    if (/^table:\d+$/.test(key) ? key === keepTable : !/^title:\d+x\d+(:hi)?$/.test(key) || key.startsWith(`title:${w}x${h}`)) continue;
    dropTexture(scene, key);
  }
}
