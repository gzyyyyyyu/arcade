import type Phaser from 'phaser';
import { COLOR } from '../theme.ts';
import { Dialog } from './dialog.ts';
import { addText } from './text.ts';

const W = 520;
/** 正文字号：比标签大一点（15），对话框里读得舒服；不在字号阶梯里，原样保留 */
const BODY = 15;

/** 一段提示（读档提示等）：标题、正文、「知道了」。 */
export class NoticeDialog extends Dialog {
  protected override get stacksOnTop(): boolean {
    return true;
  }

  constructor(scene: Phaser.Scene, title: string, body: string, onClosed?: () => void) {
    super(scene, W, 260, title, onClosed);
    this.inner.add(addText(scene, 32, 80, body, { size: BODY, color: COLOR.ink, wrap: W - 64, lineSpacing: 6 }));
    this.actions({ label: '知道了', hotkey: 'Esc', name: 'notice:ok', onClick: () => this.close() });
  }
}

/**
 * 确认框：正文 + 动词按钮 + 「取消」。Esc 等于取消；回车默认选安全的那个：
 * 普通确认回车等于确认，danger（丢东西、没法撤回）的确认按钮用危险色，回车等于取消。
 * 必须做决定，不能点遮罩关（✕、Esc、取消仍可）。
 */
export class ConfirmDialog extends Dialog {
  protected override get stacksOnTop(): boolean {
    return true;
  }

  constructor(scene: Phaser.Scene, title: string, body: string, okLabel: string, onOk: () => void, onCancel?: () => void, danger = false) {
    let decided = false;
    super(scene, W, 260, title, () => {
      if (!decided) onCancel?.();
    });
    this.closeOnBackdrop = false;
    this.inner.add(addText(scene, 32, 80, body, { size: BODY, color: COLOR.ink, wrap: W - 64, lineSpacing: 6 }));
    const { primary, secondary } = this.actions(
      {
        label: okLabel,
        hotkey: danger ? undefined : '回车',
        name: 'confirm:ok',
        danger,
        onClick: () => {
          decided = true;
          this.close();
          onOk();
        },
      },
      { label: '取消', hotkey: danger ? '回车' : 'Esc', name: 'confirm:cancel', onClick: () => this.close() },
    );
    const safe = danger ? secondary : primary;
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') safe?.press();
    };
    scene.input.keyboard?.on('keydown', onKey);
    this.once('destroy', () => scene.input.keyboard?.off('keydown', onKey));
  }
}

/** 二选一（0.6.0 实盘没打完时开别的局：继续这局 / 提前收手）：两个按钮各有去处，Esc 或 × 什么都不做；不能点遮罩关。 */
export class ChoiceDialog extends Dialog {
  protected override get stacksOnTop(): boolean {
    return true;
  }

  constructor(scene: Phaser.Scene, title: string, body: string, primary: { label: string; name: string; onClick: () => void }, secondary: { label: string; name: string; onClick: () => void }) {
    super(scene, W, 260, title);
    this.closeOnBackdrop = false;
    this.inner.add(addText(scene, 32, 80, body, { size: BODY, color: COLOR.ink, wrap: W - 64, lineSpacing: 6 }));
    const go = (fn: () => void) => (): void => {
      this.close();
      fn();
    };
    this.actions({ label: primary.label, name: primary.name, onClick: go(primary.onClick) }, { label: secondary.label, name: secondary.name, onClick: go(secondary.onClick) });
  }
}
