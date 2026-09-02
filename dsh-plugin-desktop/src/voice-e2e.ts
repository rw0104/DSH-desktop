/** Qwen Audio Realtime protocol and normalized Desktop provider-audio session. */

import { performance } from 'node:perf_hooks'
import { WebSocket } from 'ws'

export type QwenVoiceConversationMode = 'qwen-hybrid' | 'qwen-native'

export interface QwenE2eSpec {
  endpointMode: 'shared' | 'workspace'
  workspaceId: string
  model: string
  voice: string
  apiKey: string
  conversationMode?: QwenVoiceConversationMode
  systemPrompt?: string
  watchdogMs?: number
}

export interface DshCapabilityCall {
  callId: string
  responseId: string
  transcript: string
}

/** Compatibility name for integrations compiled against the experimental bridge. */
export type DshAgentTurnCall = DshCapabilityCall

export interface QwenE2eResponseDone {
  responseId: string
  status: 'completed' | 'cancelled'
  reason?: string
  audioStarted: boolean
}

export interface QwenE2eTelemetryEvent {
  event: string
  timestampMs: number
  sessionId?: string
  responseId?: string
  callId?: string
  status?: string
  reason?: string
}

export class QwenE2eError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'QwenE2eError'
  }
}

export interface QwenE2eSink {
  onReady(): void
  onSpeechStarted(): void
  onSpeechStopped(reason?: string): void
  onTranscriptPartial(text: string): void
  onTranscriptFinal(text: string): void
  onAssistantTextDelta(text: string, responseId: string): void
  onAudio(audio: Buffer, responseId: string): void
  onFunctionCall(call: DshCapabilityCall): void
  onResponseDone(response: QwenE2eResponseDone): void
  onTelemetry?(event: QwenE2eTelemetryEvent): void
  onError(error: Error): void
}

export interface QwenE2eSocket {
  readonly readyState: number
  on(event: string, listener: (...args: any[]) => void): QwenE2eSocket
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type QwenE2eSocketFactory = (url: string, options: { headers: Record<string, string> }) => QwenE2eSocket

interface ResponseState {
  readonly responseId: string
  readonly callIds: Set<string>
  readonly outputs: Map<string, string>
  providerDone: boolean
  audioStarted: boolean
}

function jsonEvent(type: string, value: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, ...value })
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function responseIdOf(event: Record<string, unknown>): string {
  return stringField(record(event.response)?.id) || stringField(event.response_id)
}

export function buildQwenE2eUrl(spec: Pick<QwenE2eSpec, 'endpointMode' | 'workspaceId' | 'model'>): string {
  const host = spec.endpointMode === 'workspace' && spec.workspaceId
    ? `${spec.workspaceId}.cn-beijing.maas.aliyuncs.com`
    : 'dashscope.aliyuncs.com'
  return `wss://${host}/api-ws/v1/realtime?model=${encodeURIComponent(spec.model)}`
}

export function buildQwenE2eSessionUpdate(
  voice: string,
  conversationMode: QwenVoiceConversationMode = 'qwen-hybrid',
  systemPrompt = '',
): string {
  const authority = conversationMode === 'qwen-hybrid'
    ? 'For every substantive user request, call dsh_capability_request. Do not answer that request until its structured result arrives. You may ignore non-semantic filler.'
    : 'Answer greetings, clarification, and requests that need no local or project capability directly. Call dsh_capability_request only when the request needs files, terminals, approvals, project context, or another DSH capability.'
  const instructions = [
    'You are the realtime Qwen voice interface for DSH Desktop and you produce the final spoken response.',
    authority,
    'DSH exclusively owns tools, approvals, files, terminals, sandboxing, and side effects. Never claim that an approval was granted or a side effect was rolled back unless the structured result says so.',
    'After a capability result arrives, use its structured facts and status to give a concise, natural spoken response. Do not read JSON aloud.',
    systemPrompt.trim(),
  ].filter(Boolean).join(' ')
  return jsonEvent('session.update', {
    session: {
      modalities: ['audio', 'text'],
      voice,
      input_audio_format: 'pcm',
      output_audio_format: 'pcm',
      input_audio_transcription: { model: 'qwen3-asr-flash-realtime' },
      turn_detection: { type: 'smart_turn' },
      instructions,
      tools: [{
        type: 'function',
        function: {
          name: 'dsh_capability_request',
          description: 'Ask the current DSH Agent to use an authorized local capability and return a structured task result.',
          parameters: {
            type: 'object',
            properties: {
              transcript: { type: 'string', description: 'The complete user request that requires a DSH capability.' },
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

export function parseDshAgentTurnCall(value: unknown): DshCapabilityCall {
  const event = record(value)
  if (event === undefined) throw new QwenE2eError('invalid_function_call', 'Qwen capability call must be an object.')
  if (event.name !== 'dsh_capability_request') {
    throw new QwenE2eError('unexpected_function', `Qwen returned unexpected function ${String(event.name ?? '')}.`)
  }
  const callId = stringField(event.call_id)
  if (callId === '') throw new QwenE2eError('missing_call_id', 'Qwen capability call has no call_id.')
  const responseId = stringField(event.response_id)
  if (responseId === '') throw new QwenE2eError('missing_response_id', 'Qwen capability call has no response_id.')
  let args: unknown
  try { args = JSON.parse(typeof event.arguments === 'string' ? event.arguments : '{}') } catch {
    throw new QwenE2eError('invalid_function_arguments', 'Qwen capability arguments are not valid JSON.')
  }
  const transcript = stringField(record(args)?.transcript)
  if (transcript === '') throw new QwenE2eError('empty_capability_request', 'Qwen capability call transcript is empty.')
  return { callId, responseId, transcript }
}

function decodePcm(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) return undefined
  const audio = Buffer.from(value, 'base64')
  return audio.length > 0 && audio.length % 2 === 0 ? audio : undefined
}

/** Maintains one provider-native full-duplex Qwen Audio session. */
export class QwenE2eSession {
  private readonly socket: QwenE2eSocket
  private readonly startedAt = performance.now()
  private readonly responses = new Map<string, ResponseState>()
  private readonly callResponseIds = new Map<string, string>()
  private readonly watchdogMs: number
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private providerSessionId = ''
  private activeResponseId = ''
  private ready = false
  private closed = false

  constructor(
    spec: QwenE2eSpec,
    private readonly sink: QwenE2eSink,
    connect: QwenE2eSocketFactory = (url, options) => new WebSocket(url, options),
  ) {
    this.watchdogMs = spec.watchdogMs ?? 10_000
    const headers = {
      Authorization: `Bearer ${spec.apiKey}`,
      ...(spec.endpointMode === 'workspace' && spec.workspaceId ? { 'X-DashScope-WorkSpace': spec.workspaceId } : {}),
    }
    this.socket = connect(buildQwenE2eUrl(spec), { headers })
    this.socket.on('open', () => {
      this.socket.send(buildQwenE2eSessionUpdate(spec.voice, spec.conversationMode ?? 'qwen-hybrid', spec.systemPrompt ?? ''))
    })
    this.socket.on('message', data => { this.onMessage(data) })
    this.socket.on('error', cause => {
      this.sink.onError(cause instanceof Error ? cause : new QwenE2eError('socket_error', 'Qwen voice connection failed.'))
    })
    this.socket.on('close', (code?: number, rawReason?: Buffer | string) => {
      const reason = Buffer.isBuffer(rawReason) ? rawReason.toString('utf8') : stringField(rawReason)
      this.telemetry('socket.close', { ...(code === undefined ? {} : { status: String(code) }), reason })
      if (!this.closed) this.sink.onError(new QwenE2eError('socket_closed', `Qwen voice connection closed unexpectedly${code === undefined ? '' : ` (${String(code)})`}.`))
    })
  }

  appendAudio(audio: string): void {
    if (this.closed || !this.ready || this.socket.readyState !== WebSocket.OPEN) return
    if (decodePcm(audio) === undefined) {
      this.sink.onError(new QwenE2eError('invalid_input_pcm', 'Microphone audio must be non-empty 16-bit mono PCM frames.'))
      return
    }
    this.socket.send(buildQwenE2eAudioAppend(audio))
  }

  writeFunctionOutput(callId: string, output: string): boolean {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) return false
    const responseId = this.callResponseIds.get(callId)
    const response = responseId === undefined ? undefined : this.responses.get(responseId)
    if (response === undefined || !response.callIds.has(callId) || response.outputs.has(callId)) return false
    response.outputs.set(callId, output)
    this.flushFunctionOutputs(response)
    return true
  }

  abandonFunctionCalls(callIds: Iterable<string>): void {
    for (const callId of callIds) {
      const responseId = this.callResponseIds.get(callId)
      this.callResponseIds.delete(callId)
      const response = responseId === undefined ? undefined : this.responses.get(responseId)
      response?.callIds.delete(callId)
      response?.outputs.delete(callId)
      if (response?.callIds.size === 0 && response.providerDone) this.responses.delete(response.responseId)
    }
  }

  cancelResponse(): void {
    if (this.closed || this.activeResponseId === '' || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(buildQwenE2eResponseCancel())
  }

  close(reason = 'client_closed'): void {
    if (this.closed) return
    this.closed = true
    this.clearWatchdog()
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, reason)
  }

  private onMessage(data: WebSocket.RawData): void {
    let event: Record<string, unknown>
    try { event = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)) as Record<string, unknown> } catch { return }
    const type = String(event.type ?? '')
    if (type === 'session.created') {
      this.providerSessionId = stringField(record(event.session)?.id) || stringField(event.session_id)
      this.telemetry(type)
      return
    }
    if (type === 'session.updated') {
      this.providerSessionId ||= stringField(record(event.session)?.id) || stringField(event.session_id)
      this.ready = true
      this.telemetry(type)
      this.sink.onReady()
      return
    }
    if (type === 'response.created') {
      const responseId = responseIdOf(event)
      if (responseId === '') return this.sink.onError(new QwenE2eError('missing_response_id', 'Qwen response.created has no response ID.'))
      this.clearWatchdog()
      this.activeResponseId = responseId
      this.responses.set(responseId, { responseId, callIds: new Set(), outputs: new Map(), providerDone: false, audioStarted: false })
      this.telemetry(type, { responseId })
      return
    }
    if (type === 'input_audio_buffer.speech_started') {
      this.telemetry(type)
      this.sink.onSpeechStarted()
      return
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      const reason = stringField(event.reason)
      this.telemetry(type, { reason })
      if (reason !== 'turn_invalid') this.armWatchdog('no_response_after_speech', 'Qwen received the speech turn but produced no response within 10 seconds.')
      this.sink.onSpeechStopped(reason || undefined)
      return
    }
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
      const responseId = responseIdOf(event)
      if (responseId !== this.activeResponseId || !this.responses.has(responseId)) return
      const text = String(event.delta ?? '')
      if (text !== '') this.sink.onAssistantTextDelta(text, responseId)
      return
    }
    if (type === 'response.audio.delta') {
      const responseId = responseIdOf(event)
      const response = this.responses.get(responseId)
      if (responseId !== this.activeResponseId || response === undefined) return
      const audio = decodePcm(event.delta)
      if (audio === undefined) return this.sink.onError(new QwenE2eError('invalid_output_pcm', 'Qwen returned an invalid 24 kHz PCM frame.'))
      if (!response.audioStarted) {
        response.audioStarted = true
        this.telemetry('response.audio.delta:first', { responseId })
      }
      this.clearWatchdog()
      this.sink.onAudio(audio, responseId)
      return
    }
    if (type === 'response.function_call_arguments.done') {
      try {
        const call = parseDshAgentTurnCall(event)
        const response = this.responses.get(call.responseId)
        if (response === undefined) throw new QwenE2eError('unknown_function_response', 'Qwen capability call does not belong to an active response.')
        if (response.callIds.has(call.callId) || this.callResponseIds.has(call.callId)) return
        this.clearWatchdog()
        response.callIds.add(call.callId)
        this.callResponseIds.set(call.callId, call.responseId)
        this.telemetry(type, { responseId: call.responseId, callId: call.callId })
        this.sink.onFunctionCall(call)
      } catch (cause) {
        this.sink.onError(cause instanceof Error ? cause : new QwenE2eError('function_call_failed', 'Qwen capability call failed.'))
      }
      return
    }
    if (type === 'response.done') {
      this.handleResponseDone(event)
      return
    }
    if (type === 'error') {
      const error = record(event.error)
      const code = stringField(error?.code) || 'provider_error'
      const message = stringField(error?.message) || 'Qwen voice provider returned an error.'
      this.sink.onError(new QwenE2eError(code, message))
    }
  }

  private handleResponseDone(event: Record<string, unknown>): void {
    const responseRecord = record(event.response)
    const responseId = responseIdOf(event)
    const response = this.responses.get(responseId)
    const rawStatus = stringField(responseRecord?.status) || 'completed'
    const details = record(responseRecord?.status_details)
    const reason = stringField(details?.reason)
    this.clearWatchdog()
    if (this.activeResponseId === responseId) this.activeResponseId = ''
    this.telemetry('response.done', { responseId, status: rawStatus, reason })
    if (rawStatus === 'failed') {
      this.responses.delete(responseId)
      this.sink.onError(new QwenE2eError('response_failed', `Qwen voice response failed${reason === '' ? '.' : `: ${reason}`}`))
      return
    }
    if (rawStatus === 'cancelled') {
      if (response !== undefined) {
        for (const callId of response.callIds) this.callResponseIds.delete(callId)
        this.responses.delete(responseId)
      }
      this.sink.onResponseDone({ responseId, status: 'cancelled', ...(reason === '' ? {} : { reason }), audioStarted: response?.audioStarted === true })
      return
    }
    if (response === undefined) {
      this.sink.onError(new QwenE2eError('unknown_response', 'Qwen completed an unknown response.'))
      return
    }
    response.providerDone = true
    if (response.callIds.size > 0) {
      this.flushFunctionOutputs(response)
      return
    }
    this.responses.delete(responseId)
    this.sink.onResponseDone({ responseId, status: 'completed', audioStarted: response.audioStarted })
  }

  private flushFunctionOutputs(response: ResponseState): void {
    if (!response.providerDone || response.callIds.size === 0 || response.outputs.size !== response.callIds.size) return
    for (const callId of response.callIds) {
      const output = response.outputs.get(callId)
      if (output === undefined) return
      this.socket.send(buildQwenE2eFunctionOutput(callId, output))
      this.callResponseIds.delete(callId)
    }
    this.responses.delete(response.responseId)
    this.socket.send(buildQwenE2eResponseCreate())
    this.armWatchdog('no_response_after_function', 'Qwen received the DSH capability result but produced no follow-up response within 10 seconds.')
  }

  private armWatchdog(code: string, message: string): void {
    this.clearWatchdog()
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined
      this.telemetry('watchdog.timeout', { status: code })
      this.sink.onError(new QwenE2eError(code, message.replace('10 seconds', `${String(Math.round(this.watchdogMs / 1000))} seconds`)))
    }, this.watchdogMs)
  }

  private clearWatchdog(): void {
    if (this.watchdog !== undefined) clearTimeout(this.watchdog)
    this.watchdog = undefined
  }

  private telemetry(event: string, fields: Omit<QwenE2eTelemetryEvent, 'event' | 'timestampMs' | 'sessionId'> = {}): void {
    this.sink.onTelemetry?.({
      event,
      timestampMs: Math.round(performance.now() - this.startedAt),
      ...(this.providerSessionId === '' ? {} : { sessionId: this.providerSessionId }),
      ...fields,
    })
  }
}
