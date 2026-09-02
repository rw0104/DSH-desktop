/** Qwen Audio Realtime protocol and normalized Desktop E2E session. */

import { WebSocket } from 'ws'

export interface QwenE2eSpec {
  endpointMode: 'shared' | 'workspace'
  workspaceId: string
  model: string
  voice: string
  apiKey: string
}

export interface DshAgentTurnCall {
  callId: string
  transcript: string
}

export interface QwenE2eSink {
  onReady(): void
  onSpeechStarted(): void
  onSpeechStopped(reason?: string): void
  onTranscriptPartial(text: string): void
  onTranscriptFinal(text: string): void
  onAssistantTextDelta(text: string): void
  onAudio(audio: Buffer): void
  onFunctionCall(call: DshAgentTurnCall): void
  onResponseDone(): void
  onError(error: Error): void
}

export interface QwenE2eSocket {
  readonly readyState: number
  on(event: string, listener: (...args: any[]) => void): QwenE2eSocket
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type QwenE2eSocketFactory = (url: string, options: { headers: Record<string, string> }) => QwenE2eSocket

function jsonEvent(type: string, value: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, ...value })
}

export function buildQwenE2eUrl(spec: Pick<QwenE2eSpec, 'endpointMode' | 'workspaceId' | 'model'>): string {
  const host = spec.endpointMode === 'workspace' && spec.workspaceId
    ? `${spec.workspaceId}.cn-beijing.maas.aliyuncs.com`
    : 'dashscope.aliyuncs.com'
  return `wss://${host}/api-ws/v1/realtime?model=${encodeURIComponent(spec.model)}`
}

export function buildQwenE2eSessionUpdate(voice: string): string {
  return jsonEvent('session.update', {
    session: {
      modalities: ['audio', 'text'],
      voice,
      input_audio_format: 'pcm',
      output_audio_format: 'pcm',
      input_audio_transcription: { model: 'qwen3-asr-flash-realtime' },
      turn_detection: { type: 'smart_turn' },
      instructions: 'You are the realtime voice interface for a DSH Agent. For every substantive user request, call dsh_agent_turn with the complete spoken request. Do not execute tools or provide the substantive answer yourself. After the function result arrives, communicate that result faithfully and naturally in speech. Ignore non-semantic filler turns.',
      tools: [{
        type: 'function',
        function: {
          name: 'dsh_agent_turn',
          description: 'Delegate every substantive user request to the current DSH Agent, which owns tools, approvals, files, and terminals.',
          parameters: {
            type: 'object',
            properties: {
              transcript: { type: 'string', description: 'The user complete spoken request.' },
            },
            required: ['transcript'],
          },
        },
      }],
    },
  })
}

export function buildQwenE2eAudioAppend(audio: string): string {
  return jsonEvent('input_audio_buffer.append', { audio })
}

export function buildQwenE2eFunctionOutput(callId: string, output: string): string {
  return jsonEvent('conversation.item.create', {
    item: { type: 'function_call_output', call_id: callId, output },
  })
}

export function buildQwenE2eResponseCreate(): string {
  return jsonEvent('response.create', { response: { modalities: ['audio', 'text'] } })
}

export function buildQwenE2eResponseCancel(): string {
  return jsonEvent('response.cancel')
}

export function parseDshAgentTurnCall(value: unknown): DshAgentTurnCall {
  if (value === null || typeof value !== 'object') throw new Error('Qwen E2E function call must be an object.')
  const record = value as Record<string, unknown>
  if (record.name !== 'dsh_agent_turn') throw new Error(`Qwen E2E returned unexpected function ${String(record.name ?? '')}.`)
  const callId = typeof record.call_id === 'string' ? record.call_id.trim() : ''
  if (callId === '') throw new Error('Qwen E2E function call has no call_id.')
  let args: unknown
  try { args = JSON.parse(typeof record.arguments === 'string' ? record.arguments : '{}') } catch { throw new Error('Qwen E2E function arguments are not valid JSON.') }
  const transcript = args !== null && typeof args === 'object' && typeof (args as Record<string, unknown>).transcript === 'string'
    ? String((args as Record<string, unknown>).transcript).trim()
    : ''
  if (transcript === '') throw new Error('Qwen E2E function call transcript is empty.')
  return { callId, transcript }
}

function decodePcm(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) return undefined
  const audio = Buffer.from(value, 'base64')
  return audio.length > 0 && audio.length % 2 === 0 ? audio : undefined
}

/** Maintains one provider-native full-duplex Qwen Audio session. */
export class QwenE2eSession {
  private readonly socket: QwenE2eSocket
  private closed = false
  private responseActive = false
  private ignoredResponseDoneCount = 0
  private pendingFunctionOutput: { callId: string; output: string } | undefined

  constructor(
    spec: QwenE2eSpec,
    private readonly sink: QwenE2eSink,
    connect: QwenE2eSocketFactory = (url, options) => new WebSocket(url, options),
  ) {
    const headers = {
      Authorization: `Bearer ${spec.apiKey}`,
      ...(spec.endpointMode === 'workspace' && spec.workspaceId ? { 'X-DashScope-WorkSpace': spec.workspaceId } : {}),
    }
    this.socket = connect(buildQwenE2eUrl(spec), { headers })
    this.socket.on('open', () => { this.socket.send(buildQwenE2eSessionUpdate(spec.voice)) })
    this.socket.on('message', data => { this.onMessage(data) })
    this.socket.on('error', cause => { this.sink.onError(cause instanceof Error ? cause : new Error('Qwen E2E connection failed.')) })
    this.socket.on('close', () => {
      if (!this.closed) this.sink.onError(new Error('Qwen E2E connection closed unexpectedly.'))
    })
  }

  appendAudio(audio: string): void {
    if (!this.closed && this.socket.readyState === WebSocket.OPEN) this.socket.send(buildQwenE2eAudioAppend(audio))
  }

  writeFunctionOutput(callId: string, output: string): void {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) return
    if (this.responseActive) {
      this.pendingFunctionOutput = { callId, output }
      return
    }
    this.sendFunctionOutput(callId, output)
  }

  private sendFunctionOutput(callId: string, output: string): void {
    this.socket.send(buildQwenE2eFunctionOutput(callId, output))
    this.socket.send(buildQwenE2eResponseCreate())
  }

  cancelResponse(): void {
    if (this.closed || !this.responseActive || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(buildQwenE2eResponseCancel())
    this.responseActive = false
    this.ignoredResponseDoneCount += 1
  }

  close(reason = 'client_closed'): void {
    if (this.closed) return
    this.closed = true
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, reason)
  }

  private onMessage(data: WebSocket.RawData): void {
    let event: Record<string, unknown>
    try { event = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)) as Record<string, unknown> } catch { return }
    const type = String(event.type ?? '')
    if (type === 'session.updated') { this.sink.onReady(); return }
    if (type === 'response.created') { this.responseActive = true; return }
    if (type === 'input_audio_buffer.speech_started') { this.sink.onSpeechStarted(); return }
    if (type === 'input_audio_buffer.speech_stopped') { this.sink.onSpeechStopped(typeof event.reason === 'string' ? event.reason : undefined); return }
    if (type.includes('input_audio_transcription') && !type.includes('completed')) {
      const text = String(event.delta ?? event.text ?? '')
      if (text !== '') this.sink.onTranscriptPartial(text)
      return
    }
    if (type.includes('input_audio_transcription.completed')) {
      const text = String(event.transcript ?? event.text ?? '')
      if (text !== '') this.sink.onTranscriptFinal(text)
      return
    }
    if (type === 'response.audio_transcript.delta') {
      const text = String(event.delta ?? '')
      if (text !== '') this.sink.onAssistantTextDelta(text)
      return
    }
    if (type === 'response.audio.delta') {
      const audio = decodePcm(event.delta)
      if (audio === undefined) this.sink.onError(new Error('Qwen E2E returned an invalid PCM frame.'))
      else this.sink.onAudio(audio)
      return
    }
    if (type === 'response.function_call_arguments.done') {
      try { this.sink.onFunctionCall(parseDshAgentTurnCall(event)) } catch (cause) { this.sink.onError(cause instanceof Error ? cause : new Error('Qwen E2E function call failed.')) }
      return
    }
    if (type === 'response.done') {
      this.responseActive = false
      if (this.ignoredResponseDoneCount > 0) {
        this.ignoredResponseDoneCount -= 1
        return
      }
      const pending = this.pendingFunctionOutput
      if (pending !== undefined) {
        this.pendingFunctionOutput = undefined
        this.sendFunctionOutput(pending.callId, pending.output)
        return
      }
      this.sink.onResponseDone()
      return
    }
    if (type === 'error') {
      const error = event.error as Record<string, unknown> | undefined
      this.sink.onError(new Error(typeof error?.message === 'string' ? error.message : 'Qwen E2E provider error.'))
    }
  }
}
