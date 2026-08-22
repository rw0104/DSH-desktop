# Upstream synchronization ledger

更新时间：2026-08-21

本文件是 DSH Desktop 每次依赖、侧栏或发布变更前的上游审计入口。它区分“上游源码最新”“npm 最新发布”和“本产品当前经过验证的 pin”，不把未经回归的上游 HEAD 直接塞进安装包。

## 三个权威仓库

| 角色 | 上游 | 当前上游信号 | 本产品当前 pin | 状态 |
| --- | --- | --- | --- | --- |
| 官方 Harness | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `master` / `dsh-v0.1.1-rc.1`，commit `528c682e061696f5a160f363f236ecbf53cbd006` | 子模块 `dsh-v0.1.0-rc.8`，commit `141eb6fef83422698aef7a981029e843e8161534`；桌面依赖为 `0.1.0-rc.8` | 不是源码最新；需要兼容性迁移后再升级 |
| 官方侧栏 | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | `main` package `0.14.1`，commit `0da2812dd375fdf872256fda927c255aa0174ea0`；npm 最新发布 `0.14.0` | `dsh-better-sidebar@0.14.0` + `.yarn/patches/` 审计 patch | 已是最新已发布包；源码 main 尚未发布，不能直接替换 |
| 桌面参考 | [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) | `master` commit `7ff6c98bc561d424fa8d2b65f8c3ba840f37f566`，根 package `2.0.2` | 本 fork `rw0104/DSH-desktop` 的 `v2.0.5` | 仅作 Electron/打包对照，不作为运行时依赖 |

补充：截至本次审计，npm `@deepseek-ai/dsh` 的 registry `latest` 仍显示 `0.1.0-rc.7`，不能用 registry 标签替代官方 Git 子模块的源码信号；升级时必须同时记录两者。

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
