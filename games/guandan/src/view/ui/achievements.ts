/** 成就的画面：解锁时牌桌上的小横幅，和主页的成就墙。数据和判断在 ../achievements.ts，这里只画。 */
import Phaser from 'phaser';
import { ACHIEVEMENTS, achDef, loadAch, type AchDef, type AchGroup } from '../common/achievements.ts';
import { audio } from '../common/audio.ts';
import { COLOR, SPACE, TYPE, minHit } from '../common/theme.ts';
import { hasLayer } from './focus.ts';
import { fitWidth,modal, segmented, text, worldH, worldW, type Modal } from './kit.ts';

/** 一枚奖章：金圆章 + 星（程序画）；没解锁的是灰章。原点在章心 */
function medal(scene: Phaser.Scene, x: number, y: number, r: number, lit: boolean): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setPosition(x, y);
  g.fillStyle(0x000000, 0.2).fillCircle(0, 3, r);
  g.fillStyle(lit ? COLOR.goldDark : 0x6e665c, 1).fillCircle(0, 0, r);
  g.fillStyle(lit ? COLOR.gold : COLOR.grey, 1).fillCircle(0, -1, r - 3);
  g.lineStyle(2, lit ? COLOR.goldLight : 0xa89f94, 1).strokeCircle(0, -1, r - 7);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = (i % 2 === 0 ? r - 10 : (r - 10) * 0.45);
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * rr, -1 + Math.sin(a) * rr));
  }
  g.fillStyle(lit ? COLOR.ivory : 0x9a9189, 1).fillPoints(pts, true);
  return g;
}

/**
 * 解锁提示：顶部居中一条横幅，不接点击（盖在结算弹窗上也不挡按钮），停约 2.4 秒后淡出；一次解锁几个就叠几条（最多 3 条，多的合成一句）。
 */
export function showUnlocked(scene: Phaser.Scene, ids: string[]): void {
  const defs = ids.map(achDef).filter((d): d is AchDef => !!d);
  if (defs.length === 0) return;
  audio.sfx('levelUp');
  const lines = defs.length <= 3 ? defs.map((d) => `成就解锁：${d.name}`) : [`成就解锁：${defs[0]!.name} 等 ${defs.length} 个`];
  const cx = worldW(scene) / 2;
  // 结算页这类弹窗开着时，顶上正是弹窗的标题飘带：横幅改落到屏幕下沿（弹窗面板最高 worldH-40，下沿基本是空的），多条往上叠，从下往上浮入
  const low = hasLayer(scene);
  lines.forEach((line, i) => {
    const c = scene.add.container(cx, low ? worldH - 30 - i * 58 : 54 + i * 58).setDepth(6000);
    const t = text(scene, 22, 0, line, { size: TYPE.body, bold: true, color: 0xfff6e0 });
    fitWidth(t, worldW(scene) - 200);
    const w = t.width + 44 + 56;
    const g = scene.add.graphics();
    g.fillStyle(0x2a1a10, 0.94).fillRoundedRect(-w / 2, -24, w, 48, 24);
    g.lineStyle(2, COLOR.gold, 0.9).strokeRoundedRect(-w / 2, -24, w, 48, 24);
    t.x = 22;
    c.add([g, medal(scene, -w / 2 + 30, 0, 16, true), t]);
    const dy = low ? -10 : 10;
    c.setAlpha(0).setY(c.y - dy);
    scene.tweens.add({ targets: c, alpha: 1, y: c.y + dy, duration: 220, delay: i * 180 });
    scene.tweens.add({ targets: c, alpha: 0, delay: 2400 + i * 180, duration: 500, onComplete: () => c.destroy() });
  });
}

const TABS: { label: string; value: AchGroup }[] = [{ label: '掼蛋', value: 'gd' }, { label: '斗地主', value: 'ddz' }];

/** 成就墙：顶上"已解锁 n/总数"，掼蛋 / 斗地主两个标签，每页 4×2 格；解锁的亮，没解锁的灰；两种都写条件 */
export function openAchievements(scene: Phaser.Scene, group: AchGroup = 'gd'): Modal {
  const W = worldW(scene);
  const PW = Math.min(W - SPACE.xxl * 2, 1100);
  const PH = Math.min(worldH - 40, 600);
  const m = modal(scene, PW, PH, '成就');
  const b = m.body;
  const unlocked = new Set(loadAch().unlocked);
  const top = -PH / 2 + 84;
  b.add(text(scene, -PW / 2 + 40, top + 22, `已解锁 ${unlocked.size}/${ACHIEVEMENTS.length}`, { size: TYPE.title, bold: true, color: COLOR.ink, ox: 0 }));
  const grid = scene.add.container(0, 0);
  b.add(grid);

  const cols = 4;
  const gap = SPACE.md;
  const cw = (PW - 80 - gap * (cols - 1)) / cols;
  const ch = Math.min(200, (PH - 84 - 70 - 40 - gap) / 2);
  const draw = (g: AchGroup): void => {
    grid.removeAll(true);
    ACHIEVEMENTS.filter((a) => a.group === g).forEach((a, i) => {
      const lit = unlocked.has(a.id);
      const x = -PW / 2 + 40 + (i % cols) * (cw + gap);
      const y = top + 70 + Math.floor(i / cols) * (ch + gap);
      const bg = scene.add.graphics();
      bg.fillStyle(lit ? 0xf3e6c9 : 0xdcd3c3, 1).fillRoundedRect(x, y, cw, ch, 14);
      bg.lineStyle(2, lit ? COLOR.gold : 0xb3a995, 1).strokeRoundedRect(x, y, cw, ch, 14);
      grid.add(bg);
      grid.add(medal(scene, x + cw / 2, y + 32, 22, lit));
      grid.add(fitWidth(text(scene, x + cw / 2, y + 74, a.name, { size: TYPE.label, bold: true, color: lit ? COLOR.ink : COLOR.muted }), cw - 16));
      grid.add(text(scene, x + cw / 2, y + 96, a.desc, { size: TYPE.small, color: lit ? COLOR.ink : COLOR.muted, wrap: cw - 20, align: 'center', oy: 0 }));
    });
  };
  draw(group);
  const hitM = minHit();
  b.add(segmented(scene, PW / 2 - 40 - 225, top + 22, TABS, group, (v) => draw(v as AchGroup), 150, hitM));
  return m;
}
