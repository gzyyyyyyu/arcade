# 牌馆 · Card Hall

浏览器里的掼蛋（四人、两副牌、对家一队，从打 2 升到过 A）和斗地主（三人、一个地主对两个农民）。单机和电脑打，也能开好友房和朋友打。

[English](README.md) · **简体中文**

![牌馆封面](public/cover.png)

## 功能

- **完整的掼蛋规则**：规则核心是纯函数、确定性，牌型（含逢人配）、进贡 / 抗贡 / 还贡、接风、升级、打 A 都有。同一种子同一串操作，结果完全相同。
- **斗地主**：经典叫分、明牌翻倍、记牌器，残局闯关 20 关，外加每天自动生成的一道每日残局。
- **有性格的电脑**：只看自己的手牌和公开信息。有反事实测试检查这一点，谁都能自己跑。
- **单机**：新手引导，娱乐三档难度（新手 / 普通 / 高手），战绩，每副打完有复盘，还有每日挑战和成就。
- **好友房和快速匹配**：六位房间码或邀请链接进房。掉线能重连，走开了自动托管，能旁观，打完能"再来一场"。服务端从不下发别人的牌。
- **牌桌互动**：道具、表情包、短语和简短聊天，电脑会回应。
- **只有游戏筹码**：实盘桌用平台钱包里的筹码。筹码不能买、不能换、不能转。
- **手机友好**：菜单竖屏能用，牌桌横屏打。图片全部由代码生成（SVG），声音全部由 WebAudio 合成。

## 快速开始

需要 Node 22（`.nvmrc`）。在本目录里运行：

```bash
npm ci
npm run dev      # http://localhost:5174/（游客身份，存档只在浏览器里）
npm test         # vitest：规则、电脑、房间、架构约束
npm run build    # 正式构建，产物在 dist/
```

提交改动前再跑一遍 `npm run lint`。改了房间的跑 `npm run test:room`，改了画面的跑 `npm run shot`。全部命令和调试用的 URL 参数见 [docs/structure.md](docs/structure.md)。

## 目录结构

```
src/core/          牌馆通用层：牌的编码、随机数、座位环
src/variants/
  guandan/         core 规则、ai 电脑、net 房间规则、stake 实盘规则
  doudizhu/        同样的分层，另有 puzzles/ 残局闯关
src/net/           两个玩法共用的房间代码
src/view/          画面层（Phaser 4）：场景、牌桌部件、程序生成的美术、音效、存储
worker/            Cloudflare Worker：登录闸门、房间、快速匹配、实盘接口
tests/             vitest，按层分目录；tests/room/ 在 workerd 里跑真房间
tools/             模拟器、冒烟和截图、构建和部署
docs/              设计文档（中文）
```

## 文档

设计文档只有中文版。

- [AGENTS.md](AGENTS.md)：模块约定和坑，写给开发者和编程代理。
- [docs/structure.md](docs/structure.md)：每个目录和文件、全部命令、调试用的 URL 参数。
- [docs/design.md](docs/design.md)：整体设计和取舍。
- [docs/rules.md](docs/rules.md)：规则的出处和各地差异怎么取舍。
- [docs/core-api.md](docs/core-api.md)：画面层用的规则核心接口。
- [docs/ai.md](docs/ai.md)：电脑（强弱、场地、性格、实测数字），以及怎么验证它不看牌（第 8 节）。
- [docs/doudizhu.md](docs/doudizhu.md)：两个玩法怎么共用代码、掼蛋金样、斗地主的各个模式。
- [docs/view.md](docs/view.md)：画面层的约定。
- [docs/art.md](docs/art.md)：美术方向、素材来源、字体子集怎么重新生成。
- [docs/net.md](docs/net.md)：好友房、实盘、云存档、部署和健康检查。
- [docs/stake.md](docs/stake.md)、[docs/stake-ddz.md](docs/stake-ddz.md)、[docs/stake-sim.md](docs/stake-sim.md)：两个玩法的实盘设计，和这些数字背后的模拟。
- [docs/storage.md](docs/storage.md)：全部浏览器存储 key。
- [CHANGELOG.md](CHANGELOG.md)：更新日志，更早的在 `docs/changelog-archive*.md`。

## 属于 Arcade

这是 Arcade 小游戏站的一个模块，挂在 `/games/guandan/` 下，账号、云存档和筹码钱包由平台提供。它也能单独部署：`wrangler.jsonc` 是独立配置，`npm run deploy`（或下面的按钮）部署出来就能玩。单独部署时是游客身份，有单机和好友房，没有钱包。见 [docs/net.md](docs/net.md) 第 7 节。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/guandan)

贡献请向 Arcade 仓库提 PR。提交信息以 `guandan:` 开头，模块规矩见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。标题字体是思源宋体 Noto Serif SC 的子集（SIL Open Font License 1.1，见 `src/view/fonts/OFL.txt`）。
