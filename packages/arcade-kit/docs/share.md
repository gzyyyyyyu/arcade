# 分享卡和邀请（share、social）

> 总览和子路径表见 [README](../README.md)。

规范是仓库根 [docs/social.md](https://github.com/gzyyyyyyu/arcade/blob/main/docs/social.md) 1.1–1.3。两个入口都只在调用时碰 DOM，import 时不碰；纯的部分测试在 `test/share.test.ts`、`test/social.test.ts`。

### 分享卡

游戏只交数据，画法统一（主题色渐变底、图标、游戏名、一个大数字、最多 3 条小数据、一句名场面、昵称和称号、北京时间日期、右下角扫码来玩的二维码）：

```ts
import { shareCard } from 'arcade-kit/share';

const r = await shareCard(
  {
    game: '游戏名', title: '实盘小档 · 8 副', accent: '#b03a2e',
    big: { value: '+3.5', label: '份筹码', sign: 1 },   // sign：输赢的数按正绿负红画（白描边），不给是白字
    stats: [{ label: '头游', value: '4 次' }, { label: '炸弹', value: '6 个' }],   // 最多 3 条，多的不画
    line: '最后一手四个 A 炸穿全场',                                               // 模板拼的，不收玩家自由文字
    art: { image: atlasImg, crop: { x: 128, y: 0, w: 128, h: 128 }, fit: 'contain' },
    player: { name: '小明', badge: '炸弹狂人' },
  },
  { url: './?room=123456' /* 只取路径，域名用运行时的 origin；好友房结算带房间码 */, log: (l) => smokeLog.push(l) },
);   // 'shared' | 'preview' | 'cancelled'
```

- `art` 可以直接给一个 `CanvasImageSource`（img、canvas、ImageBitmap），或者 `{ image, crop?, fit? }` 从图集里切一块（`crop` 是源图像素，`fit` 默认 `contain`，`cover` 铺满裁中间）。
  是 img 时先 `await img.decode()`，没加载完、坏图、跨域画不上都**不画 art、照常出卡**。
- **系统分享只给手机、平板**（`useSystemShare(ua, maxTouchPoints)`）：UA 带 Android、iPhone、iPad、iPod、HarmonyOS、Mobile，或者 Macintosh 且多点触控（iPadOS 默认报桌面 UA）才调；
  Windows、Mac、Linux 桌面（含触屏笔记本）一律直接出预览：Windows Chrome 的 `canShare` 对文件回 true，弹出系统共享，选微信后微信 PC 版是空白窗口、再报"共享失败"。
  桌面的预览第一个按钮是"复制图片"（`navigator.clipboard.write` + `ClipboardItem` 的 `image/png`，浏览器不支持就不摆），成功提示"已复制，去微信里粘贴"；按钮顺序：复制图片、保存图片、复制链接、关闭。
- 系统分享要 `navigator.canShare({ files })` 为真（手机浏览器）；不支持、或出错（用户取消除外）就出预览层：图 + "保存图片"（下载 `share.png`）+ "复制链接" + "关闭"。
  预览层 z-index 默认 11000（`SOCIAL_Z.preview`，要比游戏的弹窗和 social 的横条、面板都高），按钮的 `data-key` 是 `share:copy-image`（桌面）、`share:save`、`share:copy`、`share:close`，右上角 ✕ 是 `share:x`（Esc、点空白处也关），冒烟点这些；图在纵向弹性盒里收缩，按钮折行时图让位；`log` 给 `分享 系统`、`分享 预览`、`分享 复制图片`、`分享 保存`、`分享 复制`。
- **结算页一出现就先画好**（iOS 必须）：iOS 只许在点击的那一下里调系统分享，点了再画就过期了、只能出预览。结算页出来时 `const p = prepareShare(card, opts)`，
  "分享"按钮的点击里直接 `void p.share()`（前面别 await）：画好了就同步调 `navigator.share`，没画好等画完再试、调不起来出预览。`shareCard` 是"点了才画"的简写。
- **二维码**：朋友圈里的图不能点，扫码是唯一入口。码的内容是 `shareLink(opts.url, location.origin)`：运行时的 origin 加上 `url` 的路径、查询和 `#` 后面，
  游戏给相对路径还是绝对地址都行，kit 和游戏都不写域名（单独部署的游戏扫出来就是它自己的 `workers.dev`）。系统分享、"复制链接"也用这个链接，系统分享的 `text` 末尾自动带上它（有的 App 只取 text）。
  码画在右下角的纯白框里（`#111` 的格、每格整数像素、四周留白 ≥ 4 格、下面写"扫码来玩"），名场面和日期往左让；JPEG 压缩、缩到三分之一宽的截图实测照样解得出。
  编码器是 `src/qr.ts`，自己写的最小子集（字节模式、纠错 M、版本 1–10，最长 213 字节，约 9 KB 源码），不引运行时依赖：kit 一个运行时依赖都没有，引一个就进每个游戏的 lockfile 和审阅范围。
  链接太长编不了码就不画码，卡照常出。测试用 jsQR（Apache-2.0，只是 devDependency，不进包）把码解回原文，再对格式信息、版本信息做规范表的已知向量核对。
- **微信内置浏览器**（UA 带 `MicroMessenger`）：没有 `navigator.share`，下载链接也常常不生效。检测到微信就不试系统分享，直接出预览：图用 `data:` URL（`blob:` 的图在微信里长按经常存不下来），
  提示"长按图片 → 发送给朋友，或保存后发朋友圈"，不给"保存图片"按钮（"复制链接""关闭"照旧）。判断在 `isWeChat`、`previewMode`（纯函数）。
- 只要图不分享：`drawShareCard(card, canvas?, link?)` 返回画好的 canvas（给了 `link` 才画码），`shareCardBlob(card, link?)` 返回 PNG。
- **图上只有游戏给的数据**：别人没摊的牌、手牌这类隐藏信息游戏自己别放进来。

### 报位置、收邀请

```ts
import { mountSocial, sendInvite } from 'arcade-kit/social';

const social = await mountSocial({
  platform,                                         // 启动时 detectPlatform 的结果，不给就自己问一次 /api/me
  where: () => (room ? { place: 'room', game: 'mygame', room: room.code, seats: `${room.humans}/4` } : { place: 'game', game: 'mygame' }),
  gameName: (id) => GAME_NAMES[id],                 // 横条上"老王叫你来<名字>"；kit 不认识任何游戏，不给就说"一起玩"
  onGo: (inv) => confirmLeave(() => location.assign(`/games/${inv.game}/?room=${inv.room}`)),   // 可选：打到一半先确认
});
// 没平台、没登录：social 是 null，一个请求都不发
social?.presenceNow(true);                          // 进房、换房时马上报一次
```

- 页面在前台时每 2 分钟（`PRESENCE_MS`）`POST /api/presence`（`where()` 现问，返回 null 这次不报），每 30 秒（`INVITE_POLL_MS`）`GET /api/invites`；切后台就停，回到前台到点马上补。平台回 401 就自己停。
- 横条在页面顶上（让出刘海），一次一条，先到期的先弹；过期的、已经在那个房间里的不弹。"去"先 `dismiss`（keepalive）再跳 `/games/<id>/?room=<码>`，
  "不了"`dismiss` 后弹下一条，到期自己收起。按钮 `data-key` 是 `invite:go`、`invite:no`；`log` 给 `位置 204`、`邀请 弹 <id>`、`邀请 去`、`邀请 不了`、`邀请 过期`。
- 发邀请 `sendInvite({ to, game, room })` → `{ ok: true, id }` 或 `{ ok: false, error: 'limit' | 'blocked' | 'login' | 'failed', retryAfter? }`（429 是每天 50 条、同一好友 1 分钟 1 条超了）。
  `fetchFriends()` 把平台每项的公开资料 `{ userId, displayName, avatar }` 统一成 `id`、`name`（原样字段留着），带 `online`、`where`（对方关了开关就没有），`setShowWhere(bool)` 改"让好友看到我在哪"。都带同源 cookie，写的请求带 `x-arcade: 1`。
- 报名场面（好友动态）`postMoment(game, moment, n?, n2?, n3?)` → `POST /api/feed`：只报编号和最多 3 个整数，文字由游戏的 `public/moments.json` 给模板
  （`{"double_down": {"text": "{name}和搭档双下了对面"}}`，只认 `{name}`、`{n}`、`{n2}`、`{n3}`，≤ 40 字）。返回 HTTP 状态，平台超了每天 10 条也回 204，游戏不用管；
  编号要字母开头、1–24 位 `[a-z0-9_]`，不合格的本地就不发（回 400）。只在真有看头的时候报（一局一两条），平台每人每天 10 条是所有游戏合计。
- **"叫朋友来"面板**：`social.openInvite({ game, room })`（`social` 是 `mountSocial` 的返回值；没挂上时用导出的 `openInvite({ game, room, friends: false })`，只有"复制邀请链接"）。
  列好友（在线的在前，写在哪），每人一个"叫 TA 来"，发出后 1 分钟内是灰的"已叫"，叫不了的写成大白话；底下"复制邀请链接"（能系统分享就分享）。
  好友多、屏幕矮时按列表的可用高度翻页（`‹ 1/3 ›` 和"复制邀请链接"同一行，翻页键 44 像素见方，`data-key` 是 `invite:prev` / `invite:next`），不在框里滚动；列表高度钉在最满那一页，面板不留空白；提示那一行没字时不占地方；窗口变了重新分页。
  电脑大屏（宽 ≥ 1280、高 ≥ 720）上整体放大一档：面板宽 560，好友名 19 像素、按钮高 52；手机、平板是宽 420、按钮高 44。颜色要和游戏自己的弹窗一致，传主题（见 [theme.md](theme.md)）。
  样式和 table-fun 一样，z-index 默认 10600（`SOCIAL_Z.panel`，横条是 10500；游戏自己的弹窗更高时传 `zIndex`）；好友"在哪"先用平台给的 `where.gameName`，没有再用 `gameName` 回调，都没有说"在玩游戏"；按钮的 `data-key` 是 `invite:call:<好友 id>`、`invite:copy`、`invite:close`、`invite:prev`、`invite:next`，`log` 给 `叫人 打开 <n>`、`叫人 <id> ok|limit|blocked|…`、`叫人 复制`、`叫人 关闭`。
- 演示页 `demo/share.html`、`demo/social.html`（`npx vite` 后打开；社交用假 fetch，一进来就有几条邀请）。
