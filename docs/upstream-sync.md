# Upstream synchronization ledger

更新时间：2026-08-30

本文件是 DSH Desktop 每次依赖、侧栏或发布变更前的上游审计入口。它区分“上游源码最新”“npm 最新发布”和“本产品当前经过验证的 pin”，不把未经回归的上游 HEAD 直接塞进安装包。

## 三个权威仓库

| 角色 | 上游 | 当前上游信号 | 本产品当前 pin | 状态 |
| --- | --- | --- | --- | --- |
| 官方 Harness | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `master` / `dsh-v0.1.2-alpha.1` 为 `cd5ef8148158c3a752a658978873241fdf8e2bbc`；npm `latest`/`next` 仍为 `0.1.1-rc.2` | 子模块 `dsh-v0.1.1-rc.2`，commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；桌面依赖为 `0.1.1-rc.2` | v2.0.15 不把未正式发布的 alpha 混入市场修复 |
| 官方侧栏 | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | `main` 为 `3aab7ca3a53357f9237a91978d57df4cf84c9c45`，比 `v0.17.1` 超前 32 个未发布提交；最新 tag/npm 仍为 `v0.17.1` / `0.17.1`，tag commit `3b1898f9cb74edf4ca542ff84430eaf346dd05f4` | `dsh-better-sidebar@0.17.1` | 正式 pin 仍最新；等待新 tag/npm 后独立审计 `workspaceFence`、文件树和 Market 共存，不使用 `main` 快照 |
| 桌面参考 | [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)（重定向到 `anywhere-labs/dsh-desktop`） | `master` 为 `b9758b4346f6a806e4407873c5269b9989a39fbe`；最新 tag `v2.0.4` 为 `d29bf7a965fc68bf09750bc329905ecb17afe48b` | 本 fork `rw0104/DSH-desktop` 的 `v2.0.15` 候选 | 只作只读对照，不整体合并或作为依赖 |

补充：2026-08-29 通过代理复核三条 Git remote 与 npm registry。官方 Harness Git 已出现 `0.1.2-alpha.1`，但 npm 正式 `latest`/`next` 仍为 `0.1.1-rc.2`，因此本产品继续使用已验证 pin；Better Sidebar 正式版本与本地 pin 均为 `0.17.1`。仍然必须同时记录 Git tag、commit 和 registry 版本，不能只看任一信号。

## 每次更新的审计命令

```powershell
git ls-remote --heads --tags https://github.com/deepseek-ai/deepseek-harness.git
git ls-remote --heads --tags https://github.com/omdsh-dev/DSH-better-sidebar.git
git ls-remote --heads --tags https://github.com/anywhere-labs/deepseek-harness-desktop.git
npm view @deepseek-ai/dsh version
npm view dsh-better-sidebar version
git submodule status -- deepseek-harness
```

## 2026-08-30 Better Sidebar 未发布 main 审计

- `main` 为 `3aab7ca3a53357f9237a91978d57df4cf84c9c45`，相对正式 `v0.17.1` / `3b1898f9…` 超前 32 个提交；npm `latest` 仍是 `0.17.1`，本产品 pin 同为 `0.17.1`。
- 未发布变更包括 `workspaceFence` 偏好与错误界面一键关闭入口、文件树 reveal/scroll 行为和测试、插件目录新增项以及多语言文案补齐。
- `workspaceFence` 影响工作区安全边界，不能从 `main` 单独 cherry-pick。等待新 tag/npm 后，必须独立验证配置迁移、路径 containment、File/Git/Editor 错误面、现有 Yarn patch、Profile/Loader、Community Market 共存、完整 `check` 和 packaged smoke。
- 在正式版本出现之前，不修改 `dsh-better-sidebar@0.17.1`、lockfile、patch baseline 或发布资产。

## 2026-08-29 v2.0.15 插件市场适配发布前审计

- 三条权威 Git remote 与 npm registry 已按上表重新核对；本轮只修复 Desktop 自有 Community Market，不更新 Harness 子模块、正式 package family 或 Better Sidebar。
- 1024Store 当前公开 v1 response 可完整提供 500 条目录记录，但未压缩响应会显著延长首次同步；仅其编译期固定 Host client 新增 identity/gzip 白名单与 16 MiB 解压后上限，自定义来源仍保持 identity-only 和 2 MiB 默认上限。
- dshfind 当前分页目录为 12,366 条、124 页，已超过旧 adapter 的 10,000 条/100 页上限；改用其公开原子 `/v1/catalog`，单次真实受限客户端重放标准化 12,365 条，避免触发匿名 30 次/分钟分页配额。
- 市场弹窗默认打开“发现”，首次“可安装”完整同步提供明确状态；补齐焦点陷阱/恢复、`aria-busy` 和合作来源双语文案。
- `corepack yarn workspace dsh-community-market check`：19 个文件、275 项测试通过；仓库级 `corepack yarn check`：Market 275、Desktop 734（11 skipped）、runtime closure 201、production licenses 691。
- 发布候选继续使用 Harness `0.1.1-rc.2`、gitlink `b150a551…` 和 Better Sidebar `0.17.1`；Harness `0.1.2-alpha.1` 与参考桌面 `v2.0.4` 均不混入本次市场修复。

## 2026-08-30 v2.0.15 本地构建结果

- `corepack yarn install --immutable`、完整 `corepack yarn check` 与 Windows package preflight 均通过；Windows preflight 为 210 项、runtime closure 201。
- 正式构建复用 `%LOCALAPPDATA%\electron\Cache` 中的 Electron 43.4.0，且只通过 `DSH_PACKAGE_CHECK_ALREADY_RAN=1` 跳过刚刚已通过的重复 Windows preflight；afterPack、fuses、NSIS、installer verifier 未跳过。
- 依赖装配约 15 分钟后进入 NSIS；7z 静默压缩阶段约 11 分钟，中间 zip 从 27 MB 持续增长到成品规模，CPU 与 I/O 始终前进，没有复刻数小时无进展等待。
- Setup `DSH-Desktop-2.0.15-x64-Setup.exe` 为 `330,779,607` bytes，SHA-256 `679BDE89AA32A24DE27B8330E3479B9C43A174DFA712E034FC9A484CB7222BC2`，Authenticode `NotSigned`。
- `latest.yml` 为 `342` bytes，SHA-256 `BC6377D3A7774EA2D85882EABAD708C5D1E40032035F58DF2B355B1381BAA546`，两处 SHA-512 与本地 Setup 一致。
- unpacked 主程序为 `225,552,384` bytes，SHA-256 `C3C1DF56365A2646A28C6A6CE81E1C734C9B7DFDFCCC83D0C51CCDEA46DAF55F`，FileVersion `2.0.15`，ProductVersion `2.0.15.0`，Authenticode `NotSigned`。
- installer verifier、packaged market payload 回读和隔离 quit probe 通过；本机存在 `D:\DSH Desktop` 2.0.14 all-users 安装，因此真实 upgrade smoke 按安全前置条件不执行。

## 2026-08-30 v2.0.15 部署结果

- Annotated tag `v2.0.15` 解引用到安装包证据提交 `0893da1289895cfafb1d398c14bedc4eb7c773f8`；tag object 为 `02c399948a700746f656d9cd6f28fa11f689cc8b`。
- GitHub Release `v2.0.15` 于 `2026-08-30T10:59:02Z` 发布为 Latest，非 draft、非 prerelease：<https://github.com/rw0104/DSH-desktop/releases/tag/v2.0.15>。
- Setup 远端资产为 `330,779,607` bytes，GitHub digest `sha256:679bde89aa32a24de27b8330e3479b9c43a174dfa712e034fc9a484cb7222bc2`，与本地一致。
- `latest.yml` 远端资产为 `342` bytes，GitHub digest `sha256:bc6377d3a7774ea2d85882eabad708c5d1e40032035f58df2b355b1381baa546`，与本地一致。
- Release 只包含上述两个资产；未上传 `win-unpacked`、旧 Setup、builder debug、缓存、诊断 Profile 或 `docs/local/` 开发资料。

## 2026-08-29 v2.0.13 选择性接入与本地构建结果

- 参考桌面 `v2.0.4` 只作为证据源；本产品实现 Windows installer quit handoff 和 `mode` / `port` / `logLevel` Profile 隔离，没有 cherry-pick 参考产品提交。
- 安装器通过专用 `--dsh-desktop-installer-quit` 进入现有 shutdown coordinator，等待 30 秒后才允许用户确认 scoped fallback；进程探针严格比较 `$INSTDIR\DSH Desktop.exe` 规范化绝对路径，不匹配安装目录 helper 或其他目录同名程序。
- Profile 偏好存储为 Electron user-data 下 `profile-preferences/<sha256(Profile directory)>/state.json`，只含 Desktop 三个字段；strict schema、bounded read、symlink 检查、private mode、原子替换和 shutdown flush 均有测试。窗口、更新、日志目录等设备级状态不进入该文件。
- 保留 `nsis.useZip=true` 和 electron-builder 默认恢复语义；参考 7z 原地解压与 legacy uninstaller code `2` 放宽未接入。同机 7z payload 实验在 3 分钟进度门禁内未形成可用归档并被终止，未让对比任务进入小时级等待。
- `corepack yarn install --immutable` 通过；完整 `corepack yarn check` 为 Market `270` 项、Desktop `733` 项（`11` skipped）、runtime closure `201`、production licenses `691`；Windows preflight `210` 项、closure `201`。
- 首次最终打包因外网 Electron 下载 `ETIMEDOUT` 退出；按仓库缓存规则改用已经安装的 `node_modules/electron/dist`，没有下载或复制 Electron archive 到仓库。installer verifier 与最终 `2.0.13` unpacked quit probe 通过。
- 机器已有用户安装 `D:\DSH Desktop`，隔离 installer upgrade smoke 按安全前置条件拒绝执行；本批次没有卸载、覆盖或终止该安装。此限制在 Release 说明中公开记录。
- 最终 Setup `DSH-Desktop-2.0.13-x64-Setup.exe` 为 `330,862,178` bytes，SHA-256 `A38D003CE95EE77BD18A09413A62FE81DA917297EE3702744B668051EDFFAC9F`，Authenticode `NotSigned`。
- `latest.yml` 为 `342` bytes，SHA-256 `79D810263CF9506D8410C3E0FF9DD3EAE210A9B7AA4FE35D8F7A8667F1AB4AD1`，其中 SHA-512 与本地 Setup 一致。unpacked 主程序为 `225,552,896` bytes，SHA-256 `86DE8FC4DDF5DC8A71898606D96955C38D22886DA527733530A680BA9A1C1E81`，FileVersion `2.0.13`，ProductVersion `2.0.13.0`，Authenticode `NotSigned`。
- Harness gitlink 仍为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，正式 npm family 仍为 `0.1.1-rc.2`，Better Sidebar 仍为 `0.17.1`；没有混入 alpha runtime、Remote gateway 或参考 README/版本服务。

## 2026-08-29 v2.0.13 部署结果

- 远端 `main` 与 annotated tag `v2.0.13` 均解引用到本地安装包证据提交 `fd2ef11bd25aeacb57928a42ab3566dfec77d86c`；tag object 为 `b65e530bdfa5bce06babdd3350b76f21f6157cb7`。
- GitHub Release `v2.0.13` 于 `2026-08-29T14:07:19Z` 发布为 Latest，非 draft、非 prerelease：<https://github.com/rw0104/DSH-desktop/releases/tag/v2.0.13>。
- Setup 远端资产为 `330,862,178` bytes，GitHub digest `sha256:a38d003ce95ee77bd18a09413a62fe81da917297ee3702744b668051edffac9f`，与本地一致。
- `latest.yml` 远端资产为 `342` bytes，GitHub digest `sha256:79d810263cf9506d8410c3e0ff9dd3eae210a9b7aa4fe35d8f7a8667f1ab4ad1`，与本地一致。
- Release 只包含上述两个资产；未上传 `win-unpacked`、旧 Setup、NSIS 中间压缩包、builder debug、缓存、诊断 Profile 或 `docs/local/` 开发资料。

## 2026-08-29 v2.0.14 Profile 同步热修与本地构建结果

- `v2.0.13` 发布后最终审查发现：Profile 私有值能驱动 Host 启动，但未同步回 settings service，设置页可能仍显示共享旧值。没有覆盖已发布的 tag/资产；改为立即发布不可变的新版本 `v2.0.14`。
- 新 reconciliation contract 区分首次导入与已有私有状态：首次导入只保存私有文件；已有私有状态则同步 `mode`、`port`、`logLevel` 到 settings service，并保持私有状态为权威源。聚焦测试覆盖两条路径。
- `corepack yarn install --immutable` 通过；完整 `corepack yarn check` 为 Market `270`、Desktop `734`（`11` skipped）、closure `201`、licenses `691`；Windows preflight `210`、closure `201`。
- 最终构建显式复用 `node_modules/electron/dist`，没有外网下载；installer verifier 与 `2.0.14` unpacked quit probe 通过。
- Setup `DSH-Desktop-2.0.14-x64-Setup.exe` 为 `330,862,733` bytes，SHA-256 `423B00F77911C8EAFDC3EF711B2DE0804FD08C2FC8D23D82058F8927C5E57E53`，Authenticode `NotSigned`。
- `latest.yml` 为 `342` bytes，SHA-256 `346513C34E023ADF6EFC7D36472ECF0ED5328B3F0D300522F17AAB3C3228F41D`；unpacked 主程序为 `225,552,896` bytes，SHA-256 `AF08F57C3212BF48BD402CDD1647D469564E6640476FA27E626ED9E6B8DAA2DA`，FileVersion `2.0.14`，ProductVersion `2.0.14.0`，Authenticode `NotSigned`。

## 2026-08-29 v2.0.14 部署结果

- 远端 `main` 与 annotated tag `v2.0.14` 均解引用到本地安装包证据提交 `f76dab10b72749b52d699891540ebb080cee5bf5`；tag object 为 `d183ec85213b4446b6c3068277c10e469cab473d`。
- GitHub Release `v2.0.14` 于 `2026-08-29T16:26:12Z` 发布为 Latest，非 draft、非 prerelease：<https://github.com/rw0104/DSH-desktop/releases/tag/v2.0.14>。
- Setup 远端资产为 `330,862,733` bytes，GitHub digest `sha256:423b00f77911c8eafdc3ef711b2de0804fd08c2fc8d23d82058f8927c5e57e53`，与本地一致。
- `latest.yml` 远端资产为 `342` bytes，GitHub digest `sha256:346513c34e023adf6efc7d36472ecf0ed5328b3f0d300522f17aab3c3228f41d`，与本地一致。
- Release 只包含上述两个资产；`v2.0.13` 保留为不可变历史版本并在 Release 正文标记已由 `v2.0.14` 取代。

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

## 2026-08-25 官方 Harness 与错误提示归属复核

本轮根据客户机器导出的 `session.jsonl` 检查官方 Harness 更新状态，并确认余额不足提示的代码归属。会话的终止事件完整保留 Provider 错误 `Insufficient Balance`、错误码 `QUOTA` 和 HTTP 状态 `402`；界面前缀“本轮运行失败”来自官方 `@deepseek-ai/dsh-client-ui-conversation` 的 `message.turnError` 文案及其 `TurnErrorItem` 渲染，不是 Desktop Client face 或本地 Yarn patch 创建的错误映射。

| 组件 | 2026-08-25 远端/registry 结果 | 决策与下一步 |
| --- | --- | --- |
| DeepSeek Harness | `master`、`dsh-v0.1.1-rc.2` 和本地 submodule 均为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；npm `latest`/`next` 均为 `0.1.1-rc.2` | 没有更新；不改 submodule、package family 或官方错误提示 |
| Better Sidebar | `main` / `v0.16.1` / npm `latest` 均为 `f9153dfc…` / `0.16.1`；本产品仍为 `0.15.1` | 不混入本轮官方 Harness 核对；下一独立依赖批次更新 package/lock 后验证 Yarn patch、Profile/Loader、侧栏聚焦测试、完整 `check` 与 packaged smoke |
| Desktop reference | `master` 前进到 `2172b1b2…`；最新 tag 仍为 `v2.0.2` / `9d18856d…` | 只记录对照提交，不引入依赖或覆盖本 fork 产品文件 |

## 2026-08-25 v2.0.10 Better Sidebar 升级

- 旧 pin：`dsh-better-sidebar@0.15.1`；新 pin：`0.16.1`，npm integrity `sha512-fjFNzfrgdIbzlcC4Sd4aS1I2ZRbuA+/m3XQnOxY13jE6IKJzwz0+GjATcKTyFoLnXoDRp2QJz/U0GxhaOD70Dw==`。
- 官方 Harness 继续固定 `dsh-v0.1.1-rc.2` / `b150a551…`，本轮不更新 submodule 或 `@deepseek-ai/dsh-*` package family。
- 两版 Sidebar bundle patch 哈希一致；`registerTab/openTab/closeTab` 服务面保持兼容，新增 `floatWindows`。公开 `cordis` peer 被移除，Sidebar 改用 `@deepseek-ai/cordis` 类型基底。
- Yarn 新包隔离只为精确 `dsh-better-sidebar@0.16.1` 放行；immutable install、聚焦 103 项、完整 check、Windows package 203 项、afterPack 与 installer verifier 均通过。
- 首次 CI 在 macOS/Linux 发现 Review 反斜杠路径未进入 POSIX traversal 语义，以及 Deliverable 测试未按 `realpath` 比较 `/private/var`；生产 containment 与测试合约在 `c8328e9b25…` 修复，完整 check 和本地安装包均从该提交重新执行。
- 最终本地唯一安装器 `DSH-Desktop-2.0.10-x64-Setup.exe` 为 `276,771,959` bytes，SHA-256 `B37BA8A0F41BD3EE1DE2D7BCC34BFD93D51F2988494DCFED1EDAA838F253038D`；`latest.yml` 为 `342` bytes，SHA-256 `85D7D5B3C2F0E2153DEC96AAB365E958E61660BC41348DBCACD1766AB20EEB25`；Authenticode `NotSigned`。
- 最终构建源码提交为 `baad5023bec255518f97a98a7dd13b53ea69b5cb`，包含重新生成的第三方清单（补入 `@codemirror/lang-vue@0.1.3`、`react-icons@5.7.0`）。GitHub Draft 中的旧候选资产必须先删除，再上传并回读最终同名资产的 size/digest；不允许 Actions 二次构建或覆盖。
- 后续 CI 还修正两个验证器的跨平台假设：Profile smoke 只在真实 Windows runner 要求盘符参数；license verifier 大小写无关地识别标准 license 文件名，确认 `khroma@2.1.0` 的小写 `license` 为 MIT。这两项不改变本地安装器字节。
- GitHub CI run `32915919433` 全绿：Ubuntu 完整 check、Windows check/installer/portable、macOS check/packaged smoke 和 upstream command 均通过。Draft Release 中最终 Setup/`latest.yml` 的 size/digest 已与本地一致，满足发布条件。

## 2026-08-26 v2.0.10 发布结果

- Annotated tag `v2.0.10` 解引用到 `14f50e727d7d9f395b52d3e7546898c354c22ac3`；GitHub Release 于 `2026-08-26T10:52:33Z` 发布为 Latest，非 draft、非 prerelease。
- 最终 CI run `32935865273` 全绿：Ubuntu check、Windows check/installer/portable、macOS check/packaged smoke 和 upstream command 全部成功。
- Release 直接上传本机最终 Setup 与 `latest.yml`，未采用 CI 构建产物；不上传 `win-unpacked`、缓存、诊断 Profile 或临时归档。
- Setup 远端大小 `276,771,959` bytes，GitHub digest `sha256:b37ba8a0f41bd3ee1de2d7bcc34bfd93d51f2988494dcfed1edaa838f253038d`，与本地 SHA-256 一致。
- `latest.yml` 远端大小 `342` bytes，GitHub digest `sha256:85d7d5b3c2f0e2153dec96aab365e958e61660bc41348dbcacd1766ab20eeb25`，与本地 SHA-256 一致。

## 2026-08-26 ProducedFiles 下一期规划前审计

本轮为“产物文件胶囊右键复制实际路径”开发规划重新检查三条权威 remote 和 npm registry。

| 组件 | 远端/registry 结果 | 本轮决策 |
| --- | --- | --- |
| DeepSeek Harness | `master`、`dsh-v0.1.1-rc.2`、npm `latest/next` 和本地 submodule 均为 `b150a551b8…` / `0.1.1-rc.2` | 没有更新；规划基于当前 `ui-deliverables` / `ui-primitives` contract |
| Better Sidebar | `main` / `v0.16.1` 为 `f9153dfc…`；npm `latest` `0.16.1` | 没有更新；本功能不属于 Sidebar 所有权 |
| Desktop reference | `master` 从 `2172b1b2…` 前进到 `83e706ab…`，compare ahead `84`；最新 Release tag 仍为 `v2.0.2` | 记录 UI/恢复/安装器/市场/PTY 更新；不整体 merge，不作为本功能实现来源 |

参考 main 的 84 个提交涵盖 setup wizard、browser/LAN 权限、Recovery、运行中安装器升级、Windows minimal persistent PTY、市场 adapters/GitHub source、模型能力和隐私文档。GitHub 已把原仓库 URL 重定向到 `anywhere-labs/dsh-desktop`。

针对 ProducedFiles 的检索结果：参考仓库没有 `ProducedFiles`、`copyAbsolutePath`、`copyTextContent` 或产物 `contextmenu` 实现；只有托盘原生 context menu。因此下一期应复用官方 Harness Web UI 的 `@deepseek-ai/dsh-client-ui-primitives/Menu`，只借鉴参考仓库的 `data-slot`、aria/focus 和静态 markup 测试风格。

详细实施计划保存在本地开发资料中；公开台账只保留审计结论和发布证据。

## 2026-08-27 上游复核与选择性跟进

本轮在代理 `http://127.0.0.1:10808` 下重新执行三条权威 Git remote、tag、npm registry 和本地 pin 审计。直连 GitHub 仍会被本机网络重置，因此所有 Git 结果均以代理命令回读为准。

| 组件 | 最新远端/registry 信号 | 与本产品的差异 | 决策 |
| --- | --- | --- | --- |
| 官方 Harness | `master` / `dsh-v0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；npm `latest` 和 `next` 均为 `0.1.1-rc.2`，修改时间 `2026-08-21T12:58:57.438Z` | 本地子模块仍为 `dsh-v0.1.1-rc.2` / `b150a551…`；根工作区所有 `@deepseek-ai/dsh-*` 仍为 `0.1.1-rc.2` | 没有上游更新；不改 submodule、package family 或其 pin |
| Better Sidebar | `main` `20da6479f14689db126a3f147670220a70dfbf6b`；最新发布 tag/npm 仍为 `v0.16.1` / `f9153dfc1ce47cf43445c1b351ee3ae47b4ad9f1` / `0.16.1`，修改时间 `2026-08-25T03:22:03.832Z` | `main` 比 `v0.16.1` 多出未发布的 `0.17.0` pinned-terminal 功能（10 个提交）；本产品依赖仍为已审计 `0.16.1` | 暂缓升级。未发布 API/状态迁移未经过本产品 patch、peer closure、完整 check 和 packaged smoke，不把 `main` 当可发布依赖 |
| 桌面参考 | `master` `1eb398d78108de1303ce29b1aeaf70aaf96acee4`（2026-08-27）；最新 tag `v2.0.3` `681ba66091fc5b1e827650137f69b3ee4c435922` | 参考仓库继续包含 setup/recovery/market/PTY 等产品差异；其根 README、版本和发布资产不属于本 fork | 选择性移植，不整体 merge，不作为运行时依赖 |

### 本轮可兼容跟进

在不修改 `deepseek-harness/` 子模块、不覆盖根 README 的前提下，工作区已移植并通过聚焦验证的参考改进为：

- Community Market 使用本地 storefront 图标；Desktop 设置导航使用独立显示器图标。图标仍由本产品维护，未把参考仓库产品文件带入。
- Package manager 失败保留有界 stdout/stderr 尾部和受限异常原因，写入 Desktop 日志，并通过 loopback API 返回给失败弹窗；弹窗展示 Host 推导的精确 `dsh plugin add` 命令并提供 DSH Terminal 入口，不重试已消费的确认 token。
- Workspace 文件拖拽在捕获阶段识别尚未暴露 `File` 的目录，并优先声明 Workspace drop target；官方附件遮罩通过两个 rc2 Yarn patch 避开该区域，解决 Sidebar/聊天拖拽遮罩冲突。

新增/复用的下游 patch：

- `patches/dsh-client-ui-attachment@0.1.1-rc.2.patch`
- `patches/dsh-client-ui-conversation@0.1.1-rc.2.patch`
- `.yarn/patches/@deepseek-ai-dsh-client-ui-settings-general-npm-0.1.1-rc.2-ef120ba0cf.patch`

当前这些改动尚未形成新的产品 release，也没有修改产品版本号。根 `corepack yarn install --immutable`、完整 `corepack yarn check` 和 Windows `package:dir` unpacked smoke 已在本轮通过；安装器 verifier 留给明确的 release 批次执行。若后续 release 门禁失败，回滚点是本轮工作区改动及上述三个 patch，不触碰官方 submodule pin。

### 本轮审计命令与回读摘要

```powershell
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/deepseek-ai/deepseek-harness.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --tags --refs https://github.com/deepseek-ai/deepseek-harness.git
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/omdsh-dev/DSH-better-sidebar.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --tags --refs https://github.com/omdsh-dev/DSH-better-sidebar.git
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/anywhere-labs/deepseek-harness-desktop.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --tags --refs https://github.com/anywhere-labs/deepseek-harness-desktop.git
npm view @deepseek-ai/dsh version dist-tags time.modified --json
npm view dsh-better-sidebar version dist-tags time.modified peerDependencies --json
git submodule status -- deepseek-harness
```

本地 `corepack yarn install --immutable` 已生成并验证对应 patch locator；聚焦结果为 Market `80` 项、桌面拖拽/包面 `43` 项全部通过，两个 owned workspace typecheck 全部通过。完整 `corepack yarn check` 结果为 Market `270` 项、桌面 `707` 项（`11` 项跳过）通过，运行时闭包 `201` 个 first-party 节点闭合；Windows unpacked smoke 已生成 `dsh-plugin-desktop/dist/win-unpacked` 并完成 Electron-builder 处理。Sidebar `main` 的 pinned-terminal 设计、参考仓库其余未发布提交以及官方 Harness 新 tag（当前不存在）保留在本台账中，下一轮必须重新审计后才能进入 release。

## 2026-08-28 v2.0.11 本地构建结果

- 产品版本更新为 `2.0.11`；官方 Harness 继续固定 `dsh-v0.1.1-rc.2` / `b150a551…`，Better Sidebar 继续固定已发布 `0.16.1`。
- 功能、版本、测试和开发文档提交为 `0d353d9e1e`；从该提交本地构建 Windows x64 Setup。
- 完整 `corepack yarn check` 通过：Market `270`、Desktop `707`（`11` skipped）、runtime closure `201`、production licenses `691`。
- Windows package preflight `205` 项通过；Electron Builder afterPack、fuses、NSIS 和 installer verifier 通过。
- `DSH-Desktop-2.0.11-x64-Setup.exe`：`276,779,515` bytes，SHA-256 `375FF3DE9D53B98B24F7BA0FBEEE2CC0538AA92C52D9B037E35150BD0F9C033C`，Authenticode `NotSigned`。
- `latest.yml`：`342` bytes，SHA-256 `63EE3758FC55B70A671826283472D58802193764941B8428094A3F8120B38150`。
- unpacked `DSH Desktop.exe`：`225,552,384` bytes，SHA-256 `037103E7BCDF59EC5357AE64B54E7DC66ED23F1D3FBDED4463A41A1D3267AB32`，FileVersion `2.0.11`，ProductVersion `2.0.11.0`，Authenticode `NotSigned`。
- Annotated tag `v2.0.11` 解引用到 `beaa23811a753bba70c89e902b33d34f35181151`；GitHub Release 于 `2026-08-28T11:34:15Z` 发布为 Latest，非 draft、非 prerelease。
- GitHub Setup/`latest.yml` 的远端 size 与 digest 均与上述本地成品一致；Release 未上传 unpacked 目录、缓存或诊断 Profile。

## 2026-08-28 v2.0.12 本地构建结果

- Better Sidebar 从精确 `0.16.1` 升级到精确 `0.17.1`，Git/npm 均指向 `3b1898f9cb74edf4ca542ff84430eaf346dd05f4`；npm integrity 为 `sha512-7me2X6w+ecbzAMEHtuWkSPUrfLDLTBvL9qugzgBbg1FyWyy2dzS9QNDvnZjjkst4kr4LjUJTTG4rsXBcz41YzQ==`。`dsh-better-sidebar` 的 `dsh-client-runtime` peer 已删除，但 rc2 runtime closure 仍闭合。
- 新增 Sidebar 消费侧回归：legacy/damaged pin fail-soft、workspace/global visibility、home session/cwd/tabId、unpin/close 分离、Agent terminal 离线保留、terminal URL scheme/modifier 安全边界和 detached cwd persistence fallback。
- Desktop 新增 Host → Renderer 只读更新状态 contract：GET snapshot + 同源 SSE；下载真实字节节流、独立 verifying/ready 状态、generation/revision 防旧事件覆盖；About 页使用 ARIA progressbar、失败 alert、中文/英文状态文本和 reduced-motion 样式。
- `app-builder-lib@26.15.7` 下游 patch 增加 Yarn Berry `npm list --workspaces=false`。修复前 electron-builder 因 npm 自动跳回外层 workspace 而回退 manual traversal，`package:dir`/`dist:win` 可连续运行 60+ 分钟；修复后 collector 在 27.5 秒内收集 834 个模块并直接进入 ASAR。正式 NSIS 构建在约 18 分钟完成依赖复制后进入压缩；中间 zip 的 `-bd` 关闭进度条，导致表面上长时间无输出。
- 最终 `corepack yarn check`：Market `270` 项、Desktop `725` 项（`11` skipped）、runtime closure `201`、production licenses `691`；Windows preflight `206` 项；installer verifier 通过。
- 最终 Windows Setup：`330,773,657` bytes，SHA-256 `43012BC5C89F57C77B8AD5049E271DCA30EF665C971A865C09D050BF3D873B94`，SHA-512 base64 与 `latest.yml` 一致；`latest.yml`：`342` bytes，SHA-256 `0FD44B3CBBC6E28485B848D7FDD8977AE0ED3E91EDDE6A32BA2A6F077025B5A2`。unpacked 主程序 FileVersion `2.0.12`、ProductVersion `2.0.12.0`、Authenticode `NotSigned`。
- 成品只发布 Setup 与 `latest.yml`；`win-unpacked`、NSIS 中间 zip、builder debug 和诊断目录在发布前清理。Harness submodule 仍为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，官方 npm family 仍固定 `0.1.1-rc.2`，未混入 `0.1.2-alpha.1`。

## 2026-08-28 v2.0.12 部署结果

- 远端 `main` 与 annotated tag `v2.0.12` 均解引用到本地安装包证据提交 `93183ace60048310ce18ff93070238d7928a4d86`；tag object 为 `2e03b978d548314a896ce200bec442173c6907fd`。
- GitHub Release `v2.0.12` 于 `2026-08-29T06:26:11Z` 发布为 Latest，非 draft、非 prerelease：<https://github.com/rw0104/DSH-desktop/releases/tag/v2.0.12>。
- Setup 远端资产为 `330,773,657` bytes，GitHub digest `sha256:43012bc5c89f57c77b8ad5049e271dca30ef665c971a865c09d050bf3d873b94`，与本地一致。
- `latest.yml` 远端资产为 `342` bytes，GitHub digest `sha256:0fd44b3cbbc6e28485b848d7fdd8977ae0ed3e91edde6a32ba2a6f077025b5a2`，与本地一致。
- Release 只包含上述两个资产；未上传 `win-unpacked`、NSIS 中间 zip、builder debug、缓存、诊断 Profile 或 `docs/local/` 开发资料。

## 2026-08-28 v2.0.12 Better Sidebar 0.17.1 升级前审计

本批次在升级依赖和创建 release 前重新核对三条权威 Git remote、GitHub Release、npm registry 与本地 pin。Git 查询继续使用本机既有代理 `http://127.0.0.1:10808`；registry 结果来自 npm 官方元数据。

| 组件 | 远端/registry 结果 | 本地基线 | 本批次决策 |
| --- | --- | --- | --- |
| DeepSeek Harness | `master` / tag `dsh-v0.1.2-alpha.1` 为 `cd5ef8148158c3a752a658978873241fdf8e2bbc`；npm `@deepseek-ai/dsh` 的 `latest/next` 仍为 `0.1.1-rc.2`，`@deepseek-ai/dsh{-base,-web-app}@0.1.2-alpha.1` 均为 404 | submodule `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，正式 package family `0.1.1-rc.2` | alpha npm family 不完整；不更新 submodule、package family 或 Profile 契约 |
| Better Sidebar | `main` / tag `v0.17.1` 为 `3b1898f9cb74edf4ca542ff84430eaf346dd05f4`；Release 于 `2026-08-28T08:04:54Z` 发布；npm `latest` 为 `0.17.1`，integrity `sha512-7me2X6w+ecbzAMEHtuWkSPUrfLDLTBvL9qugzgBbg1FyWyy2dzS9QNDvnZjjkst4kr4LjUJTTG4rsXBcz41YzQ==` | 精确依赖 `0.16.1` | 只升级到 registry 的精确 `0.17.1`；不使用 Git `main` 或发布后的未审计提交 |
| Desktop reference | `master` 为 `ce14524a5614f72bf0e7a72433c2a692f644d213`；最新 tag 仍为 `v2.0.3` / `681ba66091fc5b1e827650137f69b3ee4c435922` | 本 fork `v2.0.11` | 继续只读对照，不整体合并、不覆盖根 README，也不作为运行时依赖 |

升级前 outer 回滚点为 `21a1f6a0a9cad05af3a19ad52ac7c892db1c6298`；submodule gitlink 必须保持 `b150a551…`。本批次只允许 Sidebar `0.17.1`、其消费侧回归、About 更新状态 contract 及 `2.0.12` 发布资料进入 release。若 rc2 Loader/Profile、pinned terminal、Workspace/Recovery、完整 `check` 或 Windows installer verifier 任一 P0 门禁失败，则恢复 `0.16.1` 精确依赖并记录阻塞，不推进 tag 或 Release。

复核命令：

```powershell
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/deepseek-ai/deepseek-harness.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --heads --tags https://github.com/deepseek-ai/deepseek-harness.git
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/omdsh-dev/DSH-better-sidebar.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --heads --tags https://github.com/omdsh-dev/DSH-better-sidebar.git
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/anywhere-labs/deepseek-harness-desktop.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --heads --tags https://github.com/anywhere-labs/deepseek-harness-desktop.git
gh release view v0.17.1 --repo omdsh-dev/DSH-better-sidebar --json tagName,targetCommitish,publishedAt,url,isDraft,isPrerelease
npm view dsh-better-sidebar version dist-tags dist.integrity time peerDependencies --json
npm view @deepseek-ai/dsh version dist-tags time --json
npm view @deepseek-ai/dsh@0.1.2-alpha.1 version --json
npm view @deepseek-ai/dsh-base@0.1.2-alpha.1 version --json
npm view @deepseek-ai/dsh-web-app@0.1.2-alpha.1 version --json
git submodule status -- deepseek-harness
```

## 2026-08-29 参考桌面 v2.0.4 选择性接入前审计

本批次重新核对三条权威 Git remote、GitHub Release、npm registry 和本地 pin。参考桌面与本 fork 都使用过 `v2.0.3` / `v2.0.4`，因此参考 tag 只写入 `refs/remotes/upstream/tags/*`；不得用普通 `git fetch --tags` 覆盖或误读本产品同名 tag。参考仓库的旧 URL 仍可拉取，但 GitHub Release 已重定向到 `anywhere-labs/dsh-desktop`。

| 组件 | 2026-08-29 远端/registry 证据 | 本地基线 | 本批次决策 |
| --- | --- | --- | --- |
| DeepSeek Harness | `master` / prerelease tag `dsh-v0.1.2-alpha.1` 为 `cd5ef8148158c3a752a658978873241fdf8e2bbc`；alpha Release 发布于 `2026-08-27T17:06:37Z`；npm `@deepseek-ai/dsh` 的 `latest/next` 仍为 `0.1.1-rc.2`，修改时间 `2026-08-28T06:35:05.426Z` | submodule `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，正式 package family `0.1.1-rc.2` | alpha 源码没有对应的完整 npm 发布面；不更新 submodule、package family、Remote gateway 或 Client contract |
| Better Sidebar | `main` 为 `3941bd5f3ad32f37fdb109657dd44cc6d289fe4e`；正式 Release `v0.17.1` 发布于 `2026-08-28T08:04:54Z`；npm `latest` 为 `0.17.1`，integrity `sha512-7me2X6w+ecbzAMEHtuWkSPUrfLDLTBvL9qugzgBbg1FyWyy2dzS9QNDvnZjjkst4kr4LjUJTTG4rsXBcz41YzQ==` | 精确依赖 `0.17.1` | 本批次不更新 Sidebar 或其 patch baseline |
| Desktop reference | `master` 为 `b9758b4346f6a806e4407873c5269b9989a39fbe`；namespaced `v2.0.3` / `v2.0.4` 分别为 `681ba66091fc5b1e827650137f69b3ee4c435922` / `d29bf7a965fc68bf09750bc329905ecb17afe48b`；`v2.0.4` Release 发布于 `2026-08-28T17:54:51Z` | 本 fork HEAD `4f9ee70f339819ed36492869a9debb3f4edd2628`，已发布 `v2.0.12` | 只审计 Desktop 所有权且兼容 rc2 的改进；不整体 merge、不 cherry-pick 产品耦合提交、不复制 README/品牌/下载地址 |

`ce14524a5614f72bf0e7a72433c2a692f644d213..refs/remotes/upstream/tags/v2.0.4` 的 10 个非 merge 提交和 `v2.0.4..master` 的 1 个未发布提交分类如下：

| 参考提交 | Finding | Path |
| --- | --- | --- |
| `029d7c7aa8` | 将运行中升级的优雅退出等待从 6 秒延长到 30 秒 | 与前置 quit handoff 一起建立本产品测试和实现；不能只复制常量 |
| `4a78015dd9`、`06f3b91ea4` | 7z 原地解压和 legacy uninstaller code `2` 可缩短安装，但放弃默认较原子的替换语义 | 独立比较 ZIP、默认 7z 与原地解压；故障恢复未证明前保留当前 `nsis.useZip=true` |
| `8994c5acad`、`ad597a7aa9` | 参考实现增加 Profile 偏好状态，但绑定 setup wizard、LAN、Market 与 alpha 架构 | 先用本产品两个真实 Profile 复现 `mode`、`port`、`logLevel`；没有泄漏就不新增状态层 |
| `7d7295342a` | 动态 alpha CLI chunk 验证只服务源码 runtime | 暂缓到官方完整 npm family 的 v3 迁移批次 |
| `9cdb71b843` | setup wizard revision 升级后重跑 | 本产品没有 setup wizard/onboarding，不接入 |
| `fd6dd6c1c2` | 向参考项目私有版本服务发送 installed-version header | 本产品使用 GitHub Releases API，不接入私有 endpoint/header |
| `0780604e8b`、`f4dbf6d8c8` | 参考项目 release diff/style/version metadata | 不属于本 fork 产品行为，不接入 |
| `985bd4c6fb` | 未发布提交删除 Desktop PTY relay，依赖 alpha 上游 subprocess 修复 | rc2 仍需要 Windows ACL/Pwsh trampoline；不接入 |

本批次进入代码实验前的 outer 回滚点为 `4f9ee70f339819ed36492869a9debb3f4edd2628`。实验只允许修改 Desktop 自有安装器、测试和必要文档；`deepseek-harness/` gitlink、正式 `@deepseek-ai/dsh-*` `0.1.1-rc.2` family、`dsh-better-sidebar@0.17.1` 和根 README 必须保持不变。若运行中升级不能在不误杀进程、静默覆盖或破坏恢复的前提下通过，或 Profile 泄漏无法复现，则保留审计结论而不发布 `2.0.13`。

复核命令：

```powershell
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/deepseek-ai/deepseek-harness.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/omdsh-dev/DSH-better-sidebar.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote --symref https://github.com/anywhere-labs/deepseek-harness-desktop.git HEAD
git -c http.proxy=http://127.0.0.1:10808 ls-remote https://github.com/anywhere-labs/deepseek-harness-desktop.git refs/tags/v2.0.3 refs/tags/v2.0.4
git fetch upstream master refs/tags/v2.0.3:refs/remotes/upstream/tags/v2.0.3 refs/tags/v2.0.4:refs/remotes/upstream/tags/v2.0.4 --prune
npm view @deepseek-ai/dsh version dist-tags time.modified --json
npm view @deepseek-ai/dsh-base version dist-tags time.modified --json
npm view dsh-better-sidebar version dist-tags time.modified dist.integrity --json
git submodule status -- deepseek-harness
```
