// 顶栏的手机几何（不依赖 Phaser，单元测试直接用）。

/**
 * 0.19.0 手机顶栏按世界宽度排（718–960，见 theme.ts 的 phoneWorld）。960 宽时和以前一样；窄了以后，
 * 右边的设置、怎么玩、银行贴着右边，中间按这个顺序让出宽度：道具栏（让到 120）→ 要还的钱那一块（最多 60）→ 账户（最多 38）→ 日期（最多 16），
 * 还不够就是道具栏再变窄（放不下的收进「+N」）。
 */
export function phoneTopBar(W: number) {
  let need = Math.max(0, 960 - W);
  const take = (max: number): number => {
    const v = Math.min(max, need);
    need -= v;
    return v;
  };
  // 道具栏先让到 120（它常常是空的「月底挑道具」），再让要还的钱那一块
  take(94);
  const a = take(60);
  const d1 = take(38);
  const d0 = take(16);
  const s0 = d0;
  const s1 = d0 + d1;
  const s2 = d0 + d1 + a;
  const R = W - 4;
  const help = { x: R - 88, y: 7, w: 42, h: 38 };
  const bank = { x: R - 154, y: 6, w: 60, h: 40 };
  const itemsX = 646 - s2;
  return {
    lobby: { x: 4, y: 6, w: 40, h: 40, iconDy: 13, iconS: 18 },
    calIcon: { x: 66, y: 18, s: 22 }, day: { x: 82, y: 6, size: 16 }, calPill: { x: 54, y: 29, h: 18 }, calTextX: 62, row2Y: 38,
    calHit: { x: 50, y: 4, w: 136 - s0, h: 44 }, flagsRight: 182 - s0, flagY: 29,
    accLabel: { x: 216 - s0, y: 38 }, wallet: { x: 200 - s0, y: 18, s: 24 }, account: { x: 216 - s0, y: 3, size: 22 }, accHit: { x: 186 - s0, y: 4, w: 202 - d1, h: 44 }, accWideW: 222 - d1,
    goalX: 392 - s1, billLeft: 416 - s1, billRight: 640 - s2, billBox: { y: 6, h: 40 }, hourglass: { x: 604 - s2, y: 18, s: 18 }, daysLeft: { x: 616 - s2, y: 18 },
    billY: 6, billNoteY: 38, goalIconY: 18, goalWordY: 38, goalBarY: 34, goalBarW: 90 - Math.min(20, a / 2), houseY: 38, houseNoGoalY: 18, billTitleSize: 17,
    itemsX, itemsY: 4, itemsW: help.x - 6 - itemsX, itemsWExt: Math.max(30, bank.x - 6 - itemsX), rowIconY: 23, rowChipY: 23, row2Y0: 11, row2H: 23, row2Icon: 21,
    billHit: { y: 4, h: 44 },
    bank, bankIconDy: 14, bankIconS: 20,
    help, settings: { x: R - 42, y: 7, w: 42, h: 38 }, gear: { x: R - 21, y: 26, r: 10 }, rollY: 48,
  };
}

/**
 * 0.33.0 竖屏版顶栏（世界宽 404）：两行，高 92。第一行和横屏 SE 一样是「大厅」、日期和日历小签、账户，右边怎么玩、设置；
 * 第二行（往下 46）从左起是目标和要还的钱（沙漏、天数）、道具栏，最右边是银行。字段和 phoneTopBar 一样，道具栏里的坐标相对道具栏本身，不跟着挪。
 */
export const PORTRAIT_TOP_H = 92;
export function portraitTopBar(W: number) {
  const base = phoneTopBar(718);
  const R = W - 4;
  const dy = 46;
  // 「怎么玩」「设置」各 50 宽：挨着的那一边不撑点击区，只能靠本身的宽度，360 宽上也够 44 像素
  const help = { x: R - 102, y: 7, w: 50, h: 38 };
  const bank = { x: R - 60, y: 6 + dy, w: 60, h: 40 };
  const goalX = 4;
  // 账单一块到 220 为止：右边道具栏留 112，三个道具图标一排放得下（再多才排两排）
  const billRight = 220;
  const itemsX = billRight + 6;
  const accX = base.accHit.x;
  return {
    ...base,
    accHit: { ...base.accHit, w: help.x - 6 - accX },
    accWideW: help.x - 6 - accX,
    goalX,
    billLeft: goalX,
    billRight,
    billBox: { y: base.billBox.y + dy, h: base.billBox.h },
    billHit: { y: base.billBox.y + dy - 2, h: base.billBox.h + 4 },
    hourglass: { ...base.hourglass, x: billRight - 36, y: base.hourglass.y + dy },
    daysLeft: { x: billRight - 24, y: base.daysLeft.y + dy },
    billY: base.billY + dy,
    billNoteY: base.billNoteY + dy,
    goalIconY: base.goalIconY + dy,
    goalWordY: base.goalWordY + dy,
    goalBarY: base.goalBarY + dy,
    goalBarW: 90,
    houseY: base.houseY + dy,
    houseNoGoalY: base.houseNoGoalY + dy,
    itemsX,
    itemsY: base.itemsY + dy,
    itemsW: R - itemsX,
    itemsWExt: Math.max(30, bank.x - 6 - itemsX),
    bank,
    help,
    settings: { x: R - 50, y: 7, w: 50, h: 38 },
    gear: { x: R - 25, y: 26, r: 10 },
  };
}
