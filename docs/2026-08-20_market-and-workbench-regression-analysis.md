# 社区市场与右侧工作台回归修复记录

> 日期：2026-08-20
> 基线：`sync/upstream-composed`，`v2.0.4`，`723c9c3bdf`
> 状态：已实现、已通过 headless gate、已完成 Windows x64 安装包验证。
> 适用边界：不修改 `deepseek-harness/` 子模块；所有桌面行为由 `dsh-plugin-desktop/` 和根仓库补丁承担。

## 结论

本轮解决了两条相互关联但根因不同的回归：

1. Community Market 的运行链路本来已经存在，但页面帮助链接、包元数据、Issue 和文档入口仍指向 `anywhere-labs/deepseek-harness-desktop`。本轮统一到产品仓库 `rw0104/DSH-desktop`，目录条目中的第三方 `owner`、`provider` 和 `repository` 保持原样。
2. 右侧 Workbench 的 Host 服务、Changes、Terminal registry 和 Worktree route 没有被删除，旧的 Changes UI 却只向已从 profile 移除的 `betterSidebar` 注册，导致入口静默消失。本轮新增 Desktop-owned `shell.overlay` surface，跨 `compatibility` 和 `advanced` 模式提供 Changes、Terminal projection、Worktree/Environment 和固定右侧入口。
3. 工作区目录行现在有稳定的 `data-dsh-workspace-path` 标记。右键目录会显示 Desktop 菜单，选择“打开目录”后调用现有 `ctx.workspaces.openPath(path)`，由 Host 使用系统默认文件管理器打开，不执行 Renderer 拼接的命令。

Worktree 面板采用桌面宽度预留策略：面板打开时根内容为动态面板宽度预留空间，避免 fixed surface 遮挡会话内容；窄屏保留覆盖式面板并隐藏拖动条。

## 回归原因

### 市场归属漂移

Market 页面已经实现目录读取、来源管理、安装预览、受管安装/卸载、receipt、启用/禁用、重启请求和失败恢复。未完成的是产品身份收口：帮助入口和三个包的 metadata 沿用了上游仓库地址。

测试 fixture 中仍出现 `anywhere-labs/deepseek-harness-desktop`，它们模拟第三方目录来源，不能机械替换。产品仓库链接与市场条目来源链接现在是两个概念：前者由 `dsh-community-market/src/client/product-links.ts` 提供，后者继续从 catalog identity 读取。

### Workbench 入口断链

同步 rc8 后，`dsh-better-sidebar` 被标记为 obsolete，`profile.ts` 不再把它作为内置能力。旧代码在 `dsh-plugin-desktop/src/client/index.ts` 中通过 `ctx.get('betterSidebar')` 注册 Changes；service 缺失时返回 no-op disposer，因此启动不崩溃，但 UI 也没有任何入口。

原有 `WorkspaceWorkbenchService`、Changes/Review route、Terminal registry、Worktree service 和 `WorkspaceChangesTab` 仍然存在。`AdvancedFrame` 的 `details` slot 也仍存在，但没有 Desktop-owned consumer，而且默认 compatibility 模式不会渲染 `AdvancedFrame`。因此问题是 presentation/provider 迁移顺序错误，不是两天 Host 开发被浪费，也不是 CSS 隐藏。

### 目录右键需求

上游 Workspace browser 的 `ProjectRowItem` 原先只有 role 和文本，没有可供 Desktop 安全识别的 workspace path。根仓库已有 `patches/dsh-client-ui-workspace@0.1.0-rc.8.patch`，本轮在同一补丁中增加 `data-dsh-workspace-id` 和 `data-dsh-workspace-path`，不直接编辑上游子模块。

## Evidence、Finding 与 Path

### Evidence

| ID | 证据 | 重现命令或来源 | 结果 |
| --- | --- | --- | --- |
| E-001 | Market 页面内置文档与反馈链接已集中到产品仓库 | `rg -n "DSH_DESKTOP_ISSUES_URL|INSTALL_REQUIREMENTS_DOCS|CATALOG_ADAPTER_GUIDE_DOCS" dsh-community-market/src/client` | `product-links.ts` 提供 `rw0104/DSH-desktop` 基址 |
| E-002 | Desktop 客户端不再依赖 `betterSidebar`，而是注册 `shell.overlay` | `rg -n "betterSidebar|desktop-workbench|shell.overlay" dsh-plugin-desktop/src/client` | 旧 registry 引用移除，WorkBench 注册可见 |
| E-003 | Workspace 依赖补丁包含稳定目录路径标记 | `corepack yarn install --immutable`；`corepack yarn workspace dsh-plugin-desktop vitest run tests/package.spec.ts` | 补丁 hash 锁定，installed client 含 `data-dsh-workspace-path` |
| E-004 | Desktop targeted tests | `corepack yarn workspace dsh-plugin-desktop vitest run tests/client-desktop-workbench.spec.ts tests/client-environment.spec.ts tests/package.spec.ts --maxWorkers=1` | 3 files, 41 tests passed |
| E-005 | Market full tests | `corepack yarn workspace dsh-community-market vitest run`（由 root check 执行） | 19 files, 268 tests passed |
| E-006 | Desktop full tests | `corepack yarn check` | 71 files, 669 passed, 11 skipped, 0 failed |
| E-007 | Packaged Electron DOM/screenshot | Playwright CDP `http://127.0.0.1:9338` 连接 `dist/win-unpacked/DSH Desktop.exe` | Workbench 组件 1 个，Changes/Terminal/Worktree tab 3 个；截图见 `docs/evidence/electron/workbench-visible-v2.0.4.png` |
| E-008 | 右键菜单事件链 | 在 packaged DOM 临时挂载带 `data-dsh-workspace-path` 的 row，派发 `contextmenu` 事件 | `.dshDesktopWorkspaceContextMenu` 1 个，`role=menuitem` 1 个，截图见 `docs/evidence/electron/workbench-context-menu-v2.0.4.png` |
| E-009 | Windows x64 unsigned installer | `DSH_PACKAGE_CHECK_ALREADY_RAN=1 corepack yarn dist:win` | verifier 通过；产物 209,567,123 bytes，SHA-256 `930389B3FBB9B17618479D6E8A61CA3D357B104908149E501ECABFCB6DB25C0A` |

### Findings

| ID | 结论 | 严重性 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| F-001 | Market 产品支持和 package metadata 指向错误维护仓库 | medium | 已修复 | E-001、E-005、E-006 |
| F-002 | Changes UI 依赖已移除的 Better Sidebar provider，造成右侧入口不可达 | high | 已修复 | E-002、E-004、E-006、E-007 |
| F-003 | Workspace project row 缺少 Desktop 可消费的安全路径标记 | medium | 已修复 | E-003、E-004、E-008 |
| F-004 | fixed Workbench 未预留中心内容宽度会造成遮挡 | medium | 已修复 | E-007 |

### Call paths

#### P-001 Workbench render path

1. `dsh-plugin-desktop/src/client/index.ts` 通过 `ctx.slots.inject('shell.overlay', ...)` 注册 `DesktopWorkbench`，证据 E-002。
2. `DesktopWorkbench` 使用 `useSessions` 读取当前 Session，按 tab 渲染 `WorkspaceChangesTab`、Terminal projection 或 Worktree route，证据 E-004、E-007。
3. 打开状态和宽度写入 `dsh.desktop.workbench.v1`；打开时 body 设置动态宽度，`#root` 为右侧 surface 预留空间，证据 E-007。

#### P-002 Workspace context-menu path

1. Yarn patch 将上游 `ProjectRowItem` 的 `row.cwd` 写入 `data-dsh-workspace-path`，证据 E-003。
2. `DesktopWorkbench` 在 capture 阶段监听 `contextmenu`，只接受带该标记的 DOM row，并将坐标限制在窗口范围内，证据 E-008。
3. 菜单项调用注入的 `ctx.workspaces.openPath(path)`；Renderer 不直接调用 Electron API 或执行 shell 命令，证据 E-008、E-006。

#### P-003 Market ownership path

1. `MarketSettingsTab` 从 `product-links.ts` 获取文档和 Issue URL，证据 E-001。
2. Market、Fabric、Desktop package metadata 和根仓库帮助入口统一指向 `rw0104/DSH-desktop`，证据 E-005、E-006。
3. catalog 第三方来源记录保持真实 provider/repository，避免把产品维护责任和插件来源身份混在一起。

## 本轮实现

### Desktop Workbench

- 新增 `dsh-plugin-desktop/src/client/DesktopWorkbench.tsx`。
- Changes tab 复用既有 hunk 展开、stage/unstage/revert、行级评论和 Session deep link。
- Terminal tab 使用 `/dsh-desktop/api/workspace/terminals`，展示 source、cwd、status、退出状态和 bounded output preview。
- Worktree tab 使用 `/dsh-desktop/api/workspace/worktrees`，展示 repository、checkout、branch、ownership，并通过 Host action 创建或移除受管 worktree。
- 面板关闭后保留右侧 launcher；面板宽度限定在 320–560px，窄屏下切换为覆盖式 surface。
- 菜单、tab、刷新、关闭和 resize 控件均提供 `aria-label`/`title`，支持 Escape 关闭上下文菜单，并遵循 reduced-motion。

### Market 与产品身份

- 新增 `dsh-community-market/src/client/product-links.ts`，集中维护产品仓库、Issue、安装指南和 catalog adapter guide。
- 更新 Market/Fabric/Desktop package metadata、README、FAQ、CONTRIBUTING 和 Issue template。
- 保留 `market-runtime.spec.ts`、`media-service.spec.ts` 中的第三方 `anywhere-labs` fixture，不改变 catalog identity 语义。

### 文档同步

- 更新 `docs/README.md`、`docs/02-development-plan.md` 和两个 Workbench 计划，明确 compatibility 模式也有 Desktop-owned overlay，Better Sidebar 只作为历史域兼容层。
- 本文件从“分析与恢复计划”更新为包含实现、证据、产物和残余风险的修复记录。

## 验证结果

已执行以下门禁，结果均为成功：

```powershell
corepack yarn install --immutable
corepack yarn check
corepack yarn workspace dsh-plugin-desktop typecheck
corepack yarn workspace dsh-plugin-desktop vitest run tests/client-desktop-workbench.spec.ts tests/client-environment.spec.ts --maxWorkers=1
corepack yarn build
$env:DSH_PACKAGE_CHECK_ALREADY_RAN='1'; corepack yarn dist:win
```

Root `check` 的关键结果为 Market 19/19 files、268/268 tests，Desktop 71/71 files、669 passed、11 skipped；`verify-runtime-closure` 验证 200 个 first-party runtime nodes 闭包，`verify-licenses` 检查 539 个 production packages。

Windows 安装器是 unsigned x64 NSIS 包，构建时明确跳过 Authenticode，专用 `verify-win-installer` 已通过。产物路径为 [`dsh-plugin-desktop/dist/DSH-Desktop-2.0.4-x64-Setup.exe`](../dsh-plugin-desktop/dist/DSH-Desktop-2.0.4-x64-Setup.exe)。

Packaged Electron 验证只在隔离 `DSH_HOME` 和 user-data 目录中运行。真实空 profile 没有可供右键的 Workspace 行，因此 E-008 使用临时 DOM row 验证事件链；生产 workspace row 的路径标记由 E-003 的安装后补丁测试覆盖。未把临时 DOM 验证表述成真实用户目录点击。

## 残余风险与非目标

- Terminal tab 当前是 Host projection，不重新创建 PTY；UI terminal 生命周期仍由已有 Host registry 和 adapter owner 驱动。
- Worktree create/remove 继续受 Host 的 repository dirty、ownership、managed-root 和 Session binding 检查约束；UI 不绕过这些检查。
- Artifacts、Tasks、Context Inspector 仍属于后续 W4/W5，不在本轮声称完成。
- 没有恢复 `dsh-better-sidebar`，没有修改 `deepseek-harness/`，也没有复制参考项目的品牌、图标或源码。
- Electron-builder 日志中的 optional dependency 警告是非 Windows 平台二进制的预期过滤；最终安装器 verifier 已通过。

## 发布门禁

后续上游同步或 profile composition 变更必须继续满足：

1. `corepack yarn check` 通过，且同时有 Host contract、route、Loader 和 packaged DOM 证据。
2. 干净 profile 在没有 Better Sidebar 的情况下能看到 Workbench launcher 或已打开的面板。
3. Workspace project row 保留 `data-dsh-workspace-path`，右键菜单不能接收没有该标记的任意 DOM 文本。
4. Market 产品链接、Issue、帮助、更新和包 metadata 全部指向 `rw0104/DSH-desktop`；第三方 catalog identity 单独保留。
5. 发布说明区分 Host capability、Desktop presentation 和仍在 roadmap 的域。
