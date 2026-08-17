/** Self-contained styles for the desktop workbench control strip. */
export const CONTROL_STRIP_STYLES = `
.dshDesktopControlStrip { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; min-height: 38px; padding: 6px 12px 4px; color: var(--dsw-alias-text-secondary); user-select: none; }
.dshDesktopControlStripLabel { font: 500 12px/18px var(--dsw-font-family, system-ui, sans-serif); letter-spacing: .02em; }
.dshDesktopControlStripActions { display: flex; align-items: center; gap: 4px; }
.dshDesktopControlButton { appearance: none; border: 0; border-radius: 6px; padding: 5px 9px; color: var(--dsw-alias-text-secondary); background: transparent; font: 500 12px/16px var(--dsw-font-family, system-ui, sans-serif); user-select: none; cursor: default; }
.dshDesktopControlButton:hover { background: var(--dsw-alias-fill-secondary); color: var(--dsw-alias-text-primary); }
.dshDesktopControlButton:active { background: var(--dsw-alias-fill-tertiary); }
.dshDesktopControlButton[aria-pressed="true"] { background: var(--dsw-alias-fill-secondary); color: var(--dsw-alias-text-primary); }
.dshDesktopControlButton:focus-visible { outline: 2px solid var(--dsw-alias-focus-ring); outline-offset: 1px; }
`
