import { describe, expect, it, vi } from 'vitest'
import {
  buildQwenAsrUrl,
  buildQwenSessionFinish,
  buildQwenSessionUpdate,
  buildDshCapabilityResult,
  desktopBuildCommit,
  DesktopVoiceSettingsSchema,
  effectiveVoiceAudioSource,
  normalizeVoiceConversationMode,
  shouldUseIndependentVoiceTts,
  VoiceAgentBridge,
  voiceAgentAuthority,
} from '../src/voice-realtime.ts'

describe('desktop voice host settings', () => {
  it('defaults to disabled Qwen ASR with no secret values in settings', () => {
    expect(DesktopVoiceSettingsSchema({} as never)).toEqual({
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
      systemPrompt: '你是一个简洁、友好的实时语音助手。需要时使用当前 DSH Agent 提供的工具完成任务。',
    })
  })

  it('accepts the two supported provider choices without storing keys', () => {
    const value = DesktopVoiceSettingsSchema({ provider: 'doubao', enabled: true } as never)
    expect(value.provider).toBe('doubao')
    expect(value.enabled).toBe(true)
    expect(value).not.toHaveProperty('apiKey')
    expect(value).not.toHaveProperty('qwenApiKey')
  })

  it('migrates the legacy qwen-e2e value to the accurately named hybrid mode', () => {
    expect(normalizeVoiceConversationMode('qwen-e2e')).toBe('qwen-hybrid')
    expect(DesktopVoiceSettingsSchema({ conversationMode: 'qwen-e2e' } as never).conversationMode).toBe('qwen-hybrid')
    expect(DesktopVoiceSettingsSchema({ conversationMode: 'qwen-native' } as never).conversationMode).toBe('qwen-native')
  })

  it('reports effective audio source without treating provider-native output as TTS', () => {
    expect(effectiveVoiceAudioSource({ provider: 'qwen', conversationMode: 'qwen-native', ttsEnabled: true })).toBe('provider-native')
    expect(effectiveVoiceAudioSource({ provider: 'qwen', conversationMode: 'qwen-hybrid', ttsEnabled: true })).toBe('provider-native')
    expect(effectiveVoiceAudioSource({ provider: 'qwen', conversationMode: 'cascade', ttsEnabled: true })).toBe('provider-tts')
    expect(effectiveVoiceAudioSource({ provider: 'qwen', conversationMode: 'cascade', ttsEnabled: false })).toBe('none')
    expect(shouldUseIndependentVoiceTts({ provider: 'qwen', conversationMode: 'qwen-native', ttsEnabled: true })).toBe(false)
    expect(shouldUseIndependentVoiceTts({ provider: 'qwen', conversationMode: 'qwen-hybrid', ttsEnabled: true })).toBe(false)
    expect(shouldUseIndependentVoiceTts({ provider: 'qwen', conversationMode: 'cascade', ttsEnabled: true })).toBe(true)
    expect(voiceAgentAuthority({ provider: 'qwen', conversationMode: 'qwen-hybrid' })).toBe('dsh-agent+qwen-voice')
    expect(voiceAgentAuthority({ provider: 'qwen', conversationMode: 'qwen-native' })).toBe('qwen-conversation+dsh-capabilities-and-approvals')
  })

  it('returns a bounded structured capability result', () => {
    expect(JSON.parse(buildDshCapabilityResult('completed', '  done  '))).toEqual({
      status: 'completed',
      summary: 'done',
      facts: [],
      artifacts: [],
      approvals: [],
      errors: [],
    })
    expect(desktopBuildCommit()).toMatch(/^(development|[0-9a-f]{7,40})$/u)
  })

  it('never creates an independent TTS stream or cancels a keyboard turn in provider voice mode', () => {
    const createTtsStream = vi.fn()
    const cancel = vi.fn()
    const client = { readyState: 1, send: vi.fn() }
    const ctx = {
      agents: { get: vi.fn(() => ({ status: 'running', cancel })) },
      logger: { info: vi.fn(), warn: vi.fn() },
    }
    const bridge = new VoiceAgentBridge(
      client as never,
      { provider: 'qwen', conversationMode: 'qwen-native', sessionId: 'voice-1', agentSessionId: 'agent-1' } as never,
      ctx as never,
      'sk-test',
      undefined,
      undefined,
      createTtsStream as never,
    )

    bridge.onAgentEvent({ type: 'turn/start', data: { turn: 1 } })
    bridge.onAgentEvent({ type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'keyboard output' } } })
    bridge.onAgentEvent({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
    ;(bridge as any).onE2eSpeechStarted()

    expect(createTtsStream).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('connects directly to the Qwen ASR model on shared and workspace endpoints', () => {
    expect(buildQwenAsrUrl({
      model: 'qwen3-asr-flash-realtime',
      qwenEndpointMode: 'shared',
      workspaceId: '',
    })).toBe('wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime')
    expect(buildQwenAsrUrl({
      model: 'qwen3-asr-flash-realtime',
      qwenEndpointMode: 'workspace',
      workspaceId: 'llm-workspace-1',
    })).toBe('wss://llm-workspace-1.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime')
  })

  it('sends only fields supported by the Qwen ASR realtime session', () => {
    const update = JSON.parse(buildQwenSessionUpdate()) as Record<string, unknown>
    expect(update).toMatchObject({
      type: 'session.update',
      session: {
        input_audio_format: 'pcm',
        sample_rate: 16000,
        turn_detection: {
          type: 'server_vad',
          threshold: 0,
          silence_duration_ms: 400,
        },
      },
    })
    expect(JSON.stringify(update)).not.toMatch(/livetranslate|translation|modalities|instructions|"model"|"language":"auto"/u)
  })

  it('finishes Qwen ASR using the provider session lifecycle', () => {
    expect(JSON.parse(buildQwenSessionFinish())).toMatchObject({ type: 'session.finish' })
  })
})
