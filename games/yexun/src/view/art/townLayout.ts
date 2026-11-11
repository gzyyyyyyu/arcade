/**
 * 夜探镇子建筑的布局常量：院墙、正房的高度，墙面平铺的周期。
 * 画法（art/sprites-buildings.ts）和铺设（town.ts）要用同一份数，所以放在这里，两边都从这里取。
 */
/** 院墙：墙身高（檐口）、墙头脊高、墙头外挑 */
export const WALL_Z = 50;
export const WALL_RIDGE = 62;
export const WALL_OV = 5;
/** 正房：檐口高、正脊高、屋檐外挑 */
export const HOUSE_Z = 78;
export const HOUSE_RIDGE = 114;
export const HOUSE_OV = 10;
/** 平铺的周期：横墙按 x，竖墙按屏幕 y（瓦垄 8 一道，周期是它的整数倍） */
export const WALL_H_PERIOD = 480;
export const WALL_V_PERIOD = 240;
