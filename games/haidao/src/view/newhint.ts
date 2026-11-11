import { PALETTE as P } from './art/index.ts';

/** 主寨解锁新建筑后，“建造”钮上的提示样式（约 1.5 秒的一圈金光 + 小星星）；减弱动态时圈和星星不动，只是静态高亮 */
export function newHintCss(): string {
  const ink = (P as Record<string, string>).ink!;
  const W = '.hd-ui.hd-skin';
  return `
${W} .hd-bottom .hd-btn.hd-newhint { z-index:3; animation:hd-newhint 1.5s linear 1; }
${W} .hd-bottom .hd-btn.hd-newhint::before { content:''; position:absolute; inset:-5px; border-radius:14px; border:4px solid #ffd86a; box-shadow:0 0 12px #ffd86a; pointer-events:none; animation:hd-newring .5s ease-out 3; }
${W} .hd-bottom .hd-btn.hd-newhint::after { content:'★'; position:absolute; top:-22px; left:50%; margin-left:-10px; font-size:20px; line-height:1; color:#ffe885; text-shadow:0 1px 0 ${ink},0 0 6px #ffd86a; animation:hd-newstar .5s ease-in-out 3; pointer-events:none; }
@keyframes hd-newhint { 0%,100% { opacity:1; } }
@keyframes hd-newring { 0% { transform:scale(1.12); opacity:.2; } 40% { opacity:1; } 100% { transform:scale(1); opacity:1; } }
@keyframes hd-newstar { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
@media (prefers-reduced-motion:reduce) {
  ${W} .hd-bottom .hd-btn.hd-newhint::before, ${W} .hd-bottom .hd-btn.hd-newhint::after { animation:none; }
}
`;
}
