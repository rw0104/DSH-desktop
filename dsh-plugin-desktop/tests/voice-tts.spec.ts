import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AgentSpeechChunker,
  buildQwenTtsSessionUpdate,
  buildQwenTtsTextAppend,
  buildQwenTtsUrl,
  createVoiceTtsStream,
  DoubaoSseParser,
} from '../src/voice-tts.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('desktop voice provider TTS contracts', () => {
  it('builds shared and workspace Qwen TTS URLs', () => {
    expect(buildQwenTtsUrl({ endpointMode: 'shared', workspaceId: '', model: 'qwen3-tts-flash-realtime' }))
      .toBe('wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime')
    expect(buildQwenTtsUrl({ endpointMode: 'workspace', workspaceId: 'llm-workspace-1', model: 'qwen3-tts-flash-realtime' }))
      .toBe('wss://llm-workspace-1.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime')
  })

  it('configures Qwen TTS for a natural provider voice and 24 kHz PCM', () => {
    expect(JSON.parse(buildQwenTtsSessionUpdate('Cherry'))).toMatchObject({
      type: 'session.update',
      session: {
        voice: 'Cherry',
        mode: 'server_commit',
        language_type: 'Auto',
        response_format: 'pcm',
        sample_rate: 24000,
      },
    })
    expect(JSON.parse(buildQwenTtsTextAppend('你好。'))).toMatchObject({
      type: 'input_text_buffer.append',
      text: '你好。',
    })
  })

  it('emits complete natural sentences and flushes the final fragment', () => {
    const chunker = new AgentSpeechChunker()
    expect(chunker.push('**你好**，')).toEqual([])
    expect(chunker.push('世界。[文档](https://example.com)')).toEqual(['你好，世界。'])
    expect(chunker.finish()).toEqual(['文档'])
  })

  it('bounds long unpunctuated output without reading code or URLs', () => {
    const chunker = new AgentSpeechChunker(16)
    const chunks = chunker.push(`这是一个很长的自然语言回答没有标点而且还在继续 \`secret()\` https://example.com/path`)
    expect(chunks[0]?.length).toBeLessThanOrEqual(16)
    expect([...chunks, ...chunker.finish()].join('')).not.toMatch(/secret|https|example\.com/u)
  })

  it('parses Volcengine SSE audio across transport chunk boundaries', () => {
    const parser = new DoubaoSseParser()
    expect(parser.push('data: {"code":20000000,"data":"AQ')).toEqual([])
    const frames = parser.push('IDBA=="}\n\n')
    expect(frames).toHaveLength(1)
    expect([...frames[0]!]).toEqual([1, 2, 3, 4])
    expect(parser.finish()).toEqual([])
  })

  it('rejects Volcengine provider errors instead of playing invalid audio', () => {
    const parser = new DoubaoSseParser()
    expect(() => parser.push('data: {"code":55000000,"message":"resource mismatch"}\n\n'))
      .toThrow(/resource mismatch/u)
  })

  it('streams Doubao PCM frames through the Host adapter in request order', async () => {
    const encoder = new TextEncoder()
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"code":20000000,"data":"AQIDBA=="}\n\n'))
        controller.close()
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const audio: Buffer[] = []
    let finish!: () => void
    const done = new Promise<void>(resolve => { finish = resolve })
    const stream = createVoiceTtsStream({
      provider: 'doubao',
      endpoint: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse',
      resourceId: 'seed-tts-2.0',
      voice: 'zh_female_vv_uranus_bigtts',
      appId: 'app-id',
      accessKey: 'access-key',
    }, {
      onStarted: vi.fn(),
      onAudio: frame => { audio.push(frame) },
      onDone: finish,
      onError: error => { throw error },
    })
    stream.append('你好。')
    stream.finish()
    await done

    expect(audio.map(frame => [...frame])).toEqual([[1, 2, 3, 4]])
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v3/tts/'), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Api-App-Id': 'app-id',
        'X-Api-Access-Key': 'access-key',
        'X-Api-Resource-Id': 'seed-tts-2.0',
      }),
    }))
  })
})
