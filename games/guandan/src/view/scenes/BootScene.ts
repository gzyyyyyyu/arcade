/** 加载场景：先烘焙主页要用的 SVG 纹理（带进度条），进标题页并在后台烘牌桌的素材；URL 开局、邀请链接则等全烘完直接进牌桌。 */
import Phaser from 'phaser';
import { app } from '../app.ts';
import { loadTitleFont } from '../common/fonts.ts';
import { bakeHome, ensureTextures, startBackgroundBake } from '../common/textures.ts';
import { COLOR } from '../common/theme.ts';
import { worldH, worldW } from '../ui/kit.ts';
import { showErrorPanel } from '../common/errors.ts';
import { detectOnce } from '../common/platform.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(this.scale.gameSize.height / worldH);
    const W = worldW(this);
    const g = this.add.graphics();
    const bar = (p: number): void => {
      g.clear();
      g.fillStyle(0x000000, 0.4).fillRoundedRect(W / 2 - 200, worldH / 2 + 40, 400, 14, 7);
      g.fillStyle(COLOR.gold, 1).fillRoundedRect(W / 2 - 200, worldH / 2 + 40, Math.max(14, 400 * p), 14, 7);
    };
    bar(0);
    const t0 = performance.now();
    void (async () => {
      try {
        // 标题字体和纹理烘焙并行；字体要在第一个场景建文字之前就绪
        const font = loadTitleFont();
        performance.mark('gd:boot-create');
        // 只等主页要用的（图标、logo、灯笼、人物、标题背景）；牌桌的牌面、头像、印章、粒子、牌桌背景等标题页出来后在后台烘
        await bakeHome(this, W, worldH, (p) => bar(p * 0.85));
        performance.mark('gd:bake');
        await font;
        performance.mark('gd:font');
        // 邀请链接、刷新时房间可能在载入过程中就接上了（app.net 已设好），载完直接进牌桌：这条路径要等牌桌素材烘完
        const target = app.net || app.session ? 'table' : app.ddzNet || app.ddz ? 'ddz' : 'title';
        // 有没有平台（/api/me）：标题页不等，按有平台先画，问完是单独部署再重画（TitleScene）；直接进牌桌的照旧等
        if (target !== 'title') await Promise.all([detectOnce(), ensureTextures(this, (p) => bar(0.85 + p * 0.15))]);
        performance.mark('gd:textures');
        bar(1);
        document.getElementById('boot')?.remove();
        app.bootMs = Math.round(performance.now() - t0);
        app.ready = true;
        // 邀请链接、刷新时房间可能在载入过程中就接上了（app.net 已设好），载完直接进牌桌
        this.scene.start(target);
        if (target === 'title') void startBackgroundBake(this).catch(showErrorPanel);
      } catch (err) {
        showErrorPanel(err);
      }
    })();
  }
}
