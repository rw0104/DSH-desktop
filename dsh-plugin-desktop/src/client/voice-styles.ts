const VOICE_STYLES = `
.dshVoiceDialog { position:fixed; inset:56px 24px auto auto; margin:0; width:min(500px,calc(100vw - 32px)); height:min(680px,calc(100dvh - 80px)); max-height:calc(100dvh - 32px); padding:0; border:1px solid var(--dsw-alias-border-l2); border-radius:16px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); box-shadow:0 16px 50px rgb(0 0 0 / 18%); overflow:hidden; pointer-events:auto; }
.dshVoiceDialog[open] { display:flex; }
.dshVoiceWindowAction { flex:none; display:grid; place-items:center; width:30px; height:30px; border:0; border-radius:6px; color:inherit; background:transparent; cursor:pointer; font-size:20px; }
.dshVoiceWindowAction:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dshVoicePanel button:focus-visible,.dshVoiceCompact button:focus-visible,.dshVoiceDetails summary:focus-visible,.dshVoiceTranscript:focus-visible { outline:2px solid var(--dsw-alias-interactive-label-primary); outline-offset:-2px; }
.dshVoiceDetails { flex:none; max-height:30%; overflow:auto; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshVoiceDetails summary { padding:8px 14px; cursor:pointer; color:var(--dsw-alias-label-secondary); font:var(--dsw-font-xxs-12); }
.dshVoiceCaptions { position:relative; display:flex; flex:1; min-height:0; overflow:hidden; }
.dshVoiceLatest { position:absolute; inset:auto auto 10px 50%; transform:translateX(-50%); border:1px solid var(--dsw-alias-border-l2); border-radius:16px; padding:5px 12px; color:var(--dsw-alias-interactive-label-primary); background:var(--dsw-alias-bg-base); cursor:pointer; box-shadow:0 3px 12px rgb(0 0 0 / 10%); }
.dshVoiceTask { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:5px 10px; padding:8px 14px; font:var(--dsw-font-xxs-12); background:var(--dsw-alias-bg-layer-1); }
.dshVoiceTask strong { width:100%; }
.dshVoiceTask span { flex:1; min-width:160px; color:var(--dsw-alias-label-secondary); }
.dshVoiceTask button { border:0; background:transparent; color:var(--dsw-alias-interactive-label-primary); cursor:pointer; }
.dshVoiceCompact { position:fixed; inset:auto 20px 20px auto; display:flex; align-items:center; gap:8px; width:min(420px,calc(100vw - 32px)); padding:10px; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); box-shadow:0 8px 30px rgb(0 0 0 / 15%); pointer-events:auto; }
.dshVoiceCompact button { min-height:34px; padding:6px 9px; border:0; border-radius:6px; background:transparent; color:inherit; cursor:pointer; }
.dshVoiceCompact button:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dshVoiceCompact .dshVoiceCompactRestore { flex:1; min-width:0; display:flex; align-items:center; gap:8px; text-align:start; }
.dshVoiceCompactRestore > span:last-child { overflow:hidden; }
.dshVoiceCompactRestore small { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-secondary); }
.dshVoiceCompactIndicator { width:9px; height:9px; border-radius:50%; background:var(--dsw-alias-state-success-primary); flex:none; }
.dshVoiceCompact .dshVoiceEnd { color:var(--dsw-alias-state-error-primary); }
.dshVoiceComposerButton { display:inline-grid; place-items:center; width:34px; height:34px; padding:0; border:0; border-radius:50%; color:#fff; background:#367ff5; box-shadow:0 3px 10px rgb(54 127 245 / 22%); cursor:pointer; transition:transform 140ms ease, background 140ms ease, box-shadow 140ms ease; }
.dshVoiceComposerButton:hover { background:#286fe4; box-shadow:0 4px 13px rgb(54 127 245 / 30%); transform:translateY(-1px); }
.dshVoiceComposerButton.is-active { background:#2169da; box-shadow:0 0 0 4px rgb(54 127 245 / 14%), 0 4px 13px rgb(54 127 245 / 26%); }
.dshVoiceComposerButton:disabled { opacity:.45; cursor:default; }
.dshVoiceWaveIcon { display:flex; align-items:center; justify-content:center; gap:3px; width:20px; height:20px; }
.dshVoiceWaveIcon > span { width:2px; border-radius:999px; background:currentColor; transform-origin:center; }
.dshVoiceWaveIcon > span:nth-child(1) { height:8px; }
.dshVoiceWaveIcon > span:nth-child(2) { height:17px; }
.dshVoiceWaveIcon > span:nth-child(3) { height:12px; }
.dshVoiceWaveIcon > span:nth-child(4) { height:7px; }
.dshVoiceComposerButton.is-active .dshVoiceWaveIcon > span { animation:dshVoiceBars 760ms ease-in-out infinite alternate; }
.dshVoiceComposerButton.is-active .dshVoiceWaveIcon > span:nth-child(2) { animation-delay:-240ms; }
.dshVoiceComposerButton.is-active .dshVoiceWaveIcon > span:nth-child(3) { animation-delay:-480ms; }
.dshVoiceComposerButton.is-active .dshVoiceWaveIcon > span:nth-child(4) { animation-delay:-120ms; }
.dshVoiceGlyph { display:inline-block; flex:none; width:14px; height:14px; position:relative; color:currentColor; }
.dshVoiceGlyph.is-start::before { content:""; position:absolute; inset:2px 1px 2px 4px; border-left:8px solid currentColor; border-top:5px solid transparent; border-bottom:5px solid transparent; }
.dshVoiceGlyph.is-stop::before { content:""; position:absolute; inset:3px; border-radius:2px; background:currentColor; }
.dshVoiceGlyph.is-loading { border:2px solid currentColor; border-right-color:transparent; border-radius:50%; box-sizing:border-box; animation:dshVoiceSpin .8s linear infinite; }
.dshVoiceGlyph.is-mic::before { content:""; position:absolute; left:4px; top:1px; width:6px; height:9px; border:1px solid currentColor; border-radius:4px; }
.dshVoiceGlyph.is-mic::after { content:""; position:absolute; left:2px; bottom:1px; width:10px; height:6px; border:1px solid currentColor; border-top:0; border-radius:0 0 8px 8px; }
.dshVoiceGlyph.is-speaker::before { content:""; position:absolute; left:1px; top:5px; width:4px; height:5px; background:currentColor; box-shadow:4px -3px 0 -1px currentColor; }
.dshVoiceGlyph.is-wave::before { content:""; position:absolute; inset:2px 0; border-top:2px solid currentColor; border-bottom:2px solid currentColor; transform:skewY(-20deg); }
.dshVoiceGlyph.is-settings::before { content:""; position:absolute; inset:2px; border:2px dotted currentColor; border-radius:50%; }
@keyframes dshVoiceSpin { to { transform:rotate(360deg); } }
@keyframes dshVoiceBars { from { transform:scaleY(.55); opacity:.7; } to { transform:scaleY(1.05); opacity:1; } }
.dshVoicePanel { display:flex; flex:1; flex-direction:column; min-height:0; height:100%; width:100%; overflow:hidden; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); }
.dshVoicePanelHeader { display:flex; flex:none; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshVoicePanelHeader > div { flex:1; min-width:0; }
.dshVoiceSessionInfo { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 14px; margin:0; padding:10px 14px; border-bottom:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); }
.dshVoiceSessionInfo div { min-width:0; }
.dshVoiceSessionInfo dt { color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxs-12); }
.dshVoiceSessionInfo dd { overflow:hidden; margin:2px 0 0; color:var(--dsw-alias-label-secondary); font:var(--dsw-font-xxs-12); text-overflow:ellipsis; white-space:nowrap; }
.dshVoicePanelEyebrow, .dshVoiceSettingsEyebrow { display:flex; align-items:center; gap:5px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); letter-spacing:.06em; text-transform:uppercase; }
.dshVoicePanel h2 { margin:4px 0 0; font:var(--dsw-font-s-strong-14); }
.dshVoiceStatus { flex:none; padding:4px 7px; border-radius:5px; color:var(--dsw-alias-label-tertiary); background:var(--dsw-alias-bg-layer-1); font:var(--dsw-font-xxxs-11); }
.dshVoiceStatus.is-listening, .dshVoiceStatus.is-assistant-speaking { color:var(--dsw-alias-state-success-primary); }
.dshVoiceStatus.is-error { color:var(--dsw-alias-state-error-primary); }
.dshVoiceError { margin:10px 12px 0; padding:8px 9px; border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); border-radius:6px; color:var(--dsw-alias-state-error-primary); font:var(--dsw-font-xxs-12); line-height:1.4; }
.dshVoicePresence { flex:none; height:150px; border-bottom:1px solid var(--dsw-alias-border-l2); overflow:hidden; }
.dshVoiceOrb { position:relative; display:grid; grid-template-rows:minmax(0,1fr) 24px; place-items:center; height:100%; margin:0; overflow:hidden; isolation:isolate; }
.dshVoiceOrbCanvas { z-index:1; display:block; width:auto; max-width:100%; height:100%; aspect-ratio:1; min-height:0; }
.dshVoiceOrbFallback { position:absolute; top:42px; z-index:0; width:92px; aspect-ratio:1; border-radius:50%; background:linear-gradient(180deg,#7d84ff,#8a9eff 42%,#fafbff 62%,#e8ecff); box-shadow:0 0 22px rgb(85 105 255 / 14%); }
.dshVoiceOrb figcaption { z-index:2; display:inline-flex; align-items:center; gap:7px; min-height:24px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshVoiceOrb figcaption > span { width:6px; height:6px; border-radius:50%; background:#5f73f2; box-shadow:0 0 0 4px rgb(95 115 242 / 11%); }
.dshVoiceOrb.is-error figcaption > span { background:var(--dsw-alias-state-error-primary); box-shadow:none; }
.dshVoiceOrb.is-idle figcaption > span, .dshVoiceOrb.is-ended figcaption > span { background:var(--dsw-alias-label-tertiary); box-shadow:none; }
.dshVoiceTranscript { flex:1; min-height:0; padding:14px 12px; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
.dshVoiceEmpty { padding:25px 8px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxs-12); line-height:1.5; text-align:center; }
.dshVoiceTurn { margin:0 0 12px; }
.dshVoiceTurn span { display:block; margin-bottom:3px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshVoiceTurn p { margin:0; color:var(--dsw-alias-label-primary); font:var(--dsw-font-xxs-12); line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
.dshVoiceTurn.is-user p { color:var(--dsw-alias-interactive-label-primary); }
.dshVoiceTurn.is-live p { opacity:.75; }
.dshVoiceControls { display:grid; flex:none; grid-template-columns:1fr 1.2fr 1fr; gap:6px; padding:11px 12px; border-top:1px solid var(--dsw-alias-border-l2); }
.dshVoiceControls button { display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:0; min-height:32px; padding:0 7px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-secondary); background:transparent; font:var(--dsw-font-xxxs-11); cursor:pointer; }
.dshVoiceControls button:hover:not(:disabled) { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshVoiceControls button:disabled { opacity:.4; cursor:default; }
.dshVoiceControls .dshVoicePrimary { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); }
.dshVoicePrivacy { flex:none; margin:0; padding:0 12px 10px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); line-height:1.4; }
@media (max-height:620px) { .dshVoiceDialog { inset:16px 16px auto auto; height:calc(100dvh - 32px); } .dshVoicePresence { height:100px; } .dshVoicePanelHeader { padding:8px 12px; } }
@media (max-width:600px) { .dshVoiceDialog { inset:12px; width:calc(100vw - 24px); height:calc(100dvh - 24px); } .dshVoiceCompact { inset:auto 12px 12px; width:auto; } }
@media (forced-colors:active) { .dshVoiceDialog,.dshVoiceCompact { border-color:CanvasText; background:Canvas; color:CanvasText; box-shadow:none; } }
.dshVoiceSettings { display:flex; flex-direction:column; gap:16px; width:100%; max-width:650px; padding-bottom:22px; }
.dshVoiceSettingsIntro { display:flex; flex-direction:column; gap:5px; }
.dshVoiceSettingsIntro h2 { margin:0; font:var(--dsw-font-s-strong-14); font-size:18px; }
.dshVoiceSettingsIntro p { margin:0; color:var(--dsw-alias-label-secondary); line-height:1.5; }
.dshVoiceGuideLink { align-self:flex-start; display:inline-flex; align-items:center; gap:6px; min-height:30px; padding:0; border:0; color:var(--dsw-alias-state-business-primary); background:transparent; font:var(--dsw-font-xxs-12); font-weight:650; cursor:pointer; }
.dshVoiceGuideLink:hover { text-decoration:underline; text-underline-offset:3px; }
.dshVoiceGuideLink span { font-size:13px; }
.dshVoiceSwitch { display:flex; align-items:center; gap:9px; min-height:40px; color:var(--dsw-alias-label-primary); font:var(--dsw-font-xxs-12); cursor:pointer; }
.dshVoiceSwitch input { position:absolute; width:1px; height:1px; opacity:0; }
.dshVoiceSwitch span { position:relative; width:36px; height:20px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); transition:background 140ms ease; }
.dshVoiceSwitch span::after { content:""; position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:var(--dsw-alias-label-tertiary); transition:transform 140ms ease, background 140ms ease; }
.dshVoiceSwitch input:checked + span { background:var(--dsw-alias-state-success-primary); }
.dshVoiceSwitch input:checked + span::after { transform:translateX(16px); background:white; }
.dshVoiceField, .dshVoiceKeyField { display:flex; flex-direction:column; gap:6px; }
.dshVoiceField > label, .dshVoiceKeyLabel label { color:var(--dsw-alias-label-secondary); font:var(--dsw-font-xxs-12); }
.dshVoiceField input, .dshVoiceField select, .dshVoiceField textarea, .dshVoiceKeyField > input { box-sizing:border-box; width:100%; min-height:38px; padding:0 10px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-primary); font:var(--dsw-font-xxs-12); }
.dshVoiceField textarea { min-height:84px; padding-block:9px; line-height:1.5; resize:vertical; }
.dshVoiceField input:focus, .dshVoiceField select:focus, .dshVoiceField textarea:focus, .dshVoiceKeyField > input:focus { outline:2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, transparent); outline-offset:1px; }
.dshVoiceKeyLabel { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.dshVoiceKeyLabel span { color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshVoiceKeyLabel span.is-configured { color:var(--dsw-alias-state-success-primary); }
.dshVoiceSettingsError { margin:0; color:var(--dsw-alias-state-error-primary); font:var(--dsw-font-xxs-12); line-height:1.45; }
.dshVoiceProviderNotice { margin:0; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxs-12); line-height:1.45; }
.dshVoiceExperimentalNotice { margin:0; padding:9px 10px; border-left:3px solid var(--dsw-alias-state-business-primary); color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-1); font:var(--dsw-font-xxs-12); line-height:1.5; }
.dshVoiceCompatibilityNotice { display:flex; flex-direction:column; gap:9px; padding:10px; border-left:3px solid var(--dsw-alias-state-business-primary); color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-1); font:var(--dsw-font-xxs-12); line-height:1.5; }
.dshVoiceCompatibilityNotice p { margin:0; }
.dshVoiceCompatibilityActions { display:flex; flex-wrap:wrap; gap:8px; }
.dshVoiceCompatibilityActions button { min-height:32px; padding:0 10px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-primary); font:var(--dsw-font-xxs-12); cursor:pointer; }
.dshVoiceCompatibilityActions button:hover { border-color:var(--dsw-alias-state-business-primary); }
.dshVoiceSettingsActions { display:flex; align-items:center; gap:10px; padding-top:3px; }
.dshVoiceSettingsActions button { min-height:38px; padding:0 15px; border:0; border-radius:6px; color:#fff; background:#367ff5; font:var(--dsw-font-xxs-12); font-weight:650; cursor:pointer; }
.dshVoiceSettingsActions button:hover:not(:disabled) { background:#286fe4; }
.dshVoiceSettingsActions button:disabled { opacity:.42; cursor:default; }
.dshVoiceSettingsActions span { color:var(--dsw-alias-state-success-primary); font:var(--dsw-font-xxs-12); }
.dshVoiceSettingsNote { display:flex; align-items:flex-start; gap:7px; padding-top:5px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); line-height:1.45; }
@media (prefers-reduced-motion:reduce) { .dshVoiceComposerButton, .dshVoiceSwitch span, .dshVoiceSwitch span::after { transition:none; } .dshVoiceGlyph.is-loading, .dshVoiceWaveIcon > span { animation:none !important; } }
`

export function installVoiceStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/voice'
  style.textContent = VOICE_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
