# Upstream synchronization ledger

更新时间：2026-08-22

本文件是 DSH Desktop 每次依赖、侧栏或发布变更前的上游审计入口。它区分“上游源码最新”“npm 最新发布”和“本产品当前经过验证的 pin”，不把未经回归的上游 HEAD 直接塞进安装包。

## 三个权威仓库

| 角色 | 上游 | 当前上游信号 | 本产品当前 pin | 状态 |
| --- | --- | --- | --- | --- |
| 官方 Harness | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `master` / `dsh-v0.1.1-rc.2`，commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；npm `latest` `0.1.1-rc.2` | 子模块 `dsh-v0.1.1-rc.2`，commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；桌面依赖为 `0.1.1-rc.2` | 本轮迁移、check 和 packaged smoke 已通过 |
| 官方侧栏 | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | `main` / `v0.15.1`，commit `ef8d3a90505f90e15e810d35d8c9c14bc6894fdb`；npm `latest` `0.15.1` | `dsh-better-sidebar@0.15.1` | 本轮迁移、peer 解析和 Desktop check 已通过 |
| 桌面参考 | [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) | `master` commit `6201080cfaa2f9b0864333e9da695cde71d3f1e1`，根 package `2.0.2` | 本 fork `rw0104/DSH-desktop` 的 `v2.0.8` | 仅作 Electron/打包对照，不作为运行时依赖 |

补充：本次通过代理复核 npm registry，`@deepseek-ai/dsh` 与 `dsh-better-sidebar` 的 `latest` 均已与上述 rc2/0.15.1 源码基线一致。仍然必须同时记录 Git tag、commit 和 registry 版本，不能只看任一信号。

## 每次更新的审计命令

```powershell
git ls-remote --heads --tags https://github.com/deepseek-ai/deepseek-harness.git
git ls-remote --heads --tags https://github.com/omdsh-dev/DSH-better-sidebar.git
git ls-remote --heads --tags https://github.com/anywhere-labs/deepseek-harness-desktop.git
npm view @deepseek-ai/dsh version
npm view dsh-better-sidebar version
git submodule status -- deepseek-harness
```

## 升级准入

只有在以下证据齐全后，才能把上游新版本放进 release：

- DSH package family、Cordis peer contract 和 pinned submodule 一致；
- Better Sidebar 的 `dsh.bundle.patch`、`betterSidebar.registerTab`、Terminal/Explorer 路由和本地 Yarn patch 均能应用；
- 左侧新会话、Workspace 菜单、系统文件夹打开、右侧 Files/Git/Terminal/Browser、窄窗口 modal 点击均通过 packaged smoke；
- 变更文档记录旧 pin、新 pin、兼容性差异、回滚点和安装包哈希。

## 2026-08-22 本轮迁移决策

- 旧 pin：官方 Harness `dsh-v0.1.0-rc.8` / `141eb6f…`，侧栏 `0.14.0`，产品 `v2.0.7`。
- 目标 pin：官方 Harness `dsh-v0.1.1-rc.2` / `b150a551…`，侧栏 `0.15.1`。
- 迁移依据：npm registry 与三个官方 Git remote 均已通过代理核对；桌面参考仓库的 rc2 patch 集合仅作为适配参考。
- 回滚点：保留本轮升级前的 outer commit `d9be36a500` 与 submodule gitlink `141eb6f…`；上游 pin 在独立提交中更新。
- 兼容性门槛：`corepack yarn install --immutable`、typecheck、完整 unit/check、Loader/Profile smoke、Windows packaged smoke 和 installer verifier 全部通过；发布为 `v2.0.8`。
- 安装包：`DSH-Desktop-2.0.8-x64-Setup.exe`，SHA-256 `73ACCE83E921760291BE10B8C49897CBB203698EB83A27EFBBF6CAFEC31318D2`。
- 已知功能恢复：Windows 工作区目录弹窗盘符选择器来自历史 `0f98feed34`/`2f58276e4f`，在 `7d4dd6a6e6` 的 rc8 合并结果中被删除；本轮在新基线上选择性恢复，不恢复无关右键目录浮层。
