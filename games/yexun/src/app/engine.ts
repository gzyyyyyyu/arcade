/**
 * 画面引擎（Phaser + 对局场景）：main.ts 在主页画出来以后才动态 import 这个文件，Phaser 的下载、解析、开 WebGL 都不挡首屏。
 * 起好以后趁空闲把三张常驻图集先传上显卡（一张一个空闲片），点开局时不再一次传完。
 * 不在对局里时帧循环睡着（菜单盖着画布，空画也要每帧清屏、合成）：开局、回放时 main.ts 叫醒，回主页时让它睡。
 */
import Phaser from 'phaser';
import { GameScene } from '../view/game/GameScene.ts';
import { watchContextLoss } from './glitchTip.ts';

export { GameScene };

export interface Engine {
  game: Phaser.Game;
  GameScene: typeof GameScene;
}

export interface EngineOpts {
  parent: HTMLElement;
  /** 画布像素尺寸（CSS 尺寸 × 渲染倍数）和渲染倍数 */
  width: number;
  height: number;
  r: number;
  ground: HTMLCanvasElement;
  /** 空闲时先传的图集：纹理名 → 画布（名字和 GameScene 里取的一致，场景开局时有就直接用） */
  preload: readonly (readonly [string, HTMLCanvasElement])[];
}

/**
 * Phaser 的默认批大小是 16,384 个四边形，每种批处理各开一块这么大的顶点缓冲（开机共 5.8 MB），慢手机上开 WebGL 卡一两秒。
 * 夜巡一帧只有 4 次左右绘制，4,096 个一批绰绰有余；满了只是多一次绘制，画面不变
 */
const BATCH = 4096;

export function startEngine(o: EngineOpts): Promise<Engine> {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: o.parent,
    width: o.width,
    height: o.height,
    backgroundColor: '#e4e8f0',
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / o.r },
    render: { antialias: true, pixelArt: false, powerPreference: 'high-performance', batchSize: BATCH },
    banner: false,
    audio: { noAudio: true },
    fps: { smoothStep: false },
  });
  watchContextLoss(game);
  return new Promise((resolve) => {
    game.events.once(Phaser.Core.Events.READY, () => {
      game.textures.addCanvas('ground', o.ground);
      preloadIdle(game, o.preload);
      // READY 之后 Phaser 才同步开帧循环（Game.texturesReady），放到微任务里再让它睡
      queueMicrotask(() => {
        game.loop.sleep();
        resolve({ game, GameScene });
      });
    });
  });
}

/** 一张图集一个空闲片；开局时还没传到的由场景自己传（GameScene 里 exists 判断） */
function preloadIdle(game: Phaser.Game, list: EngineOpts['preload']): void {
  const idle = (f: () => void): void => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(f, { timeout: 2000 });
    else setTimeout(f, 50);
  };
  const next = (i: number): void => {
    const item = list[i];
    if (!item) return;
    idle(() => {
      if (!game.textures.exists(item[0])) game.textures.addCanvas(item[0], item[1]);
      next(i + 1);
    });
  };
  next(0);
}
