import React, { useState } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import * as reactDOM from 'react-dom'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'
import * as store from '@deepseek-ai/dsh-client-store'
import settingsCode from '../../node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js?raw'
import attachmentCode from '../../node_modules/@deepseek-ai/dsh-client-ui-attachment/lib/client.js?raw'
import { ImagePreview } from '../../src/client/experience-images.tsx'
import { DesktopVoiceController } from '../../src/client/voice-controller.ts'
import { VoiceOverlay, VoiceComposerButton } from '../../src/client/voice-ui.tsx'
import { installVoiceStyles } from '../../src/client/voice-styles.ts'
import { voiceLocales } from '../../src/client/voice-locales.ts'
import { installDesktopSettingsPresentation, DESKTOP_SETTINGS_MASK } from '../../src/client/settings-presentation.ts'

// Export-only instrumentation: run the exact shipped SettingsRoot function and
// its shipped CSS, with controlled slot contents and session state.
let SettingsRoot!: React.ComponentType<any>
let ImageLightbox!: React.ComponentType<any>
const dependencies: Record<string, unknown> = { react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': reactDOM,
  '@deepseek-ai/dsh-client-ui-primitives': primitives, '@deepseek-ai/dsh-client-ui-slots': slots, '@deepseek-ai/dsh-client-store': store }
const instrumented = settingsCode.replace('return module.exports;', 'module.exports.fixtureSettingsRoot = SettingsRoot; return module.exports;')
function loadFixture(code: string, exported: string) {
  let component: any
  Object.assign(window, { __ModuleLoader__: { load: ({ factory }: any) => { component = factory((name: string) => dependencies[name])[exported] } } })
  new Function('window', 'document', code)(window, document)
  delete (window as any).__ModuleLoader__
  return component
}
SettingsRoot = loadFixture(instrumented, 'fixtureSettingsRoot')
ImageLightbox = loadFixture(attachmentCode.replace('return module.exports;', 'module.exports.fixtureImageLightbox = DefaultImageLightbox; return module.exports;'), 'fixtureImageLightbox')

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQyLz0HwAEQwJTHlVcYAAAAABJRU5ErkJggg=='

function Content() {
  const [nested, setNested] = useState(false)
  const [menu, setMenu] = useState(false)
  const [language, setLanguage] = useState('中文')
  const [image, setImage] = useState(false)
  const [nativeImage, setNativeImage] = useState(false)
  return <><h2>Agent 预设</h2><p>标准模式：文件编辑、Shell、检索、Skills、计划、目标和工作流。</p>
    <primitives.Menu open={menu} onClose={() => setMenu(false)} portal anchor={<button onClick={() => setMenu(true)}>语言：{language}</button>} items={[{ id: 'en', label: 'English' }, { id: 'zh', label: '中文' }]} onSelect={id => { setLanguage(id === 'en' ? 'English' : '中文'); setMenu(false) }} />
    <button onClick={() => setNested(true)}>打开嵌套确认</button><primitives.Modal open={nested} onClose={() => setNested(false)} title="嵌套确认" closeLabel="关闭确认"><button onClick={() => setNested(false)}>完成</button></primitives.Modal>
    <button onClick={() => setImage(true)}>打开上游图片</button>{image && <ImageLightbox src={PNG} alt="fixture" labels={{ dialog: '上游图片预览', close: '关闭图片' }} onClose={() => setImage(false)} />}
    <button onClick={() => setNativeImage(true)}>打开原图预览</button>{nativeImage && <ImagePreview src={PNG} name="fixture.png" zh onClose={() => setNativeImage(false)} />}
  </>
}
const sections = [{ id: 'agent-presets', label: 'Agent 预设' }, { id: 'general', label: '通用设置' }]
const root = createRoot(document.getElementById('settings-root')!)
root.render(<div data-slot="sidebar.settings"><SettingsRoot wide={true} reconnect={() => {}} useConnectionState={(select: any) => select('connected')} useSections={(select: any) => select(sections)} useOnboardingSteps={(select: any) => select([])} useSessions={(select: any) => select({ phase: 'ready', current: 'one', byId: { one: { blank: false } } })} t={(key: string) => key === 'trigger' ? '设置' : key} renderSlot={(name: string) => <span data-slot={name}>{name === 'settings.trigger' || name === 'settings.header' ? '设置' : name === 'settings.close' ? '关闭设置' : name === 'settings.section' ? <Content /> : null}</span>} /></div>)
let remove: (() => void) | undefined
const counters = { tickets: 0, microphone: 0, stopped: 0, closed: 0 }
globalThis.fetch = async () => { counters.tickets++; return new Response(JSON.stringify({ error: 'Fixture transport stopped after visible-panel verification' }), { status: 503 }) }
Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => { counters.microphone++; throw new Error('No microphone in the surface fixture') } } })
const voice = new DesktopVoiceController({
  settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: async () => {} }) },
  remote: { credentials: { describe: async () => ({ ok: true, value: { DASHSCOPE_API_KEY: { configured: true } } }) } },
} as never)
voice.store.set({ ...voice.getSnapshot(), settings: { ...voice.getSnapshot().settings, enabled: true } })
const voiceRootElement = document.createElement('div')
document.body.appendChild(voiceRootElement)
const voiceRoot = createRoot(voiceRootElement)
installVoiceStyles()
voiceRoot.render(<><div style={{ position: 'fixed', left: 32, top: 160 }}><VoiceComposerButton sessionId={'surface-session' as never} controller={voice} t={key => voiceLocales.zh[key]} /></div><VoiceOverlay controller={voice} locale={{ subscribe: () => () => {}, getSnapshot: () => 'zh' }} /></>)
const socket = { readyState: 1, send() {}, close() { counters.closed++; this.readyState = 3 } }
Object.assign(window, { fixture: {
  mask: DESKTOP_SETTINGS_MASK, voice, counters,
  install: () => { remove ??= installDesktopSettingsPresentation() },
  dispose: () => { remove?.(); remove = undefined },
  active: () => {
    (voice as any).socket = socket;
    (voice as any).stream = { getTracks: () => [{ stop: () => counters.stopped++ }] }
    voice.store.set({ ...voice.getSnapshot(), status: 'listening', error: null })
  },
  task: () => (voice as any).handleSocketMessage(socket, { data: JSON.stringify({ type: 'agent.request.accepted' }) }),
  unmount: async () => { root.unmount(); voiceRoot.unmount(); await voice.dispose(); remove?.() },
} })
