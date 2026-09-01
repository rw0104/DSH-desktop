/** Host-side Agent Voice bridge: realtime ASR in, DSH Agent turns out. */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { gzipSync, gunzipSync } from 'node:zlib'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { randomBytes, randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { AgentSpeechChunker, createVoiceTtsStream } from './voice-tts.ts'
import type { VoiceTtsSpec, VoiceTtsStream } from './voice-tts.ts'

export const DESKTOP_VOICE_SETTINGS_NAMESPACE = settingsNamespace('dsh-desktop-voice')
export const QWEN_API_KEY_REF = 'DASHSCOPE_API_KEY'
export const DOUBAO_APP_ID_REF = 'DOUBAO_APP_ID'
export const DOUBAO_ACCESS_KEY_REF = 'DOUBAO_ACCESS_KEY'
export const VOICE_TICKET_PATH = '/dsh-desktop/api/voice/ticket'
export const VOICE_CONFIG_PATH = '/dsh-desktop/api/voice/config'
export const VOICE_SETTINGS_PATH = '/dsh-desktop/api/voice/settings'
export const VOICE_CREDENTIALS_PATH = '/dsh-desktop/api/voice/credentials'
export const VOICE_UPGRADE_PATH = '/dsh-desktop/api/voice/realtime'

export interface DesktopVoiceSettings {
  enabled: boolean
  provider: 'qwen' | 'doubao'
  qwenModel: 'qwen3-asr-flash-realtime'
  qwenEndpointMode: 'shared' | 'workspace'
  qwenWorkspaceId: string
  ttsEnabled: boolean
  qwenTtsModel: 'qwen3-tts-flash-realtime'
  qwenTtsVoice: string
  doubaoModel: 'doubao-seed-asr-2'
  doubaoRealtimeUrl: string
  doubaoResourceId: string
  doubaoAppKey: string
  doubaoTtsEndpoint: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse'
  doubaoTtsResourceId: string
  doubaoTtsVoice: string
  systemPrompt: string
}

export const DesktopVoiceSettingsSchema: z<DesktopVoiceSettings> = z.object({
  enabled: z.boolean().default(false),
  provider: z.union(['qwen', 'doubao'] as const).default('qwen'),
  qwenModel: z.union(['qwen3-asr-flash-realtime'] as const).default('qwen3-asr-flash-realtime'),
  qwenEndpointMode: z.union(['shared', 'workspace'] as const).default('shared'),
  qwenWorkspaceId: z.string().max(120).default(''),
  ttsEnabled: z.boolean().default(true),
  qwenTtsModel: z.union(['qwen3-tts-flash-realtime'] as const).default('qwen3-tts-flash-realtime'),
  qwenTtsVoice: z.string().max(120).default('Cherry'),
  doubaoModel: z.union(['doubao-seed-asr-2'] as const).default('doubao-seed-asr-2'),
  doubaoRealtimeUrl: z.string().max(500).default('wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'),
  doubaoResourceId: z.string().max(160).default('volc.seedasr.sauc.duration'),
  doubaoAppKey: z.string().max(160).default('PlgvMymc7f3tQnJ6'),
  doubaoTtsEndpoint: z.union(['https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse'] as const).default('https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse'),
  doubaoTtsResourceId: z.string().max(160).default('seed-tts-2.0'),
  doubaoTtsVoice: z.string().max(160).default('zh_female_vv_uranus_bigtts'),
  systemPrompt: z.string().max(10_000).default('你是一个简洁、友好的实时语音助手。需要时使用当前 DSH Agent 提供的工具完成任务。'),
})

interface VoiceTicket {
  readonly provider: DesktopVoiceSettings['provider']
  readonly model: string
  readonly qwenEndpointMode: DesktopVoiceSettings['qwenEndpointMode']
  readonly workspaceId: string
  readonly endpoint: string
  readonly resourceId: string
  readonly appKey: string
  readonly ttsEnabled: boolean
  readonly ttsModel: string
  readonly ttsVoice: string
  readonly ttsEndpoint: string
  readonly ttsResourceId: string
  readonly systemPrompt: string
  readonly agentSessionId: string
  readonly sessionId: string
  readonly expiresAt: number
}

interface CredentialStatus {
  configured: boolean
  writable: boolean
  source?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function sameOrigin(ctx: Context, req: IncomingMessage): boolean {
  return req.headers.origin === `http://127.0.0.1:${String(ctx.webServer.port)}`
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > 16 * 1024) throw new Error('voice request body is too large')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function safeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,160}$/u.test(value)
}

type QwenConnectionSpec = Pick<VoiceTicket, 'model' | 'qwenEndpointMode' | 'workspaceId'>

export function buildQwenAsrUrl(spec: QwenConnectionSpec): string {
  const host = spec.qwenEndpointMode === 'workspace' && spec.workspaceId
    ? `${spec.workspaceId}.cn-beijing.maas.aliyuncs.com`
    : 'dashscope.aliyuncs.com'
  return `wss://${host}/api-ws/v1/realtime?model=${encodeURIComponent(spec.model)}`
}

export function buildQwenSessionUpdate(): string {
  return JSON.stringify({
    type: 'session.update',
    event_id: `event_${randomUUID()}`,
    session: {
      input_audio_format: 'pcm',
      sample_rate: 16000,
      turn_detection: { type: 'server_vad', threshold: 0, silence_duration_ms: 400 },
    },
  })
}

function qwenAudioAppend(audio: string): string {
  return JSON.stringify({ type: 'input_audio_buffer.append', event_id: `event_${randomUUID()}`, audio })
}

function qwenAudioCommit(): string {
  return JSON.stringify({ type: 'input_audio_buffer.commit', event_id: `event_${randomUUID()}` })
}

export function buildQwenSessionFinish(): string {
  return JSON.stringify({ type: 'session.finish', event_id: `event_${randomUUID()}` })
}

const DOUBAO = {
  version: 1,
  headerSize: 1,
  fullRequest: 1,
  audioRequest: 2,
  fullResponse: 9,
  error: 15,
  json: 1,
  noSerialization: 0,
  gzip: 1,
  positiveSequence: 1,
  negativeSequence: 3,
} as const

function doubaoHeader(messageType: number, flags: number, serialization: number, compression: number): Buffer {
  return Buffer.from([
    (DOUBAO.version << 4) | DOUBAO.headerSize,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0,
  ])
}

function doubaoAsrFullRequest(sequence: number, payload: unknown): Buffer {
  const body = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  const eventBytes = Buffer.alloc(4)
  eventBytes.writeInt32BE(sequence)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(body.byteLength)
  return Buffer.concat([doubaoHeader(DOUBAO.fullRequest, DOUBAO.positiveSequence, DOUBAO.json, DOUBAO.gzip), eventBytes, size, body])
}

function doubaoAsrAudioRequest(sequence: number, audio: Buffer, final = false): Buffer {
  const body = gzipSync(audio)
  const sequenceBytes = Buffer.alloc(4)
  sequenceBytes.writeInt32BE(final ? -Math.max(1, sequence) : sequence)
  const bodyLength = Buffer.alloc(4)
  bodyLength.writeUInt32BE(body.byteLength)
  return Buffer.concat([doubaoHeader(DOUBAO.audioRequest, final ? DOUBAO.negativeSequence : DOUBAO.positiveSequence, DOUBAO.noSerialization, DOUBAO.gzip), sequenceBytes, bodyLength, body])
}

interface DoubaoResponse {
  messageType: number
  event?: number
  payload?: Buffer
  json?: unknown
  errorCode?: number
}

function parseDoubaoAsrResponse(value: WebSocket.RawData): DoubaoResponse | undefined {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value as ArrayBuffer)
  if (bytes.byteLength < 4) return undefined
  const headerSize = (bytes[0]! & 0x0f) * 4
  const messageType = bytes[1]! >> 4
  const flags = bytes[1]! & 0x0f
  const serialization = bytes[2]! >> 4
  const compression = bytes[2]! & 0x0f
  if (headerSize < 4 || headerSize > bytes.byteLength) return undefined
  let offset = headerSize
  const result: DoubaoResponse = { messageType }
  const isLast = (flags & 2) !== 0
  if (isLast) result.event = -1
  if (messageType === DOUBAO.error) {
    if (offset + 8 > bytes.byteLength) return undefined
    result.errorCode = bytes.readUInt32BE(offset)
    const size = bytes.readUInt32BE(offset + 4)
    result.payload = bytes.subarray(offset + 8, offset + 8 + size)
    return result
  }
  if (offset + 4 > bytes.byteLength) return undefined
  const payloadSize = bytes.readUInt32BE(offset)
  offset += 4
  let payload = bytes.subarray(offset, Math.min(bytes.byteLength, offset + payloadSize))
  if (compression === DOUBAO.gzip) {
    try { payload = gunzipSync(payload) } catch { return result }
  }
  result.payload = payload
  if (serialization === DOUBAO.json) {
    try { result.json = JSON.parse(payload.toString('utf8')) as unknown } catch { /* binary audio */ }
  }
  return result
}

function decodeBase64(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) return undefined
  const audio = Buffer.from(value, 'base64')
  return audio.byteLength > 0 && audio.byteLength % 2 === 0 ? audio : undefined
}

function sendClient(client: WebSocket, value: Record<string, unknown>): void {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value))
}

function parseClientMessage(data: WebSocket.RawData): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data))
    return isRecord(value) ? value : undefined
  } catch { return undefined }
}

function eventText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

type AgentEvent = { type: string; data: any }

class VoiceAgentBridge {
  private provider: WebSocket | undefined
  private started = false
  private closed = false
  private finalTranscript = ''
  private finalTranscriptAt = 0
  private doubaoSequence = 1
  private finishing = false
  private finishTimer: ReturnType<typeof setTimeout> | undefined
  private readonly speechChunker = new AgentSpeechChunker()
  private tts: VoiceTtsStream | undefined
  private ttsGeneration = 0
  private activeAgentTurn: number | undefined
  private ttsSuppressed = false
  private userSpeechActive = false

  constructor(
    private readonly client: WebSocket,
    private readonly ticket: VoiceTicket,
    private readonly ctx: Context,
    private readonly qwenKey: string | undefined,
    private readonly doubaoAppId: string | undefined,
    private readonly doubaoAccessKey: string | undefined,
  ) {}

  open(): void {
    sendClient(this.client, { type: 'session.connected', sessionId: this.ticket.sessionId, provider: this.ticket.provider, modelId: this.ticket.model })
    const url = this.ticket.provider === 'qwen' ? buildQwenAsrUrl(this.ticket) : this.ticket.endpoint
    const headers = this.ticket.provider === 'qwen'
      ? { Authorization: `Bearer ${this.qwenKey!}`, ...(this.ticket.qwenEndpointMode === 'workspace' && this.ticket.workspaceId ? { 'X-DashScope-WorkSpace': this.ticket.workspaceId } : {}) }
      : { 'X-Api-App-ID': this.doubaoAppId!, 'X-Api-Access-Key': this.doubaoAccessKey!, 'X-Api-Resource-Id': this.ticket.resourceId, 'X-Api-App-Key': this.ticket.appKey, 'X-Api-Connect-Id': this.ticket.sessionId }
    this.provider = new WebSocket(url, { headers })
    this.provider.on('open', () => {
      sendClient(this.client, { type: 'provider.ready' })
    })
    this.provider.on('message', data => {
      if (this.ticket.provider === 'qwen') this.onQwenMessage(data)
      else this.onDoubaoMessage(data)
    })
    this.provider.on('error', error => { this.ctx.logger.warn(error); sendClient(this.client, { type: 'session.failed', code: 'provider_error', message: 'Realtime speech provider connection failed.' }) })
    this.provider.on('close', () => {
      if (this.finishing) this.completeProviderSession()
      else if (!this.closed && this.client.readyState < WebSocket.CLOSING) sendClient(this.client, { type: 'provider.closed' })
    })
  }

  onClientMessage(data: WebSocket.RawData, isBinary: boolean): void {
    if (this.closed || isBinary) return
    const message = parseClientMessage(data)
    if (message === undefined) return sendClient(this.client, { type: 'session.failed', code: 'invalid_message', message: 'Voice control messages must be JSON.' })
    const type = String(message.type || '')
    if (type === 'session.start') {
      this.started = true
      if (this.ticket.provider === 'qwen' && this.provider?.readyState === WebSocket.OPEN) this.provider.send(buildQwenSessionUpdate())
      if (this.ticket.provider === 'doubao' && this.provider?.readyState === WebSocket.OPEN) {
        this.doubaoSequence = 1
        this.provider.send(doubaoAsrFullRequest(this.doubaoSequence++, {
          user: { uid: `dsh-desktop-${this.ticket.agentSessionId}` },
          audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
          request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_nonstream: true, end_window_size: 800, show_utterances: true, result_type: 'full' },
        }))
      }
      return
    }
    if (type === 'audio.append' && this.started && typeof message.audio === 'string' && this.provider?.readyState === WebSocket.OPEN) {
      if (this.ticket.provider === 'qwen') this.provider.send(qwenAudioAppend(message.audio))
      else { const audio = decodeBase64(message.audio); if (audio) this.provider.send(doubaoAsrAudioRequest(this.doubaoSequence++, audio)) }
      return
    }
    if (type === 'turn.commit' && this.ticket.provider === 'qwen' && this.provider?.readyState === WebSocket.OPEN) { this.provider.send(qwenAudioCommit()); return }
    if (type === 'turn.commit' && this.ticket.provider === 'doubao' && this.provider?.readyState === WebSocket.OPEN) { this.provider.send(doubaoAsrAudioRequest(this.doubaoSequence++, Buffer.alloc(0), true)); return }
    if (type === 'tts.cancel') { this.cancelTts('client_cancelled'); return }
    if (type === 'session.finish') {
      if (this.finishing) return
      this.finishing = true
      if (this.provider?.readyState === WebSocket.OPEN) {
        if (this.ticket.provider === 'qwen') this.provider.send(buildQwenSessionFinish())
        else this.provider.send(doubaoAsrAudioRequest(this.doubaoSequence++, Buffer.alloc(0), true))
        this.finishTimer = setTimeout(() => { this.completeProviderSession() }, 5_000)
      } else this.completeProviderSession()
    }
  }

  onAgentEvent(event: AgentEvent): void {
    if (this.closed) return
    if (event.type === 'turn/start') {
      this.beginAgentTurn(Number(event.data.turn))
      return
    }
    if (event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (chunk.type === 'text-delta' && chunk.text) {
        sendClient(this.client, { type: 'agent.text.delta', text: chunk.text })
        if (!this.ttsSuppressed && this.ticket.ttsEnabled) {
          for (const text of this.speechChunker.push(chunk.text)) this.appendTts(text)
        }
      }
      if (chunk.type === 'tool-call-delta') sendClient(this.client, { type: 'agent.tool.delta', name: chunk.name || '', text: chunk.argumentsDelta })
    } else if (event.type === 'tool/call') sendClient(this.client, { type: 'agent.tool.started', name: event.data.name })
    else if (event.type === 'tool/result') sendClient(this.client, { type: 'agent.tool.finished', name: event.data.message.content[0]?.type || 'tool' })
    else if (event.type === 'turn/end') this.endAgentTurn(event.data.reason?.kind === 'completed')
  }

  close(reason = 'client_closed'): void {
    if (this.closed) return
    this.closed = true
    if (this.finishTimer !== undefined) clearTimeout(this.finishTimer)
    this.finishTimer = undefined
    this.cancelTts(reason)
    const provider = this.provider
    if (provider && provider.readyState < WebSocket.CLOSING) provider.close(1000, reason)
    this.provider = undefined
  }

  private onQwenMessage(data: WebSocket.RawData): void {
    const event = parseClientMessage(data)
    if (event === undefined) return
    const type = String(event.type || '')
    if (type.includes('input_audio_transcription') && !type.includes('completed')) { sendClient(this.client, { type: 'transcript.partial', text: eventText(event.delta || event.text || event.stash) }); return }
    if (type.includes('input_audio_transcription.completed')) {
      const text = eventText(event.transcript || event.text)
      if (!text || (text === this.finalTranscript && Date.now() - this.finalTranscriptAt < 1_500)) return
      this.finalTranscript = text
      this.finalTranscriptAt = Date.now()
      sendClient(this.client, { type: 'transcript.final', text })
      this.submitToAgent(text)
      return
    }
    if (type === 'input_audio_buffer.speech_started') { this.userSpeechActive = true; this.cancelTts('user_interrupted'); sendClient(this.client, { type: 'speech.started' }) }
    if (type === 'input_audio_buffer.speech_stopped') { this.userSpeechActive = false; sendClient(this.client, { type: 'speech.stopped' }) }
    if (type === 'session.finished') this.completeProviderSession()
    if (type === 'error') sendClient(this.client, { type: 'session.failed', code: 'provider_error', message: eventText((event.error as Record<string, unknown> | undefined)?.message) || 'Qwen speech recognition failed.' })
  }

  private onDoubaoMessage(data: WebSocket.RawData): void {
    const event = parseDoubaoAsrResponse(data)
    if (event === undefined) return
    if (event.messageType === DOUBAO.error) { sendClient(this.client, { type: 'session.failed', code: 'provider_error', message: `Doubao speech provider error ${String(event.errorCode ?? '')}` }); return }
    if (isRecord(event.json)) {
      const result = isRecord(event.json.result) ? event.json.result : event.json
      const utterances = Array.isArray(result.utterances) ? result.utterances.filter(isRecord) : []
      const definiteText = utterances.filter(item => item.definite === true).map(item => item.text).filter((text): text is string => typeof text === 'string').join('')
      const partial = result.text || result.transcript || result.delta
      if (typeof partial === 'string' && partial.trim()) {
        if (!this.userSpeechActive) { this.userSpeechActive = true; this.cancelTts('user_interrupted'); sendClient(this.client, { type: 'speech.started' }) }
        sendClient(this.client, { type: 'transcript.partial', text: partial })
      }
      const finalText = definiteText || (typeof partial === 'string' ? partial : '')
      const final = event.event === -1 || result.definite === true || event.json.is_finish === true || event.json.finished === true || event.json.event === 'conversation.item.input_audio_transcription.completed'
      if (final && finalText.trim()) {
        if (this.userSpeechActive) { this.userSpeechActive = false; sendClient(this.client, { type: 'speech.stopped' }) }
        if (finalText === this.finalTranscript && Date.now() - this.finalTranscriptAt < 1_500) return
        this.finalTranscript = finalText
        this.finalTranscriptAt = Date.now()
        sendClient(this.client, { type: 'transcript.final', text: finalText })
        this.submitToAgent(finalText)
      }
      if (this.finishing && event.event === -1) this.completeProviderSession()
    }
  }

  private completeProviderSession(): void {
    if (this.closed) return
    if (this.finishTimer !== undefined) clearTimeout(this.finishTimer)
    this.finishTimer = undefined
    sendClient(this.client, { type: 'session.finished' })
    this.close('provider_finished')
  }

  private beginAgentTurn(turn: number): void {
    this.ttsGeneration += 1
    this.tts?.cancel()
    this.tts = undefined
    this.speechChunker.clear()
    this.ttsSuppressed = false
    this.activeAgentTurn = Number.isFinite(turn) ? turn : undefined
  }

  private endAgentTurn(completed: boolean): void {
    if (!completed) {
      this.cancelTts('agent_turn_incomplete')
      sendClient(this.client, { type: 'agent.response.done', ttsExpected: false })
      this.activeAgentTurn = undefined
      return
    }
    if (!this.ttsSuppressed && this.ticket.ttsEnabled) {
      for (const text of this.speechChunker.finish()) this.appendTts(text)
    } else this.speechChunker.clear()
    const ttsExpected = this.tts !== undefined
    this.tts?.finish()
    sendClient(this.client, { type: 'agent.response.done', ttsExpected })
    this.activeAgentTurn = undefined
  }

  private appendTts(text: string): void {
    if (this.ttsSuppressed || !this.ticket.ttsEnabled || text === '') return
    this.ensureTts()?.append(text)
  }

  private ensureTts(): VoiceTtsStream | undefined {
    if (this.tts !== undefined) return this.tts
    const spec = this.ttsSpec()
    if (spec === undefined) return undefined
    const generation = this.ttsGeneration
    this.tts = createVoiceTtsStream(spec, {
      onStarted: () => { if (this.acceptTts(generation)) sendClient(this.client, { type: 'tts.started', turn: this.activeAgentTurn }) },
      onAudio: audio => {
        if (this.acceptTts(generation) && this.client.readyState === WebSocket.OPEN) this.client.send(audio, { binary: true })
      },
      onDone: () => {
        if (!this.acceptTts(generation)) return
        this.tts = undefined
        sendClient(this.client, { type: 'tts.done' })
      },
      onError: error => {
        if (!this.acceptTts(generation)) return
        this.tts = undefined
        this.ttsSuppressed = true
        this.ctx.logger.warn(error)
        sendClient(this.client, { type: 'tts.failed', message: error.message })
      },
    })
    return this.tts
  }

  private ttsSpec(): VoiceTtsSpec | undefined {
    if (this.ticket.provider === 'qwen' && this.qwenKey) {
      return { provider: 'qwen', endpointMode: this.ticket.qwenEndpointMode, workspaceId: this.ticket.workspaceId, model: this.ticket.ttsModel, voice: this.ticket.ttsVoice, apiKey: this.qwenKey }
    }
    if (this.ticket.provider === 'doubao' && this.doubaoAppId && this.doubaoAccessKey) {
      return { provider: 'doubao', endpoint: this.ticket.ttsEndpoint, resourceId: this.ticket.ttsResourceId, voice: this.ticket.ttsVoice, appId: this.doubaoAppId, accessKey: this.doubaoAccessKey }
    }
    return undefined
  }

  private acceptTts(generation: number): boolean {
    return !this.closed && !this.ttsSuppressed && generation === this.ttsGeneration
  }

  private cancelTts(reason: string): void {
    this.ttsGeneration += 1
    this.tts?.cancel()
    this.tts = undefined
    this.speechChunker.clear()
    if (this.activeAgentTurn !== undefined) this.ttsSuppressed = true
    sendClient(this.client, { type: 'tts.cancelled', reason })
  }

  private submitToAgent(text: string): void {
    const agent = this.ctx.agents.get(this.ticket.agentSessionId as never)
    if (agent === undefined) { sendClient(this.client, { type: 'session.failed', code: 'agent_unavailable', message: 'The selected DSH Agent is no longer available.' }); return }
    try { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })); sendClient(this.client, { type: 'agent.request.accepted' }) }
    catch (cause) { sendClient(this.client, { type: 'session.failed', code: 'agent_submit_failed', message: cause instanceof Error ? cause.message : 'The voice turn could not be sent to the Agent.' }) }
  }
}

async function credentialStatus(ctx: Context, ref: string): Promise<CredentialStatus> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return { configured: false, writable: false }
  const info = await credentials.describe(credentialRef(ref))
  return { configured: info.configured, writable: info.writable, ...(info.source === undefined ? {} : { source: info.source }) }
}

async function resolveCredential(ctx: Context, ref: string): Promise<string | undefined> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return undefined
  return (await credentials.resolve(credentialRef(ref)))?.value
}

function clearExpiredTickets(tickets: Map<string, VoiceTicket>): void {
  const now = Date.now()
  for (const [token, value] of tickets) if (value.expiresAt <= now) tickets.delete(token)
}

/** Register voice settings, credential routes, Agent event forwarding, and WS upgrade. */
export function registerVoiceRealtimeHost(ctx: Context): void {
  const settings = ctx.settings.register(DESKTOP_VOICE_SETTINGS_NAMESPACE, DesktopVoiceSettingsSchema, { applies: 'live' })
  const tickets = new Map<string, VoiceTicket>()
  const bridges = new Map<string, VoiceAgentBridge>()
  const server = new WebSocketServer({ noServer: true })
  const stopAgentEvents = ctx.on('session/event', (session, event) => bridges.get(String(session.id))?.onAgentEvent(event))
  ctx.effect(() => {
    const disposeConfig = ctx.webServer.register({ kind: 'exact', path: VOICE_CONFIG_PATH, handler: async (req, res) => {
      if (!sameOrigin(ctx, req) || req.method !== 'GET') return sendJson(res, 403, { message: 'forbidden' })
      const current = settings.get()
      const [qwen, doubaoAppId, doubaoAccessKey] = await Promise.all([credentialStatus(ctx, QWEN_API_KEY_REF), credentialStatus(ctx, DOUBAO_APP_ID_REF), credentialStatus(ctx, DOUBAO_ACCESS_KEY_REF)])
      sendJson(res, 200, { enabled: current.enabled, provider: current.provider, systemPrompt: current.systemPrompt, qwen: { model: current.qwenModel, endpointMode: current.qwenEndpointMode, workspaceIdConfigured: safeIdentifier(current.qwenWorkspaceId.trim()), credential: qwen, ready: qwen.configured && (current.qwenEndpointMode === 'shared' || safeIdentifier(current.qwenWorkspaceId.trim())) }, doubao: { model: current.doubaoModel, endpoint: current.doubaoRealtimeUrl, resourceId: current.doubaoResourceId, credentials: { appId: doubaoAppId, accessKey: doubaoAccessKey }, ready: current.doubaoRealtimeUrl.startsWith('wss://') && doubaoAppId.configured && doubaoAccessKey.configured } })
    } })
    const disposeSettings = ctx.webServer.register({ kind: 'exact', path: VOICE_SETTINGS_PATH, handler: async (req, res) => {
      if (!sameOrigin(ctx, req)) return sendJson(res, 403, { message: 'forbidden' })
      if (req.method !== 'POST' || req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return sendJson(res, 405, { message: 'Voice settings require JSON POST.' })
      try { const value = await readJson(req); if (!isRecord(value)) return sendJson(res, 400, { message: 'Invalid voice settings.' }); const allowed = new Set(['enabled', 'provider', 'qwenModel', 'qwenEndpointMode', 'qwenWorkspaceId', 'ttsEnabled', 'qwenTtsModel', 'qwenTtsVoice', 'doubaoModel', 'doubaoRealtimeUrl', 'doubaoResourceId', 'doubaoAppKey', 'doubaoTtsEndpoint', 'doubaoTtsResourceId', 'doubaoTtsVoice', 'systemPrompt']); await settings.update(Object.fromEntries(Object.entries(value).filter(([key]) => allowed.has(key)))); sendJson(res, 200, { ok: true }) }
      catch (cause) { sendJson(res, 400, { message: cause instanceof Error ? cause.message : 'Invalid voice settings.' }) }
    } })
    const disposeCredentials = ctx.webServer.register({ kind: 'exact', path: VOICE_CREDENTIALS_PATH, handler: async (req, res) => {
      if (!sameOrigin(ctx, req)) return sendJson(res, 403, { message: 'forbidden' })
      if (req.method !== 'POST' || req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return sendJson(res, 405, { message: 'Voice credentials require JSON POST.' })
      try { const value = await readJson(req); if (!isRecord(value) || (value.provider !== 'qwen' && value.provider !== 'doubao')) return sendJson(res, 400, { message: 'Invalid voice provider.' }); const credentials = ctx.get('credentials'); if (credentials === undefined) return sendJson(res, 503, { message: 'Credential storage is unavailable.' }); const setOrUnset = async (ref: string, raw: unknown): Promise<void> => { const secret = typeof raw === 'string' ? raw.trim() : ''; if (secret) await credentials.set(credentialRef(ref), secret); else await credentials.unset(credentialRef(ref)) }; if (value.provider === 'qwen') await setOrUnset(QWEN_API_KEY_REF, value.apiKey); else { await setOrUnset(DOUBAO_APP_ID_REF, value.appId); await setOrUnset(DOUBAO_ACCESS_KEY_REF, value.accessKey) } sendJson(res, 200, { ok: true }) }
      catch (cause) { sendJson(res, 400, { message: cause instanceof Error ? cause.message : 'Credential update failed.' }) }
    } })
    const disposeTicket = ctx.webServer.register({ kind: 'exact', path: VOICE_TICKET_PATH, handler: async (req, res) => {
      if (!sameOrigin(ctx, req) || req.method !== 'POST') return sendJson(res, 403, { message: 'forbidden' })
      let body: unknown; try { body = await readJson(req) } catch { return sendJson(res, 400, { message: 'Invalid voice ticket request.' }) }
      const sessionId = isRecord(body) && typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (!safeIdentifier(sessionId) || ctx.agents.get(sessionId as never) === undefined) return sendJson(res, 404, { message: 'The selected DSH Agent is unavailable.' })
      const current = settings.get(); if (!current.enabled) return sendJson(res, 409, { code: 'disabled', message: 'Realtime Agent Voice is disabled.' })
      const qwenKey = current.provider === 'qwen' ? await resolveCredential(ctx, QWEN_API_KEY_REF) : undefined; const appId = current.provider === 'doubao' ? await resolveCredential(ctx, DOUBAO_APP_ID_REF) : undefined; const accessKey = current.provider === 'doubao' ? await resolveCredential(ctx, DOUBAO_ACCESS_KEY_REF) : undefined
      if (current.provider === 'qwen' && (!qwenKey || (current.qwenEndpointMode === 'workspace' && !safeIdentifier(current.qwenWorkspaceId.trim())))) return sendJson(res, 503, { code: 'qwen_not_ready', message: current.qwenEndpointMode === 'workspace' ? 'Configure the Qwen workspace ID and API key first.' : 'Configure the Qwen API key first.' })
      if (current.provider === 'doubao' && (!appId || !accessKey || !current.doubaoRealtimeUrl.startsWith('wss://'))) return sendJson(res, 503, { code: 'doubao_not_ready', message: 'Configure the Doubao App ID, Access Key, and realtime endpoint first.' })
      const token = randomBytes(32).toString('base64url'); const bridgeSessionId = randomUUID(); clearExpiredTickets(tickets); tickets.set(token, { provider: current.provider, model: current.provider === 'qwen' ? current.qwenModel : current.doubaoModel, qwenEndpointMode: current.qwenEndpointMode, workspaceId: current.qwenWorkspaceId.trim(), endpoint: current.doubaoRealtimeUrl.trim(), resourceId: current.doubaoResourceId.trim(), appKey: current.doubaoAppKey.trim(), ttsEnabled: current.ttsEnabled, ttsModel: current.provider === 'qwen' ? current.qwenTtsModel : current.doubaoTtsResourceId, ttsVoice: current.provider === 'qwen' ? current.qwenTtsVoice.trim() : current.doubaoTtsVoice.trim(), ttsEndpoint: current.provider === 'qwen' ? '' : current.doubaoTtsEndpoint.trim(), ttsResourceId: current.provider === 'qwen' ? '' : current.doubaoTtsResourceId.trim(), systemPrompt: current.systemPrompt, agentSessionId: sessionId, sessionId: bridgeSessionId, expiresAt: Date.now() + 60_000 }); sendJson(res, 200, { ticket: token, wsPath: VOICE_UPGRADE_PATH, sessionId: bridgeSessionId, agentSessionId: sessionId, provider: current.provider, modelId: current.provider === 'qwen' ? current.qwenModel : current.doubaoModel, expiresAt: new Date(Date.now() + 60_000).toISOString() })
    } })
    const registerUpgrade = (ctx.webServer as typeof ctx.webServer & {
      registerUpgrade?: (route: { path: string; handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void> }) => () => void
    }).registerUpgrade
    const disposeUpgrade = registerUpgrade === undefined ? () => {} : registerUpgrade.call(ctx.webServer, { path: VOICE_UPGRADE_PATH, handler: async (req, socket: Duplex, head: Buffer) => {
      const token = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('ticket') ?? ''; clearExpiredTickets(tickets); const ticket = tickets.get(token); if (!ticket) { socket.destroy(); return }; tickets.delete(token)
      const qwenKey = ticket.provider === 'qwen' ? await resolveCredential(ctx, QWEN_API_KEY_REF) : undefined; const appId = ticket.provider === 'doubao' ? await resolveCredential(ctx, DOUBAO_APP_ID_REF) : undefined; const accessKey = ticket.provider === 'doubao' ? await resolveCredential(ctx, DOUBAO_ACCESS_KEY_REF) : undefined; if ((ticket.provider === 'qwen' && !qwenKey) || (ticket.provider === 'doubao' && (!appId || !accessKey))) { socket.destroy(); return }
      server.handleUpgrade(req, socket, head, client => { const bridge = new VoiceAgentBridge(client, ticket, ctx, qwenKey, appId, accessKey); bridges.set(ticket.agentSessionId, bridge); bridge.open(); client.on('message', (data, isBinary) => bridge.onClientMessage(data, isBinary)); client.on('close', () => { bridge.close(); if (bridges.get(ticket.agentSessionId) === bridge) bridges.delete(ticket.agentSessionId) }) })
    } })
    return () => { disposeConfig(); disposeSettings(); disposeCredentials(); disposeTicket(); disposeUpgrade(); tickets.clear(); for (const bridge of bridges.values()) bridge.close('host_disposed'); bridges.clear(); server.close() }
  }, 'dsh-plugin-desktop: Agent Voice host')
  ctx.effect(() => stopAgentEvents, 'dsh-plugin-desktop: Agent Voice session event forwarding')
}
