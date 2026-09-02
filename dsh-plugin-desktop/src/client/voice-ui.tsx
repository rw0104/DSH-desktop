import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DesktopVoiceController } from './voice-controller.ts'
import type { DesktopVoiceState, DesktopVoiceSettings } from './voice-controller.ts'
import type { VoiceKey } from './voice-locales.ts'
import { VoiceOrb } from './voice-orb.tsx'
import type { DesktopExternalNavigationAction } from '../external-navigation-contract.ts'

export interface VoiceInjected {
  controller: DesktopVoiceController
}

type VoiceButtonProps = { session: { sessionId: string }; controller: DesktopVoiceController; t: (key: VoiceKey) => string }

export function VoiceComposerButton({ session, controller, t }: VoiceButtonProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const ready = state.settings.provider === 'qwen'
    ? state.qwenKeyConfigured && (state.settings.qwenEndpointMode === 'shared' || state.settings.qwenWorkspaceId.trim().length > 0)
    : state.doubaoAppIdConfigured && state.doubaoAccessKeyConfigured && state.settings.doubaoRealtimeUrl.startsWith('wss://')
  const active = controller.isActive()
  if (!state.settings.enabled && !active) return null
  return (
    <button
      type="button"
      className={`dshVoiceComposerButton${active ? ' is-active' : ''}`}
      aria-label={active ? t('button.stop') : t('button.start')}
      title={ready ? (active ? t('button.stop') : t('button.start')) : t('button.unavailable')}
      disabled={!ready && !active}
      onClick={() => { if (active) void controller.finish(); else void controller.openAndStart(session.sessionId) }}
    >
      <span className="dshVoiceWaveIcon" aria-hidden><span /><span /><span /><span /></span>
    </button>
  )
}

export function VoiceSidebarTab({ controller, scope }: { controller: DesktopVoiceController; scope: { sessionId: string; cwd?: string } }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const status = statusText(state)
  return (
    <section className="dshVoicePanel" aria-label="Realtime voice">
      <header className="dshVoicePanelHeader">
        <div>
          <span className="dshVoicePanelEyebrow"><span className="dshVoiceGlyph is-wave" aria-hidden /> Realtime voice</span>
          <h2>{voiceModeTitle(state)}</h2>
        </div>
        <span className={`dshVoiceStatus is-${state.status}`}>{status}</span>
      </header>
      <dl className="dshVoiceSessionInfo">
        <div><dt>Mode</dt><dd>{state.sessionInfo.conversationMode}</dd></div>
        <div><dt>Audio</dt><dd>{state.sessionInfo.audioSource}</dd></div>
        <div><dt>Model</dt><dd>{state.sessionInfo.modelId || 'Not connected'}</dd></div>
        <div><dt>Voice</dt><dd>{state.sessionInfo.voice || 'Off'}</dd></div>
        <div><dt>Authority</dt><dd>{state.sessionInfo.agentAuthority}</dd></div>
        <div><dt>Build</dt><dd>{state.sessionInfo.buildCommit}</dd></div>
      </dl>
      {state.error !== null && <div className="dshVoiceError" role="alert">{state.error}</div>}
      <div className="dshVoicePresence">
        <VoiceOrb status={state.status} inputFeatures={state.inputAudio} outputFeatures={state.outputAudio} label={status} />
      </div>
      <div className={`dshVoiceTranscript${state.turns.length ? ' has-content' : ''}`} aria-live="polite">
        {state.turns.length === 0 && state.liveInput === '' && state.liveOutput === '' && (
          <div className="dshVoiceEmpty">{state.settings.enabled ? 'Speak naturally. Your transcript will appear here.' : 'Enable realtime voice in Settings to begin.'}</div>
        )}
        {state.turns.map(turn => <article key={turn.id} className={`dshVoiceTurn is-${turn.role}`}><span>{turn.role === 'user' ? 'You' : 'Agent'}</span><p>{turn.text}</p></article>)}
        {state.liveInput !== '' && <article className="dshVoiceTurn is-user is-live"><span>You</span><p>{state.liveInput}</p></article>}
        {state.liveOutput !== '' && <article className="dshVoiceTurn is-assistant is-live"><span>Agent</span><p>{state.liveOutput}</p></article>}
      </div>
      <div className="dshVoiceControls">
        <button type="button" className="dshVoiceControl" disabled={!controller.isActive()} aria-pressed={state.microphoneMuted} onClick={() => { void controller.toggleMicrophone() }}>
          <span className="dshVoiceGlyph is-mic" aria-hidden /> {state.microphoneMuted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="dshVoicePrimary" disabled={state.status === 'finishing'} onClick={() => { if (controller.isActive()) void controller.finish(); else void controller.start(scope.sessionId) }}>
          <span className={`dshVoiceGlyph is-${state.status === 'finishing' ? 'loading' : controller.isActive() ? 'stop' : 'start'}`} aria-hidden />
          {controller.isActive() ? 'End' : 'Start voice'}
        </button>
        <button type="button" className="dshVoiceControl" disabled={!controller.isActive()} aria-pressed={state.outputMuted} onClick={() => { controller.toggleOutput() }}>
          <span className="dshVoiceGlyph is-speaker" aria-hidden /> {state.outputMuted ? 'Sound on' : 'Speaker'}
        </button>
      </div>
      <p className="dshVoicePrivacy">Microphone audio is relayed to the selected provider while a session is active.</p>
    </section>
  )
}

type VoiceSettingsProps = {
  controller: DesktopVoiceController
  t: (key: VoiceKey) => string
  openExternal: (action: DesktopExternalNavigationAction) => Promise<void>
}

export function VoiceSettingsSection({ controller, t, openExternal }: VoiceSettingsProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const [draft, setDraft] = useState(state.settings)
  const [qwenKey, setQwenKey] = useState('')
  const [doubaoAppId, setDoubaoAppId] = useState('')
  const [doubaoAccessKey, setDoubaoAccessKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setDraft(state.settings) }, [state.settings])
  const update = <K extends keyof DesktopVoiceSettings>(key: K, value: DesktopVoiceSettings[K]): void => {
    setDraft(current => ({ ...current, [key]: value }))
    setSaved(false)
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(state.settings) || qwenKey.trim() !== '' || doubaoAppId.trim() !== '' || doubaoAccessKey.trim() !== ''
  const save = async (): Promise<void> => {
    setSaving(true)
    const ok = await controller.saveConfiguration(draft, { qwenKey, doubaoAppId, doubaoAccessKey })
    if (ok) {
      setQwenKey('')
      setDoubaoAppId('')
      setDoubaoAccessKey('')
      setSaved(true)
    }
    setSaving(false)
  }
  return (
    <div className="dshVoiceSettings">
      <div className="dshVoiceSettingsIntro"><span className="dshVoiceSettingsEyebrow">Desktop capability</span><h2>{t('settings.title')}</h2><p>{t('settings.intro')}</p></div>
      <button className="dshVoiceGuideLink" type="button" data-external-action="realtime-voice-credentials" onClick={() => { void openExternal('realtime-voice-credentials').catch(() => {}) }}>{t('settings.credentialsGuide')}<span aria-hidden>↗</span></button>
      <label className="dshVoiceSwitch"><input type="checkbox" checked={draft.enabled} onChange={event => { update('enabled', event.target.checked) }} /><span /><strong>{t('settings.enabled')}</strong></label>
      <div className="dshVoiceField"><label htmlFor="dsh-voice-provider">{t('settings.provider')}</label><select id="dsh-voice-provider" value={draft.provider} onChange={event => { update('provider', event.target.value as DesktopVoiceSettings['provider']) }}><option value="qwen">Qwen 实时语音识别</option><option value="doubao">豆包 Seed-ASR 2</option></select></div>
      {(draft.provider !== 'qwen' || draft.conversationMode === 'cascade') && <label className="dshVoiceSwitch"><input id="dsh-voice-tts-enabled" type="checkbox" checked={draft.ttsEnabled} onChange={event => { update('ttsEnabled', event.target.checked) }} /><span /><strong>{t('settings.ttsEnabled')}</strong></label>}
      {draft.provider === 'qwen'
        ? <QwenSettings state={state} draft={draft} update={update} t={t} qwenKey={qwenKey} setQwenKey={value => { setQwenKey(value); setSaved(false) }} />
        : <DoubaoSettings state={state} draft={draft} update={update} t={t} doubaoAppId={doubaoAppId} setDoubaoAppId={value => { setDoubaoAppId(value); setSaved(false) }} doubaoAccessKey={doubaoAccessKey} setDoubaoAccessKey={value => { setDoubaoAccessKey(value); setSaved(false) }} />}
      {state.error !== null && <p className="dshVoiceSettingsError" role="alert">{state.error}</p>}
      <div className="dshVoiceSettingsActions">
        <button id="dsh-voice-save-all" type="button" disabled={!changed || saving} onClick={() => { void save() }}>{saving ? t('settings.saving') : t('settings.saveAll')}</button>
        <span role="status" aria-live="polite">{saved ? t('settings.saved') : ''}</span>
      </div>
      <div className="dshVoiceSettingsNote"><span className="dshVoiceGlyph is-settings" aria-hidden /><span>{t('settings.secretNote')}</span></div>
    </div>
  )
}

function QwenSettings({ state, draft, update, t, qwenKey, setQwenKey }: { state: DesktopVoiceState; draft: DesktopVoiceSettings; update: <K extends keyof DesktopVoiceSettings>(key: K, value: DesktopVoiceSettings[K]) => void; t: (key: VoiceKey) => string; qwenKey: string; setQwenKey: (value: string) => void }) {
  return <>
    <div className="dshVoiceField"><label htmlFor="dsh-voice-conversation-mode">{t('settings.conversationMode')}</label><select id="dsh-voice-conversation-mode" value={draft.conversationMode} onChange={event => { update('conversationMode', event.target.value as DesktopVoiceSettings['conversationMode']) }}><option value="cascade">{t('settings.cascadeMode')}</option><option value="qwen-hybrid">{t('settings.qwenHybridMode')}</option><option value="qwen-native">{t('settings.qwenNativeMode')}</option></select></div>
    <div className="dshVoiceField"><label htmlFor="dsh-qwen-endpoint-mode">{t('settings.endpointMode')}</label><select id="dsh-qwen-endpoint-mode" value={draft.qwenEndpointMode} onChange={event => { update('qwenEndpointMode', event.target.value as DesktopVoiceSettings['qwenEndpointMode']) }}><option value="shared">{t('settings.apiKeyOnly')}</option><option value="workspace">{t('settings.workspaceDedicated')}</option></select></div>
    {draft.qwenEndpointMode === 'workspace' && <div className="dshVoiceField"><label htmlFor="dsh-qwen-workspace">{t('settings.workspace')}</label><input id="dsh-qwen-workspace" value={draft.qwenWorkspaceId} placeholder="llm-xxxxxxxxxxxx" onChange={event => { update('qwenWorkspaceId', event.target.value) }} /><span className="dshVoiceProviderNotice">{t('settings.workspaceHint')}</span></div>}
    {draft.conversationMode !== 'cascade' ? <>
      <div className="dshVoiceField"><label htmlFor="dsh-qwen-e2e-model">{t('settings.providerVoiceModel')}</label><input id="dsh-qwen-e2e-model" value={draft.qwenE2eModel} readOnly /></div>
      <div className="dshVoiceField"><label htmlFor="dsh-qwen-e2e-voice">{t('settings.providerVoice')}</label><select id="dsh-qwen-e2e-voice" value={draft.qwenE2eVoice} onChange={event => { update('qwenE2eVoice', event.target.value) }}><option value="longanqian">龙安芊 · 默认女声</option><option value="longanlingxin">龙安灵心 · 温暖女声</option><option value="longanlingxi">龙安灵希 · 甜美女声</option><option value="longanxiaoxin">龙安小新 · 活力童声</option><option value="longanlufeng">龙安鲁风 · 明亮男声</option></select></div>
      <p className="dshVoiceExperimentalNotice">{t(draft.conversationMode === 'qwen-native' ? 'settings.nativeNotice' : 'settings.hybridNotice')}</p>
    </> : <>
      <div className="dshVoiceField"><label htmlFor="dsh-qwen-model">{t('settings.model')}</label><input id="dsh-qwen-model" value={draft.qwenModel} readOnly /></div>
      <div className="dshVoiceField"><label htmlFor="dsh-qwen-tts-model">{t('settings.ttsModel')}</label><input id="dsh-qwen-tts-model" value={draft.qwenTtsModel} readOnly /></div>
      <div className="dshVoiceField"><label htmlFor="dsh-qwen-tts-voice">{t('settings.ttsVoice')}</label><select id="dsh-qwen-tts-voice" value={draft.qwenTtsVoice} disabled={!draft.ttsEnabled} onChange={event => { update('qwenTtsVoice', event.target.value) }}><option value="Cherry">Cherry · 阳光自然女声</option><option value="Serena">Serena · 温柔女声</option><option value="Ethan">Ethan · 温暖活力男声</option><option value="Moon">Moon · 大气男声</option><option value="Maia">Maia · 知性温柔女声</option><option value="Kai">Kai · 舒缓男声</option><option value="Dylan">Dylan · 北京男声</option><option value="Kiki">Kiki · 粤语女声</option></select></div>
    </>}
    <KeyField id="dsh-qwen-key" label={t('settings.apiKey')} configured={state.qwenKeyConfigured} writable={state.qwenKeyWritable} value={qwenKey} onChange={setQwenKey} />
  </>
}

function DoubaoSettings({ state, draft, update, t, doubaoAppId, setDoubaoAppId, doubaoAccessKey, setDoubaoAccessKey }: { state: DesktopVoiceState; draft: DesktopVoiceSettings; update: <K extends keyof DesktopVoiceSettings>(key: K, value: DesktopVoiceSettings[K]) => void; t: (key: VoiceKey) => string; doubaoAppId: string; setDoubaoAppId: (value: string) => void; doubaoAccessKey: string; setDoubaoAccessKey: (value: string) => void }) {
  return <>
    <div className="dshVoiceField"><label htmlFor="dsh-doubao-model">{t('settings.model')}</label><input id="dsh-doubao-model" value={draft.doubaoModel} readOnly /></div>
    <div className="dshVoiceField"><label htmlFor="dsh-doubao-endpoint">{t('settings.endpoint')}</label><input id="dsh-doubao-endpoint" value={draft.doubaoRealtimeUrl} placeholder="wss://..." onChange={event => { update('doubaoRealtimeUrl', event.target.value) }} /></div>
    <div className="dshVoiceField"><label htmlFor="dsh-doubao-resource">{t('settings.resource')}</label><input id="dsh-doubao-resource" value={draft.doubaoResourceId} onChange={event => { update('doubaoResourceId', event.target.value) }} /></div>
    <div className="dshVoiceField"><label htmlFor="dsh-doubao-app-key">{t('settings.appKey')}</label><input id="dsh-doubao-app-key" value={draft.doubaoAppKey} onChange={event => { update('doubaoAppKey', event.target.value) }} /></div>
    <div className="dshVoiceField"><label htmlFor="dsh-doubao-tts-endpoint">{t('settings.ttsEndpoint')}</label><input id="dsh-doubao-tts-endpoint" value={draft.doubaoTtsEndpoint} readOnly /></div>
    <div className="dshVoiceField"><label htmlFor="dsh-doubao-tts-resource">{t('settings.ttsResource')}</label><input id="dsh-doubao-tts-resource" value={draft.doubaoTtsResourceId} onChange={event => { update('doubaoTtsResourceId', event.target.value) }} /></div>
    <div className="dshVoiceField"><label htmlFor="dsh-doubao-tts-voice">{t('settings.ttsVoice')}</label><select id="dsh-doubao-tts-voice" value={draft.doubaoTtsVoice} disabled={!draft.ttsEnabled} onChange={event => { update('doubaoTtsVoice', event.target.value) }}><option value="zh_female_vv_uranus_bigtts">Vivi 2.0 · 活泼自然女声</option><option value="zh_female_xiaohe_uranus_bigtts">小何 2.0 · 甜美女声</option><option value="zh_male_m191_uranus_bigtts">云舟 2.0 · 沉稳男声</option><option value="zh_male_taocheng_uranus_bigtts">小天 2.0 · 磁性男声</option><option value="zh_male_ruyayichen_uranus_bigtts">儒雅逸辰 2.0 · 儒雅男声</option><option value="zh_female_cancan_uranus_bigtts">知性灿灿 2.0 · 知性女声</option></select></div>
    <KeyField id="dsh-doubao-app-id" label={t('settings.appId')} configured={state.doubaoAppIdConfigured} writable={state.doubaoAppIdWritable} value={doubaoAppId} onChange={setDoubaoAppId} />
    <KeyField id="dsh-doubao-access-key" label={t('settings.accessKey')} configured={state.doubaoAccessKeyConfigured} writable={state.doubaoAccessKeyWritable} value={doubaoAccessKey} onChange={setDoubaoAccessKey} />
    <p className="dshVoiceProviderNotice">{t('settings.doubaoNotice')}</p>
  </>
}

function KeyField({ id, label, configured, writable, value, onChange }: { id: string; label: string; configured: boolean; writable: boolean; value: string; onChange: (value: string) => void }) {
  return <div className="dshVoiceKeyField"><div className="dshVoiceKeyLabel"><label htmlFor={id}>{label}</label><span className={configured ? 'is-configured' : ''}>{configured ? 'Configured' : 'Not set'}</span></div><input id={id} type="password" autoComplete="off" value={value} disabled={!writable} placeholder={configured ? 'Stored securely' : 'Paste provider key'} onChange={event => { onChange(event.target.value) }} /></div>
}

function statusText(state: DesktopVoiceState): string {
  const labels: Record<DesktopVoiceState['status'], string> = { idle: 'Ready', requesting: 'Requesting mic', connecting: 'Connecting', listening: 'Listening', 'user-speaking': 'Listening to you', thinking: 'Thinking', 'assistant-speaking': 'Speaking', finishing: 'Finishing', ended: 'Ended', error: 'Needs attention' }
  return labels[state.status]
}

function voiceModeTitle(state: DesktopVoiceState): string {
  if (state.settings.provider === 'doubao') return 'Doubao Seed-ASR 2'
  if (state.sessionInfo.conversationMode === 'qwen-native') return 'Qwen native voice Agent'
  if (state.sessionInfo.conversationMode === 'qwen-hybrid') return 'Qwen Agent bridge'
  return 'Qwen Agent cascade'
}
