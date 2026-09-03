import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceComposerButton, VoiceSettingsSection, VoiceSidebarTab } from '../src/client/voice-ui.tsx'
import { DesktopVoiceController, VOICE_SETTINGS_PATH } from '../src/client/voice-controller.ts'
import type { DesktopVoiceState } from '../src/client/voice-controller.ts'

const t = (key: string): string => key

afterEach(() => { vi.unstubAllGlobals() })

function state(overrides: Partial<DesktopVoiceState> = {}): DesktopVoiceState {
  return {
    settings: {
      enabled: false,
      provider: 'qwen',
      qwenModel: 'qwen3-asr-flash-realtime',
      qwenEndpointMode: 'shared',
      qwenWorkspaceId: '',
      conversationMode: 'cascade',
      qwenE2eModel: 'qwen-audio-3.0-realtime-flash',
      qwenE2eVoice: 'longanqian',
      ttsEnabled: true,
      qwenTtsModel: 'qwen3-tts-flash-realtime',
      qwenTtsVoice: 'Cherry',
      doubaoModel: 'doubao-seed-asr-2',
      doubaoRealtimeUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
      doubaoResourceId: 'volc.seedasr.sauc.duration',
      doubaoAppKey: 'PlgvMymc7f3tQnJ6',
      doubaoTtsEndpoint: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse',
      doubaoTtsResourceId: 'seed-tts-2.0',
      doubaoTtsVoice: 'zh_female_vv_uranus_bigtts',
      systemPrompt: 'You are a concise, friendly realtime voice assistant.',
    },
    qwenKeyConfigured: false,
    doubaoAppIdConfigured: false,
    doubaoAccessKeyConfigured: false,
    qwenKeyWritable: true,
    doubaoAppIdWritable: true,
    doubaoAccessKeyWritable: true,
    status: 'idle',
    sessionId: '',
    sessionInfo: { conversationMode: 'cascade', audioSource: 'none', modelId: '', voice: '', agentAuthority: 'dsh-agent', buildCommit: 'development' },
    turns: [],
    liveInput: '',
    liveOutput: '',
    microphoneMuted: false,
    outputMuted: false,
    inputAudio: { rms: 0, peak: 0, low: 0, mid: 0, high: 0 },
    outputAudio: { rms: 0, peak: 0, low: 0, mid: 0, high: 0 },
    error: null,
    ...overrides,
  }
}

function controller(snapshot: DesktopVoiceState): DesktopVoiceController {
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    isActive: () => snapshot.status !== 'idle',
    openAndStart: vi.fn(),
    finish: vi.fn(),
    start: vi.fn(),
    toggleMicrophone: vi.fn(),
    toggleOutput: vi.fn(),
    setSetting: vi.fn(),
    setCredential: vi.fn(),
    saveConfiguration: vi.fn(),
  } as unknown as DesktopVoiceController
}

const openExternal = vi.fn().mockResolvedValue(undefined)

describe('desktop voice surfaces', () => {
  it('keeps the composer button hidden while the user disables voice', () => {
    const html = renderToStaticMarkup(createElement(VoiceComposerButton, {
      session: { sessionId: 'session-1' },
      controller: controller(state()),
      t,
    } as never))
    expect(html).toBe('')
  })

  it('shows the composer button only after enabling voice', () => {
    const html = renderToStaticMarkup(createElement(VoiceComposerButton, {
      session: { sessionId: 'session-1' },
      controller: controller(state({
        settings: {
          ...state().settings,
          enabled: true,
          qwenWorkspaceId: 'workspace-1',
        },
        qwenKeyConfigured: true,
      })),
      t,
    } as never))
    expect(html).toContain('dshVoiceComposerButton')
    expect(html).toContain('dshVoiceWaveIcon')
    expect(html).not.toContain('is-start')
    expect(html).toContain('aria-label="button.start"')
  })

  it('allows Qwen API-key-only setup without a Workspace ID', () => {
    const html = renderToStaticMarkup(createElement(VoiceComposerButton, {
      session: { sessionId: 'session-1' },
      controller: controller(state({
        settings: { ...state().settings, enabled: true, qwenEndpointMode: 'shared' },
        qwenKeyConfigured: true,
      })),
      t,
    } as never))
    expect(html).toContain('dshVoiceComposerButton')
    expect(html).not.toContain('disabled')
  })

  it('renders provider settings and the Doubao credential fields', () => {
    const snapshot = state({ settings: { ...state().settings, enabled: true, provider: 'doubao' } })
    const html = renderToStaticMarkup(createElement(VoiceSettingsSection, {
      controller: controller(snapshot),
      t,
      openExternal,
    } as never))
    expect(html).toContain('dshVoiceSettings')
    expect(html).toContain('dsh-doubao-endpoint')
    expect(html).toContain('dsh-doubao-tts-voice')
    expect(html).toContain('dsh-voice-tts-enabled')
    expect(html).toContain('settings.doubaoNotice')
    expect(html).toContain('id="dsh-voice-save-all"')
    expect(html).toContain('data-external-action="realtime-voice-credentials"')
  })

  it('renders Qwen provider voice selection', () => {
    const html = renderToStaticMarkup(createElement(VoiceSettingsSection, {
      controller: controller(state()),
      t,
      openExternal,
    } as never))
    expect(html).toContain('dsh-qwen-tts-voice')
    expect(html).toContain('dsh-voice-conversation-mode')
    expect(html).toContain('value="qwen-native"')
    expect(html).not.toContain('value="qwen-e2e"')
    expect(html).not.toContain('value="qwen-hybrid"')
    expect(html).toContain('value="Cherry"')
  })

  it('requires an explicit choice before leaving the internal bridge mode', () => {
    const html = renderToStaticMarkup(createElement(VoiceSettingsSection, {
      controller: controller(state({ settings: { ...state().settings, conversationMode: 'qwen-hybrid' } })),
      t,
      openExternal,
    } as never))
    expect(html).toContain('settings.hybridInternalNotice')
    expect(html).toContain('settings.cascadeMode')
    expect(html).toContain('settings.qwenNativeMode')
    expect(html).not.toContain('<option value="qwen-hybrid">')
  })

  it('hides independent TTS controls and identifies provider-native audio', () => {
    const snapshot = state({
      settings: { ...state().settings, conversationMode: 'qwen-native' },
      sessionInfo: {
        conversationMode: 'qwen-native',
        audioSource: 'provider-native',
        modelId: 'qwen-audio-3.0-realtime-flash',
        voice: 'longanqian',
        agentAuthority: 'qwen-conversation+dsh-capabilities-and-approvals',
        buildCommit: 'abc123456789',
      },
    })
    const settingsHtml = renderToStaticMarkup(createElement(VoiceSettingsSection, {
      controller: controller(snapshot),
      t,
      openExternal,
    } as never))
    const sidebarHtml = renderToStaticMarkup(createElement(VoiceSidebarTab, {
      controller: controller(snapshot),
      scope: { sessionId: 'session-1' },
    }))

    expect(settingsHtml).not.toContain('dsh-voice-tts-enabled')
    expect(settingsHtml).not.toContain('dsh-qwen-tts-model')
    expect(settingsHtml).not.toContain('dsh-qwen-tts-voice')
    expect(settingsHtml).toContain('settings.nativeNotice')
    expect(sidebarHtml).toContain('Qwen native voice Agent')
    expect(sidebarHtml).toContain('provider-native')
    expect(sidebarHtml).toContain('abc123456789')
  })

  it('keeps the sidebar transcript accessible', () => {
    const html = renderToStaticMarkup(createElement(VoiceSidebarTab, {
      controller: controller(state({
        settings: { ...state().settings, enabled: true },
        turns: [{ id: 'turn-1', role: 'assistant', text: 'Hello from Qwen' }],
      })),
      scope: { sessionId: 'session-1' },
    }))
    expect(html).toContain('aria-label="Realtime voice"')
    expect(html).toContain('dshVoiceOrb')
    expect(html).toContain('Hello from Qwen')
  })

  it('saves the settings draft and entered secrets as one action', async () => {
    const credentialSet = vi.fn().mockResolvedValue({ result: { ok: true } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const snapshot = state({ settings: { ...state().settings, enabled: true } })
    const scope = {
      getSnapshot: () => ({ value: snapshot.settings }),
      subscribe: () => () => {},
      set: vi.fn(),
    }
    const voice = new DesktopVoiceController({
      settingsScope: { bind: () => scope },
      get: () => ({ api: { credentials: {
        describe: vi.fn().mockResolvedValue({ result: { ok: true, value: { credentials: {} } } }),
        set: credentialSet,
        unset: vi.fn(),
      } } }),
    } as never, { openTab: vi.fn() })

    await expect(voice.saveConfiguration(snapshot.settings, {
      qwenKey: '  sk-new  ',
      doubaoAppId: '',
      doubaoAccessKey: '',
    })).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(VOICE_SETTINGS_PATH, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(snapshot.settings),
    }))
    expect(credentialSet).toHaveBeenCalledOnce()
    expect(credentialSet).toHaveBeenCalledWith({ ref: 'DASHSCOPE_API_KEY', value: 'sk-new' })
  })
})
