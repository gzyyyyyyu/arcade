import Phaser from 'phaser';

export function watchContextLoss(game: Phaser.Game): void {
  // WebGL 上下文丢了（显存吃紧时 iOS 会收回）Phaser 会等它恢复；3 秒还没恢复才提示刷新，恢复就收起，同一时间只有一条
  game.events.once(Phaser.Core.Events.READY, () => {
    let wait: ReturnType<typeof setTimeout> | null = null;
    let tip: HTMLButtonElement | null = null;
    game.canvas.addEventListener('webglcontextlost', () => {
      if (wait || tip) return;
      wait = setTimeout(() => {
        wait = null;
        tip = document.createElement('button');
        tip.type = 'button';
        tip.className = 'yx-glitch';
        tip.textContent = '画面出了点问题，点这里刷新（进度都存着）';
        tip.addEventListener('click', () => location.reload());
        document.body.appendChild(tip);
      }, 3000);
    });
    game.canvas.addEventListener('webglcontextrestored', () => {
      if (wait) clearTimeout(wait);
      wait = null;
      tip?.remove();
      tip = null;
    });
  });
}
