@AGENTS.md

## Claude Code 补充

- 进入模块工作时同时读该模块的 `AGENTS.md`；派子代理时每个只在一个模块内写文件，brief 写明模块路径和"不得引用模块外文件"。
- 提交前在仓库根跑 `node tools/check-isolation.mjs`；改动走功能分支 + PR（AGENTS.md 第 5 节），不直推 main。
