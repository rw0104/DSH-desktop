interface VoiceCredentialResult {
  ok: true
  value: { credentials: Record<string, { configured?: boolean; writable?: boolean }> }
}

interface VoiceCredentialApi {
  describe(input: { refs: string[] }): Promise<{ result: VoiceCredentialResult | { ok: false; error: { message: string } } }>
  set(input: { ref: string; value: string }): Promise<{ result: { ok: true } | { ok: false; error: { message: string } } }>
  unset(input: { ref: string }): Promise<{ result: { ok: true } | { ok: false; error: { message: string } } }>
}

interface VoiceConnectionApi { credentials: VoiceCredentialApi }

interface VoiceContext {
  get(name: string): unknown
  settingsScope: SettingsScopeBinder
}

interface SettingsScope<T> {
  getSnapshot(): { value: T | undefined }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

interface SettingsScopeBinder {
  bind<T>(spec: { namespace: string }): SettingsScope<T>
}

interface SnapshotStore<T> {
  getSnapshot(): T
  set(value: T): void
  subscribe(listener: () => void): () => void
}

function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    set: value => {
      snapshot = value
      listeners.forEach(listener => { listener() })
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export const DESKTOP_VOICE_SETTINGS_NAMESPACE = 'dsh-desktop-voice'
export const QWEN_API_KEY_REF = 'DASHSCOPE_API_KEY'
export const DOUBAO_APP_ID_REF = 'DOUBAO_APP_ID'
export const DOUBAO_ACCESS_KEY_REF = 'DOUBAO_ACCESS_KEY'
export const VOICE_TICKET_PATH = '/dsh-desktop/api/voice/ticket'
export const VOICE_SETTINGS_PATH = '/dsh-desktop/api/voice/settings'

export interface DesktopVoiceSettings {
  enabled: boolean
  provider: 'qwen' | 'doubao'
  qwenModel: 'qwen3-asr-flash-realtime'
  qwenEndpointMode: 'shared' | 'workspace'
  qwenWorkspaceId: string
  doubaoModel: 'doubao-seed-asr-2'
  doubaoRealtimeUrl: string
  doubaoResourceId: string
  doubaoAppKey: string
  systemPrompt: string
}

export type VoiceStatus = 'idle' | 'requesting' | 'connecting' | 'listening' | 'user-speaking' | 'thinking' | 'assistant-speaking' | 'finishing' | 'ended' | 'error'

export interface VoiceTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  interrupted?: boolean
}

export interface VoiceAudioFeatures {
  rms: number
  peak: number
  low: number
  mid: number
  high: number
}

export interface DesktopVoiceState {
  settings: DesktopVoiceSettings
  qwenKeyConfigured: boolean
  doubaoAppIdConfigured: boolean
  doubaoAccessKeyConfigured: boolean
  qwenKeyWritable: boolean
  doubaoAppIdWritable: boolean
  doubaoAccessKeyWritable: boolean
  status: VoiceStatus
  sessionId: string
  turns: readonly VoiceTurn[]
  liveInput: string
  liveOutput: string
  microphoneMuted: boolean
  outputMuted: boolean
  inputAudio: VoiceAudioFeatures
  error: string | null
}

export interface VoiceSidebarApi {
  openTab(seed: { type: string; title?: string; meta?: unknown }, scope?: { sessionId: string }): void
}

const DEFAULT_SETTINGS: DesktopVoiceSettings = {
  enabled: false,
  provider: 'qwen',
  qwenModel: 'qwen3-asr-flash-realtime',
  qwenEndpointMode: 'shared',
  qwenWorkspaceId: '',
  doubaoModel: 'doubao-seed-asr-2',
  doubaoRealtimeUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
  doubaoResourceId: 'volc.seedasr.sauc.duration',
  doubaoAppKey: 'PlgvMymc7f3tQnJ6',
  systemPrompt: 'You are a concise, friendly realtime voice assistant.',
}

const INITIAL: DesktopVoiceState = {
  settings: DEFAULT_SETTINGS,
  qwenKeyConfigured: false,
  doubaoAppIdConfigured: false,
  doubaoAccessKeyConfigured: false,
  qwenKeyWritable: true,
  doubaoAppIdWritable: true,
  doubaoAccessKeyWritable: true,
  status: 'idle',
  sessionId: '',
  turns: [],
  liveInput: '',
  liveOutput: '',
  microphoneMuted: false,
  outputMuted: false,
  inputAudio: { rms: 0, peak: 0, low: 0, mid: 0, high: 0 },
  error: null,
}

const ACTIVE = new Set<VoiceStatus>(['requesting', 'connecting', 'listening', 'user-speaking', 'thinking', 'assistant-speaking', 'finishing'])

function base64(bytes: Uint8Array): string {
  let raw = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(raw)
}

/** Convert browser-native float samples to the 16 kHz mono PCM16 contract. */
function resamplePcm16(input: Float32Array, sourceRate: number): Int16Array {
  const targetRate = 16_000
  if (sourceRate === targetRate) {
    const result = new Int16Array(input.length)
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index] ?? 0))
      result[index] = sample < 0 ? sample * 32768 : sample * 32767
    }
    return result
  }
  const ratio = sourceRate / targetRate
  const result = new Int16Array(Math.max(1, Math.round(input.length / ratio)))
  for (let index = 0; index < result.length; index += 1) {
    const position = index * ratio
    const before = Math.min(input.length - 1, Math.floor(position))
    const after = Math.min(input.length - 1, before + 1)
    const mix = position - before
    const sample = Math.max(-1, Math.min(1, (input[before] ?? 0) * (1 - mix) + (input[after] ?? 0) * mix))
    result[index] = sample < 0 ? sample * 32768 : sample * 32767
  }
  return result
}

function analyzePcm16(samples: Int16Array, sampleRate = 16_000): VoiceAudioFeatures {
  if (samples.length === 0) return { rms: 0, peak: 0, low: 0, mid: 0, high: 0 }
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * 280) / sampleRate)
  const midAlpha = 1 - Math.exp((-2 * Math.PI * 2200) / sampleRate)
  let lowPass = 0
  let midPass = 0
  let squareTotal = 0
  let lowTotal = 0
  let midTotal = 0
  let highTotal = 0
  let peak = 0
  for (const raw of samples) {
    const sample = raw / 32768
    lowPass += lowAlpha * (sample - lowPass)
    midPass += midAlpha * (sample - midPass)
    const low = lowPass
    const mid = midPass - lowPass
    const high = sample - midPass
    squareTotal += sample * sample
    lowTotal += low * low
    midTotal += mid * mid
    highTotal += high * high
    peak = Math.max(peak, Math.abs(sample))
  }
  const length = samples.length
  const rms = Math.sqrt(squareTotal / length)
  const gate = rms < 0.004 ? 0 : 1
  const clamp = (value: number): number => Math.max(0, Math.min(1, value)) * gate
  return {
    rms: clamp(rms * 4.8),
    peak: clamp(peak),
    low: clamp(Math.sqrt(lowTotal / length) * 7.2),
    mid: clamp(Math.sqrt(midTotal / length) * 6.4),
    high: clamp(Math.sqrt(highTotal / length) * 8.8),
  }
}

const VOICE_CAPTURE_PROCESSOR = `
class DshVoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const targetRate = Number(options?.processorOptions?.targetSampleRate || 16000);
    const chunkMs = Number(options?.processorOptions?.chunkMs || 40);
    this.input = [];
    this.output = [];
    this.cursor = 0;
    this.ratio = sampleRate / targetRate;
    this.framesPerChunk = Math.max(1, Math.round(targetRate * chunkMs / 1000));
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel?.length) return true;
    for (let index = 0; index < channel.length; index += 1) this.input.push(channel[index]);
    while (this.cursor + this.ratio <= this.input.length) {
      const start = Math.floor(this.cursor);
      const end = Math.min(this.input.length, Math.max(start + 1, Math.floor(this.cursor + this.ratio)));
      let total = 0;
      for (let index = start; index < end; index += 1) total += this.input[index];
      this.output.push(total / Math.max(1, end - start));
      this.cursor += this.ratio;
    }
    const consumed = Math.floor(this.cursor);
    if (consumed > 0) { this.input.splice(0, consumed); this.cursor -= consumed; }
    while (this.output.length >= this.framesPerChunk) {
      const chunk = this.output.splice(0, this.framesPerChunk);
      const pcm = new Int16Array(this.framesPerChunk);
      for (let index = 0; index < pcm.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, Number(chunk[index]) || 0));
        pcm[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      }
      this.port.postMessage({ type: 'pcm', samples: pcm }, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('dsh-realtime-pcm-capture', DshVoiceCaptureProcessor);
`

const MAX_VOICE_SOCKET_BUFFER = 256 * 1024

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  if (value !== null && typeof value === 'object' && 'message' in value) return String(value.message)
  return String(value)
}

export class DesktopVoiceController {
  readonly store: SnapshotStore<DesktopVoiceState> = createSnapshotStore(INITIAL)
  private readonly scope: SettingsScope<DesktopVoiceSettings>
  private readonly api: VoiceConnectionApi
  private socket: WebSocket | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private captureContext: AudioContext | null = null
  private captureSource: MediaStreamAudioSourceNode | null = null
  private captureProcessor: ScriptProcessorNode | null = null
  private captureWorklet: AudioWorkletNode | null = null
  private captureGain: GainNode | null = null
  private lastAudioFeatureAt = 0
  private playbackAt = 0
  private activeGeneration = 0
  private credentialRefresh: Promise<void> | null = null
  private finishTimer: ReturnType<typeof setTimeout> | null = null
  private uiFrame: number | null = null
  private pendingInput: string | null = null
  private pendingOutput = ''

  constructor(ctx: VoiceContext, private readonly sidebar: VoiceSidebarApi) {
    this.scope = ctx.settingsScope.bind<DesktopVoiceSettings>({ namespace: DESKTOP_VOICE_SETTINGS_NAMESPACE })
    this.api = (ctx.get('connection') as { api: VoiceConnectionApi }).api
    this.scope.subscribe(() => this.syncSettings())
    this.syncSettings()
    void this.refreshCredentials()
  }

  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener)

  getSnapshot = (): DesktopVoiceState => this.store.getSnapshot()

  isActive(): boolean { return ACTIVE.has(this.store.getSnapshot().status) }

  private set(patch: Partial<DesktopVoiceState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private syncSettings(): void {
    const value = this.scope.getSnapshot().value
    if (value !== undefined) this.set({ settings: value, error: null })
  }

  async refreshCredentials(): Promise<void> {
    if (this.credentialRefresh !== null) return this.credentialRefresh
    this.credentialRefresh = (async () => {
      try {
        const response = await this.api.credentials.describe({ refs: [QWEN_API_KEY_REF, DOUBAO_APP_ID_REF, DOUBAO_ACCESS_KEY_REF] })
        if (!response.result.ok) return
        const credentials = response.result.value.credentials
        this.set({
          qwenKeyConfigured: credentials[QWEN_API_KEY_REF]?.configured === true,
          doubaoAppIdConfigured: credentials[DOUBAO_APP_ID_REF]?.configured === true,
          doubaoAccessKeyConfigured: credentials[DOUBAO_ACCESS_KEY_REF]?.configured === true,
          qwenKeyWritable: credentials[QWEN_API_KEY_REF]?.writable !== false,
          doubaoAppIdWritable: credentials[DOUBAO_APP_ID_REF]?.writable !== false,
          doubaoAccessKeyWritable: credentials[DOUBAO_ACCESS_KEY_REF]?.writable !== false,
        })
      } catch {
        // A missing credentials service leaves the controls usable; the Host
        // reports the actionable failure when the user tries to save or start.
      } finally {
        this.credentialRefresh = null
      }
    })()
    return this.credentialRefresh
  }

  async setSetting<K extends keyof DesktopVoiceSettings>(key: K, value: DesktopVoiceSettings[K]): Promise<void> {
    try {
      await this.scope.set(String(key), value)
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  async setCredential(ref: string, value: string): Promise<void> {
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      const response = await this.api.credentials.set({ ref, value: trimmed })
      if (!response.result.ok) throw new Error(response.result.error.message)
      await this.refreshCredentials()
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  async saveConfiguration(settings: DesktopVoiceSettings, secrets: { qwenKey?: string; doubaoAppId?: string; doubaoAccessKey?: string }): Promise<boolean> {
    try {
      const response = await fetch(VOICE_SETTINGS_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const payload: unknown = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(messageOf(payload))
      const entries = [
        [QWEN_API_KEY_REF, secrets.qwenKey],
        [DOUBAO_APP_ID_REF, secrets.doubaoAppId],
        [DOUBAO_ACCESS_KEY_REF, secrets.doubaoAccessKey],
      ] as const
      for (const [ref, raw] of entries) {
        const value = raw?.trim()
        if (!value) continue
        const result = await this.api.credentials.set({ ref, value })
        if (!result.result.ok) throw new Error(result.result.error.message)
      }
      await this.refreshCredentials()
      this.set({ error: null })
      return true
    } catch (error) {
      this.set({ error: messageOf(error) })
      return false
    }
  }

  async clearCredential(ref: string): Promise<void> {
    try {
      const response = await this.api.credentials.unset({ ref })
      if (!response.result.ok) throw new Error(response.result.error.message)
      await this.refreshCredentials()
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  open(sessionId: string): void {
    if (!sessionId) return
    this.sidebar.openTab({ type: 'desktop:voice', title: 'Voice', meta: { sessionId } }, { sessionId })
  }

  async openAndStart(sessionId: string): Promise<void> {
    this.open(sessionId)
    await this.start(sessionId)
  }

  async start(sessionId: string): Promise<void> {
    const snapshot = this.store.getSnapshot()
    if (this.isActive()) return
    if (!snapshot.settings.enabled) {
      this.set({ error: 'Enable realtime voice in Settings first.' })
      return
    }
    const generation = ++this.activeGeneration
    this.set({ status: 'requesting', error: null, turns: [], liveInput: '', liveOutput: '' })
    try {
      const ticketResponse = await fetch(VOICE_TICKET_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
      const ticketPayload: unknown = await ticketResponse.json().catch(() => ({}))
      if (!ticketResponse.ok) throw new Error(messageOf(ticketPayload))
      const ticket = ticketPayload as { ticket?: string; wsPath?: string; sessionId?: string }
      if (!ticket.ticket || !ticket.wsPath || !ticket.sessionId) throw new Error('The realtime voice ticket response is incomplete.')
      await this.openMicrophone(generation)
      if (generation !== this.activeGeneration) return
      this.set({ status: 'connecting', sessionId: ticket.sessionId })
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}${ticket.wsPath}?ticket=${encodeURIComponent(ticket.ticket)}`)
      socket.binaryType = 'arraybuffer'
      socket.onopen = () => { this.set({ status: 'connecting' }) }
      socket.onmessage = event => { void this.handleSocketMessage(socket, event) }
      socket.onerror = () => { if (generation === this.activeGeneration) this.fail('The realtime connection was interrupted.') }
      socket.onclose = () => {
        if (this.socket !== socket || generation !== this.activeGeneration) return
        this.socket = null
        if (this.isActive()) {
          void this.stopMedia()
          this.set({ status: 'ended' })
        }
      }
      this.socket = socket
    } catch (error) {
      if (generation === this.activeGeneration) this.fail(messageOf(error))
    }
  }

  async finish(): Promise<void> {
    if (!this.isActive()) return
    this.set({ status: 'finishing' })
    const socket = this.socket
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ type: 'session.finish' })) } catch { /* socket is closing */ }
      if (this.finishTimer !== null) clearTimeout(this.finishTimer)
      this.finishTimer = setTimeout(() => { void this.completeFinish(socket) }, 5_500)
    } else await this.completeFinish(socket)
  }

  async toggleMicrophone(): Promise<void> {
    const muted = !this.store.getSnapshot().microphoneMuted
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted })
    this.set({ microphoneMuted: muted })
  }

  toggleOutput(): void {
    const muted = !this.store.getSnapshot().outputMuted
    if (muted) window.speechSynthesis?.cancel()
    this.set({ outputMuted: muted })
  }

  private async openMicrophone(generation: number): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This desktop does not expose a microphone.')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    if (generation !== this.activeGeneration) {
      stream.getTracks().forEach(track => track.stop())
      return
    }
    const context = new AudioContext({ latencyHint: 'interactive' })
    await context.resume()
    const source = context.createMediaStreamSource(stream)
    const gain = context.createGain()
    gain.gain.value = 0
    let workletReady = false
    if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        const moduleUrl = URL.createObjectURL(new Blob([VOICE_CAPTURE_PROCESSOR], { type: 'text/javascript' }))
        try { await context.audioWorklet.addModule(moduleUrl) } finally { URL.revokeObjectURL(moduleUrl) }
        const worklet = new AudioWorkletNode(context, 'dsh-realtime-pcm-capture', { processorOptions: { targetSampleRate: 16_000, chunkMs: 40 } })
        worklet.port.onmessage = event => {
          const data = event.data as { type?: unknown; samples?: unknown }
          if (data.type !== 'pcm' || !(data.samples instanceof Int16Array || data.samples instanceof ArrayBuffer)) return
          const pcm = data.samples instanceof Int16Array ? data.samples : new Int16Array(data.samples)
          this.emitPcm(pcm)
        }
        source.connect(worklet)
        worklet.connect(gain)
        this.captureWorklet = worklet
        workletReady = true
      } catch {
        // CSP or an older WebAudio implementation can reject Blob worklets.
      }
    }
    if (!workletReady) {
      const processor = context.createScriptProcessor(2048, 1, 1)
      processor.onaudioprocess = event => { this.emitPcm(resamplePcm16(event.inputBuffer.getChannelData(0), context.sampleRate)) }
      source.connect(processor)
      processor.connect(gain)
      this.captureProcessor = processor
    }
    gain.connect(context.destination)
    this.stream = stream
    this.captureContext = context
    this.captureSource = source
    this.captureGain = gain
  }

  private emitPcm(pcm: Int16Array): void {
    const socket = this.socket
    if (this.store.getSnapshot().microphoneMuted || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_VOICE_SOCKET_BUFFER) return
    socket.send(JSON.stringify({ type: 'audio.append', audio: base64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)) }))
    const now = performance.now()
    if (now - this.lastAudioFeatureAt >= 80) {
      this.lastAudioFeatureAt = now
      this.set({ inputAudio: analyzePcm16(pcm) })
    }
  }

  private async handleSocketMessage(socket: WebSocket, event: MessageEvent): Promise<void> {
    if (socket !== this.socket) return
    if (typeof event.data !== 'string') {
      const buffer = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data
      if (buffer instanceof ArrayBuffer) this.playPcmBytes(new Int16Array(buffer))
      return
    }
    let message: Record<string, unknown>
    try { message = JSON.parse(event.data) as Record<string, unknown> } catch { return }
    const type = String(message.type || '')
    if (type === 'provider.ready') {
      socket.send(JSON.stringify({ type: 'session.start' }))
      this.set({ status: 'listening' })
    } else if (type === 'speech.started') this.set({ status: 'user-speaking' })
    else if (type === 'speech.stopped' || type === 'agent.request.accepted') this.set({ status: 'thinking' })
    else if (type === 'transcript.partial') this.queueInput(String(message.text || ''))
    else if (type === 'transcript.final') {
      this.flushRealtimeUi()
      this.commitTurn('user', String(message.text || this.store.getSnapshot().liveInput))
    }
    else if (type === 'agent.text.delta') {
      if (this.store.getSnapshot().status !== 'assistant-speaking') this.set({ status: 'assistant-speaking' })
      this.pendingOutput += String(message.text || '')
      this.scheduleUiFlush()
    } else if (type === 'agent.response.done') {
      this.flushRealtimeUi()
      const response = this.store.getSnapshot().liveOutput
      this.commitTurn('assistant', response)
      if (!this.speak(response)) this.set({ status: 'listening' })
    } else if (type === 'session.finished') await this.completeFinish(socket)
    else if (type === 'session.failed') this.fail(String(message.message || 'The voice provider returned an error.'))
    else if (type === 'provider.closed') {
      void this.stopMedia()
      this.set({ status: 'ended' })
    }
  }

  private commitTurn(role: VoiceTurn['role'], value: string): void {
    const text = value.trim()
    if (!text) return
    const turn: VoiceTurn = { id: `${role}-${Date.now()}-${this.store.getSnapshot().turns.length}`, role, text }
    this.set({ turns: [...this.store.getSnapshot().turns.slice(-39), turn], ...(role === 'user' ? { liveInput: '' } : { liveOutput: '' }) })
  }

  private queueInput(value: string): void {
    this.pendingInput = value
    this.scheduleUiFlush()
  }

  private scheduleUiFlush(): void {
    if (this.uiFrame !== null) return
    this.uiFrame = window.requestAnimationFrame(() => {
      this.uiFrame = null
      this.flushRealtimeUi()
    })
  }

  private flushRealtimeUi(): void {
    if (this.uiFrame !== null) window.cancelAnimationFrame(this.uiFrame)
    this.uiFrame = null
    if (this.pendingInput === null && this.pendingOutput === '') return
    const patch: Partial<DesktopVoiceState> = {}
    if (this.pendingInput !== null) patch.liveInput = this.pendingInput
    if (this.pendingOutput !== '') patch.liveOutput = `${this.store.getSnapshot().liveOutput}${this.pendingOutput}`
    this.pendingInput = null
    this.pendingOutput = ''
    this.set(patch)
  }

  private playPcmBytes(samples: Int16Array): void {
    if (this.store.getSnapshot().outputMuted) return
    const context = this.audioContext ?? new AudioContext({ sampleRate: 24000 })
    this.audioContext = context
    const buffer = context.createBuffer(1, samples.length, 24000)
    const output = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) output[index] = (samples[index] ?? 0) / 32768
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const now = context.currentTime
    this.playbackAt = Math.max(this.playbackAt, now)
    source.start(this.playbackAt)
    this.playbackAt += buffer.duration
  }

  private speak(text: string): boolean {
    if (this.store.getSnapshot().outputMuted || !text.trim() || !window.speechSynthesis) return false
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = /[\u3400-\u9fff]/u.test(text) ? 'zh-CN' : 'en-US'
    const finish = (): void => {
      if (this.store.getSnapshot().status === 'assistant-speaking') this.set({ status: 'listening' })
    }
    utterance.onend = finish
    utterance.onerror = finish
    this.set({ status: 'assistant-speaking' })
    window.speechSynthesis.speak(utterance)
    return true
  }

  private fail(error: string): void {
    if (this.finishTimer !== null) clearTimeout(this.finishTimer)
    this.finishTimer = null
    this.set({ status: 'error', error })
    void this.stopMedia()
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1011, 'voice_error')
  }

  private async completeFinish(socket: WebSocket | null): Promise<void> {
    if (this.finishTimer !== null) clearTimeout(this.finishTimer)
    this.finishTimer = null
    if (socket !== null && this.socket === socket) this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'client_finished')
    await this.stopMedia()
    this.set({ status: 'ended' })
  }

  private async stopMedia(): Promise<void> {
    if (this.finishTimer !== null) clearTimeout(this.finishTimer)
    this.finishTimer = null
    if (this.uiFrame !== null) window.cancelAnimationFrame(this.uiFrame)
    this.uiFrame = null
    this.pendingInput = null
    this.pendingOutput = ''
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.captureProcessor?.disconnect()
    if (this.captureWorklet) this.captureWorklet.port.onmessage = null
    this.captureWorklet?.disconnect()
    this.captureSource?.disconnect()
    this.captureGain?.disconnect()
    this.captureProcessor = null
    this.captureWorklet = null
    this.captureSource = null
    this.captureGain = null
    await Promise.allSettled([
      this.captureContext?.close() ?? Promise.resolve(),
      this.audioContext?.close() ?? Promise.resolve(),
    ])
    this.captureContext = null
    this.audioContext = null
    window.speechSynthesis?.cancel()
    this.playbackAt = 0
    this.lastAudioFeatureAt = 0
    this.set({ inputAudio: { rms: 0, peak: 0, low: 0, mid: 0, high: 0 } })
  }
}
