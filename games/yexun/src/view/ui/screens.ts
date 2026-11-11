/**
 * 对局外的几个界面（DOM）的入口，各屏在 screens/ 下一屏一个文件（共用小函数在 shared.ts）：开始菜单、暂停（设置 + 本局法器）、结算、确认框、引导小提示。
 * 第一次打开只有一个大按钮（DESIGN.md 13.7：打开到开打 ≤ 30 秒）；玩过一局以后才出模式卡和难度。
 * 所有按钮 ≥ 44×44（tools/shot.ts 检查）；左上角常驻"大厅"，任何界面两步内回到大厅。
 */
import './screens.css';

export type { MenuState, Toggle } from './screens/shared.ts';
export { Home } from './screens/home.ts';
export { Select } from './screens/select.ts';
export { Menu } from './screens/menu.ts';
export { type BuildRow, Pause } from './screens/pause.ts';
export { Confirm } from './screens/confirm.ts';
export { type RaidItemView, type RaidResultView, type ResultView, Result } from './screens/result.ts';
export { Tips } from './screens/tips.ts';
