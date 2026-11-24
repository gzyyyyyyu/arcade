<!--
Title starts with the module, e.g. "kaipan: fix empty row in the monthly bill"; root docs use "docs: …", other root files "repo: …".
One PR changes one module and is one complete change; split cross-module work and state the merge order. Quality standard: docs/engineering.md
标题以模块名开头，例如「kaipan: 修复月账单空行」；根目录文档用「docs: …」，其他根目录文件用「repo: …」。一个 PR 只改一个模块、是一个完整的改动；跨模块的改动拆开，并写明合并顺序。质量标准见 docs/engineering.md。
-->

## What and why / 改了什么、为什么

## Related issue / 关联 issue

Fixes #… / 无

## Module and version / 模块与版本

- Module: platform / games/<id> / packages/<name> / repository
- Version and CHANGELOG: bumped to x.y.z / not needed (docs, tests or tooling only)

## Verification / 验证

- [ ] `node tools/check-isolation.mjs` passes at the repository root
- [ ] `npm test` and the build pass in the module (commands and results below)
- [ ] UI changes: up to 3 screenshots in the description (webp, ≤ 300 KB each; not committed to the branch), zero console errors / 界面改动：描述里最多 3 张 webp 截图（每张 ≤300KB，不进分支），控制台零报错
- [ ] Docs, README and the module's `AGENTS.md` describe the new behaviour (current state, no history)
- [ ] Version bumped and `CHANGELOG.md` entry added in the standard format (if it ships)
- [ ] Balance or AI changes: simulator / bot results attached

## Notes for reviewers / 审阅备注
