# DSH Desktop v2.0.10 与 Better Sidebar 0.16.1 开发记录

> 本文记录 2026-08-25 至 2026-08-26 完成的 Better Sidebar 升级、Windows 本地构建、跨平台 CI 修复和 GitHub Release 发布。正式 Windows 安装器未配置 Authenticode 证书，状态为 `NotSigned`。本文同时复核“本次产出”文件项右键复制实际路径的历史需求：安全复制能力已经实现，但右键菜单没有实现，当前下游选择的是相邻“路径/内容”按钮。

## 结果摘要

| 项目 | 最终结果 |
| --- | --- |
| DSH Desktop | `v2.0.10`，GitHub Latest Release |
| Better Sidebar | `0.15.1` 升级到 `0.16.1` |
| 官方 DeepSeek Harness | 保持 `0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |
| Windows 安装器 | `DSH-Desktop-2.0.10-x64-Setup.exe` |
| 安装器大小 | `276,771,959` bytes |
| 安装器 SHA-256 | `B37BA8A0F41BD3EE1DE2D7BCC34BFD93D51F2988494DCFED1EDAA838F253038D` |
| `latest.yml` SHA-256 | `85D7D5B3C2F0E2153DEC96AAB365E958E61660BC41348DBCACD1766AB20EEB25` |
| Authenticode | `NotSigned` |
| Release | <https://github.com/rw0104/DSH-desktop/releases/tag/v2.0.10> |
| 最终产品 CI | <https://github.com/rw0104/DSH-desktop/actions/runs/32935865273>，全部成功 |
| 部署日志 CI | <https://github.com/rw0104/DSH-desktop/actions/runs/32960548329>，成功 |

## 需求与边界

本轮目标是把产品固定工作台升级到维护中的 Better Sidebar 最新版，在本机完成 Windows 安装包构建和验证，再把同一份本地产物上传到 GitHub。GitHub Actions 只承担跨平台验证，不作为 Release 安装器来源。

实施边界如下：

- `deepseek-harness/` 继续作为只读固定子模块，不在 Desktop 分支中修改；
- 根 `README.md`、`README.en.md` 和 `README.i18n.yaml` 保持 `rw0104/DSH-desktop` 产品身份；
- Better Sidebar 作为产品固定工作台，版本必须进入 manifest、Yarn lock、许可证清单和成品 runtime；
- Windows Setup 必须在本机生成、完成 afterPack/PE/哈希验证后再上传；
- Release 不上传 `win-unpacked`、机器缓存、临时 Profile 或诊断目录；
- 未签名状态必须明确披露，不把 SHA-256 描述为发布者身份认证。

## 基线审计

2026-08-25 在改动前复核三条权威上游和 npm registry：

| 组件 | 审计结果 | 决策 |
| --- | --- | --- |
| DeepSeek Harness | `master`、`dsh-v0.1.1-rc.2`、npm `latest/next` 和本地子模块均为 `b150a551…` / `0.1.1-rc.2` | 不升级 |
| Better Sidebar | `main`、tag 和 npm `latest` 均为 `0.16.1` / `f9153dfc…` | 独立兼容批次升级 |
| Desktop reference | `master` 为 `2172b1b2…`，最新 tag 仍为 `v2.0.2` | 只作对照，不引入依赖 |

Better Sidebar `0.16.1` 发布未满 Yarn 默认 24 小时隔离期。仓库没有关闭全局隔离，而是在 `.yarnrc.yml` 中只预批准精确描述符 `dsh-better-sidebar@0.16.1`。

## 实施内容

### 依赖与版本

- 根包和 `dsh-plugin-desktop` 从 `2.0.9` 升级到 `2.0.10`；
- `dsh-better-sidebar` 从 `0.15.1` 升级到 `0.16.1`；
- `yarn.lock` 增加 `@codemirror/lang-vue@0.1.3`、`react-icons@5.7.0` 等传递依赖；
- `THIRD_PARTY_NOTICES.md` 重新生成并补入新增依赖；
- README 下载链接和产品组合说明更新为 `v2.0.10` / Sidebar `0.16.1`；
- `README.i18n.yaml` 记录更新后的中英文 blob hash。

### Sidebar 兼容性

`0.15.1` 与 `0.16.1` npm 成品中的 `cordis.patch.yml` SHA-256 均为：

```text
D363ACAD7F1521559194A3E04DE06FE68974B4A7B1AD3CC74DB54BCA63C4248B
```

关键兼容结论：

- `registerTab`、`registerFileViewer`、`openTab` 和 `closeTab` 服务签名保持兼容；
- `SIDEBAR_FEATURES` 新增 `floatWindows`，旧能力未移除；
- 上游移除公开 `cordis` peer，改用 `@deepseek-ai/cordis` 类型基底；
- 可选 peer `@huanlin/dsh-plugin-better-locale` 未被产品强制捆绑；
- Desktop 继续通过 `ctx.get('betterSidebar')` 和最小结构接口注册 `desktop:changes` Tab。

### 新增 Sidebar 能力

升级带入的主要上游能力包括：

- Tab 拖入主会话区形成自由窗口；
- 默认关闭的 `sidebar_open` 模型工具；
- Markdown 内嵌 HTML、目录大纲和本地相对图片；
- Vue 与更多语言的编辑器高亮；
- Git 多仓库和 linked worktree 支持；
- Git 状态数量、仓库发现和超时上限，避免大工作区冻结；
- 文件 API workspace/realpath/symlink 边界修复；
- npm DSH `0.1.1-rc.x` 下内部 `ctx.betterSidebar` 读取修复。

## 开发时间线

| 提交 | 内容 | 结果 |
| --- | --- | --- |
| `b877d4d90e` | 记录 2026-08-25 上游审计 | Harness 不变，Sidebar 发现 `0.16.1` |
| `cf14343e3c` | 升级 Sidebar、产品版本和锁文件 | `0.16.1 / v2.0.10` 进入依赖树 |
| `77d9265624` | 记录第一份本地安装器 | 候选资产生成，尚未发布 |
| `c8328e9b25` | 修复 POSIX Review path containment | 统一使用归一化路径执行 `resolve()` |
| `23413a305c` | 更新修复后的候选资产记录 | Draft 资产首次替换 |
| `82449fd459` | 修复 Profile smoke 的盘符假设 | Windows 要求盘符，macOS/Linux 要求参数缺失 |
| `247dc420cf` | 跨平台识别小写 license 文件 | Linux 接受 `khroma` 随包 MIT `license` |
| `1d1a9ebe6b` | 记录跨平台门禁 | 首轮完整产品 CI 全绿 |
| `baad5023be` | 重新生成第三方许可证清单 | 补入 Sidebar 新依赖并触发最终重建 |
| `14f50e727d` | 记录最终 notice-build | Annotated tag `v2.0.10` 指向该提交 |
| `19c2e39471` | 记录 GitHub 部署结果 | main 包含最终 size/digest/CI 证据 |

## CI 暴露的问题与修复

### POSIX Review 路径

旧代码先把 `\\` 归一化为 `/` 做初步检查，却在 `resolve()` 时重新使用原始字符串。Linux/macOS 会把 `..\\outside.ts` 当成普通文件名，而不是父目录跳转。

修复后调用路径为：

```text
Renderer path -> replaceAll('\\', '/') -> resolve(cwd, normalized) -> relative containment -> accept/reject
```

这是一项生产安全修复，因此修复后重新完成完整本地构建并替换 Draft 资产。

### macOS realpath 测试

Deliverable copy 服务按安全设计返回 `realpath`。macOS 会把 `/var/...` 规范化为 `/private/var/...`，旧测试比较未规范化的 `mkdtemp` 字符串。测试改为比较 `await realpath(...)`，生产行为不变。

### Profile smoke 盘符参数

生产代码只在真实枚举到 Windows 盘符时写入 `dsh-desktop-drives`。旧 smoke 在 macOS/Linux 上模拟 `platform=win32`，却无条件要求该参数存在。

修复后的规则：

- Windows runner：参数必须存在且只含大写盘符；
- macOS/Linux runner：参数必须缺失；
- 任何宿主出现错误格式都会失败。

### Linux license 文件名

`khroma@2.1.0` 没有 manifest `license` 字段，但 npm 包和上游仓库提供小写文件 `license`，内容为 MIT。Windows/macOS 的大小写不敏感文件系统可找到它，Linux 的精确 `LICENSE` 探测失败。

Verifier 改为枚举包目录，并对 `license`、`license.md`、`license.txt` 做文件名小写归一化。许可 allowlist 没有放宽。

### 许可证清单重建

最终检查发现旧 `THIRD_PARTY_NOTICES.md` 没有列出 `@codemirror/lang-vue` 和 `react-icons`。由于 NSIS 许可页直接使用该文件，不能只修文档后沿用旧安装器。清单提交后再次从头执行 Electron Builder、afterPack、NSIS 和 installer verifier，形成最终 Setup。

## 验证记录

| 验证 | 结果 |
| --- | --- |
| `corepack yarn install --immutable` | 通过 |
| Sidebar/Profile/Workbench 聚焦测试 | 6 个文件，103 passed |
| Community Market 完整测试 | 268 passed |
| Desktop 完整测试 | 703 passed、11 skipped（Windows 本地） |
| Windows package preflight | 203 passed |
| Runtime closure | 201 个 first-party 节点闭合 |
| 许可证扫描 | 691 个生产包；2 个 notice-required license |
| Electron Builder afterPack | 通过 |
| 诊断 Worker packaged smoke | 通过 |
| Windows PE installer verifier | 通过 |
| Ubuntu/macOS/Windows `yarn check` | 全部通过 |
| Windows installer/portable CI smoke | 通过 |
| macOS universal packaged smoke | 通过 |

最终 CI：<https://github.com/rw0104/DSH-desktop/actions/runs/32935865273>。

## 构建与发布

Windows Setup 在本机通过以下产品脚本构建：

```powershell
$env:HTTP_PROXY='http://127.0.0.1:10808'
$env:HTTPS_PROXY='http://127.0.0.1:10808'
$env:ALL_PROXY='http://127.0.0.1:10808'
corepack yarn dist:win
```

最终 notice-only 重建在共享 CI 已通过后使用脚本支持的 `DSH_PACKAGE_CHECK_ALREADY_RAN=1`，只跳过重复 Windows preflight；Electron Builder、afterPack、NSIS 和 installer verifier 均未跳过。

GitHub Release 只上传以下本地文件：

- `DSH-Desktop-2.0.10-x64-Setup.exe`；
- `latest.yml`。

GitHub 返回的 size/digest 与本地一致，Release 为 Latest、非 draft、非 prerelease。Annotated tag `v2.0.10` 解引用到 `14f50e727d7d9f395b52d3e7546898c354c22ac3`。

## “本次产出”复制路径需求复核

### 界面所有权

截图红线区域不是 Better Sidebar。它由官方包 `@deepseek-ai/dsh-client-ui-deliverables` 的 `ProducedFiles` 组件通过 `conversation.chat.turnTail` slot 渲染。

原生行为是：

- 芯片文字使用 `basename(path)`；
- 完整路径只放在 `title`；
- 主点击调用 `openFile(path)`；
- 原生组件没有 clipboard Host 合约。

Desktop 不能在兼容模式通过 DOM patch 偷换该组件，因此 v2.0.9 采用两层实现：Desktop Host 提供受控复制接口，Yarn patch 给官方已发布 client 包增加入口。

### 实际完成的能力

提交 `d96794e4a29d0900e3e73ce85631e1c36edc1059` 完成：

- `POST /dsh-desktop/api/deliverables/copy`；
- `kind: absolute-path` 和 `kind: text-content`；
- 会话历史证明产物身份；
- workspace/cwd containment；
- realpath、符号链接、目录、设备、二进制、NUL、非法 UTF-8 和 1 MiB 限制；
- Electron clipboard 只接收 Host 已验证的字符串；
- UI patch 增加相邻“路径”和“内容”按钮及成功/失败状态。

本机安装的 `dsh-plugin-desktop@2.0.10` bundle 包含 `copyAbsolutePath` 和 `copyTextContent`，说明安全复制后端和相邻按钮代码已进入正式安装包。

### 没有完成的部分

右键菜单没有实现。证据是：

- 规划文本写的是“为每个产物提供菜单或相邻操作”，允许二选一；
- 实施提交选择相邻按钮，没有 `onContextMenu` 或 `contextmenu`；
- UI patch 没有修改 `ProducedFiles` 的源码测试文件；
- 包级测试只断言 bundle 包含 `copyAbsolutePath`、`copyTextContent` 和 Host route；
- 没有右键打开、菜单项选择、键盘菜单和焦点恢复测试；
- v2.0.9 Release 已把键盘、读屏、loading 和错误映射自动化列为后续工作。

因此，原始用户语义“右键文件胶囊复制实际路径”在任务拆分时被放宽成“菜单或相邻操作”，实施者选择了后者。功能不是因技术障碍失败，而是验收标准没有继续锁定“右键”这一交互。

### 相邻按钮的剩余风险

当前 patch 把每个文件的“路径/内容”按钮插入单行 `.row`，但原生 `fitProducedFiles()` 仍只测量文件芯片和剩余计数，不测量新增动作按钮；`.row` 同时设置 `overflow: hidden`。在窄窗口中，相邻按钮存在被裁剪的风险。

现有官方 UI 测试只覆盖原生文件芯片数量、overflow 计数和“在文件夹中显示”，没有加载下游 patch 后的按钮布局测试。用户截图可证明目标交互不可见，但截图本身不能单独区分“历史版本”“按钮裁剪”或“运行时渲染路径”；若要把相邻按钮也视为正式交付，需要在当前 v2.0.10 页面补一轮 DOM 和视觉回归。

### 正确的后续实现边界

如果产品要求仍然是右键复制实际路径，应在 `ui-deliverables` 所有权边界实现共享 action handler：

1. 文件芯片主点击继续打开文件；
2. `onContextMenu` 只打开菜单，不直接复制；
3. 菜单至少包含“复制实际路径”和“复制文本内容”；
4. 菜单动作复用现有 Host route，不新增任意文件读取能力；
5. 同时提供键盘菜单入口和 aria-label；
6. 测试右键、键盘、成功/失败、焦点恢复、窄窗口和同 basename 多文件；
7. 若保留相邻按钮，测量算法必须把动作宽度纳入 fit 计算，或把动作移出单行文件 lane。

## Evidence → Finding → Path

### Evidence

| ID | 不可变观察 | 来源/复现 |
| --- | --- | --- |
| E-001 | Harness 远端、tag、npm 和子模块均为 rc2 / `b150a551…` | `git ls-remote`、`npm view @deepseek-ai/dsh`、`git submodule status` |
| E-002 | Sidebar `0.16.1` 的 bundle patch 与 `0.15.1` 哈希一致，服务面兼容 | npm tarball 对比、`service.d.ts`、SHA-256 |
| E-003 | 最终本地 Setup 为 `276,771,959` bytes，SHA-256 为 `B37BA8…` | `Get-FileHash`、installer verifier |
| E-004 | GitHub Setup/`latest.yml` digest 与本地一致 | GitHub Release API |
| E-005 | 最终产品 CI 全绿 | run `32935865273` |
| E-006 | 截图红线指向结束消息后的文件胶囊行 | 截图 SHA-256 `953492E797039405F01A2BE5ABF5382D5AA1C2620148F498F66B4F11E38C11DD` |
| E-007 | 规划允许“菜单或相邻操作”，没有锁定右键 | `docs/2026-08-24_v2.0.9-remediation-task-plan.md:296` |
| E-008 | 提交只增加相邻 Path/Content 按钮，没有 context menu | `d96794e4a2`、Yarn deliverables patch |
| E-009 | 当前安装的 v2.0.10 bundle 含 copy actions，不含 context menu | `D:/DSH Desktop/resources/app.asar.unpacked/.../lib/client.js` |
| E-010 | 原生测量只计算 chip/remainder，row 使用 `overflow: hidden` | `ProducedFiles.tsx`、`ProducedFiles.module.css`、下游 patch |

### Findings

| ID | 结论 | 状态 | 证据 | 置信度 |
| --- | --- | --- | --- | --- |
| F-001 | Sidebar 0.16.1 和 Desktop v2.0.10 已完成兼容验证和正式发布 | validated | E-001 至 E-005 | 高 |
| F-002 | 右键复制实际路径从未实现；任务实施时选择了允许的相邻操作方案 | validated | E-006 至 E-009 | 高 |
| F-003 | Host 受控复制绝对路径/文本内容的安全能力已经完成，不是后端缺失 | validated | E-008、E-009 | 高 |
| F-004 | 相邻动作未进入原生测量和 UI 回归，窄窗口存在裁剪风险 | candidate | E-010 | 中 |

### Paths

| ID | 调用/实施路径 | 结果 |
| --- | --- | --- |
| P-001 | 上游审计 → Sidebar pin → immutable install → contract test → full check → local NSIS → remote digest → Release | v2.0.10 正式发布（F-001） |
| P-002 | ProducedFiles path → Desktop Host history authorization → realpath/containment/type/size validation → Electron clipboard | 安全复制能力完成（F-003） |
| P-003 | 原始“右键”语义 → 规划改写为“菜单或相邻操作” → 实施相邻按钮 → 无 context-menu test | 右键交互未交付（F-002） |

## 发布后运行与磁盘观察

正式安装版位于 `D:\DSH Desktop`，FileVersion 为 `2.0.10`。发布后盘点发现：

- 仓库 `dsh-plugin-desktop/dist` 构建输出约 `1.022 GiB`；
- `%LOCALAPPDATA%\Temp` 下 3,282 个过期 `dsh-*` 根约 `1.426 GiB`；
- 可清理总量约 `2.448 GiB`；
- 当前运行中的 DSH Desktop 使用的 4 个临时根被排除；
- Codex 静态安全策略拒绝递归删除，因此盘点完成但未代执行删除。

这部分占用的是磁盘空间，不是进程 RAM。降低 RAM 需要关闭或重启当前 DSH Desktop 进程。

## 结论

本轮 Sidebar 升级和 v2.0.10 发布已经完整完成，最终本地资产、GitHub digest、tag 和跨平台 CI 一致。CI 过程中额外修复了 POSIX 路径 containment、macOS realpath 测试、Profile smoke 盘符假设和 Linux license 文件名大小写问题。

“本次产出”复制能力的后端已经完成并进入 v2.0.10；没有完成的是用户明确要求的右键菜单交互。根因是需求在规划中被改写为“菜单或相邻操作”，实施选择相邻按钮，且 UI 验收没有覆盖右键、键盘菜单和窄窗口布局。若继续开发，应复用现有 Host 安全合约，只补齐 `ui-deliverables` 所有权范围内的 context menu 与完整 UI 回归。
