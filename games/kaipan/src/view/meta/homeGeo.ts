// 主页的手机几何（不依赖 Phaser，单元测试直接用）。

type Box = { x: number; y: number; w: number; h: number };

/**
 * 手机主页按世界宽度排（718–960×404，见 theme.ts 的 phoneWorld）。
 * 要点的东西都放在下半屏一排：右下是大卡（继续 / 快速开始，右手拇指的位置），左边是 n 张模式卡；
 * 上半屏是 Logo、一句玩法和主视觉，小人站在卡片上沿。顶上一行只有「大厅」、云存档和右上角的小入口。
 */
export function phoneHome(W: number, H: number, n: number) {
  const pad = 12;
  const bandH = 112;
  const bandY = H - pad - bandH;
  // 4 张模式卡时大卡收窄一些，让每张卡还有 100 多宽；5 张（再加本周市场）时大卡再收一点，每张卡 84 以上
  const heroW = n >= 5 ? Math.max(230, Math.min(300, Math.round(W * 0.3))) : n >= 4 ? Math.max(244, Math.min(340, Math.round(W * 0.34))) : Math.max(300, Math.min(404, Math.round(W * 0.42)));
  const hero: Box = { x: W - pad - heroW, y: bandY, w: heroW, h: bandH };
  const gap = 8;
  const cardsW = hero.x - 10 - pad;
  const cw = Math.floor((cardsW - gap * (n - 1)) / n);
  const cards: Box[] = Array.from({ length: n }, (_, i) => ({ x: pad + i * (cw + gap), y: bandY, w: cw, h: bandH }));
  // 主视觉：电脑 1280×720 的坐标缩到 0.62，中线对齐，小人的脚（电脑 y≈700）踩在卡片上沿
  const k = 0.62;
  return {
    hero,
    cards,
    /** 有没打完的局时大卡是「继续」，快速开始挪到大卡正上方 */
    quick: { x: hero.x + hero.w - 132, y: bandY - 54, w: 132, h: 44 },
    logo: { x: pad + cardsW / 2, y: 104, size: 52 },
    tagY: 156,
    tools: { right: W - pad, y: 8, h: 42, gap: 6, font: 14 },
    lobby: { x: pad, y: 8 },
    cloud: { x: 160, y: 30 },
    version: { x: W - pad, y: 56 },
    art: { k, ox: Math.round(W / 2 - 640 * k), oy: Math.round(bandY + 4 - 700 * k) },
    /** 山坡的中心：底边压到屏幕下沿以外（卡片之间的缝里看到的是草地，不是天空） */
    hillsY: Math.round(H + 8 - (336 * k) / 2),
  };
}

/**
 * 竖屏版主页（世界 404 × 718–960，见 theme.ts 的 PORTRAIT）：和横屏版同一套字段，排成单列。
 * 顶上两行：「大厅」、云存档、版本号，下面一排小入口；中间 Logo、一句玩法、主视觉（小屋居中，两边各露两三个小人）；
 * 要点的都在下半屏：模式卡两行（5 张 3+2，4 张 2+2），最下面是整宽的大卡。有没打完的局时大卡让出右边一格给「快速开始」。
 */
export function portraitHome(W: number, H: number, n: number, withQuick: boolean) {
  const pad = 12;
  const gap = 8;
  const bandH = 112;
  const heroY = H - pad - bandH;
  const quickW = 96;
  const hero: Box = { x: pad, y: heroY, w: W - 2 * pad - (withQuick ? quickW + gap : 0), h: bandH };
  const quick: Box = { x: W - pad - quickW, y: heroY, w: quickW, h: bandH };
  const rows = n <= 3 ? [n] : n === 4 ? [2, 2] : [Math.ceil(n / 2), Math.floor(n / 2)];
  const cardH = 112;
  const cardsTop = heroY - gap - rows.length * cardH - (rows.length - 1) * gap;
  const cards: Box[] = [];
  rows.forEach((m, r) => {
    const cw = Math.floor((W - 2 * pad - gap * (m - 1)) / m);
    for (let i = 0; i < m; i++) cards.push({ x: pad + i * (cw + gap), y: cardsTop + r * (cardH + gap), w: cw, h: cardH });
  });
  const toolsY = 70;
  // 小屋顶（电脑 y≈431）到小人脚（y≈700）是 269：矮屏上主视觉缩一点，不压一句玩法
  const feet = cardsTop + 4;
  const logoMin = toolsY + 42 + 40;
  // 高屏上主视觉放大一些（最多 0.72，小屋约占宽度的八成），不留一大块空天
  const k = Math.min(0.72, Math.max(0.42, (feet - (logoMin + 48 + 18)) / 269));
  const artTop = feet - 269 * k;
  // Logo 和一句玩法在小入口和屋顶之间居中
  const logoY = Math.max(logoMin, Math.round((toolsY + 42 + artTop) / 2 - 20));
  return {
    hero,
    cards,
    quick,
    logo: { x: W / 2, y: logoY, size: 52 },
    tagY: logoY + 48,
    tools: { right: W - pad, y: toolsY, h: 42, gap: 6, font: 14 },
    lobby: { x: pad, y: 8 },
    cloud: { x: Math.round(W / 2 + 20), y: 26 },
    version: { x: W - pad, y: 12 },
    art: { k, ox: Math.round(W / 2 - 696 * k), oy: Math.round(feet - 700 * k) },
    /** 山坡顶在小人脚下 123×k（和横屏版一样露出一截坡），底下由场景铺草地 */
    hillsY: Math.round(feet + 45 * k),
  };
}
