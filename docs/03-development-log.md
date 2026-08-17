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
- 目标仓库尚未完成本阶段 Git 提交和远程推送。

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

一次直接启动 `dist/win-unpacked/DSH Desktop.exe` 的 headless packaged BrowserWindow 只创建了 DevToolsActivePort，没有在观察窗口内产生 page target，因此暂不计为 packaged UI 回归通过；需要下一阶段增加 packaged 启动日志和 profile boot 诊断。

### 未完成项

- 未签名 NSIS 安装包、Authenticode、干净机安装/升级/卸载和 SmartScreen 仍未验证。
- macOS arm64/x64 DMG、Developer ID、公证和 universal 原生模块仍需原生 macOS 主机。

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
