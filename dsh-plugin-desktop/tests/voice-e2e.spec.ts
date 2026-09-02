import { describe, expect, it, vi } from 'vitest'
import {
  buildQwenE2eFunctionOutput,
  buildQwenE2eResponseCancel,
  buildQwenE2eResponseCreate,
  buildQwenE2eSessionUpdate,
  buildQwenE2eUrl,
  parseDshAgentTurnCall,
  QwenE2eSession,
} from '../src/voice-e2e.ts'

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
}

describe('Qwen E2E voice orchestration contracts', () => {
  it('builds shared and Workspace realtime URLs', () => {
    expect(buildQwenE2eUrl({ endpointMode: 'shared', workspaceId: '', model: 'qwen-audio-3.0-realtime-flash' }))
      .toBe('wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen-audio-3.0-realtime-flash')
    expect(buildQwenE2eUrl({ endpointMode: 'workspace', workspaceId: 'llm-workspace-1', model: 'qwen-audio-3.0-realtime-flash' }))
      .toBe('wss://llm-workspace-1.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen-audio-3.0-realtime-flash')
  })

  it('configures smart turn, native audio, and one DSH delegation function', () => {
    const update = JSON.parse(buildQwenE2eSessionUpdate('longanqian')) as any
    expect(update).toMatchObject({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        voice: 'longanqian',
        input_audio_format: 'pcm',
        output_audio_format: 'pcm',
        turn_detection: { type: 'smart_turn' },
        tools: [{ type: 'function', function: { name: 'dsh_agent_turn' } }],
      },
    })
    expect(update.session.tools).toHaveLength(1)
    expect(update.session.instructions).toMatch(/every substantive user request.*dsh_agent_turn/is)
  })

  it('parses only valid DSH delegation calls', () => {
    expect(parseDshAgentTurnCall({
      name: 'dsh_agent_turn',
      call_id: 'call-1',
      arguments: '{"transcript":"检查当前工作区"}',
    })).toEqual({ callId: 'call-1', transcript: '检查当前工作区' })
    expect(() => parseDshAgentTurnCall({ name: 'other', call_id: 'call-1', arguments: '{}' })).toThrow(/unexpected function/u)
    expect(() => parseDshAgentTurnCall({ name: 'dsh_agent_turn', call_id: 'call-1', arguments: '{"transcript":""}' })).toThrow(/transcript/u)
  })

  it('writes function output and controls provider inference', () => {
    expect(JSON.parse(buildQwenE2eFunctionOutput('call-1', '任务完成'))).toMatchObject({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: 'call-1', output: '任务完成' },
    })
    expect(JSON.parse(buildQwenE2eResponseCreate())).toMatchObject({ type: 'response.create', response: { modalities: ['audio', 'text'] } })
    expect(JSON.parse(buildQwenE2eResponseCancel())).toEqual({ type: 'response.cancel' })
  })

  it('normalizes a full-duplex provider event sequence', () => {
    const socket = new FakeSocket()
    const sink = {
      onReady: vi.fn(), onSpeechStarted: vi.fn(), onSpeechStopped: vi.fn(),
      onTranscriptPartial: vi.fn(), onTranscriptFinal: vi.fn(), onAssistantTextDelta: vi.fn(),
      onAudio: vi.fn(), onFunctionCall: vi.fn(), onResponseDone: vi.fn(), onError: vi.fn(),
    }
    const session = new QwenE2eSession({
      endpointMode: 'shared', workspaceId: '', model: 'qwen-audio-3.0-realtime-flash', voice: 'longanqian', apiKey: 'sk-test',
    }, sink, () => socket)
    socket.readyState = 1
    socket.emit('open')
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ type: 'session.update' })
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'session.updated' })))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'input_audio_buffer.speech_started' })))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: '检查项目' })))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.created' })))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.function_call_arguments.done', name: 'dsh_agent_turn', call_id: 'call-1', arguments: '{"transcript":"检查项目"}' })))
    session.writeFunctionOutput('call-1', '已完成')
    expect(socket.sent.map(row => JSON.parse(row).type)).not.toContain('conversation.item.create')
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.done' })))
    expect(socket.sent.slice(-2).map(row => JSON.parse(row).type)).toEqual(['conversation.item.create', 'response.create'])
    expect(sink.onResponseDone).not.toHaveBeenCalled()
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.created' })))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.audio_transcript.delta', delta: '任务完成' })))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.audio.delta', delta: 'AQIDBA==' })))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.done' })))

    expect(sink.onReady).toHaveBeenCalledOnce()
    expect(sink.onSpeechStarted).toHaveBeenCalledOnce()
    expect(sink.onTranscriptFinal).toHaveBeenCalledWith('检查项目')
    expect(sink.onAssistantTextDelta).toHaveBeenCalledWith('任务完成')
    expect([...sink.onAudio.mock.calls[0]![0]]).toEqual([1, 2, 3, 4])
    expect(sink.onFunctionCall).toHaveBeenCalledWith({ callId: 'call-1', transcript: '检查项目' })
    expect(sink.onResponseDone).toHaveBeenCalledOnce()

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.created' })))
    session.cancelResponse()
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.done' })))
    expect(socket.sent.map(row => JSON.parse(row).type)).toContain('response.cancel')
    expect(sink.onResponseDone).toHaveBeenCalledOnce()
  })
})
