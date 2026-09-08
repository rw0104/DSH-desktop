import { installSettingsModalCoordinator } from './settings-modal.ts'

/** The slot wrapper is public; the settings-only semantic child shape is tested. */
export const DESKTOP_SETTINGS_MASK = '[data-slot="sidebar.settings"] > [role="presentation"]:has(> [role="dialog"] [data-slot="settings.header"]) > [aria-hidden="true"]'

export function installDesktopSettingsPresentation(): () => void {
  const previous = document.body.getAttribute('data-dsh-desktop-experience')
  document.body.setAttribute('data-dsh-desktop-experience', 'desktop')
  const style = document.createElement('style')
  style.dataset.pluginCss = 'dsh-plugin-desktop/settings-presentation'
  style.textContent = `
body[data-dsh-desktop-experience="desktop"] ${DESKTOP_SETTINGS_MASK} { background:rgb(0 0 0 / 12%); backdrop-filter:none; -webkit-backdrop-filter:none; }
body[data-dsh-desktop-experience="desktop"][data-ds-dark-theme] ${DESKTOP_SETTINGS_MASK} { background:rgb(0 0 0 / 24%); }
body[data-dsh-desktop-experience="desktop"] ${DESKTOP_SETTINGS_MASK}[data-dsh-settings-covered] { background:transparent; }
.dshDesktopAppearance { max-width:720px; color:var(--dsw-alias-label-primary); }
.dshDesktopAppearance h2 { margin:0 0 12px; font:var(--dsw-font-l-strong-20,600 20px/1.4 system-ui); }
.dshDesktopAppearance p { margin:0 0 20px; line-height:1.5; color:var(--dsw-alias-label-secondary); }
.dshDesktopAppearance fieldset { border:0; padding:0; margin:0 0 20px; }
.dshDesktopAppearance legend { margin-bottom:12px; font-weight:600; }
.dshDesktopAppearance label { display:flex; align-items:flex-start; gap:12px; padding:12px 0; cursor:pointer; }
.dshDesktopAppearance small { display:block; margin-top:4px; color:var(--dsw-alias-label-secondary); line-height:1.5; }
.dshDesktopAppearance input { margin:4px 0 0; accent-color:var(--dsw-alias-interactive-label-primary); }
.dshDesktopAppearance button,.dshVoiceLegacy button { min-height:34px; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; padding:6px 12px; background:var(--dsw-alias-bg-layer-1); color:inherit; font:inherit; cursor:pointer; }
.dshDesktopAppearance button:disabled { opacity:.5; cursor:default; }
.dshDesktopAppearance :focus-visible,.dshVoiceLegacy button:focus-visible { outline:2px solid var(--dsw-alias-interactive-label-primary); outline-offset:2px; }
.dshVoiceLegacy { padding:16px; color:var(--dsw-alias-label-primary); }
`
  document.head.appendChild(style)
  const removeModalCoordinator = installSettingsModalCoordinator(DESKTOP_SETTINGS_MASK)
  return () => {
    removeModalCoordinator()
    style.remove()
    if (document.body.getAttribute('data-dsh-desktop-experience') !== 'desktop') return
    if (previous === null) document.body.removeAttribute('data-dsh-desktop-experience')
    else document.body.setAttribute('data-dsh-desktop-experience', previous)
  }
}
