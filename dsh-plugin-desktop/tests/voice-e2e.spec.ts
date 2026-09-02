import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildQwenE2eFunctionOutput,
  buildQwenE2eResponseCancel,
  buildQwenE2eResponseCreate,
  buildQwenE2eSessionUpdate,
  buildQwenE2eUrl,
  parseDshAgentTurnCall,
  QwenE2eError,
  QwenE2eSession,
} from '../src/voice-e2e.ts'
import type { QwenE2eSink, QwenE2eSpec } from '../src/voice-e2e.ts'

class FakeSocket {
  readyState = 0
  readonly sent: string[] = []
  readonly listeners = new Map<string, Array<(...args: any[]) => void>>()
  on(event: string, listener: (...args: any[]) => void): this {
    const rows = this.listeners.get(event) ?? []
    rows.push(listener)
    this.listeners.set(event, rows)
    return this
  }
  send(data: string): void { this.sent.push(data) }
  close(): void { this.readyState = 3 }
  emit(event: string, ...args: any[]): void { for (const listener of this.listeners.get(event) ?? []) listener(...args) }
  server(value: unknown): void { this.emit('message', Buffer.from(JSON.stringify(value))) }
  sentTypes(): string[] { return this.sent.map(row => String((JSON.parse(row) as { type?: unknown }).type ?? '')) }
}

function spec(overrides: Partial<QwenE2eSpec> = {}): QwenE2eSpec {
  return {
    endpointMode: 'shared',
    workspaceId: '',
    model: 'qwen-audio-3.0-realtime-flash',
    voice: 'longanqian',
    apiKey: 'sk-test',
    conversationMode: 'qwen-native',
    systemPrompt: 'Be concise.',
    ...overrides,
  }
}

function sink(): QwenE2eSink {
  return {
    onReady: vi.fn(),
    onSpeechStarted: vi.fn(),
    onSpeechStopped: vi.fn(),
    onTranscriptPartial: vi.fn(),
    onTranscriptFinal: vi.fn(),
    onAssistantTextDelta: vi.fn(),
    onAudio: vi.fn(),
    onFunctionCall: vi.fn(),
    onResponseDone: vi.fn(),
    onTelemetry: vi.fn(),
    onError: vi.fn(),
  }
}

function openSession(socket: FakeSocket, target: QwenE2eSink = sink(), overrides: Partial<QwenE2eSpec> = {}): { session: QwenE2eSession; target: QwenE2eSink } {
  const session = new QwenE2eSession(spec(overrides), target, () => socket)
  socket.readyState = 1
  socket.emit('open')
  return { session, target }
}

afterEach(() => { vi.useRealTimers() })

describe('Qwen provider voice orchestration contracts', () => {
  it('builds shared and Workspace realtime URLs', () => {
    expect(buildQwenE2eUrl({ endpointMode: 'shared', workspaceId: '', model: 'qwen-audio-3.0-realtime-flash' }))
      .toBe('wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen-audio-3.0-realtime-flash')
    expect(buildQwenE2eUrl({ endpointMode: 'workspace', workspaceId: 'llm-workspace-1', model: 'qwen-audio-3.0-realtime-flash' }))
      .toBe('wss://llm-workspace-1.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen-audio-3.0-realtime-flash')
  })

  it('gives native mode direct-answer authority and keeps hybrid mode delegated', () => {
    const native = JSON.parse(buildQwenE2eSessionUpdate('longanqian', 'qwen-native')) as any
    expect(native).toMatchObject({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        voice: 'longanqian',
        input_audio_format: 'pcm',
        output_audio_format: 'pcm',
        turn_detection: { type: 'smart_turn' },
        tools: [{ type: 'function', function: { name: 'dsh_capability_request' } }],
      },
    })
    expect(native.session.instructions).toMatch(/Answer greetings.*directly/is)
    expect(native.session.instructions).toMatch(/DSH exclusively owns tools, approvals, files, terminals/is)

    const hybrid = JSON.parse(buildQwenE2eSessionUpdate('longanqian', 'qwen-hybrid')) as any
    expect(hybrid.session.instructions).toMatch(/every substantive user request.*dsh_capability_request/is)
  })

  it('parses only valid capability calls with response ownership', () => {
    expect(parseDshAgentTurnCall({
      name: 'dsh_capability_request',
      response_id: 'resp-1',
      call_id: 'call-1',
      arguments: '{"transcript":"检查当前工作区"}',
    })).toEqual({ callId: 'call-1', responseId: 'resp-1', transcript: '检查当前工作区' })
    expect(() => parseDshAgentTurnCall({ name: 'other', response_id: 'resp-1', call_id: 'call-1', arguments: '{}' })).toThrow(/unexpected function/u)
    expect(() => parseDshAgentTurnCall({ name: 'dsh_capability_request', call_id: 'call-1', arguments: '{"transcript":"x"}' })).toThrow(/response_id/u)
    expect(() => parseDshAgentTurnCall({ name: 'dsh_capability_request', response_id: 'resp-1', call_id: 'call-1', arguments: '{"transcript":""}' })).toThrow(/transcript/u)
  })

  it('writes structured function output events and response controls', () => {
    expect(JSON.parse(buildQwenE2eFunctionOutput('call-1', '{"status":"completed"}'))).toMatchObject({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: 'call-1', output: '{"status":"completed"}' },
    })
    expect(JSON.parse(buildQwenE2eResponseCreate())).toMatchObject({ type: 'response.create', response: { modalities: ['audio', 'text'] } })
    expect(JSON.parse(buildQwenE2eResponseCancel())).toEqual({ type: 'response.cancel' })
  })

  it('allows a direct native audio response without a DSH function call', () => {
    const socket = new FakeSocket()
    const { session, target } = openSession(socket)
    session.appendAudio('AQIDBA==')
    expect(socket.sentTypes()).toEqual(['session.update'])

    socket.server({ type: 'session.created', session: { id: 'sess-1' } })
    socket.server({ type: 'session.updated', session: { id: 'sess-1' } })
    session.appendAudio('AQIDBA==')
    socket.server({ type: 'input_audio_buffer.speech_started', item_id: 'item-1' })
    socket.server({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-1' })
    socket.server({ type: 'conversation.item.input_audio_transcription.completed', transcript: '你好' })
    socket.server({ type: 'response.created', response: { id: 'resp-1' } })
    socket.server({ type: 'response.audio_transcript.delta', response_id: 'resp-1', delta: '你好，有什么可以帮你？' })
    socket.server({ type: 'response.audio.delta', response_id: 'resp-1', delta: 'AQIDBA==' })
    socket.server({ type: 'response.done', response: { id: 'resp-1', status: 'completed' } })

    expect(socket.sentTypes()).toEqual(['session.update', 'input_audio_buffer.append'])
    expect(target.onReady).toHaveBeenCalledOnce()
    expect(target.onSpeechStarted).toHaveBeenCalledOnce()
    expect(target.onTranscriptFinal).toHaveBeenCalledWith('你好')
    expect(target.onAssistantTextDelta).toHaveBeenCalledWith('你好，有什么可以帮你？', 'resp-1')
    expect([...vi.mocked(target.onAudio).mock.calls[0]![0]]).toEqual([1, 2, 3, 4])
    expect(target.onFunctionCall).not.toHaveBeenCalled()
    expect(target.onResponseDone).toHaveBeenCalledWith({ responseId: 'resp-1', status: 'completed', audioStarted: true })
    expect(target.onError).not.toHaveBeenCalled()
    expect(vi.mocked(target.onTelemetry!).mock.calls.map(call => call[0].event)).toEqual(expect.arrayContaining([
      'session.created',
      'session.updated',
      'input_audio_buffer.speech_started',
      'input_audio_buffer.speech_stopped',
      'response.created',
      'response.audio.delta:first',
      'response.done',
    ]))
  })

  it('groups multiple capability results under one follow-up response', () => {
    const socket = new FakeSocket()
    const { session, target } = openSession(socket)
    socket.server({ type: 'session.updated', session: { id: 'sess-1' } })
    socket.server({ type: 'response.created', response: { id: 'resp-tools' } })
    socket.server({ type: 'response.function_call_arguments.done', response_id: 'resp-tools', name: 'dsh_capability_request', call_id: 'call-1', arguments: '{"transcript":"检查文件"}' })
    socket.server({ type: 'response.function_call_arguments.done', response_id: 'resp-tools', name: 'dsh_capability_request', call_id: 'call-2', arguments: '{"transcript":"运行测试"}' })

    expect(target.onFunctionCall).toHaveBeenNthCalledWith(1, { callId: 'call-1', responseId: 'resp-tools', transcript: '检查文件' })
    expect(target.onFunctionCall).toHaveBeenNthCalledWith(2, { callId: 'call-2', responseId: 'resp-tools', transcript: '运行测试' })
    expect(session.writeFunctionOutput('call-1', '{"status":"completed","summary":"文件正常"}')).toBe(true)
    socket.server({ type: 'response.done', response: { id: 'resp-tools', status: 'completed' } })
    expect(socket.sentTypes()).not.toContain('conversation.item.create')

    expect(session.writeFunctionOutput('call-2', '{"status":"completed","summary":"测试通过"}')).toBe(true)
    expect(socket.sentTypes().slice(-3)).toEqual(['conversation.item.create', 'conversation.item.create', 'response.create'])
    expect(socket.sentTypes().filter(type => type === 'response.create')).toHaveLength(1)
    expect(session.writeFunctionOutput('call-2', 'duplicate')).toBe(false)

    socket.server({ type: 'response.created', response: { id: 'resp-spoken' } })
    socket.server({ type: 'response.audio.delta', response_id: 'resp-spoken', delta: 'AQIDBA==' })
    socket.server({ type: 'response.done', response: { id: 'resp-spoken', status: 'completed' } })
    expect(target.onResponseDone).toHaveBeenCalledOnce()
    expect(target.onResponseDone).toHaveBeenCalledWith({ responseId: 'resp-spoken', status: 'completed', audioStarted: true })
  })

  it('treats cancelled response.done as a normal terminal state and drops late PCM', () => {
    const socket = new FakeSocket()
    const { session, target } = openSession(socket)
    socket.server({ type: 'session.updated' })
    socket.server({ type: 'response.created', response: { id: 'resp-1' } })
    session.cancelResponse()
    socket.server({ type: 'response.done', response: { id: 'resp-1', status: 'cancelled', status_details: { reason: 'client_cancelled' } } })
    socket.server({ type: 'response.audio.delta', response_id: 'resp-1', delta: 'AQIDBA==' })

    expect(socket.sentTypes()).toContain('response.cancel')
    expect(target.onResponseDone).toHaveBeenCalledWith({ responseId: 'resp-1', status: 'cancelled', reason: 'client_cancelled', audioStarted: false })
    expect(target.onAudio).not.toHaveBeenCalled()
    expect(target.onError).not.toHaveBeenCalled()
  })

  it('reports a classified timeout instead of waiting for the provider 180-second close', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    const { target } = openSession(socket, sink(), { watchdogMs: 100 })
    socket.server({ type: 'session.updated' })
    socket.server({ type: 'input_audio_buffer.speech_stopped' })
    await vi.advanceTimersByTimeAsync(100)

    expect(target.onError).toHaveBeenCalledOnce()
    expect(vi.mocked(target.onError).mock.calls[0]![0]).toBeInstanceOf(QwenE2eError)
    expect(vi.mocked(target.onError).mock.calls[0]![0]).toMatchObject({ code: 'no_response_after_speech' })
    expect(target.onTelemetry).toHaveBeenCalledWith(expect.objectContaining({ event: 'watchdog.timeout', status: 'no_response_after_speech' }))
  })
})
