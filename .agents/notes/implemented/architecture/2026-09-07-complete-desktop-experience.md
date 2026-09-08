# Agent Note: Complete desktop experience and transient diagnostics

Status: implemented

## Problem

The previous compatibility/advanced presentation switch also selected product features. File actions were available in one branch while the complete voice window belonged to another. A Sidebar type-only open could create a hidden voice tab, and mocked openTab tests did not establish visibility.

## Decision

`desktop-experience.ts` resolves the everyday desktop experience independently from system/native window decoration. Legacy mode strings remain migration inputs and native-window adapter values. The standard, PTC and custom Agent presets are a separate upstream capability choice.

The Host upload route and Client file/voice contributions are available in either everyday decoration. Native decoration alone replaces root/layout geometry. Voice uses one modeless window and controller; saved Sidebar voice tabs are launchers. A mounted surface must pass visibility and modal-obstruction checks before requesting a ticket or microphone. Reopening an active call retains its originating session. Close and disposal cancel pending work and release media/subscriptions.

Settings presentation is scoped to the public sidebar.settings anchor and the tested current semantic child structure. The mask is 12% in light themes, 24% in dark themes, with no backdrop blur. Existing light panel elevation is retained. A coordinator follows settings and body-portal child lifetimes, preserves owned menus, restores focus/inert state, and routes Escape to the highest supported surface. It does not observe the streaming subtree or replace upstream content components.

## Migration and recovery

Profile appearance is represented in a fixed presentation-v2.json record. The exact v1 state.json schema is retained as a compatibility mirror for older executables. The v2 record commits last and stores a digest of the mirror. If a process stops between writes or an older executable changes v1, the next run migrates the complete validated v1 values again. Neither record copies credentials or sessions. Existing Profile-private precedence over shared legacy settings is retained, and absent shared windowStyle must not be synthesized before reconciliation.

The explicit `--upstream-diagnostic` argument selects an in-memory composition with third-party rows disabled and the official layout restored. The desktop client runs only a minimal boot reporter. Diagnostics inspect selection without consuming pending state, never claim an install WAL, and never commit normal preferences, health or rollback. The startup-state owner enforces these rules for success and failure. The tray returns to the normal desktop through the restart coordinator; the flag is not persisted as a normal preference. A second-instance diagnostic request uses the same restart path.

## Verification boundary

Unit tests exercise both current and archived 2.2.7 preference readers/writers, interruption before either atomic commit, Profile selection, and real installation-WAL bytes. Profile smokes validate native/system/diagnostic Host and Client graphs. `verify:surfaces` runs production components in hidden Electron, covering settings masks, menus, nested previews, focus, repeated open/close, voice visibility and media cleanup. These tests use isolated homes and synthetic provider state; they are not a real-provider audio or cross-platform installation claim.

The older compatibility/advanced notes remain historical records for native geometry. Their feature-gating and single shared-mode persistence descriptions are superseded by this decision and the current user guide.
