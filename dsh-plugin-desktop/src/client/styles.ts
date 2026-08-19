import {
  MACOS_DRAG_REGION_HEIGHT,
  MACOS_TITLEBAR_HEIGHT,
  MACOS_TRAFFIC_LIGHT_SAFE_WIDTH,
  WINDOWS_CAPTION_CONTROLS_WIDTH,
  WINDOWS_TITLEBAR_HEIGHT,
} from '../window-chrome.ts'
import { SIDEBAR_COLLAPSED } from './layout-state.ts'

/** Windows integration that applies in both compatibility and advanced presentation. */
const DESKTOP_INTEGRATION_STYLES = `
body[data-dsh-title-bar-compat] [data-dsh-better-sidebar] > div:first-child {
  top: calc(var(--dsh-title-bar-strip, 40px) - 12px);
}

/* A path-less Files tab is the explorer home. When its tree is open, remove
   the empty preview column completely and let the tree own the full body. */
[class*="editorBody"]:has(> [class*="editorMain"] > [class*="editorPlaceholder"]:only-child):has(> [class*="editorTreeDock"]) > [class*="editorMain"] {
  display: none !important;
}
[class*="editorBody"]:has(> [class*="editorMain"] > [class*="editorPlaceholder"]:only-child):has(> [class*="editorTreeDock"]) > [class*="editorTreeDock"] {
  flex: 1 1 auto !important;
  width: 100% !important;
  border-left: 0 !important;
}
[class*="editorBody"]:has(> [class*="editorMain"] > [class*="editorPlaceholder"]:only-child):has(> [class*="editorTreeDock"]) [class*="editorTreeResize"] {
  display: none !important;
}
`

/** Styles for the desktop-owned About section in Settings. */
const ABOUT_STYLES = `
.dshWorkspaceChanges { display:flex; flex-direction:column; min-height:100%; color:var(--dsw-alias-label-primary); }
.dshWorkspaceChangesHeader { display:flex; align-items:center; justify-content:space-between; min-height:40px; padding:0 10px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceChangesBranch { display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:var(--dsw-font-xxs-strong-12); }
.dshWorkspaceChangesIcon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border:0; border-radius:6px; color:var(--dsw-alias-label-secondary); background:transparent; cursor:pointer; }
.dshWorkspaceChangesIcon:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshWorkspaceChangesIcon:disabled { opacity:.45; cursor:default; }
.dshWorkspaceChangesRow { display:flex; align-items:center; gap:6px; min-height:34px; padding:0 8px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceChangesBadge { width:22px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); text-align:center; }
.dshWorkspaceChangesPath { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:var(--dsw-font-xxs-12); }
.dshWorkspaceChangesAction { flex:none; min-height:24px; padding:0 7px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-secondary); background:transparent; font:var(--dsw-font-xxxs-11); cursor:pointer; }
.dshWorkspaceChangesAction:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshWorkspaceChangesEmpty { padding:18px 12px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxs-12); }
.dshWorkspaceChangesError { padding:10px 12px; color:var(--dsw-alias-state-error-primary); font:var(--dsw-font-xxs-12); }
.dshDesktopAbout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 720px;
}
.dshDesktopAboutIntro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dshDesktopAboutTitle {
  margin: 0;
  font: var(--dsw-font-s-strong-14);
  font-size: 18px;
  color: var(--dsw-alias-label-primary);
}
.dshDesktopAboutSubtitle {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  line-height: 1.5;
}
.dshDesktopAboutRows {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dshDesktopAboutRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dshDesktopAboutLabel {
  color: var(--dsw-alias-label-secondary);
}
.dshDesktopAboutValue {
  color: var(--dsw-alias-label-primary);
  text-align: right;
}
.dshDesktopAboutValue code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dshDesktopAboutLink {
  color: var(--dsw-alias-interactive-label-primary);
  text-decoration: none;
}
.dshDesktopAboutLink:hover { text-decoration: underline; }
.dshDesktopAboutActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dshDesktopAboutAction {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
}
.dshDesktopAboutAction:hover { background: var(--dsw-alias-interactive-bg-hover); }
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

/** Install desktop-to-plugin chrome alignment shared by every Windows presentation mode. */
export function installDesktopIntegrationStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/integration'
  style.textContent = DESKTOP_INTEGRATION_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Install the desktop-owned About section styles. */
export function installDesktopAboutStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/about'
  style.textContent = ABOUT_STYLES
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
