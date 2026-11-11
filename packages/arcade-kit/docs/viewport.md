# 手机和平板（viewport）

> 总览和子路径表见 [README](../README.md)。

仓库根 [AGENTS.md](https://github.com/gzyyyyyyu/arcade/blob/main/AGENTS.md) 第 4 节"手机和平板"的规矩收成一份（0.25.0）。**默认值都取开盘的实现**；牌馆独有的做法做成选项。游戏迁过来时传自己原来的值，行为不变。

```ts
import { watchViewport, renderScale, onWebglLoss, isLowMemoryDevice } from 'arcade-kit/viewport';

// 高度按看得见的区域：默认写 --app-h（CSS 依次写 100vh → 100dvh → var(--app-h)），给 pin 就把元素钉成可见区扣掉安全区的像素位置
const stop = watchViewport({ onChange: () => game.scale.refresh() });
// 渲染倍数：省内存设备（iOS 或触屏）封顶 2；URL 的 scale=N 优先
const RENDER_SCALE = renderScale({ designW: 1280, designH: 720 });
// WebGL 丢了等 3 秒还没回来才提示，恢复时收起，同一时间只有一条
onWebglLoss(game.canvas, { show: () => showBanner('画面出了点问题，刷新一下页面就好') });
```

| 规矩 | kit 怎么做（默认 = 开盘） | 选项 |
|---|---|---|
| 省内存设备 | `isLowMemoryDevice()`：iOS（含报成 Mac 的 iPad）或 `(pointer: coarse)` | 牌馆的三档（被系统杀过就降档）：`lowMemoryTier({ read, write, version })`，存储由游戏给、key 带游戏前缀，默认只在 iOS 上记 |
| 渲染倍数封顶 2 | `renderScale`：物理像素对设计尺寸向上取整，1..3，省内存设备封顶 2；真手机平板（省内存、窗口长边 ≥ 屏幕长边 90%）按窗口算，其余按 `screen` 算 | `cap`、`lowMemoryCap`、`bias`（牌馆 0.05）、`basis: 'visible'`（一律按可见区，牌馆）；只按像素比、可以是小数的写法（海岛、夜巡、弹里个弹）用 `dprScale({ dpr, cap, lowMemory, lowMemoryCap })` |
| 整屏大背景按 1 倍 | 不在 kit 里：各游戏的烘焙自己按 `isLowMemoryDevice()` 判断 | — |
| 高度按可见区 | `watchViewport`：visualViewport（没有就 inner）的宽高和偏移；写 `--app-h`；页面被推上去就 `scrollTo(0, 0)`；所有设备都跑（电脑上的缩放、窗口变化也管） | `pin`（钉元素、扣安全区，牌馆）、`writeAppH`、`scrollTop` |
| 转屏后补算 | 每次事件当下量一次，300ms 后再量一次，然后调 `onSettle` | `settleMs`（牌馆 250） |
| 监听 | resize、orientationchange、visualViewport 的 resize 和 scroll（工具栏收放时只有偏移变）；判重比 x、y、w、h；一律返回取消函数 | `listenScroll: false` |
| 双指放大不改尺寸 | `|scale − 1| > 0.02` 就不量、不写、不滚、不回调，缩回 1 倍再说 | `zoomEpsilon`、`isZoomed`（牌馆只认放大 `s > 1.01`） |
| WebGL 丢失 | `onWebglLoss`：丢了 3 秒还没回来才 `show()`，`webglcontextrestored` 时收起；丢着时再来的 lost 不重算，同一时间只有一条 | `showAfterMs`（牌馆 2000）、`giveUpMs` + `onGiveUp`（牌馆 20 秒记一笔下次降档）、`giveUpOnHide`（页面离开时还丢着也算） |
| safe-area | `safeInsets()` 用探针读 `env(safe-area-inset-*, 0px)`，不支持的浏览器是 0；`--app-h` 模式不扣（CSS 自己 calc），`pin` 模式扣 | — |
| 能不能用 WebGL | `webglUsable()`：试开一个上下文马上还掉 | — |

舞台等比缩放的游戏（雀馆、德州、飞驰）用 `watchStage(app, onChange)`：kit 只量 `app` 的矩形、判重、补算、放大中不动，缩放和 CSS 变量留在游戏的 `onChange` 里。

开盘和牌馆原来不一样的地方（迁移时各传各的，统一另做）：放大判定（开盘 0.02 双向，牌馆 1.01 只认放大）、补算延时（300 / 250ms）、启用范围（开盘只在省内存设备上、牌馆所有设备）、倍数输入（开盘按窗口或屏幕，牌馆按可见区并减 0.05）、安卓触屏的封顶（开盘 2，牌馆 3）、WebGL 提示时间（3 / 2 秒）和牌馆的 20 秒降档、`scrollTo`（开盘有、牌馆靠 `overflow: hidden`）、是否听 visualViewport 的 scroll（牌馆听）。
