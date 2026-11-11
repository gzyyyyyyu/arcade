# 主题（theme）

> 总览和子路径表见 [README](../README.md)。

kit 的 DOM 组件（分享预览层、邀请横条、"叫朋友来"面板、牌桌互动的菜单和面板）的颜色、圆角、字体都走 CSS 自定义属性 `--ak-*`，每处写成 `var(--ak-xxx, <默认值>)`：
**不传主题，外观就是默认值**（`test/theme.test.ts` 扫源码守住：每个 `var(--ak-` 都带默认值）。`fun.ts` 的飞行道具图层只画素材，没有可换的样式，不在里面；分享卡本身（canvas 画的那张图）也不受影响，它的颜色由游戏给的 `card.accent` 决定。

| 变量 | `KitTheme` 字段 | 用在哪 | 默认值（随组件不同时写主要的） |
|---|---|---|---|
| `--ak-bg` | `bg` | 面板、菜单、邀请横条的底色 | 面板 `rgba(43,29,20,.96)`，横条 `rgba(28,28,32,.94)` |
| `--ak-fg` | `fg` | 面板和横条上的文字；分享预览的字、次按钮的字和边 | 面板 `#fff6e0`，横条和分享预览 `#fff` |
| `--ak-accent` | `accent` | 主按钮底色：横条的"去"、面板的"叫他来"、互动菜单的主按钮、分享预览的主按钮 | 面板 `#7a2a1e`，横条 `#f5c542`，分享预览 `#fff` |
| `--ak-accent-fg` | `accentFg` | 主按钮上的字 | 面板 `#fff6e0`，横条和分享预览 `#222` |
| `--ak-border` | `border` | 面板、菜单、按钮的边框 | 面板 `#d4a64a`，面板里的主按钮 `rgba(212,166,74,.6)`，分享预览按钮 `#fff` |
| `--ak-radius` | `radius` | 面板、菜单、横条、气泡、分享预览图的圆角 | 面板 `14px`，横条 `28px`，预览图 `16px` |
| `--ak-radius-btn` | `radiusBtn` | 按钮、头像格、好友行的圆角 | 按钮 `22px`（分享预览 `24px`），格子和行 `10px` |
| `--ak-font` | `font` | 字体（font-family 的值） | 继承页面；分享预览和横条是 kit 自带的中文字体栈 |
| `--ak-overlay` | `overlay` | 分享预览、"叫朋友来"面板背后的遮罩 | 预览 `rgba(0,0,0,.72)`，面板 `rgba(0,0,0,.5)` |
| `--ak-soft` | `soft` | 次按钮、头像格、好友行、"互动"按钮的底色 | 面板 `#4a3220`，横条的"不了" `rgba(255,255,255,.14)` |
| `--ak-title` | `title` | 标题、✕、飘字、横幅这些金色强调字，转圈的亮边 | `#f3d98b` |

没有主题化的：状态色（灰掉的按钮、"开着""选中"的绿红）、被扔的污渍和道具的素材、气泡的米色底（`#fffaf0`）、名场面横幅的红渐变，这些随游戏换意义不大，需要时再加。

两种用法，可以混着用（组件根节点上的变量盖过页面 CSS 里的）：

```ts
// 1. 传 theme：每个组件的选项里都有（ShareOptions、SocialOptions、InvitePanelOptions、TableFunOptions）
import type { KitTheme } from 'arcade-kit/theme';
const theme: KitTheme = { bg: '#1b120b', fg: '#f4e9d3', accent: '#e0b43c', accentFg: '#2a1a08', border: '#e0b43c', radius: '4px' };
new TableFun({ /* ... */ theme });
prepareShare(card, { url, theme });
const social = await mountSocial({ where, theme });   // social.openInvite(...) 打开的面板默认也用它，面板自己传 theme 则以面板的为准
```

```css
/* 2. 或者在自己的 CSS 里写变量，靠继承生效（kit 组件都挂在 body 下） */
:root { --ak-bg: #1b120b; --ak-fg: #f4e9d3; --ak-accent: #e0b43c; --ak-accent-fg: #2a1a08; --ak-radius: 4px; --ak-font: Georgia, serif; }
```

`themeVars(theme)` 是纯函数，返回 `[变量名, 值][]`；值必须是字符串，含 `;` `{` `}` `<` `>` `\`、`/*`、`url(`、`expression`、`@import`、`javascript:` 或超过 200 字的字段整个忽略，其他字段照常。游戏要自己的组件也用这套变量时可以直接用 `themeVars` / `applyTheme`。
演示页加 `?theme`（如 `/demo/table-fun.html?theme`）看深色木纹 + 金色强调的样子。
