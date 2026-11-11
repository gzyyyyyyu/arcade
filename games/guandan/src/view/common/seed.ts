/** 没指定种子时开一局用的随机种子（浏览器里的开局入口用；牌局本身只认种子，规则核心不碰 Math.random）。 */
export function randomSeed(): string {
  return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}
