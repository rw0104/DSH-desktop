# 分阶段开发记录

> 本文记录从方案文档进入代码实现后的阶段性结果。每个阶段都记录范围、改动、验证和未完成项，避免把未验证的功能当作完成状态。

## 2026-08-17：P0 版本与仓库基线

### 范围

- 以 DSH Desktop `v2` 分支作为目标仓库初始代码基线。
- 将远程仓库切换为 `https://github.com/rw0104/-DSH-desktop.git`。
- 保留 `deepseek-harness/` 为固定上游 Git 子模块，不修改其源码。
- 将可行性分析和开发任务规划纳入仓库。

### 结果

- 当前分支：`main`。
- 基线提交：上游 DSH Desktop `v2` 的 shallow commit `5968db6`。
- 文档提交：`728e68f docs: add feasibility analysis and development plan`。
- 运行时：Node `v24.16.0`、Yarn `4.18.0`。
- Yarn 使用 `node-modules` linker，并关闭未审查 install scripts。

### 验证

- `corepack yarn install --immutable`：通过。
- `corepack yarn workspace dsh-plugin-desktop typecheck`：通过。
- 根级 `corepack yarn check`：暂未通过，原因是上游子模块尚未 checkout。

### 环境限制与恢复

首次安装阶段的 `git submodule update --init --recursive` 因 GitHub 连接重置失败；随后重试成功，`deepseek-harness` 已 checkout 到 `47f943859bef60e4160492346772ded9b24f765a`，状态干净。Windows checkout 曾把 `CLAUDE.md` 还原为普通文件，已恢复为仓库要求的 `AGENTS.md` 符号链接。

恢复后 `corepack yarn check:layout` 通过。完整根级 `check` 仍需关注上游现有的 Windows 路径/权限测试差异，不能用它替代本阶段的包级验证。

## 2026-08-17：P2-01/P2-02 默认插件组合

### 范围

- 将 Vision Toolkit `0.1.24` 和 Better Sidebar `0.12.3` 固定为桌面 Profile 的产品插件。
- 保持用户第三方插件顺序，并消除用户已经安装的同名插件重复项。
- 修复 `react-dom` peer 供给，保证 Sidebar 的 React 运行时契约明确。
- 对两个刚发布的产品插件增加 Yarn 精确版本预批准，保留其他依赖的最小发布年龄门禁。

### 代码改动

- `dsh-plugin-desktop/src/profile.ts`：新增 `DEFAULT_DESKTOP_PLUGIN_BUNDLES`，并在 `desktopBundleList()` 中统一插入和去重。
- `dsh-plugin-desktop/package.json`：加入 Vision、Sidebar、React DOM 的精确依赖。
- `.yarnrc.yml`：只预批准两个已审查的精确插件版本。
- `dsh-plugin-desktop/tests/profile.spec.ts`：覆盖默认顺序、重复安装、Profile 修复和用户禁用行为。
- `yarn.lock`：记录新增插件及其依赖闭包。

### 验证

- `corepack yarn install`：通过，插件依赖成功解析和链接。
- `corepack yarn workspace dsh-plugin-desktop exec vitest run tests/profile.spec.ts`：12 个测试通过。
- `corepack yarn workspace dsh-plugin-desktop typecheck`：通过。
- `corepack yarn workspace dsh-plugin-desktop build`：通过。
- `corepack yarn workspace dsh-plugin-desktop verify:profile`：通过，Profile/Host/Web 组装 smoke 可运行，renderer manifest 包含两个产品插件的 client entries。
- `corepack yarn workspace dsh-plugin-desktop verify:loader`：通过，桌面插件和 Profile-local Loader smoke 可运行。
- `corepack yarn workspace dsh-plugin-desktop verify:cli`：通过，Electron-backed CLI 和 pnpm shim smoke 可运行。
- `corepack yarn workspace dsh-plugin-desktop verify:closure`：通过，197 个 first-party runtime 节点闭包完整。

### 未完成项

- 还没有在真实 DSH Web/Headless Profile 中做插件挂载 E2E。
- 还没有验证 Better Sidebar 与 Desktop Advanced Shell 的联合布局。
- Vision 的 Python、Chrome、远程 Endpoint 和数据告知仍属于 P4。
- 本阶段已完成本地 Git 提交；远程同步状态见文档末尾的“远程提交状态”。

## 下一阶段

P2-03/P2-05 的 Profile、Loader、CLI、runtime closure 和 renderer manifest smoke 已经通过。当前进入 P3-07：验证 Advanced Shell 的侧栏/详情宽度偏好跨重启恢复，再继续做 Codex-like 视觉层和截图回归。

## 2026-08-17：P3-07 Advanced Shell 布局持久化

### 范围

- 保存侧栏宽度、详情面板宽度和收起状态。
- 不保存窄窗口检测结果和临时窄屏展开状态。
- 让浏览器 `localStorage` 成为可选依赖，存储不可用时布局仍可工作。

### 代码改动

- `dsh-plugin-desktop/src/client/layout-storage.ts`：新增最小存储接口和安全的浏览器存储探测。
- `dsh-plugin-desktop/src/client/layout-state.ts`：新增版本化布局快照读写、数值校验和持久化边界。
- `dsh-plugin-desktop/src/client/advanced-shell.ts`：为 Advanced Shell 注入可选布局存储。
- `dsh-plugin-desktop/tests/client-environment.spec.ts`：覆盖恢复、窄屏状态隔离和损坏快照回退。

### 验证

- `corepack yarn workspace dsh-plugin-desktop exec vitest run tests/client-environment.spec.ts`：12 个测试通过。
- `corepack yarn workspace dsh-plugin-desktop typecheck`：通过。
- `corepack yarn workspace dsh-plugin-desktop build`：通过。
- `corepack yarn workspace dsh-plugin-desktop verify:profile`：通过。

### 未完成项

- 尚未在真实 Electron BrowserWindow 中做多窗口、多显示器和系统主题截图回归。
- 尚未把布局快照和 DSH Profile/Session 做更细粒度的关联；当前是桌面用户级布局偏好。

## 2026-08-17：P3-01/P3-04 Codex-like 工作区控制条

### 设计决策

采用“安静的开发者工作台”方向：控制条只承担工作区切换，不复制 Codex 品牌资产，不创建嵌套卡片或自定义窗口材质。样式消费 DSH Theme Token，使用系统字体回退，按钮不设置网页式手型光标，焦点和 pressed 状态可见。

### 代码改动

- `dsh-plugin-desktop/src/client/DesktopControlStrip.tsx`：新增 Sidebar/Details 工作区切换控制。
- `dsh-plugin-desktop/src/client/control-strip-styles.ts`：隔离控制条样式，保持单文件长度和职责边界。
- `dsh-plugin-desktop/src/client/AdvancedFrame.tsx`：将控制条挂到中央 conversation surface 顶部。
- `dsh-plugin-desktop/src/client/styles.ts`：组合产品控制条样式，并保留 reduced-motion 规则。
- `dsh-plugin-desktop/tests/client-environment.spec.ts`：验证样式包含控制条、pressed 状态和原生标题栏约束。

### 验证

- `corepack yarn workspace dsh-plugin-desktop typecheck`：通过。
- `corepack yarn workspace dsh-plugin-desktop exec vitest run tests/client-environment.spec.ts`：12 个测试通过。
- `corepack yarn workspace dsh-plugin-desktop build`：通过。
- `corepack yarn workspace dsh-plugin-desktop verify:profile`：通过。
- `corepack yarn workspace dsh-plugin-desktop verify:product-plugins`：通过。

### 未完成项

- 尚未通过真实 Electron BrowserWindow/Playwright 截图确认在 macOS 和 Windows 标题栏下不遮挡 DSH Conversation Header。
- 尚未完成命令搜索、全局快捷键、窄屏抽屉和无障碍端到端检查。

## 2026-08-17：P4-01/P4-02 Vision 隐私同意和 Profile 停用

### 范围

- 打包应用首次启动前，用原生 Electron dialog 告知 Vision Toolkit 的图片外发边界。
- 接受后启用 Vision；拒绝后仍启动 DSH 和 Sidebar，但禁用 `vision-toolkit` Loader row。
- 将决定保存为版本化 JSON，使用原子写入和用户私有目录。
- 开发模式、headless smoke 和已接受状态不重复阻塞启动；拒绝状态下下一次打包启动可以重新选择。

### 代码改动

- `dsh-plugin-desktop/src/vision-consent.ts`：新增纯 Node 的读取、原子写入和决策解析模块。
- `dsh-plugin-desktop/src/main.ts`：在 Profile 组装前调用原生隐私 dialog，失败时 fail-closed 禁用 Vision。
- `dsh-plugin-desktop/src/profile.ts`：增加 `visionEnabled` 产品选项并在最终 patch 层禁用 Vision row。
- `dsh-plugin-desktop/tests/vision-consent.spec.ts`：覆盖开发模式、首次接受、拒绝后重新选择、损坏状态和版本化写入。
- `dsh-plugin-desktop/tests/profile.spec.ts`：覆盖 consent declined 的 Profile 结果。

### 验证

- `corepack yarn workspace dsh-plugin-desktop typecheck`：通过。
- `corepack yarn workspace dsh-plugin-desktop exec vitest run tests/profile.spec.ts tests/vision-consent.spec.ts`：17 个测试通过。
- `corepack yarn workspace dsh-plugin-desktop build`：通过。
- `corepack yarn workspace dsh-plugin-desktop verify:profile`：通过。
- `corepack yarn workspace dsh-plugin-desktop verify:product-plugins`：通过。

### 未完成项

- 还没有把 consent 状态接入设置页面或托盘菜单；当前拒绝后会在下一次打包启动再次询问。
- 还没有验证真实视觉请求、429、Python 缺失和 Chrome 缺失的 UI 恢复路径。

## 2026-08-17：P3/P5 Electron BrowserWindow 截图回归

### 范围

- 启动真实 Electron `43.4.0` BrowserWindow，而不是仅渲染 React 单测。
- 使用临时 `DSH_HOME`、独立 CDP `9223` 和 `--headless`，不污染用户配置。
- 通过 CDP 检查页面 URL、DSH boot entries、控制条文本和按钮 pressed 状态，并捕获 PNG。

### 证据

- [Electron 截图目录](./evidence/electron/README.md)
- compatibility 模式：关闭内测声明后官方 DSH UI 正常渲染，控制条按设计不存在。
- advanced 模式：控制条显示 `Workspace / Sidebar / Details`。
- 点击 Sidebar 和 Details 后：CDP 读取两个按钮 `aria-pressed=true`，截图显示左侧工作区展开且中央输入区没有被遮挡。

### 可复现命令

```powershell
$env:DSH_HOME = 'D:\\Demo\\DHS\\.tmp-electron-dsh-home'
$electron = (Resolve-Path 'dsh-plugin-desktop/node_modules/electron/dist/electron.exe').Path
& $electron 'dsh-plugin-desktop/lib/main.js' --headless --no-sandbox --remote-debugging-port=9223
node scripts/electron-cdp-smoke.mjs 'docs/evidence/electron/advanced-sidebar-details.png' --toggle-sidebar --toggle-details
```

### 未完成项

- 当前证据是在 Windows headless Electron 上采集；macOS arm64/x64 仍需真机截图。
- 还需要把页面错误、console error、窗口尺寸和主题切换纳入自动化断言。

## 2026-08-17：P4-03/P4-04 Vision Python 和浏览器健康检查

### 范围

- 探测 Python `3.11+`，支持 `DSH_VISION_PYTHON`、`python`、`python3` 和 Windows `py -3`。
- 探测用户配置路径和常见 Chrome、Chromium、Edge 安装路径。
- Python 是总体运行前置；浏览器只影响 `vision_html_screenshot`，缺失时返回 warning 而不是误报全部 Vision 不可用。
- `--require-browser` 可用于发布机或 HTML 截图专用门禁。

### 代码改动

- `dsh-plugin-desktop/scripts/verify-vision-runtime.mjs`：新增跨平台探测和 JSON 报告。
- `dsh-plugin-desktop/scripts/vision-runtime.spec.mjs`：覆盖版本解析、最低版本、浏览器可选和不支持版本。
- `dsh-plugin-desktop/package.json`：新增 `verify:vision-runtime` 命令。
- [Windows 健康报告](./evidence/vision-runtime/windows.json)：不含凭据或业务内容。

### 验证

- `node --test scripts/vision-runtime.spec.mjs`：4 个测试通过。
- `corepack yarn workspace dsh-plugin-desktop verify:vision-runtime`：Python `3.12.10`、Chrome 可用、总体 OK。
- `corepack yarn workspace dsh-plugin-desktop exec node scripts/verify-vision-runtime.mjs --require-browser`：通过。

### 未完成项

- 尚未把健康报告接入 Vision Settings 页面或桌面托盘。
- 尚未在 macOS arm64、macOS x64 和无浏览器环境执行真实机矩阵。

## 2026-08-17：P5/P6 Headless 发布门禁聚合

### 范围

- 将布局、类型、目标测试、runtime closure、CLI、Loader、Profile、插件闭包和 Vision runtime 组合成一个 headless-safe release gate。
- Windows 下使用显式 `cmd.exe /d /s /c` 启动 Yarn，不使用带弃用警告的 `shell:true`。
- 门禁不依赖 GUI，也不把当前上游 Windows 平台路径测试的已知差异混入产品发布阻塞项。

### 代码改动

- `dsh-plugin-desktop/scripts/verify-release-readiness.mjs`：新增发布前检查聚合器。
- `dsh-plugin-desktop/package.json`：新增 `verify:release-readiness` 命令。

### 验证

- `corepack yarn workspace dsh-plugin-desktop verify:release-readiness`：通过。
- 通过项：layout、typecheck、29 个目标测试、runtime closure、CLI smoke、Loader smoke、Profile smoke、product plugin closure、Vision runtime。
- 运行时没有 shell 安全弃用警告。

### 未完成项

- 仍需在 macOS arm64/x64 真机执行签名、公证、DMG 和原生窗口矩阵。
- 仍需在干净 Windows 环境执行 NSIS 安装、升级、卸载和 SmartScreen 验证。

## 2026-08-17：P6 Windows x64 unpacked packaging

### 过程

- 首次 `package:dir` 因 `node-pty` 被 Electron Builder 重新编译，触发本机缺失 Spectre-mitigated libraries 的 MSB8040。
- 检查确认 `node-pty@1.1.0` 已携带 `prebuilds/win32-x64` 的 `pty.node`、ConPTY 和 winpty 文件。
- `package-dir.mjs` 改为显式传递 `--config.npmRebuild=false` 和 `--publish never`，让本地 smoke 使用已审查的预编译模块，不触发源码编译或发布网络。

### 验证

- `corepack yarn workspace dsh-plugin-desktop package:dir`：通过。
- Electron Builder：Windows x64、Electron `43.4.0`、`win-unpacked` 完成。
- AfterPack packaged-runtime gate：通过，`app.asar`、`app.asar.unpacked`、桌面入口和 `node-pty` 物理条目存在。
- [Windows unpacked 制品报告](./evidence/release/windows-dir.json)：包含入口、ASAR、unpacked runtime、文件数和总字节数。

第一次直接启动 `dist/win-unpacked/DSH Desktop.exe` 在 8 秒观察窗口内只创建了 DevToolsActivePort，没有 page target。增加 Chromium file logging 并延长等待后，packaged BrowserWindow 正常出现，已完成 onboarding、Advanced 控制条和 Sidebar/Details 操作截图；首轮延迟现象保留为启动时序风险。

### 未完成项

- 未签名 NSIS 安装包、Authenticode、干净机安装/升级/卸载和 SmartScreen 仍未验证。
- macOS arm64/x64 DMG、Developer ID、公证和 universal 原生模块仍需原生 macOS 主机。

## 2026-08-17：P6 Windows x64 NSIS smoke

### 验证

- `corepack yarn workspace dsh-plugin-desktop dist:win`：通过。
- Windows-safe package gate：101 个测试通过，1 个跳过；runtime closure 197 个 first-party nodes 通过。
- Electron Builder：生成未签名 `DSH-Desktop-2.0.0-x64-Setup.exe` 和 blockmap。
- `verify-win-installer.ts`：unpacked application 和 NSIS installer 的 PE header 验证通过。
- [Windows installer 制品报告](./evidence/release/windows-installer.json)：记录 installer、unpacked executable 和 blockmap 大小。

### 未完成项

- 制品明确未签名，仍需 Authenticode、干净 Windows 安装、升级、卸载和 SmartScreen 验证。
- macOS arm64/x64 DMG、Developer ID、公证和 universal 原生模块仍需原生 macOS 主机。

## 2026-08-17：P6 Windows packaged memory sample

### 结果

- Windows x64 packaged Advanced BrowserWindow 空闲启动样本包含 main、GPU、utility 和 renderer 进程。
- 总 Working Set：约 `555.1 MiB`。
- 总 Private Memory：约 `413.0 MiB`。
- [内存样本报告](./evidence/release/windows-memory.json)。

这说明当前 Electron + DSH + 插件组合不是轻量小工具。安装器约 `150.9 MiB`，安装目录约 `548.3 MiB`，其中 `app.asar.unpacked` 约 `194.6 MiB`。后续需要把空闲、对话、终端、浏览器和 Vision 任务分开测量，不能用单一数字宣称最终性能。

## 2026-08-17：P5-07 资源和内存预算门禁

### 范围

- 安装器预算：`220 MiB`。
- Windows unpacked 目录预算：`650 MiB`。
- Packaged Private Memory 预算：`512 MiB`。
- Packaged Working Set 预算：`700 MiB`。

### 代码改动

- `dsh-plugin-desktop/scripts/verify-package-footprint.mjs`：读取 Windows 制品和内存报告并检查预算。
- `dsh-plugin-desktop/scripts/verify-package-footprint.spec.mjs`：覆盖预算常量和超限失败。
- `dsh-plugin-desktop/scripts/verify-release-readiness.mjs`：加入 footprint gate；没有制品时允许 headless checkout 跳过，已有制品时必须通过。

### 验证

- `node --test scripts/verify-package-footprint.spec.mjs`：2 个测试通过。
- `corepack yarn workspace dsh-plugin-desktop verify:package-footprint`：通过，当前 Windows 样本为 installer `150.9 MiB`、unpacked `548.3 MiB`、Private Memory `413 MiB`、Working Set `555.1 MiB`。

## 远程提交状态

本地 `origin` 已确认是 `https://github.com/rw0104/DSH-desktop.git`。当前本地 `main` 保留完整分阶段提交；由于上游历史较大，本环境对直接完整历史 push 多次重置连接。另生成了 `publish-main` 精简发布链，最终树与本地 `main` 一致，不改写本地开发分支。

后续使用精简发布链完成推送，远程 `main` 当前为 `3efdd2f9ce6fdbe77ec8d43528973065440df272`。远程文件树与本地 `main` 一致；本地完整分阶段历史仍保存在 `main`，远程发布链保留对应的阶段提交信息但使用新的精简 commit id。

## 2026-08-17：性能优化与 Windows 制品复测

### 诊断结论

- 在首次空白 DSH Home 上，Vision Toolkit 原先会在 Cordis boot 关键路径同步准备 Python 运行时；开发 Electron 计时显示 boot 从约 `2.9 s` 延长到约 `13.4 s`。
- 正常缓存启动的 packaged BrowserWindow 约 `2.2–3.0 s`；未签名制品的首次启动约 `13.2 s`，第二次启动约 `2.2 s`，说明冷启动额外耗时主要来自 Windows 对 Electron/native 二进制的首次扫描和缓存建立。
- 当前安装目录包含约 `25,341` 个文件；NSIS 静默安装实测约 `168 s`，主要受物理依赖树写入和 Windows Defender/未签名扫描影响。

### 代码与制品优化

- 为 Vision Toolkit `0.1.24` 增加仓库内 Yarn patch：运行时准备改为后台初始化，Settings/Web 路由先可用，运行时就绪后再注册视觉工具；失败仍保留原有错误状态，不隐藏设置入口。
- 将构建期 `sharp` 移到根级开发依赖，并在 Electron Builder `files`/`asarUnpack` 中排除 `sharp` 与 `@img`，避免把构建用的全平台图像 native 二进制带给客户。
- Windows x64 NSIS 复测结果：安装器约 `145.3 MiB`，unpacked 目录约 `530.5 MiB`；相较基线安装器 `150.9 MiB`、unpacked `549.4 MiB`，分别减少约 `5.6 MiB` 和 `18.9 MiB`。

### 验证

- `42` 个包级回归测试通过，类型检查通过，Vision/Sidebar 产品插件门禁通过。
- Windows-safe package gate：`101` passed、`1` skipped；runtime closure `197` 个 first-party nodes 通过。
- 真实 packaged Electron BrowserWindow/CDP 截图通过：`Workspace / Sidebar / Details` 控制条存在，Sidebar 与 Details 均为 `aria-pressed=true`，输入区未被遮挡。
- [最终 Windows 目录报告](./evidence/release/windows-dir.json)、[最终 Windows 安装器报告](./evidence/release/windows-installer.json)、[最终 Electron 截图](./evidence/electron/packaged-advanced-final.png)。

### 发布注意

- 当前 Windows 制品仍未完成 Authenticode 签名；未签名状态会放大首启和安装阶段的 SmartScreen/Defender 延迟。签名、干净机安装/升级/卸载和 SmartScreen 仍是发布前置条件。
- macOS arm64/x64 原生模块、签名、公证和对应性能矩阵尚未在本 Windows 环境验证，不能据此宣称跨平台发布完成。

## 2026-08-17：P0-05/P5-05 产品插件版本门禁

### 范围

- 校验 `package.json` 中的 Vision/Sidebar 精确版本。
- 校验实际解析到的 `node_modules` manifest 版本。
- 校验两个插件都携带官方 `cordis.patch.yml` bundle patch。

### 代码改动

- `dsh-plugin-desktop/scripts/verify-product-plugins.mjs`：新增产品插件闭包验证脚本。
- `dsh-plugin-desktop/package.json`：将该脚本加入 `check` 门禁。

### 验证

- `corepack yarn workspace dsh-plugin-desktop verify:product-plugins`：通过，2 个精确版本插件已安装且带 bundle patch。

### 未完成项

- 还没有生成完整的第三方传递依赖许可证清单和 SBOM 制品。

## 2026-08-17：启动反馈与 Windows 真实盘符回归

### 修复

- Electron 在 `whenReady` 后、DSH Boot 前创建原生“正在启动 DSH Desktop”反馈窗口；主 BrowserWindow 完成挂载后关闭，失败时改为显示原生错误框。
- Windows 盘符下拉不再生成固定的 `C:` 到 `Z:` 列表。Host 启动时通过 `fs.existsSync("X:\\")` 探测当前用户可见卷，并将去重后的盘符通过 renderer URL 传入；本机实测为 `CDE`。
- CDP smoke 支持可配置端口、目录选择器操作和下拉选项输出；Profile smoke 改为解析 URL 并验证新增 marker，不再因合法查询参数误报失败。

### 验证

- 真实 packaged Electron 页面 URL：`dsh-desktop-mode=advanced&dsh-desktop-platform=win32&dsh-desktop-drives=CDE`。
- 启动反馈窗口与主窗口的冷启动观测已通过；缓存启动约 `2–6 s`，未签名安装器仍可能受 Defender/SmartScreen 扫描影响。
- `verify:release-readiness` 全部 headless gate 通过；最新安装器为 `dist/DSH-Desktop-1.0.0-x64-Setup.exe`，约 `145.3 MiB`。
