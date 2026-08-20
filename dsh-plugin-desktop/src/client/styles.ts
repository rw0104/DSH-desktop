import {
  MACOS_DRAG_REGION_HEIGHT,
  MACOS_TITLEBAR_HEIGHT,
  MACOS_TRAFFIC_LIGHT_SAFE_WIDTH,
  WINDOWS_CAPTION_CONTROLS_WIDTH,
  WINDOWS_TITLEBAR_HEIGHT,
} from '../window-chrome.ts'
import { SIDEBAR_COLLAPSED } from './layout-state.ts'
import { WORKBENCH_MAX_WIDTH, WORKBENCH_MIN_WIDTH } from './DesktopWorkbench.tsx'

const WORKSPACE_CHANGES_STYLES = `
.dshWorkspaceChanges { display:flex; flex-direction:column; min-height:100%; color:var(--dsw-alias-label-primary); }
.dshWorkspaceChangesHeader { display:flex; align-items:center; justify-content:space-between; min-height:40px; padding:0 10px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceChangesBranch { display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:var(--dsw-font-xxs-strong-12); }
.dshWorkspaceChangesIcon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border:0; border-radius:6px; color:var(--dsw-alias-label-secondary); background:transparent; cursor:pointer; }
.dshWorkspaceChangesIcon:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshWorkspaceChangesIcon:disabled { opacity:.45; cursor:default; }
.dshWorkspaceChangesScopes { display:flex; gap:2px; padding:6px 8px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceChangesScope { flex:1; min-height:26px; padding:0 5px; border:0; border-radius:5px; color:var(--dsw-alias-label-tertiary); background:transparent; font:var(--dsw-font-xxxs-11); cursor:pointer; }
.dshWorkspaceChangesScope:hover, .dshWorkspaceChangesScope.is-active { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshWorkspaceChangesFile { border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceChangesRow { display:flex; align-items:center; gap:6px; min-height:34px; padding:0 8px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceChangesFile > .dshWorkspaceChangesRow { border-bottom:0; }
.dshWorkspaceChangesDisclosure { display:inline-flex; align-items:center; justify-content:center; width:22px; height:24px; padding:0; border:0; color:var(--dsw-alias-label-tertiary); background:transparent; cursor:pointer; }
.dshWorkspaceChangesDisclosure:hover { color:var(--dsw-alias-label-primary); }
.dshWorkspaceChangesHunks { padding:0 8px 8px 30px; }
.dshWorkspaceChangesHunk { margin-top:6px; padding:7px; border:1px solid var(--dsw-alias-border-l2); border-radius:5px; background:var(--dsw-alias-bg-secondary); }
.dshWorkspaceChangesHunkHeader { display:block; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); white-space:pre-wrap; }
.dshWorkspaceChangesHunkLines { display:flex; flex-direction:column; max-height:180px; margin:5px 0; overflow:auto; color:var(--dsw-alias-label-secondary); font:var(--dsw-font-xxxs-11); }
.dshWorkspaceChangesDiffLine { display:grid; grid-template-columns:30px 30px minmax(0,1fr); width:100%; min-height:20px; padding:0; border:0; color:inherit; background:transparent; font:inherit; text-align:left; cursor:pointer; }
.dshWorkspaceChangesDiffLine:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dshWorkspaceChangesDiffLine:disabled { cursor:default; }
.dshWorkspaceChangesDiffLine > span { padding:2px 4px; color:var(--dsw-alias-label-tertiary); text-align:right; user-select:none; }
.dshWorkspaceChangesDiffLine > code { min-width:0; padding:2px 5px; overflow:visible; font:inherit; white-space:pre; }
.dshWorkspaceChangesDiffLine.is-addition { background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); }
.dshWorkspaceChangesDiffLine.is-deletion { background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.dshWorkspaceChangesHunkActions { display:flex; flex-wrap:wrap; gap:5px; }
.dshWorkspaceChangesHunkEmpty { padding:6px 0; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshWorkspaceChangesReview { display:flex; flex-direction:column; gap:6px; margin-top:7px; }
.dshWorkspaceChangesReviewFields { display:flex; gap:5px; }
.dshWorkspaceChangesReviewFields select, .dshWorkspaceChangesReviewFields input, .dshWorkspaceChangesReview textarea { min-height:26px; border:1px solid var(--dsw-alias-border-l2); border-radius:4px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-primary); font:var(--dsw-font-xxxs-11); }
.dshWorkspaceChangesReviewFields input { width:70px; padding:0 5px; }
.dshWorkspaceChangesReviewFields select { padding:0 5px; }
.dshWorkspaceChangesReview textarea { min-height:58px; padding:5px; resize:vertical; }
.dshWorkspaceChangesBadge { width:22px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); text-align:center; }
.dshWorkspaceChangesPath { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:var(--dsw-font-xxs-12); }
.dshWorkspaceChangesAction { flex:none; min-height:24px; padding:0 7px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-secondary); background:transparent; font:var(--dsw-font-xxxs-11); cursor:pointer; }
.dshWorkspaceChangesAction:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshWorkspaceChangesEmpty { padding:18px 12px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxs-12); }
.dshWorkspaceChangesError { padding:10px 12px; color:var(--dsw-alias-state-error-primary); font:var(--dsw-font-xxs-12); }
`

const DESKTOP_ABOUT_STYLES = `
.dshDesktopAbout { display:flex; flex-direction:column; gap:20px; width:100%; max-width:720px; }
.dshDesktopAboutIntro { display:flex; flex-direction:column; gap:6px; }
.dshDesktopAboutTitle { margin:0; color:var(--dsw-alias-label-primary); font:var(--dsw-font-s-strong-14); font-size:18px; }
.dshDesktopAboutSubtitle { margin:0; color:var(--dsw-alias-label-secondary); line-height:1.5; }
.dshDesktopAboutRows { display:flex; flex-direction:column; border-top:1px solid var(--dsw-alias-border-l2); }
.dshDesktopAboutRow { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:52px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshDesktopAboutLabel { color:var(--dsw-alias-label-secondary); }
.dshDesktopAboutValue { color:var(--dsw-alias-label-primary); text-align:right; }
.dshDesktopAboutValue code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.dshDesktopAboutLink { color:var(--dsw-alias-interactive-label-primary); text-decoration:none; }
.dshDesktopAboutLink:hover { text-decoration:underline; }
.dshDesktopAboutActions { display:flex; flex-wrap:wrap; gap:8px; }
.dshDesktopAboutAction { display:inline-flex; align-items:center; min-height:32px; padding:0 12px; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); text-decoration:none; cursor:pointer; }
.dshDesktopAboutAction:hover { background:var(--dsw-alias-interactive-bg-hover); }
`

const DESKTOP_WORKBENCH_STYLES = `
.dshDesktopWorkbenchLauncher { position:fixed; z-index:72; right:12px; top:50%; display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; padding:0; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-1); box-shadow:var(--dsw-shadow-elevation-2); cursor:pointer; transform:translateY(-50%); pointer-events:auto; }
.dshDesktopWorkbenchLauncher:hover, .dshDesktopWorkbenchIcon:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
body[data-dsh-desktop-workbench-open] #root { box-sizing:border-box; padding-right:var(--dsh-desktop-workbench-width); }
.dshDesktopWorkbench { position:fixed; z-index:70; top:0; right:0; bottom:0; display:flex; flex-direction:column; box-sizing:border-box; min-width:${String(WORKBENCH_MIN_WIDTH)}px; max-width:min(${String(WORKBENCH_MAX_WIDTH)}px, calc(100vw - 64px)); color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); border-left:1px solid var(--dsw-alias-border-l1); box-shadow:-12px 0 28px color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); pointer-events:auto; }
body[data-dsh-desktop-mode="advanced"][data-dsh-desktop-platform="win32"] .dshDesktopWorkbench { top:${WINDOWS_TITLEBAR_HEIGHT}px; }
body[data-dsh-desktop-mode="advanced"][data-dsh-desktop-platform="darwin"] .dshDesktopWorkbench { top:${MACOS_TITLEBAR_HEIGHT}px; }
.dshDesktopWorkbenchResize { position:absolute; z-index:2; top:0; bottom:0; left:-5px; width:10px; cursor:col-resize; touch-action:none; }
.dshDesktopWorkbenchHeader, .dshDesktopWorkbenchPanelToolbar { display:flex; align-items:center; justify-content:space-between; min-height:40px; padding:0 10px 0 12px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshDesktopWorkbenchHeader strong, .dshDesktopWorkbenchPanelToolbar strong { font:var(--dsw-font-xs-strong-13); }
.dshDesktopWorkbenchIcon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border:0; border-radius:6px; color:var(--dsw-alias-label-secondary); background:transparent; cursor:pointer; }
.dshDesktopWorkbenchIcon:disabled { opacity:.45; cursor:default; }
.dshDesktopWorkbenchTabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:2px; padding:6px 8px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshDesktopWorkbenchTab { display:flex; align-items:center; justify-content:center; gap:5px; min-width:0; min-height:30px; padding:0 6px; border:0; border-radius:6px; color:var(--dsw-alias-label-tertiary); background:transparent; font:var(--dsw-font-xxxs-11); cursor:pointer; }
.dshDesktopWorkbenchTab span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshDesktopWorkbenchTab:hover, .dshDesktopWorkbenchTab.is-active { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshDesktopWorkbenchTab.is-active { box-shadow:inset 0 -2px 0 var(--dsw-alias-state-business-primary); }
.dshDesktopWorkbenchBody { min-height:0; flex:1; overflow:auto; }
.dshDesktopWorkbenchBody > .dshWorkspaceChanges { min-height:100%; }
.dshDesktopWorkbenchPanel { min-height:100%; }
.dshDesktopWorkbenchEmpty, .dshDesktopWorkbenchError { padding:18px 14px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxs-12); line-height:1.5; }
.dshDesktopWorkbenchError { color:var(--dsw-alias-state-error-primary); }
.dshDesktopTerminalRow { display:flex; flex-direction:column; gap:5px; padding:10px 12px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshDesktopTerminalRow > div { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.dshDesktopTerminalRow strong { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:var(--dsw-font-xxs-strong-12); }
.dshDesktopTerminalRow code, .dshDesktopWorktreeFacts code { overflow-wrap:anywhere; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshDesktopTerminalRow pre { max-height:130px; margin:2px 0 0; padding:7px; overflow:auto; border-radius:5px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-secondary); font:var(--dsw-font-xxxs-11); white-space:pre-wrap; }
.dshDesktopTerminalStatus { flex:none; padding:1px 5px; border-radius:4px; color:var(--dsw-alias-label-tertiary); background:var(--dsw-alias-bg-secondary); font:var(--dsw-font-xxxs-11); }
.dshDesktopTerminalStatus.is-running { color:var(--dsw-alias-state-success-primary); }
.dshDesktopTerminalStatus.is-disconnected, .dshDesktopTerminalStatus.is-exited { color:var(--dsw-alias-state-warning-primary); }
.dshDesktopWorktreeFacts { display:flex; flex-direction:column; margin:0; }
.dshDesktopWorktreeFacts > div { display:grid; grid-template-columns:92px minmax(0,1fr); gap:10px; padding:9px 12px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshDesktopWorktreeFacts dt { color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshDesktopWorktreeFacts dd { min-width:0; margin:0; color:var(--dsw-alias-label-secondary); font:var(--dsw-font-xxs-12); overflow-wrap:anywhere; }
.dshDesktopWorktreeAction { display:flex; gap:7px; padding:12px; }
.dshDesktopWorktreeAction input { min-width:0; min-height:30px; flex:1; padding:0 8px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-primary); }
.dshDesktopWorktreeAction button, .dshDesktopWorktreeConfirm button { min-height:30px; padding:0 9px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-1); cursor:pointer; }
.dshDesktopWorktreeAction button:hover, .dshDesktopWorktreeConfirm button:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshDesktopWorktreeAction button:disabled, .dshDesktopWorktreeConfirm button:disabled { opacity:.45; cursor:default; }
.dshDesktopWorktreeConfirm { margin:0 12px 12px; padding:10px; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; background:var(--dsw-alias-bg-secondary); }
.dshDesktopWorktreeConfirm p { margin:0 0 8px; color:var(--dsw-alias-label-secondary); font:var(--dsw-font-xxs-12); }
.dshDesktopWorktreeConfirm > div { display:flex; gap:7px; justify-content:flex-end; }
.dshDesktopWorkspaceContextMenu { position:fixed; z-index:1200; width:188px; padding:4px; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; background:var(--dsw-alias-bg-layer-1); box-shadow:var(--dsw-shadow-elevation-3); pointer-events:auto; }
.dshDesktopWorkspaceContextMenu button { display:flex; align-items:center; gap:9px; width:100%; min-height:34px; padding:0 9px; border:0; border-radius:5px; color:var(--dsw-alias-label-primary); background:transparent; font:var(--dsw-font-xs-13); text-align:left; cursor:pointer; }
.dshDesktopWorkspaceContextMenu button:hover, .dshDesktopWorkspaceContextMenu button:focus-visible { background:var(--dsw-alias-interactive-bg-hover); outline:none; }
.dshDesktopWorkbenchToast { position:fixed; z-index:1200; right:16px; bottom:16px; max-width:min(420px,calc(100vw - 32px)); padding:10px 12px; border:1px solid var(--dsw-alias-state-error-primary); border-radius:7px; color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-bg-layer-1); box-shadow:var(--dsw-shadow-elevation-2); pointer-events:auto; }
@media (max-width:760px) { body[data-dsh-desktop-workbench-open] #root { padding-right:0; } .dshDesktopWorkbench { width:calc(100vw - 48px) !important; min-width:0; } .dshDesktopWorkbenchResize { display:none; } .dshDesktopWorkbenchTab span { display:none; } }
@media (prefers-reduced-motion:reduce) { .dshDesktopWorkbench, .dshDesktopWorkbenchLauncher { transition:none; } }
`

/** Advanced-shell stylesheet kept as a plain string so the package client bundle stays self-contained. */
const ADVANCED_STYLES = `
html, body, #root { width: 100%; height: 100%; }
body[data-dsh-desktop-mode="advanced"] { margin: 0; background: transparent !important; }
.dshDesktopFrame { position: relative; display: grid; grid-template-rows: 100%; width: 100%; height: 100%; overflow: hidden; background: transparent; }
.dshDesktopSidebarSurface { --dsw-specific-sidebar-fill: transparent; position: relative; grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; background: transparent; border-right: 1px solid var(--dsw-alias-border-l1); }
.dshDesktopUpstreamSidebar { box-sizing: border-box; width: 100%; height: 100%; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopUpstreamSidebar { padding-top: ${MACOS_TITLEBAR_HEIGHT}px; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"][data-sidebar-collapsed] .dshDesktopUpstreamSidebar { width: ${SIDEBAR_COLLAPSED}px; margin: 0 auto; }
.dshDesktopFrame[data-desktop-platform="darwin"] { grid-template-rows: ${MACOS_TITLEBAR_HEIGHT}px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface { grid-row: 1 / -1; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface::before { content: ""; position: absolute; top: 0; right: 0; left: ${MACOS_TRAFFIC_LIGHT_SAFE_WIDTH}px; height: ${MACOS_DRAG_REGION_HEIGHT}px; user-select: none; -webkit-app-region: drag; }
.dshDesktopMacCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopMacCaptionRow::before { content: ""; position: absolute; top: 0; right: 0; left: 0; height: ${MACOS_DRAG_REGION_HEIGHT}px; user-select: none; -webkit-app-region: drag; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
.dshDesktopDetailsSurface { grid-column: 3; grid-row: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l2); }
.dshDesktopFrame[data-desktop-platform="win32"] { grid-template-rows: ${WINDOWS_TITLEBAR_HEIGHT}px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopSidebarSurface { grid-row: 1 / -1; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopWindowsCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopWindowsCaptionRow::before { content: ""; position: absolute; inset: 0 ${WINDOWS_CAPTION_CONTROLS_WIDTH}px 0 0; user-select: none; -webkit-app-region: drag; }
.dshDesktopFrame[data-sidebar-collapsed] { transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopOverlay { position: absolute; z-index: 1000; inset: 0; pointer-events: none; }
.dshDesktopOverlay > * { pointer-events: auto; }
.dshDesktopResizeHandle { position: absolute; z-index: 50; top: 0; bottom: 0; width: 8px; margin-left: -4px; cursor: col-resize; touch-action: none; -webkit-app-region: no-drag; }
.dshDesktopNoDrag, button, input, textarea, select, a, [role="button"], [role="dialog"], [role="presentation"] { -webkit-app-region: no-drag; }
[role="dialog"], [aria-modal="true"] { -webkit-app-region: no-drag !important; }
html:has([aria-modal="true"]) .dshDesktopWindowsCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopMacCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface::before { -webkit-app-region: no-drag !important; }
@media (prefers-reduced-motion: reduce) { .dshDesktopFrame { transition: none !important; } }
`

/** Install and remove the desktop-owned Changes tab styles. */
export function installWorkspaceChangesStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/workspace-changes'
  style.textContent = WORKSPACE_CHANGES_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Install and remove the desktop-owned About settings styles. */
export function installDesktopAboutStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/about'
  style.textContent = DESKTOP_ABOUT_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Install and remove the desktop-owned Workbench and context-menu styles. */
export function installDesktopWorkbenchStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/workbench'
  style.textContent = DESKTOP_WORKBENCH_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Install and remove the advanced shell's global native-window styles. @returns the style disposer. */
export function installAdvancedStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/advanced-shell'
  style.textContent = ADVANCED_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
