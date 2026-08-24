# Upstream synchronization ledger

更新时间：2026-08-24

本文件是 DSH Desktop 每次依赖、侧栏或发布变更前的上游审计入口。它区分“上游源码最新”“npm 最新发布”和“本产品当前经过验证的 pin”，不把未经回归的上游 HEAD 直接塞进安装包。

## 三个权威仓库

| 角色 | 上游 | 当前上游信号 | 本产品当前 pin | 状态 |
| --- | --- | --- | --- | --- |
| 官方 Harness | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `master` / `dsh-v0.1.1-rc.2`，commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；npm `latest` `0.1.1-rc.2` | 子模块 `dsh-v0.1.1-rc.2`，commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；桌面依赖为 `0.1.1-rc.2` | 本轮迁移、check 和 packaged smoke 已通过 |
| 官方侧栏 | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | `main` commit `4631a02db051e82dfd521dc7ff559c4651bf8b34`；`v0.15.2` commit `d9b8f15d9eab018742f97d67e54b2398504894cd`；npm `latest` `0.15.2` | `dsh-better-sidebar@0.15.1` | 上游有新版本；不与 v2.0.9 Vision/更新安全修复混合，待单独验证 patch、peer 与 packaged smoke |
| 桌面参考 | [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) | `master` commit `b13e1fa47e3ac5925bcd664091cfe5db85ee7fab`；最新 tag `v2.0.2` commit `9d18856ddea4f20eb3ef8c88b0436921c6b19606` | 本 fork `rw0104/DSH-desktop` 的 `v2.0.8` | 仅作 Electron/打包对照，不作为运行时依赖 |

补充：本次通过代理复核 npm registry，`@deepseek-ai/dsh` 与 `dsh-better-sidebar` 的 `latest` 均已与上述 rc2/0.15.1 源码基线一致。仍然必须同时记录 Git tag、commit 和 registry 版本，不能只看任一信号。

> 2026-08-24 更新：上述补充描述的是 2026-08-22 审计结果；当前 `dsh-better-sidebar` npm `latest` 已变为 `0.15.2`。本产品继续 pin `0.15.1` 不是静默忽略，而是明确延期到独立兼容性批次。

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

## 2026-08-24 v2.0.9 修复前审计

本轮准备变更 `@anionex/dsh-vision-toolkit` 的产品依赖和默认 Profile 地位，因此在代码修改前重新检查三条权威 remote、npm registry 和 submodule pin。

| 组件 | 远端/registry 结果 | 本轮决策 |
| --- | --- | --- |
| DeepSeek Harness | `master`、`dsh-v0.1.1-rc.2` 和本地 submodule 均为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；npm `latest`/`next` 均为 `0.1.1-rc.2` | 不更新 submodule 或 package family |
| Better Sidebar | `main` 为 `4631a02d…`；新 tag/npm `0.15.2` 为 `d9b8f15d…`；本产品仍为 `0.15.1` | 新版尚未通过本产品 Yarn patch、peer closure 和 packaged smoke；单独迁移，不混入 Vision hotfix |
| Desktop reference | `master` 前进到 `b13e1fa4…`；最新 tag 仍是 `v2.0.2` / `9d18856d…` | 只记录对照提交，不引入依赖 |
| Vision Toolkit | npm `latest` 仍为 `0.1.38`，registry 修改时间 `2026-08-20T20:49:34.911Z` | v2.0.8 成品缺运行时文件且默认不可禁用；v2.0.9 正式产品彻底移除 Bundle、依赖、设置入口和安装包，不再保留可启用路径 |

直连 GitHub 在本机返回 connection reset，按项目既有网络配置使用 `127.0.0.1:10808` 代理后成功：

```powershell
git -c http.proxy=http://127.0.0.1:10808 ls-remote --heads --tags https://github.com/deepseek-ai/deepseek-harness.git
git -c http.proxy=http://127.0.0.1:10808 ls-remote --heads --tags https://github.com/omdsh-dev/DSH-better-sidebar.git
git -c http.proxy=http://127.0.0.1:10808 ls-remote --heads --tags https://github.com/anywhere-labs/deepseek-harness-desktop.git
npm view @deepseek-ai/dsh version dist-tags --json
npm view dsh-better-sidebar version dist-tags peerDependencies --json
npm view @anionex/dsh-vision-toolkit version dist-tags time.modified peerDependencies --json
git submodule status -- deepseek-harness
```

已完成：Vision Toolkit 正式产品移除、旧 Profile 清理、immutable install、Profile/Loader、模型能力/原生图片安全门禁聚焦测试、完整 Desktop check 和真实 Windows unpacked afterPack smoke。Better Sidebar `0.15.2` 仍另开依赖批次，必须先证明其 `dsh.bundle.patch`、`betterSidebar.registerTab` 和 rc2 peer 解析兼容；本轮不静默升级。

### rc2 模型能力补丁边界

v2.0.9 在不修改 `deepseek-harness/` 子模块的前提下，对三个已发布 rc2 包使用可审查的 Yarn patch：

- `@deepseek-ai/dsh-client-ui-settings-models`：模型行可显式声明原生图片输入；DeepSeek 写 `inputModalities`，pi-ai 写其既有 `input` 字段；
- `@deepseek-ai/dsh-host-apiproxy`：`ModelCatalogModel` Wire schema 和 Host catalog 投影携带 exact-route `inputModalities`；
- `@deepseek-ai/dsh-client-ui-model-selection`：模型菜单和当前选择显示“支持图片/Vision”能力标记。

这些补丁没有放宽两道安全检查：Host 仍在图片持久化前拒绝明确 text-only 的当前模型，DeepSeek Adapter 仍在 Provider I/O 前拒绝未声明 image 的模型。设置提交后的 `settings/document-updated` 和 adapter topology 事件继续触发已打开模型目录的 generation-safe 刷新。补丁文件位于 `.yarn/patches/`，目标仍是官方 `0.1.1-rc.2` tarball；后续官方版本包含等价能力后应删除下游 patch，而不是长期分叉协议。

本轮还确认 Desktop 最终 `web-runtime` 覆盖层曾遗漏 `openBrowser: false`，导致上游 schema 回退到默认打开浏览器。`dsh-plugin-desktop/cordis.patch.yml` 现已固定该字段，完整 Profile smoke 同时传入 `--no-open` 并断言最终 Loader row 不允许打开浏览器。

## 2026-08-24 v2.0.9 发布结果

- Vision Toolkit 已从正式 Profile、依赖、设置入口、许可证闭包和安装包彻底移除；旧 Profile 启动时同时清理 bundle 与依赖字段。
- 本地 `corepack yarn dist:win` 生成唯一 `DSH-Desktop-2.0.9-x64-Setup.exe`，installer verifier 通过；真实 `app.asar` 中 Vision Toolkit/agent-vision 条目数为 0。
- GitHub `main` 推进到 `d83049b993812d10f4c8fb798c37127d4eae73af`，annotated tag `v2.0.9` 指向该提交。
- GitHub Release `v2.0.9` 为 Latest、非 draft、非 prerelease；直接上传本地同一 Setup 和 `latest.yml`，tag 不触发 Actions 二次重建。
- Setup 大小 `254,479,549` bytes；本地与 GitHub asset digest 均为 SHA-256 `044DE9DD5668C03D74765D8D68E27903CB272C91C6FB2F7224EC33F0875A1E09`。
- `latest.yml` 大小 `339` bytes；本地与 GitHub asset digest 均为 SHA-256 `FB48B5A475AB9D8F8245102FD7827766F291A4800390DACDEA26320B5707AFE7`。
- Authenticode 状态为 `NotSigned`，与 Release/README 的透明披露一致；配置受信代码签名证书和 updater publisher lock 仍是后续安全工作。
