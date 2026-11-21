# 《夜巡》设计稿

> 模块 `games/yexun`（Worker 名 `yexun`，路径 `/games/yexun/`）。本文是这个游戏的设计正本：现在是什么、为什么这样设计、怎么验收、怎么配平。
> 数值的实际值以 `src/content/` 为准，配平结果以模拟器跑出来的表为准（第 8 节）；逐版变化看 [CHANGELOG.md](CHANGELOG.md)，本文不记过程。
> 跨模块的规范以仓库根 `AGENTS.md`、`docs/economy.md`、`docs/balance.md` 为准；冲突时以它们为准。界面流程和布局规则见 [docs/art.md](docs/art.md)，配色见 [docs/palette.md](docs/palette.md)。

## 目录（各节在哪份文件）

| 节 | 内容 | 文件 |
|---|---|---|
| 0、1、2 | 一句话、质量验收、两个模式、新手保护、首领连战 | [docs/design-play.md](docs/design-play.md) |
| 3（开头）、3.1–3.3 | 内容表总则、法器、被动、进化和合成（含 3.3b–3.3f） | [docs/design-content-1.md](docs/design-content-1.md) |
| 3.4–3.6 | 套装和流派、怪物和 Boss、地图 | [docs/design-content-2.md](docs/design-content-2.md) |
| 3.7–3.10 | 角色、局外成长、选卡三件套、守夜夜市 | [docs/design-content-3.md](docs/design-content-3.md) |
| 4 | 实盘：规则、结回倍数、角色和地图系数、配平目标 | [docs/design-live.md](docs/design-live.md) |
| 5、6 | 架构（核心、内容、画面、输入录像、平台、Worker、排行榜、每周夜事）、性能预算 | [docs/design-arch.md](docs/design-arch.md) |
| 7、8、9 | 画风和声音、机器人和配平工具（含 8.1）、测试 | [docs/design-art-tools.md](docs/design-art-tools.md) |
| 10–14 | 登记和跨模块约定、内容规模、已知问题、验收标准、和平台的关系 | [docs/design-misc.md](docs/design-misc.md) |
