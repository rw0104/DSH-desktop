export function installExperienceStyles(): () => void {
  const style = document.createElement('style')
  style.textContent = `
  .dsh-add { position:relative; display:flex; align-items:center }
  .dsh-add>button { width:28px; height:28px; border:0; border-radius:7px; background:transparent; color:inherit; cursor:pointer; font-size:21px }
  .dsh-add>button:hover,.dsh-context-menu button:hover,.dsh-context-menu button:focus-visible { background:var(--dsh-fill-secondary,rgba(128,128,128,.16)) }
  .dsh-add button:disabled { opacity:.4; cursor:default }
  .dsh-context-menu { position:fixed; z-index:10000; min-width:190px; max-width:calc(100vw - 16px); padding:5px; border:1px solid var(--dsh-line-color,rgba(128,128,128,.25)); border-radius:10px; background:var(--dsh-bg-elevated,#fff); color:var(--dsh-text-primary,#252525); box-shadow:0 8px 32px #0003; font:13px/1.5 inherit }
  .dsh-context-menu button { display:block; text-align:left; width:100%; border:0; border-radius:6px; padding:8px 12px; background:transparent; color:inherit; cursor:pointer }
  .dsh-file-status { box-sizing:border-box; width:calc(100% - 32px); max-width:724px; margin:0 auto 8px; font-size:12px; line-height:1.5; padding:8px 12px; max-height:140px; overflow:auto; overflow-wrap:anywhere; color:var(--dsw-alias-label-secondary,inherit) }
  .dsh-file-status>div { margin:3px 0 }
  .dsh-file-status button { border:0; border-radius:5px; padding:3px 7px; margin-left:4px; background:transparent; color:var(--dsw-alias-label-link,#1965cf); font:inherit; cursor:pointer }
  .dsh-file-status button:hover { background:var(--dsw-alias-interactive-bg-hover,#8882) }
  .dsh-image-dialog { padding:0; border:0; background:#171717; color:white; border-radius:12px; width:min(94vw,1400px); max-width:94vw; max-height:94vh; box-shadow:0 16px 70px #0008 }
  .dsh-image-dialog::backdrop { background:#000b }
  .dsh-image-toolbar { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid #ffffff20 }
  .dsh-image-toolbar span { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .dsh-image-toolbar button { border:1px solid #ffffff30; border-radius:7px; background:#fff1; color:inherit; padding:7px 12px; cursor:pointer }
  .dsh-original-image { display:block; margin:auto; max-width:100%; max-height:calc(90vh - 110px); object-fit:contain }
  .dsh-image-status { padding:8px 16px; font-size:12px; margin:0 }
  .dsh-context-menu { background:var(--dsw-alias-bg-base,#fff); color:var(--dsw-alias-label-primary,#252525); border-color:var(--dsw-alias-border-main,rgba(128,128,128,.25)) }
  `
  document.head.append(style)
  return () => style.remove()
}
