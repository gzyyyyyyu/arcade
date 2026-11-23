import type Phaser from 'phaser';
import type { TitleScene } from '../scenes/TitleScene.ts';
import { worldH, worldW } from '../ui/kit.ts';
import { toast } from '../ui/bubble.ts';

/**
 * 实盘"再来一场"带入没成：回标题页并直接打开选档页，把原因弹在上面。
 * 为什么不留在结算页重试：带入被拒（钱不够、已经在另一桌、没登录……）重点几次也不会成，让人回去换档或看钱包更直接。
 * 选档页和主页上的"实盘"卡是同一个（TitleScene 的 pickStake / pickDdzStake），这里只在标题页建好后调它
 */
export function backToPicker(scene: Phaser.Scene, variant: 'guandan' | 'ddz', msg: string): void {
  const title = scene.scene.get('title') as TitleScene;
  title.events.once('create', () => {
    // 标题页自己的开场（钱包提醒之类的 toast）先走一帧再弹，免得被盖掉
    title.time.delayedCall(60, () => {
      if (!title.scene.isActive()) return;
      if (variant === 'ddz') title.pickDdzStake();
      else title.pickStake();
      toast(title, msg, worldW(title) / 2, worldH(title) - 60);
    });
  });
  scene.scene.start('title');
}
