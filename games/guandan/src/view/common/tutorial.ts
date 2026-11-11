/**
 * 新手引导的外壳（掼蛋、斗地主共用）：遮罩、点阵、跳过 / 下一步。每一步画什么由各玩法的 tutorial.ts 决定。
 */
import type Phaser from 'phaser';
import { COLOR } from './theme.ts';
import { Button, worldH, worldW } from '../ui/kit.ts';

/** 当前是否在引导中（冒烟用） */
export const tutorialState = { step: -1, buttons: {} as Record<string, { x: number; y: number }> };

/** 引导的外壳（掼蛋、斗地主共用）：遮罩、点阵、跳过 / 下一步；每一步画什么由 draw 决定。看完或跳过时调 onDone */
export interface TutorialUi {
  W: number;
  page: Phaser.GameObjects.Container;
  /** 整屏压暗 */
  fullDim(): void;
  /** 自己画遮罩（聚光） */
  dim: Phaser.GameObjects.Graphics;
  /** 底部的跳过 / 下一步，y 是按钮的纵坐标；最后一步按钮写"开打！" */
  nav(y: number, last: boolean): void;
}

export function runTutorialSteps(scene: Phaser.Scene, steps: number, onDone: () => void, draw: (step: number, ui: TutorialUi) => void): Promise<void> {
  return new Promise((resolve) => {
    const W = worldW(scene);
    const root = scene.add.container(0, 0).setDepth(6000);
    const dim = scene.add.graphics();
    root.add(dim);
    const blocker = scene.add.zone(0, 0, W, worldH).setOrigin(0, 0).setInteractive();
    root.add(blocker);
    const page = scene.add.container(0, 0);
    root.add(page);
    let step = 0;

    const finish = (): void => {
      onDone();
      tutorialState.step = -1;
      scene.tweens.add({ targets: root, alpha: 0, duration: 160, onComplete: () => root.destroy() });
      resolve();
    };

    const nav = (y: number, last: boolean): void => {
      const dots = scene.add.container(W / 2, y - 52);
      for (let i = 0; i < steps; i++) dots.add(scene.add.circle((i - (steps - 1) / 2) * 22, 0, 6, i === step ? COLOR.red : 0xc9b48e));
      page.add(dots);
      tutorialState.buttons = { skip: { x: W / 2 - 130, y }, next: { x: W / 2 + 130, y } };
      page.add(new Button(scene, W / 2 - 130, y, 200, 58, '跳过', 'wood', finish));
      page.add(
        new Button(scene, W / 2 + 130, y, 200, 58, last ? '开打！' : '下一步', 'red', () => {
          if (last) finish();
          else {
            step++;
            show();
          }
        }),
      );
    };

    const fullDim = (): void => {
      dim.clear();
      dim.fillStyle(COLOR.overlay, 0.66).fillRect(0, 0, W, worldH);
    };

    const show = (): void => {
      tutorialState.step = step;
      page.removeAll(true);
      draw(step, { W, page, dim, fullDim, nav });
    };
    show();
  });
}
