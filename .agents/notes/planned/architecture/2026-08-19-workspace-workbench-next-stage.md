# Agent Note: Workspace Workbench next-stage architecture

Status: planned

English | [中文](2026-08-19-workspace-workbench-next-stage.zh.md)

## Decision

The next stage builds a desktop-owned **Workspace Workbench** instead of evolving primarily through more Better Sidebar tabs or CSS patches. DSH Agent, Session, Tool, Permission, and persistence remain authoritative. Codex App Server is a rich-client protocol reference, not a new product runtime.

No complete open-source implementation of the official Codex Desktop Workbench exists. OpenAI publishes the CLI, SDK, and App Server, but not the desktop Workbench UI. Development therefore uses combined references:

| Role | Project | Boundary |
| --- | --- | --- |
| Product/Workbench primary | `zhukunpenglinyutong/desktop-cc-gui@64c0873c` | MIT; study its unified DSH/Codex engine, Files, Git, Terminal, worktree, and plan surfaces |
| App Server protocol primary | `milisp/codexia@e4ba3ceb` | MIT; study thread/turn/approval, event sink, Git/worktree/terminal |
| Typed protocol support | `wieslawsoltes/CodexGui@01a72633` | MIT; study schema generation, initialization, and approval compatibility; do not adopt Avalonia UI |
| Electron interaction observation | `op7418/CodePilot@ff26f22d` | BSL 1.1; observe only, never copy source into the product |

## Problem

Better Sidebar already supplies Files, Git, Diff, Terminal, Browser, Subagent, and Jobs. The gap is fragmented state rather than tool count:

- Git lacks Last turn attribution, hunk operations, inline comments, and feedback into the Session.
- UI terminals and Agent terminals use separate registries.
- A Session has a cwd but no authoritative checkout/worktree binding.
- Artifacts lack a common source Turn, validation state, and annotation anchors.
- Plan, approval, tool, file, terminal, job, and subagent events have no shared Activity Ledger.

## Target services

1. `SessionWorkspaceBinding`: authoritative Session, repository, checkout/worktree, branch, and lifecycle.
2. `WorkspaceActivityLedger`: common plan, tool, approval, file, terminal, artifact, job, and subagent projection.
3. `ChangesService`: status, diff, hunk stage/unstage/revert, commit, branch, and review scopes.
4. `UnifiedTerminalRegistry`: one terminal identity, transcript, cwd, command stream, and exit state for UI and Agent.
5. `ArtifactRegistry`: artifact source Turn, validation, viewer, and annotation anchors.

The Client Workbench presents Changes, Files, Terminal, Artifacts, Tasks, and Context Inspector. Every surface consumes Host-owned facts and never infers business state from DOM or adjacent plugins.

## Stages

| Stage | Result | Exit condition |
| --- | --- | --- |
| W0 | SessionWorkspaceBinding, ActivityLedger schema, deep-link vocabulary | real composition projects file, terminal, and task events from one Turn |
| W1 | Changes/Review with Unstaged, Staged, Last turn, hunk actions, inline comments | comments return as structured Session context and Git state remains consistent |
| W2 | Unified Terminal and Actions | user and Agent share one PTY without cross-Session/worktree leakage |
| W3 | managed worktrees, setup scripts, handoff | two Sessions work in isolated worktrees and hand off safely |
| W4 | Artifact Registry, automatic previews, annotations | annotations return precisely and replay durably |
| W5 | plan/jobs/subagents/approvals timeline and PR context | execution, changes, validation, and review form one Turn-level loop |

The first implementation slice is W0 + W1 only. Keep the existing Files/viewer registry. Unify Terminal after Activity Ledger stabilizes. Better Sidebar remains a compatibility layer; disable one builtin only after its domain migrates.

Current progress: W0 `WorkspaceWorkbenchService`, Session binding, Activity Ledger, deep-link vocabulary, and `WorkspaceChangesService` now live in `dsh-plugin-desktop` and are owned by the Host generation lifecycle. W1 has its first vertical slice: a Host Changes route, a desktop-owned Changes tab, branch/staged/unstaged file status, and file-level stage/unstage/revert. Last turn, hunk mutation confirmation, and inline comments remain incomplete.

## Constraints

- Never edit the pinned `deepseek-harness/` submodule.
- Never copy private Codex UI, branding, or reverse-engineered assets.
- Never copy CodePilot BSL source.
- Do not import all of VS Code/Theia or switch the desktop to Tauri; reuse only reviewed independent implementations and design patterns.
- Git, filesystem, terminal, and worktree mutations run in the Host through structured APIs/argv.
- Every service requires ownership, lifecycle, wire schema, error matrix, and a real-composition test.
- Every surface requires packaged Electron screenshots, DOM/geometry assertions, keyboard, and focus verification.

## References

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex Open Source](https://developers.openai.com/codex/open-source)
- [desktop-cc-gui](https://github.com/zhukunpenglinyutong/desktop-cc-gui/tree/64c0873c421c483d884db6561b34c3f3cdb41254)
- [Codexia](https://github.com/milisp/codexia/tree/e4ba3cebee01a842383209cc08bca40db5d86f6c)
- [CodexGui](https://github.com/wieslawsoltes/CodexGui/tree/01a726339bdbda0b0c0c59b23ffb86f7850bc7c6)
- [CodePilot](https://github.com/op7418/CodePilot/tree/ff26f22d9cfe9ce385424030c6d6f8c52697362c)
