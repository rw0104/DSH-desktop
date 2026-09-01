import { describe, expect, it } from 'vitest'
import {
  buildQwenAsrUrl,
  buildQwenSessionFinish,
  buildQwenSessionUpdate,
  DesktopVoiceSettingsSchema,
} from '../src/voice-realtime.ts'

describe('desktop voice host settings', () => {
  it('defaults to disabled Qwen ASR with no secret values in settings', () => {
    expect(DesktopVoiceSettingsSchema({} as never)).toEqual({
      enabled: false,
      provider: 'qwen',
      qwenModel: 'qwen3-asr-flash-realtime',
      qwenEndpointMode: 'shared',
      qwenWorkspaceId: '',
      doubaoModel: 'doubao-seed-asr-2',
      doubaoRealtimeUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
      doubaoResourceId: 'volc.seedasr.sauc.duration',
      doubaoAppKey: 'PlgvMymc7f3tQnJ6',
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
