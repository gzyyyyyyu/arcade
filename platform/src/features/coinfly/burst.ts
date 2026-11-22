/** 顶栏筹码牌子上迸出一小撮金币（约 600ms）。只动 transform/opacity；样式在 coinfly.css 的 .account--chips 下（features/topbar/TopBar.tsx 引入） */
import { burstTarget } from './burst-logic.ts';

const DURATION = 600;

export function burstCoins(host: HTMLElement, n = 8): void {
  const layer = document.createElement('span');
  layer.className = 'chips-burst';
  layer.setAttribute('aria-hidden', 'true');
  host.append(layer);
  const anims: Animation[] = [];
  for (let i = 0; i < n; i++) {
    const coin = document.createElement('span');
    coin.className = 'chips-burst__coin';
    layer.append(coin);
    const { dx, dy } = burstTarget(i, n);
    anims.push(
      coin.animate(
        [
          { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
          { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(1)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${dy + 10}px) scale(0.8)`, opacity: 0 },
        ],
        { duration: DURATION, delay: i * 15, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' },
      ),
    );
  }
  Promise.allSettled(anims.map((a) => a.finished)).then(() => layer.remove());
}
