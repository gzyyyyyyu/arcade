import type Phaser from 'phaser';
import { KEY_NOTE, KEY_ROWS } from '../keys.ts';
import { COLOR, PHONE, TYPE } from '../theme.ts';
import { phonePanel, Dialog } from '../ui/dialog.ts';
import { addText } from '../ui/text.ts';

/**
 * 快捷键一览（H 或 ? 打开，Esc、右键、× 关闭）：一行一组键，左边键帽、右边一句话。
 * 内容在 keys.ts；手机横屏高度不够放按钮和提醒，行距收紧，靠 × 和 Esc 关。
 */
export class KeysPanel extends Dialog {
  constructor(scene: Phaser.Scene, onClosed?: () => void) {
    const row = PHONE ? 28 : 36;
    const top = PHONE ? 70 : 78;
    const note = PHONE ? 0 : 34;
    const foot = PHONE ? 14 : 70;
    const want = top + KEY_ROWS.length * row + note + foot;
    const size = PHONE ? phonePanel(scene) : { w: 640, h: want };
    super(scene, PHONE ? Math.min(size.w, 720) : size.w, Math.min(want, size.h), '快捷键一览', onClosed);
    const keyW = PHONE ? 176 : 200;
    KEY_ROWS.forEach((r, i) => {
      const cy = top + i * row + row / 2;
      let x = 28;
      for (const k of r.keys) {
        const t = addText(scene, 0, cy, k, { size: TYPE.label, bold: true, color: COLOR.ink, originY: 0.5 });
        const w = Math.max(30, t.width + 16);
        const cap = scene.add.rectangle(x, cy, w, row - 8, COLOR.paperHi).setOrigin(0, 0.5).setRounded(6).setStrokeStyle(2, COLOR.ink, 1);
        t.setX(x + (w - t.width) / 2);
        this.inner.add([cap, t]);
        x += w + 6;
      }
      this.inner.add(addText(scene, 28 + keyW + 8, cy, r.what, { size: PHONE ? TYPE.label - 1 : TYPE.label, color: COLOR.muted, originY: 0.5, wrap: this.dw - keyW - 72 }));
    });
    if (!PHONE) {
      this.inner.add(addText(scene, 28, top + KEY_ROWS.length * row + 14, KEY_NOTE, { size: TYPE.label, color: COLOR.accentDark, bold: true, originY: 0.5 }));
      this.actions({ label: '知道了', hotkey: 'Esc', name: 'keys:ok', onClick: () => this.close() });
    }
  }
}
