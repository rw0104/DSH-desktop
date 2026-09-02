const VOICE_STYLES = `
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
.dshVoicePanel { display:flex; flex-direction:column; min-height:100%; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); }
.dshVoicePanelHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:16px 14px 13px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dshVoicePanelEyebrow, .dshVoiceSettingsEyebrow { display:flex; align-items:center; gap:5px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); letter-spacing:.06em; text-transform:uppercase; }
.dshVoicePanel h2 { margin:4px 0 0; font:var(--dsw-font-s-strong-14); }
.dshVoiceStatus { flex:none; padding:4px 7px; border-radius:5px; color:var(--dsw-alias-label-tertiary); background:var(--dsw-alias-bg-layer-1); font:var(--dsw-font-xxxs-11); }
.dshVoiceStatus.is-listening, .dshVoiceStatus.is-assistant-speaking { color:var(--dsw-alias-state-success-primary); }
.dshVoiceStatus.is-error { color:var(--dsw-alias-state-error-primary); }
.dshVoiceError { margin:10px 12px 0; padding:8px 9px; border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); border-radius:6px; color:var(--dsw-alias-state-error-primary); font:var(--dsw-font-xxs-12); line-height:1.4; }
.dshVoicePresence { flex:none; min-height:188px; border-bottom:1px solid var(--dsw-alias-border-l2); overflow:hidden; }
.dshVoiceOrb { position:relative; display:grid; grid-template-rows:158px 24px; place-items:center; min-height:188px; margin:0; overflow:hidden; isolation:isolate; }
.dshVoiceOrbCanvas { z-index:1; display:block; width:min(100%, 230px); height:158px; }
.dshVoiceOrbFallback { position:absolute; top:42px; z-index:0; width:92px; aspect-ratio:1; border-radius:50%; background:linear-gradient(180deg,#7d84ff,#8a9eff 42%,#fafbff 62%,#e8ecff); box-shadow:0 0 22px rgb(85 105 255 / 14%); }
.dshVoiceOrb figcaption { z-index:2; display:inline-flex; align-items:center; gap:7px; min-height:24px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshVoiceOrb figcaption > span { width:6px; height:6px; border-radius:50%; background:#5f73f2; box-shadow:0 0 0 4px rgb(95 115 242 / 11%); }
.dshVoiceOrb.is-error figcaption > span { background:var(--dsw-alias-state-error-primary); box-shadow:none; }
.dshVoiceOrb.is-idle figcaption > span, .dshVoiceOrb.is-ended figcaption > span { background:var(--dsw-alias-label-tertiary); box-shadow:none; }
.dshVoiceTranscript { flex:1; min-height:150px; padding:14px 12px; overflow:auto; }
.dshVoiceEmpty { padding:25px 8px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxs-12); line-height:1.5; text-align:center; }
.dshVoiceTurn { margin:0 0 12px; }
.dshVoiceTurn span { display:block; margin-bottom:3px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); }
.dshVoiceTurn p { margin:0; color:var(--dsw-alias-label-primary); font:var(--dsw-font-xxs-12); line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
.dshVoiceTurn.is-user p { color:var(--dsw-alias-interactive-label-primary); }
.dshVoiceTurn.is-live p { opacity:.75; }
.dshVoiceControls { display:grid; grid-template-columns:1fr 1.2fr 1fr; gap:6px; padding:11px 12px; border-top:1px solid var(--dsw-alias-border-l2); }
.dshVoiceControls button { display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:0; min-height:32px; padding:0 7px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; color:var(--dsw-alias-label-secondary); background:transparent; font:var(--dsw-font-xxxs-11); cursor:pointer; }
.dshVoiceControls button:hover:not(:disabled) { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dshVoiceControls button:disabled { opacity:.4; cursor:default; }
.dshVoiceControls .dshVoicePrimary { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); }
.dshVoicePrivacy { margin:0; padding:0 12px 12px; color:var(--dsw-alias-label-tertiary); font:var(--dsw-font-xxxs-11); line-height:1.4; }
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
