# 更新日志

## 0.31.0（2026-11-23）

- 修：头像热区（`.atf-hot`）为凑够 44 往外撑的那一圈会盖住头像旁边游戏自己的按钮（比如"离开"），点不到。现在撑出来的部分让开 `avoid()` 里的矩形（新纯函数 `yieldBox`，头像本身不切）；头像旁的按钮要放进 `avoid()`。
- "互动" / "聊天"按钮（`.atf-btn`）加按下态：按住时缩到 0.94、变暗（用独立的 `scale`、`filter`，不碰定位用的 transform）。
- 文档按现状改：装依赖的示例版本、房间规范和平台各节直接链到现在的文件、旁观上限按账号、`onEmote` 示例按构造选项写、聊天框最少一行、平台屏蔽 RPC 已有但好友房聊天还没接、viewport 只写默认值和选项。
- 注释去掉版本号和"以前 / 原来"的历史写法（只写现状和理由；协议、存档兼容的理由保留）。
- 筹码回钱包一律叫"带回"（文档、注释、测试名）；"叫朋友来"面板的按钮"叫他来"改"叫 TA 来"。
- 更新日志 0.20.0–0.27.0 挪到 `docs/changelog-archive.md`。

## 0.30.0（2026-11-22）

- **新 `platformSoundOn()`（`arcade-kit/client`，`docs/sound.md`）：大厅静音带进游戏。** 平台大厅关了声音记成 localStorage `arcade.sound` = `'off'`，
  这是平台对游戏公开的唯一一个存储约定，游戏只读不写。游戏启动时读一次：false 就这一次打开先静音、自己的开关显示关；玩家在游戏里打开只管本游戏这一次，
  不写 `arcade.sound`、不改游戏自己存的偏好。没有这个 key、读不了（隐私模式、单独部署、Node）都返回 true。
- 测试：`create.test.ts` 加两条（只有 'off' 是关、读不了算开且不抛错；假 localStorage 的 setItem 一碰就抛，锁住"只读"）。

## 0.29.0（2026-11-22）

- **新子路径 `arcade-kit/personas`：全站共用的电脑名册**（`docs/personas.md`）。牌类游戏里的电脑以后是同一批人，名字、人设、口头禅、头像、性格只写在这里，每个游戏把性格翻译成自己的打法：
  - `ROSTER`：16 个人（老张、小美、阿强、稳哥、老好、慢慢、算盘、江湖、虎子、老鹰、幺妹儿、熊猫哥、盖碗儿、兔头哥、火锅婆婆、板凳儿），性格 9 项 0–100，带出现档位、互动脾气、出手快慢；
  - `traitsNow(person, ctx, seed)`：这一手的性格 = 底子 →（输多了、领先、被针对、牌桌松、按节奏，按变招概率、每 10 手一段抽）换打法 → 手感 → 上头，整数运算、确定性；
  - `pickLineup(rng, weights, n)`：按场地权重挑不重复的人，人不够抛错；
  - `personaFace(id, mood)`：程序画的座位头像 SVG（四种表情），不引外部图片。
  不改任何现有接口和行为；游戏接入时先对拍"映射后参数 = 原来的参数"再调强。
- `AGENTS.md`：kit 里的人物只在共用名册 `personas.ts`（游戏名、玩法短语照旧不进 kit）。
- 测试：`test/personas.test.ts` 12 条（名册形状、底子不变、同种子同输出、同一段不一手一变、换打法只改 alt 的项且按概率、手感和上头的方向、结果夹在 0–100、挑人不重复按权重、人不够抛错、头像是独立 SVG）。

## 0.28.1（2026-11-22）

- 老浏览器不报错：`detectPlatform`、社交请求（`social.ts`）、服务端问平台（`auth.ts`）的超时信号经新的 `timeoutSignal(ms)`（`internal.ts`，两边共用）拿，
  没有 `AbortSignal.timeout` 的浏览器不带超时照常发请求。以前直接调，老浏览器上抛 TypeError，`detectPlatform` 永远回"不知道"、好友面板挂不上。
- 测试：`create.test.ts` 加一条没有 `AbortSignal.timeout` 时照常问到平台（旧写法会回 unknown）。

## 0.28.0（2026-11-22）

- **等人时离开房间还名额**（`GameRoom`）：以前等人页点「离开房间」只断开连接，房间要等 `noHumanMs`（10 分钟）才关，期间开房的人被 `has_room` 挡回旧房间。
  现在房间还在等人、座位上没有真人、除了这条连接没别人连着时，`leave` 直接关房（4000 `everyone left`）并把名额还给计量；有人还连着或已经开打的照旧。
- **开房找计量有超时**：`kitCreate` / `kitCreateMatch` 等计量最多 `METER_CALL_MS`（3 秒），超时按计量连不上处理（不开房），
  并补一次退回，防止计量晚到的占位把名额卡到过期。`withTimeout` / `TimeoutError` 挪进 `internal.ts`，匹配和房间共用。
- **社交请求有超时、平台没问出来会再问**（`social.ts`）：请求默认 `SOCIAL_FETCH_MS`（8 秒）超时；`detectPlatform` 回 unknown（平台慢、超过 2.5 秒）时
  按 `SOCIAL_DETECT_RETRY` 隔 5 秒、15 秒各再问一次（每次等 10 秒），以前一次没问出来好友面板就整局不挂。新导出 `platformWithRetry`。
- 聊天和短语的节奏默认值只在 `chat.ts` 的 `CHAT_RATE`、`EMOTE_RATE`，房间和 `RoomClient` 都引它，不再各写一份。
- 分享预览（`share.ts`）：右上角加 ✕（`share:x`，44px）、Esc 关闭，底色 `.85`，图在矮屏上按比例缩小不把按钮挤出屏幕。
- 注释里去掉具体游戏的名字；`AGENTS.md` 精简到 5KB 内；更新日志归档拆成 `docs/changelog-archive.md`（0.11.0–0.19.1）和 `docs/changelog-archive-2.md`（0.10.2 及以前），各不到 40KB。
- 测试：`quota.test.ts` 加等人时离开还名额、有人还连着不关房、计量慢于超时不开房且补退回三条；`room.test.ts` 加扫全部服务端源码不用 `setTimeout`/`setInterval`，
  受新离开行为影响的两条改了写法；`social.test.ts` 加再问平台、请求带超时信号两条。离开还名额、计量超时两条做了反证。

0.27.0 及更早的版本见 [docs/changelog-archive.md](docs/changelog-archive.md)（0.11.0–0.27.0）和 [docs/changelog-archive-2.md](docs/changelog-archive-2.md)（更早）。
