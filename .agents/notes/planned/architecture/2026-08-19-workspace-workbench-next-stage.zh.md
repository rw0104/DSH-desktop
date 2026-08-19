# Agent Note：Workspace Workbench 下一阶段架构

Status: planned

[English](2026-08-19-workspace-workbench-next-stage.md) | 中文

## 决策

下一阶段建设桌面自有 **Workspace Workbench**，不再以持续增加 Better Sidebar 标签页或 CSS patch 作为主要演进方式。DSH Agent、Session、Tool、Permission 和持久化继续拥有业务权威；Codex App Server 只作为富客户端协议参考，不进入产品主运行时。

当前不存在完整开源的官方 Codex Desktop Workbench。OpenAI 官方开源 CLI、SDK 与 App Server，未开放桌面 Workbench UI。开发采用组合参考：

| 角色 | 项目 | 边界 |
| --- | --- | --- |
| 产品/Workbench 主参考 | `zhukunpenglinyutong/desktop-cc-gui@64c0873c` | MIT；研究 DSH/Codex 引擎、Files/Git/Terminal/worktree/plan 的统一产品形态 |
| App Server 协议主参考 | `milisp/codexia@e4ba3ceb` | MIT；研究 thread/turn/approval、event sink、Git/worktree/terminal |
| Typed protocol 辅助参考 | `wieslawsoltes/CodexGui@01a72633` | MIT；研究 schema generation、初始化与审批兼容性；不采用 Avalonia UI |
| Electron 交互观察 | `op7418/CodePilot@ff26f22d` | BSL 1.1；只观察，不复制源码进入产品 |

## 问题定义

当前 Better Sidebar 已有 Files、Git、Diff、Terminal、Browser、Subagent 与 Jobs。差距不是工具数量，而是状态割裂：

- Git 无 Last turn、hunk stage/revert、行级评论与评论回送。
- UI terminal 与 Agent terminal 使用不同 registry。
- Session 只有 cwd，没有权威 checkout/worktree binding。
- Artifact 没有统一来源 Turn、验证状态和 annotation anchor。
- plan、approval、tool、file、terminal、job、subagent 没有统一 Activity Ledger。

## 目标服务

1. `SessionWorkspaceBinding`：权威记录 Session、repository、checkout/worktree、branch 与生命周期。
2. `WorkspaceActivityLedger`：统一投影 plan、tool、approval、file、terminal、artifact、job 与 subagent 事件。
3. `ChangesService`：status、diff、hunk stage/unstage/revert、commit、branch 和 review scope。
4. `UnifiedTerminalRegistry`：UI 与 Agent 共享 terminal identity、transcript、cwd、command 与退出状态。
5. `ArtifactRegistry`：记录产物、来源 Turn、验证、viewer 与 annotation anchors。

Client Workbench 提供 Changes、Files、Terminal、Artifacts、Tasks 和 Context Inspector。每个 surface 只消费 Host 权威状态，不从 DOM 或相邻插件状态推断业务事实。

## 阶段

| 阶段 | 结果 | 退出条件 |
| --- | --- | --- |
| W0 | SessionWorkspaceBinding、ActivityLedger schema、deep-link vocabulary | real composition 能从一个 Turn 投影文件、终端和任务事件 |
| W1 | Changes/Review：Unstaged、Staged、Last turn、hunk 操作、行级评论 | 评论可作为结构化上下文回送当前 Session，Git 状态一致 |
| W2 | Unified Terminal 与 Actions | 用户和 Agent 看到同一 PTY，Session/worktree 间不串线 |
| W3 | managed worktree、setup scripts、handoff | 两个 Session 可在独立 worktree 并行并安全交接 |
| W4 | Artifact Registry、自动预览、annotation | 标注可精确回送且持久化可重放 |
| W5 | plan/jobs/subagents/approvals 时间线与 PR context | 一个 Turn 的执行、变更、验证和 review 形成闭环 |

首批实现只做 W0 + W1。Files/viewer registry 暂时保留；Terminal 在 Activity Ledger 稳定后统一。Better Sidebar 在迁移期作为兼容层，每迁移一个 domain 才禁用对应 builtin，禁止一次性重写。

当前进度：W0 的 `WorkspaceWorkbenchService`、Session binding、Activity Ledger、deep link vocabulary 和 `WorkspaceChangesService` 已进入 `dsh-plugin-desktop`，并由 Host generation 生命周期管理。W1 已完成第一条纵向切片：Host Changes route、桌面自有 Changes tab、branch/staged/unstaged 文件状态和 file-level stage/unstage/revert。Last turn、hunk 写操作确认和行级评论尚未完成。

## 约束

- 不修改 pinned `deepseek-harness/` submodule。
- 不复制官方 Codex 私有 UI、品牌或反编译产物。
- 不复制 CodePilot BSL 源码。
- 不整体引入 VS Code/Theia 或切换到 Tauri；只复用经过许可证审查的独立实现和设计模式。
- Git、文件、terminal 与 worktree 写操作必须在 Host 使用结构化 API/argv 执行。
- 每个 service 必须有 ownership、lifecycle、wire schema、error matrix 和 real-composition test。
- 每个 surface 必须有 packaged Electron 截图、DOM/尺寸、键盘和 focus 验证。

## 参考

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex Open Source](https://developers.openai.com/codex/open-source)
- [desktop-cc-gui](https://github.com/zhukunpenglinyutong/desktop-cc-gui/tree/64c0873c421c483d884db6561b34c3f3cdb41254)
- [Codexia](https://github.com/milisp/codexia/tree/e4ba3cebee01a842383209cc08bca40db5d86f6c)
- [CodexGui](https://github.com/wieslawsoltes/CodexGui/tree/01a726339bdbda0b0c0c59b23ffb86f7850bc7c6)
- [CodePilot](https://github.com/op7418/CodePilot/tree/ff26f22d9cfe9ce385424030c6d6f8c52697362c)
