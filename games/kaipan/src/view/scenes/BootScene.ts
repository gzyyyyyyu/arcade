import Phaser from 'phaser';
import { APP_VERSION } from '../../platform/version.ts';
import { atlasStatus, ensureAtlas, ensureGameArt, loadOptionalArt, prepareArt, queueBoot, stocksForThemes, warmLazy, type AtlasMode } from '../assets.ts';
import { loadNumFont } from '../numFont.ts';
import type { Session } from '../session.ts';
import { COLOR, PHONE, VIEW } from '../theme.ts';
import { addText } from '../ui/text.ts';
import { setupCamera } from './BaseScene.ts';

// 竖屏版世界只有 404 宽：进度条两边各留 32
const BAR_W = Math.min(420, VIEW.w - 64);

/** URL 参数 atlas=0 / atlas=1：强制不用 / 用图集（对比清晰度、统计请求数用）。 */
function atlasMode(): AtlasMode {
  const v = new URLSearchParams(window.location.search).get('atlas');
  return v === '0' ? 'off' : v === '1' ? 'on' : 'auto';
}

/** 有图没载入的提示：页面上方一条，点一下刷新（docs/ui.md 第 7 节）；同一时间只有一条，换场景也留着，直到刷新 */
let reloadHint: HTMLElement | null = null;
function showReloadHint(): void {
  if (typeof document === 'undefined' || reloadHint?.isConnected) return;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'kp-reload-hint';
  el.textContent = '有图没载入，点这里刷新';
  el.style.cssText =
    'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translateX(-50%);z-index:60;min-height:44px;padding:10px 22px;border:2px solid #d8342c;border-radius:999px;' +
    'background:#fff8ec;color:#3a2634;font:600 16px/1.4 system-ui,"Noto Sans CJK SC","PingFang SC",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;';
  el.addEventListener('click', () => globalThis.location.reload());
  document.body.appendChild(el);
  reloadHint = el;
}

/**
 * 启动加载：先读图集入口（有图集就从图集取帧），再加载 title 图集页、其余固定素材、当前这局登场题材的股票合成图
 * （其余题材进交易场景时按需补加载），最后取可选素材（道具图标、眨眼、标题主视觉，缺了就算了）。
 * 显示进度与版本号，完成后交给 Session。
 */
export class BootScene extends Phaser.Scene {
  private readonly session: Session;
  private readonly toTitle: boolean;
  private fill!: Phaser.GameObjects.Rectangle;
  private label!: Phaser.GameObjects.Text;

  constructor(session: Session, toTitle: boolean) {
    super('boot');
    this.session = session;
    this.toTitle = toTitle;
  }

  create(): void {
    // 手机横屏直接按手机世界布局（VIEW，见 theme.ts 的 phoneWorld；电脑上是 1280×720）
    setupCamera(this, PHONE);
    const cx = VIEW.w / 2;
    const cy = VIEW.h / 2;
    this.add.rectangle(0, 0, VIEW.w, VIEW.h, COLOR.bg).setOrigin(0, 0);
    addText(this, cx, cy - 70, '开盘', { size: 44, bold: true, color: COLOR.accentDark, originX: 0.5, originY: 0.5 });
    this.label = addText(this, cx, cy + 30, '正在载入…', { size: 15, color: COLOR.muted, originX: 0.5 });
    this.add.rectangle(cx - BAR_W / 2, cy, BAR_W, 12, COLOR.paper).setOrigin(0, 0.5).setRounded(6).setStrokeStyle(2, COLOR.ink, 1);
    this.fill = this.add.rectangle(cx - BAR_W / 2 + 2, cy, 1, 8, COLOR.accent).setOrigin(0, 0.5).setRounded(4);
    addText(this, VIEW.w - 20, VIEW.h - 16, `版本 ${APP_VERSION}`, { size: 13, color: COLOR.muted, originX: 1, originY: 1 });
    document.getElementById('boot')?.remove();
    void this.run();
  }

  private progress(p: number): void {
    this.session.bootProgress = p;
    this.fill.setSize(Math.max(1, (BAR_W - 4) * p), 8);
    this.label.setText(`正在载入… ${Math.round(p * 100)}%`);
  }

  private async run(): Promise<void> {
    // 字体和图集入口同时取；图集入口一到，页图、固定素材、标题主视觉就一起拉，不排着队一段一段等
    const font = loadNumFont();
    await prepareArt(atlasMode());
    const stocks = stocksForThemes(this.session.state.themeIds);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => this.progress(p * 0.95));
    const failed: string[] = [];
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      // 缺素材时界面退回到纯色图形，不阻断启动；同时让玩家知道，点一下刷新就能补上
      console.warn('素材加载失败：', file.key, file.url);
      failed.push(file.key);
    });
    const pass = (): Promise<void> =>
      new Promise<void>((resolve) => {
        this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
        queueBoot(this.load, this.textures, stocks);
        this.load.start();
      });
    // 只等标题页用到的 title 组；game 组（对局用）等标题页出来后在后台下，进对局前由 Session 保证到齐
    const hasAtlas = atlasStatus().title.pages > 0;
    const atlas = ensureAtlas(this.textures, 'title');
    const optional = loadOptionalArt(this.textures, { items: true, stocks, keyart: true, friendly: true });
    await Promise.all([pass(), atlas, optional, font]);
    // title 图集没加载成功：改用单独的 SVG 再加载一遍
    if (hasAtlas && !(await atlas)) {
      await pass();
      await loadOptionalArt(this.textures, { items: true, stocks, keyart: true, friendly: true });
    }
    this.progress(1);
    // 失败后又靠重试补上的不算：只在确实还缺图时提示
    if (failed.some((key) => !this.textures.exists(key))) showReloadHint();
    this.session.boot(this.game, this.toTitle);
    // 首屏可操作之后在后台预取：game 图集（对局用）、雷雨天图层、meta 图集（人设 / 难度 / 成就 / 图鉴界面用，用到时会再 ensureAtlas）
    if (this.toTitle) {
      void ensureGameArt(this.textures);
      warmLazy(this.textures);
      void ensureAtlas(this.textures, 'meta');
    }
  }
}
