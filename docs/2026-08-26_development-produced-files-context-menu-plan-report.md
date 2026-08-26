# 下一期开发规划：ProducedFiles 右键复制实际路径

> 本计划只定义下一期实现与验收，不在当前批次修改运行时代码。目标是让结束消息中的产物文件胶囊稳定支持右键菜单，并在未来 DeepSeek Harness 更新时做到“验证通过才发布、契约变化立即阻断”，而不是承诺未知上游版本永远无需适配。

## 目标结果

下一功能版本应交付以下行为：

- 左键文件胶囊继续打开文件；
- 右键文件胶囊打开官方样式的上下文菜单；
- 菜单提供“复制实际路径”和“复制文本内容”；
- `Shift+F10` 和键盘 Menu 键打开同一菜单；
- Esc、外部点击和选择命令关闭菜单，并恢复到原文件胶囊的焦点；
- 所有复制动作复用现有 Desktop Host 安全接口；
- 移除或替代当前相邻“路径/内容”按钮，恢复原生单行测量语义；
- 当前内核和以后每次受控升级都必须通过 UI、Host、Loader/Profile 和 packaged smoke 门禁。

## 不可突破的边界

| 边界 | 决策 |
| --- | --- |
| 组件所有权 | 文件胶囊由官方 `@deepseek-ai/dsh-client-ui-deliverables` 的 `ProducedFiles` 拥有 |
| 上游子模块 | `deepseek-harness/` 在 Desktop 功能分支保持只读 |
| Host 安全 | 不新增任意路径复制或任意文件读取能力 |
| 主点击 | 左键始终是打开文件，右键只打开菜单 |
| 兼容模式 | 不使用 DOM 查询/替换偷换官方组件 |
| UI 样式 | 使用官方 Web UI token 和 `@deepseek-ai/dsh-client-ui-primitives/Menu` |
| 桌面参考样式 | 只借鉴交互和测试方法，不复制原生 setup/recovery 的 Tailwind 主题 |
| 上游更新 | patch 或 slot/props contract 变化时失败退出并阻止发布 |

## 当前基础

### 已完成能力

提交 `d96794e4a29d0900e3e73ce85631e1c36edc1059` 已提供完整 Host 安全链：

- `POST /dsh-desktop/api/deliverables/copy`；
- `absolute-path` 和 `text-content` 两种动作；
- 通过会话历史证明 path 是指定 Session 的真实产物；
- workspace/cwd、realpath、符号链接和文件类型边界；
- 文本最大 1 MiB，UTF-8 fatal decode，拒绝 NUL/二进制；
- 读取前后 stat 防止文件替换竞态；
- Electron clipboard 只接收 Host 校验后的字符串。

### 当前 UI 缺口

当前 Yarn patch 给每个文件插入相邻“路径/内容”按钮，但没有 `onContextMenu` 或 context-menu 测试。原生 `fitProducedFiles()` 只测量文件芯片与剩余计数，父行又使用 `overflow: hidden`，因此新增相邻动作没有稳定的布局契约。

下一期不重写 Host 安全层，而是把现有动作迁移到正式上下文菜单并补齐 UI 验收。

## 上游优先实施策略

### 首选路径：贡献官方 Harness

在独立上游工作分支修改以下文件：

- `packages/client/ui-deliverables/src/client/ProducedFiles.tsx`；
- `packages/client/ui-deliverables/src/client/locales.ts`；
- `packages/client/ui-deliverables/tests/produced-files.client.spec.tsx`；
- 必要时扩展 `packages/client/ui-primitives/src/Menu.tsx` 的焦点恢复能力及测试。

官方合并并发布兼容 package family 后：

1. 重新检查 Harness、Sidebar 和桌面参考 remote；
2. 子模块 pin 单独提交；
3. 同步升级所有 `@deepseek-ai/dsh-*` direct dependency；
4. 删除 Desktop 的 deliverables UI Yarn patch；
5. 保留 Desktop Host route 和安全测试；
6. 通过完整产品门禁后再发布。

### 临时路径：精确 Yarn patch

若产品交付早于上游发布，可在当前精确 `0.1.1-rc.2` 包上维护 Yarn patch，但必须满足：

- patch 修改已发布 client bundle、types 和 locale，不编辑子模块；
- 增加真实 UI 测试，不能只用字符串存在断言；
- package version、patch hash 和 lockfile 同步；
- 新上游包到来时先重放 patch；无法应用即阻止 install/release；
- 官方版本包含等价能力后立即删除下游 UI patch。

## 交互设计

### 菜单打开

使用官方 `Menu` 组件的 `portal` 模式，避免 `ProducedFiles.row` 的 `overflow: hidden` 裁剪菜单。菜单锚点使用被操作文件胶囊的 `DOMRect`：

- 鼠标右键：`preventDefault()`，记录当前胶囊和其 rect，打开菜单；
- `Shift+F10` / Menu 键：以当前焦点胶囊为锚点打开；
- 左键：不打开菜单，继续调用 `openFile(path)`；
- 同一时刻最多打开一个产物菜单。

### 菜单命令

| 命令 ID | 文案 | Host kind | 行为 |
| --- | --- | --- | --- |
| `copy-absolute-path` | 复制实际路径 | `absolute-path` | 复制 Host `realpath` 后的绝对路径 |
| `copy-text-content` | 复制文本内容 | `text-content` | 复制通过类型/大小/UTF-8 校验的文本 |

菜单命令不得在 Renderer 拼接 cwd，也不得直接读取本地文件。成功反馈不回显完整路径或内容；失败只映射稳定产品错误码。

### 焦点和可访问性

- 文件胶囊声明 `aria-haspopup="menu"`；
- 菜单打开后聚焦第一项；
- ArrowUp/ArrowDown 移动菜单项；
- Enter/Space 执行；
- Escape 关闭并恢复焦点；
- 外部点击关闭并保持后续 Tab 顺序稳定；
- 右键和键盘使用同一 action handler；
- 成功/失败通过 `role="status"` 或官方 Toast 通知，不抢焦点。

现有 `Menu` 已提供 portal、viewport clamp、外部点击和 Escape 关闭。若它不能完整恢复焦点，应在 `ui-primitives` 修复通用能力，而不是在 ProducedFiles 私有模拟一套菜单。

## 工作包

| ID | 优先级 | 工作包 | 主要交付物 | 依赖 |
| --- | --- | --- | --- | --- |
| PFCM-0 | P0 | 固化当前失败基线 | 右键无菜单、相邻动作测量缺口测试 | 无 |
| PFCM-1 | P0 | 定义菜单状态与 action handler | 单菜单状态、鼠标/键盘统一入口 | PFCM-0 |
| PFCM-2 | P0 | 接入官方 Menu portal | 两个菜单项、viewport clamp、外部关闭 | PFCM-1 |
| PFCM-3 | P0 | 复用 Host 安全复制 | 现有 route/error code 回归，无 API 扩权 | PFCM-1 |
| PFCM-4 | P0 | 修复焦点和键盘 | Shift+F10/Menu/Escape/方向键/焦点恢复 | PFCM-2 |
| PFCM-5 | P1 | 恢复文件 lane 测量 | 移除相邻按钮或把动作移出 lane | PFCM-2 |
| PFCM-6 | P0 | 上游/下游兼容门禁 | source test、patch replay、slot/props contract | PFCM-2 至 PFCM-5 |
| PFCM-7 | P0 | packaged UI smoke | Desktop 真实窗口 DOM、截图和窄窗口验证 | PFCM-6 |
| PFCM-8 | P1 | 文档和发布记录 | 上游坐标、回滚点、Release Notes | PFCM-7 |

## 测试矩阵

### Component tests

| 类别 | 用例 | 必须断言 |
| --- | --- | --- |
| 主点击 | 左键文件胶囊 | 只调用 `openFile(path)`，菜单保持关闭 |
| 右键 | `contextmenu` | 阻止浏览器默认菜单，打开正确文件的菜单 |
| 键盘 | Shift+F10 / Menu | 与右键打开同一菜单 |
| 命令 | 复制实际路径 | 请求包含正确 `sessionId/path/kind` |
| 命令 | 复制文本内容 | 请求 `kind=text-content` |
| 关闭 | Escape / 外部点击 | 菜单关闭且焦点恢复 |
| 多文件 | 相同 basename | 根据完整 path 区分，不猜目标 |
| 单实例 | 连续右键不同胶囊 | 旧菜单关闭，新菜单绑定新 path |
| 错误 | Host 稳定错误码 | 显示产品文案，不泄漏路径/内容 |
| 重复 | 快速双击菜单项 | 同一动作单飞或明确拒绝重复 |

### Layout tests

固定至少以下 conversation 宽度：`320`、`480`、`768`、`1280` px。

每个宽度断言：

- 文件胶囊、剩余计数和后续 IconActions 不重叠；
- 菜单使用 portal，不被 conversation/row overflow 裁剪；
- 菜单距离 viewport 边缘至少 12 px；
- 最长路径不会扩大文件 lane；
- 打开/关闭菜单不改变 row 高度和文件显示数量；
- 200% 缩放下文案和菜单仍可操作。

### Host security regression

保留并扩展以下现有测试：

- 非产物 path；
- 跨 Session path；
- `..`、不同盘、UNC 和前缀碰撞；
- 文件/父目录 symlink 与 junction；
- 目录、设备、socket、非法 UTF-8、NUL、二进制；
- 1 MiB 与 1 MiB + 1；
- 读取中替换/变化；
- clipboard adapter 拒绝或不可用。

### Packaged smoke

真实 Desktop 成品必须验证：

1. 打开包含至少 4 个产物的已完成会话；
2. 对第 1 个和最后 1 个可见胶囊分别右键；
3. 菜单 DOM 在 `document.body` portal 下且未裁剪；
4. 复制实际路径后剪贴板等于 Host canonical path；
5. Shift+F10 可完成同一动作；
6. Escape 恢复胶囊焦点；
7. 重启后相同会话仍可操作；
8. compatibility 和 advanced 两种 Profile 均通过。

## 内核升级稳定性门禁

不能保证未知上游永远兼容，但必须保证不静默退化。

每次 Harness 更新前执行：

```powershell
git ls-remote --heads --tags https://github.com/deepseek-ai/deepseek-harness.git
npm view @deepseek-ai/dsh version dist-tags --json
corepack yarn install --immutable
corepack yarn check
```

并额外执行：

- 比较 `ProducedFiles.tsx`、`ProducedFiles.module.css`、locale 和 slot injection；
- patch dry-run/replay；
- 验证 `Menu` export、portal 和 focus contract；
- 运行 PFCM component/layout 测试；
- Loader/Profile smoke；
- Windows/macOS packaged smoke；
- 从真实成品搜索 `onContextMenu`、两个 action ID 和 Host route；
- Playwright 截图与 DOM 断言。

失败策略：任一关键契约变化时阻止发布，在 `docs/upstream-sync.md` 记录受影响 contract、临时 pin 和迁移步骤。不得回退为只有字符串存在测试，也不得在 UI 中静默删除菜单。

## 桌面参考仓库更新评估

2026-08-26 审计结果：

| 项目 | 旧台账 | 当前远端 | 变化 |
| --- | --- | --- | --- |
| 参考 master | `2172b1b2…` | `83e706ab…` | 前进 84 个提交 |
| 最新 tag | `v2.0.2` | `v2.0.2` | 无新 Release tag |
| 仓库 URL | `anywhere-labs/deepseek-harness-desktop` | GitHub 重定向到 `anywhere-labs/dsh-desktop` | 仓库重命名/重定向 |

参考 main 新增或强化：

- Base UI + shadcn/Tailwind 原生组件：Badge、Dialog、RadioGroup、Switch；
- 分步 setup wizard、browser/LAN 权限、Beta 标记和 welcome flow；
- Recovery 插件卸载、checkpoint 恢复与 terminal 入口；
- Windows 运行中升级安装器、caption drag 和 minimal persistent PowerShell PTY；
- 市场 live adapters、分页和 GitHub source 验证；
- 模型 input modalities 的更完整设置/Host 投影；
- privacy policy 和跨平台 UI/frame 测试。

对本计划的直接结论：

- 参考仓库没有 `ProducedFiles`、`copyAbsolutePath`、`copyTextContent` 或产物 context menu；
- 不能从参考仓库直接移植本功能；
- 可借鉴它的 `data-slot`、`aria-haspopup`、focus-visible、portal/modal 层级和静态 markup 测试；
- Conversation Web UI 必须继续使用官方 DSH Web token/Menu，不使用参考仓库 native UI 的 Tailwind theme；
- 84 个提交涉及多个产品域，本期不得整体 merge，只允许后续按独立问题选择性评估。

本期不采纳但值得单独立项评估的参考变化：Windows minimal PTY、运行中安装器升级、setup wizard/browser 权限、恢复模式插件卸载和市场 GitHub source 验证。这些工作不得与 ProducedFiles context menu 混在同一提交或发布批次。

## 发布与回滚

### 发布准入

- 官方上游 PR/发布坐标或精确 Yarn patch 已记录；
- Host、Component、Layout、Loader/Profile、packaged smoke 全部通过；
- compatibility/advanced 两种 Profile 通过；
- 真实成品右键、键盘和焦点行为通过；
- 新旧内核差分和回滚点写入同步台账；
- 安装器来源、size、SHA-256 和 Authenticode 状态写入 Release Notes。

### 回滚

若新菜单导致 crash、裁剪或焦点锁死：

1. 回滚 UI patch/上游 package pin；
2. 保留现有 Host 安全 route，不删除已验证后端；
3. 恢复原生文件胶囊左键打开行为；
4. 不恢复会破坏测量的相邻动作按钮；
5. 记录失败 viewport、内核坐标和复现截图后再修复。

## Evidence → Finding → Path

### Evidence

| ID | 不可变观察 | 来源/复现 |
| --- | --- | --- |
| E-001 | v2.0.10 Host 已支持受控绝对路径/文本复制 | `deliverable-copy.ts`、`deliverable-copy-plugin.ts` |
| E-002 | 当前 patch 只有相邻动作，没有 context menu | deliverables Yarn patch、提交 `d96794e4a2` |
| E-003 | 原生 `Menu` 已支持 portal、viewport clamp、外部关闭和 Escape | `ui-primitives/Menu.tsx` 及 component tests |
| E-004 | 原生文件 lane 测量不包含下游相邻动作，row 使用 overflow hidden | `ProducedFiles.tsx`、CSS 和现有 patch |
| E-005 | Harness 和 Sidebar 远端/npm 均未更新 | 2026-08-26 `ls-remote` / `npm view` |
| E-006 | 桌面参考 master 前进到 `83e706ab…`，领先旧台账 84 个提交，tag 仍为 v2.0.2 | GitHub compare API、`ls-remote` |
| E-007 | 参考仓库没有产物 copy/context-menu 实现 | `git grep upstream/master` |

### Findings

| ID | 结论 | 状态 | Evidence | 置信度 |
| --- | --- | --- | --- | --- |
| F-001 | 右键菜单可在现有 Host 合约上稳定实现，无需新增文件读取权限 | validated | E-001、E-003 | 高 |
| F-002 | 当前缺口是 UI ownership/验收，不是 Host 后端能力 | validated | E-001、E-002 | 高 |
| F-003 | 复用官方 Menu portal 可消除 row overflow 对菜单的裁剪 | validated | E-003、E-004 | 高 |
| F-004 | 未知内核无法承诺零适配，但 fail-loud 门禁可以阻止静默退化 | validated | E-002 至 E-005 | 高 |
| F-005 | 参考桌面有大量更新，但没有可直接移植的产物菜单 | validated | E-006、E-007 | 高 |

### Paths

| ID | 调用/实施路径 | 结果 |
| --- | --- | --- |
| P-001 | 文件胶囊 contextmenu/Shift+F10 → Menu portal → action ID → 现有 Host route → canonical clipboard | 目标功能路径（F-001、F-003） |
| P-002 | Harness 新版本 → source/slot/Menu diff → patch replay → component/layout/package smoke → release gate | 内核稳定更新路径（F-004） |
| P-003 | 参考仓库更新 → 84 提交分类 → 样式/测试模式借鉴 → 不整体 merge | 参考更新处理路径（F-005） |

## 完成定义

只有以下条件同时满足，本计划才能标记完成：

- 鼠标右键和键盘都能打开同一文件的菜单；
- 复制结果来自 Host canonical path；
- 主点击、overflow 计数和文件打开行为无回归；
- 相邻动作按钮不再破坏单行测量；
- 所有安全拒绝路径仍失败关闭；
- current pin 和至少一次模拟升级 contract 测试通过；
- Windows/macOS packaged UI smoke 通过；
- 同步台账、上游坐标、回滚点和发布说明完整。
