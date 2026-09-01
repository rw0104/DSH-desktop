/** Provider-native streaming TTS adapters for Desktop Agent Voice. */

import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'

export interface VoiceTtsSink {
  onStarted(): void
  onAudio(audio: Buffer): void
  onDone(): void
  onError(error: Error): void
}

export interface VoiceTtsStream {
  append(text: string): void
  finish(): void
  cancel(): void
}

export interface QwenTtsSpec {
  provider: 'qwen'
  endpointMode: 'shared' | 'workspace'
  workspaceId: string
  model: string
  voice: string
  apiKey: string
}

export interface DoubaoTtsSpec {
  provider: 'doubao'
  endpoint: string
  resourceId: string
  voice: string
  appId: string
  accessKey: string
}

export type VoiceTtsSpec = QwenTtsSpec | DoubaoTtsSpec

function event(type: string, value: Record<string, unknown> = {}): string {
  return JSON.stringify({ event_id: `event_${randomUUID()}`, type, ...value })
}

export function buildQwenTtsUrl(spec: Pick<QwenTtsSpec, 'endpointMode' | 'workspaceId' | 'model'>): string {
  const host = spec.endpointMode === 'workspace' && spec.workspaceId
    ? `${spec.workspaceId}.cn-beijing.maas.aliyuncs.com`
    : 'dashscope.aliyuncs.com'
  return `wss://${host}/api-ws/v1/realtime?model=${encodeURIComponent(spec.model)}`
}

export function buildQwenTtsSessionUpdate(voice: string): string {
  return event('session.update', {
    session: {
      voice,
      mode: 'server_commit',
      language_type: 'Auto',
      response_format: 'pcm',
      sample_rate: 24_000,
    },
  })
}

export function buildQwenTtsTextAppend(text: string): string {
  return event('input_text_buffer.append', { text })
}

export function buildQwenTtsFinish(): string {
  return event('session.finish')
}

function speakableText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gmu, '')
    .replace(/^\s*[-+*]\s+/gmu, '')
    .replace(/[*_~]/gu, '')
    .replace(/[>|]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function sentenceBoundary(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== undefined && /[。！？!?；;\n]/u.test(character)) return index + 1
  }
  return -1
}

/** Buffers Agent token deltas into bounded, speakable natural-language chunks. */
export class AgentSpeechChunker {
  private buffer = ''

  constructor(private readonly maxLength = 120) {}

  push(delta: string): string[] {
    this.buffer += delta
    return this.extract(false)
  }

  finish(): string[] {
    return this.extract(true)
  }

  clear(): void {
    this.buffer = ''
  }

  private extract(flush: boolean): string[] {
    const chunks: string[] = []
    while (this.buffer !== '') {
      const boundary = sentenceBoundary(this.buffer)
      if (boundary > 0) {
        this.emit(this.buffer.slice(0, boundary), chunks)
        this.buffer = this.buffer.slice(boundary)
        continue
      }
      if (this.buffer.length >= this.maxLength) {
        const cut = this.safeCut(flush)
        if (cut === 0) break
        this.emit(this.buffer.slice(0, cut), chunks)
        this.buffer = this.buffer.slice(cut)
        continue
      }
      if (flush) {
        this.emit(this.buffer, chunks)
        this.buffer = ''
      }
      break
    }
    return chunks
  }

  private emit(value: string, chunks: string[]): void {
    const clean = speakableText(value)
    if (clean !== '') chunks.push(clean)
  }

  private safeCut(flush: boolean): number {
    const head = this.buffer.slice(0, this.maxLength)
    const ticks = [...head].filter(character => character === '`').length
    if (ticks % 2 === 1) {
      const close = this.buffer.indexOf('`', this.maxLength)
      if (close < 0) return flush ? this.buffer.length : 0
      return close + 1
    }
    const tokenStart = Math.max(head.lastIndexOf('http://'), head.lastIndexOf('https://'))
    if (tokenStart >= 0) {
      const tokenEnd = this.buffer.slice(this.maxLength).search(/\s/u)
      if (tokenEnd < 0) return flush ? this.buffer.length : 0
      return this.maxLength + tokenEnd
    }
    const whitespace = head.search(/\s+[^\s]*$/u)
    return whitespace >= Math.floor(this.maxLength * 0.55) ? whitespace : this.maxLength
  }
}

function providerError(value: unknown): Error {
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : typeof record.error === 'string' ? record.error : ''
    const code = record.code === undefined ? '' : ` ${String(record.code)}`
    if (message !== '') return new Error(`Doubao TTS${code}: ${message}`)
  }
  return new Error('Doubao TTS returned an invalid streaming event.')
}

function decodePcm(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value === '' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) return undefined
  const audio = Buffer.from(value, 'base64')
  return audio.length > 0 && audio.length % 2 === 0 ? audio : undefined
}

/** Incremental parser for Volcengine V3 SSE `data:` events. */
export class DoubaoSseParser {
  private buffer = ''

  push(value: string): Buffer[] {
    this.buffer += value
    const frames: Buffer[] = []
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      this.parseLine(line, frames)
      newline = this.buffer.indexOf('\n')
    }
    return frames
  }

  finish(): Buffer[] {
    const frames: Buffer[] = []
    this.parseLine(this.buffer.trim(), frames)
    this.buffer = ''
    return frames
  }

  private parseLine(line: string, frames: Buffer[]): void {
    if (line === '' || line.startsWith(':')) return
    const payload = line.startsWith('data:') ? line.slice(5).trim() : line
    let value: unknown
    try { value = JSON.parse(payload) } catch { throw providerError(undefined) }
    if (value === null || typeof value !== 'object') throw providerError(value)
    const record = value as Record<string, unknown>
    const code = Number(record.code ?? 0)
    if (code !== 0 && code !== 20_000_000) throw providerError(record)
    const audio = decodePcm(record.data)
    if (audio !== undefined) frames.push(audio)
  }
}

class QwenTtsStream implements VoiceTtsStream {
  private readonly socket: WebSocket
  private readonly pending: string[] = []
  private ready = false
  private finishing = false
  private finished = false
  private cancelled = false
  private started = false

  constructor(spec: QwenTtsSpec, private readonly sink: VoiceTtsSink) {
    const headers = {
      Authorization: `Bearer ${spec.apiKey}`,
      ...(spec.endpointMode === 'workspace' && spec.workspaceId ? { 'X-DashScope-WorkSpace': spec.workspaceId } : {}),
    }
    this.socket = new WebSocket(buildQwenTtsUrl(spec), { headers })
    this.socket.on('open', () => { this.socket.send(buildQwenTtsSessionUpdate(spec.voice)) })
    this.socket.on('message', data => { this.onMessage(data) })
    this.socket.on('error', cause => { this.fail(cause instanceof Error ? cause : new Error('Qwen TTS connection failed.')) })
    this.socket.on('close', () => {
      if (!this.cancelled && !this.finished) this.fail(new Error('Qwen TTS connection closed before synthesis completed.'))
    })
  }

  append(text: string): void {
    if (this.cancelled || this.finished || text.trim() === '') return
    this.pending.push(text)
    this.flush()
  }

  finish(): void {
    if (this.cancelled || this.finished) return
    this.finishing = true
    this.flush()
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.pending.length = 0
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, 'tts_cancelled')
  }

  private flush(): void {
    if (!this.ready || this.socket.readyState !== WebSocket.OPEN) return
    while (this.pending.length > 0) this.socket.send(buildQwenTtsTextAppend(this.pending.shift()!))
    if (this.finishing && !this.finished) {
      this.finishing = false
      this.socket.send(buildQwenTtsFinish())
    }
  }

  private onMessage(data: WebSocket.RawData): void {
    let value: Record<string, unknown>
    try { value = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)) as Record<string, unknown> } catch { return }
    const type = String(value.type ?? '')
    if (type === 'session.updated') {
      this.ready = true
      this.flush()
      return
    }
    if (type === 'response.audio.delta') {
      const audio = decodePcm(value.delta)
      if (audio === undefined) return this.fail(new Error('Qwen TTS returned an invalid PCM frame.'))
      if (!this.started) { this.started = true; this.sink.onStarted() }
      this.sink.onAudio(audio)
      return
    }
    if (type === 'session.finished') this.complete()
    if (type === 'error') {
      const error = value.error as Record<string, unknown> | undefined
      this.fail(new Error(typeof error?.message === 'string' ? error.message : 'Qwen TTS synthesis failed.'))
    }
  }

  private complete(): void {
    if (this.finished || this.cancelled) return
    this.finished = true
    this.sink.onDone()
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, 'tts_finished')
  }

  private fail(error: Error): void {
    if (this.finished || this.cancelled) return
    this.finished = true
    this.sink.onError(error)
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close(1011, 'tts_error')
  }
}

class DoubaoTtsStream implements VoiceTtsStream {
  private readonly pending: string[] = []
  private controller: AbortController | undefined
  private running = false
  private finishing = false
  private cancelled = false
  private finished = false
  private started = false

  constructor(private readonly spec: DoubaoTtsSpec, private readonly sink: VoiceTtsSink) {}

  append(text: string): void {
    if (this.cancelled || this.finished || text.trim() === '') return
    this.pending.push(text)
    void this.drain()
  }

  finish(): void {
    if (this.cancelled || this.finished) return
    this.finishing = true
    void this.drain()
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.pending.length = 0
    this.controller?.abort()
  }

  private async drain(): Promise<void> {
    if (this.running || this.cancelled || this.finished) return
    this.running = true
    try {
      while (!this.cancelled && this.pending.length > 0) await this.synthesize(this.pending.shift()!)
      if (!this.cancelled && this.finishing && this.pending.length === 0) {
        this.finished = true
        this.sink.onDone()
      }
    } catch (cause) {
      if (!this.cancelled) {
        this.finished = true
        this.sink.onError(cause instanceof Error ? cause : new Error('Doubao TTS synthesis failed.'))
      }
    } finally {
      this.running = false
      this.controller = undefined
      if (!this.cancelled && !this.finished && this.pending.length > 0) void this.drain()
    }
  }

  private async synthesize(text: string): Promise<void> {
    const controller = new AbortController()
    this.controller = controller
    const requestId = randomUUID()
    const response = await fetch(this.spec.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Api-App-Id': this.spec.appId,
        'X-Api-Access-Key': this.spec.accessKey,
        'X-Api-Resource-Id': this.spec.resourceId,
        'X-Api-Request-Id': requestId,
      },
      body: JSON.stringify({
        user: { uid: 'dsh-desktop-agent-voice' },
        req_params: {
          text,
          speaker: this.spec.voice,
          sample_rate: 24_000,
          audio_params: { format: 'pcm', sample_rate: 24_000, speech_rate: 0, loudness_rate: 0 },
          additions: JSON.stringify({ disable_markdown_filter: false, enable_latex_tn: false }),
        },
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Doubao TTS request failed (${String(response.status)}): ${await response.text()}`)
    if (response.body === null) throw new Error('Doubao TTS returned no response stream.')
    const parser = new DoubaoSseParser()
    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    while (!this.cancelled) {
      const result = await reader.read()
      const frames = parser.push(decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done }))
      for (const audio of frames) this.emitAudio(audio)
      if (result.done) break
    }
    if (!this.cancelled) for (const audio of parser.finish()) this.emitAudio(audio)
  }

  private emitAudio(audio: Buffer): void {
    if (this.cancelled) return
    if (!this.started) { this.started = true; this.sink.onStarted() }
    this.sink.onAudio(audio)
  }
}

export function createVoiceTtsStream(spec: VoiceTtsSpec, sink: VoiceTtsSink): VoiceTtsStream {
  return spec.provider === 'qwen' ? new QwenTtsStream(spec, sink) : new DoubaoTtsStream(spec, sink)
}
