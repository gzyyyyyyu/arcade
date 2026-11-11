/**
 * 页面入口：找到根节点，把页面装上去（src/app/mount.ts）。样式按这个顺序叠：后面的压前面的。
 */
import { mount } from './app/mount.ts';
import { must } from './must.ts';
import './view/style.css';
// 单机锦标赛：结束页和牌桌顶上的几行
import './view/tour.css';
import './view/ach.css';
import './view/puzzle.css';
// 夜场牌桌的皮：材质、光影、颜色都在这里，压在 style.css 的布局上
import './view/skin.css';
// 标题页和选桌页的排法（电脑版窄左栏宽右栏、各行压矮、顶栏图标带字）：压在 skin.css 后面
import './view/lobby-layout.css';
// 摊牌：赢的五张抬起发金光、输的压暗（table.ts 摊牌时加类名）
import './view/potfx.css';
// 分层背景（docs/art.md）：墙、散景、吊灯吧台、光锥，在舞台后面
import './view/scene.css';
// 主题房：四个档位各一间，只换颜色和材质
import './view/rooms.css';
// 新手指引（view/coach.ts）：盖在整页上的说明框，按屏幕像素排
import './view/coach.css';
import './view/settings.css';

function main(): void {
  mount(must(document.getElementById('app'), '页面根节点 #app（index.html）'));
}

main();
