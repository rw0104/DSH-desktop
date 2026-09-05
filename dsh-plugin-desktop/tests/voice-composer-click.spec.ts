import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceComposerButton } from '../src/client/voice-ui.tsx'
import { DesktopVoiceController, VOICE_TICKET_PATH, analyzePcm16 } from '../src/client/voice-controller.ts'

// The event test supplies the actual RC1 slot shape (top-level sessionId).
// Only the external-store hook is flattened; the button and controller run unchanged.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('voice composer click with the RC1 slot contract', () => {
  it('drives output features at the scheduled 24kHz playback time and cancels pending meters', async () => {
    vi.useFakeTimers()
    const rate = vi.fn()
    class AudioFixture {
      currentTime = 0
      state = 'running'
      destination = {}
      createBuffer(_channels: number, size: number, sampleRate: number) {
        rate(sampleRate)
        return { duration: size / sampleRate, getChannelData: () => new Float32Array(size) }
      }
      createBufferSource() { return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null, buffer: null } }
      close() { return Promise.resolve() }
    }
    vi.stubGlobal('AudioContext', AudioFixture)
    const voice = new DesktopVoiceController({
      settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: vi.fn() }) },
      remote: { credentials: { describe: vi.fn().mockResolvedValue({ ok: true, value: {} }) } },
    } as never, { openTab: vi.fn() })
    const play = voice as unknown as { playPcmBytes(samples: Int16Array): void }
    const samples = Int16Array.from({ length: 24000 }, (_, i) => Math.round(Math.sin(i * 2 * Math.PI * 3200 / 24000) * 12000))
    play.playPcmBytes(new Int16Array(24000))
    play.playPcmBytes(samples)
    await vi.advanceTimersByTimeAsync(1)
    expect(voice.audio.output.rms).toBe(0)
    await vi.advanceTimersByTimeAsync(999)
    expect(voice.audio.output).toEqual(analyzePcm16(samples, 24000))
    expect(rate).toHaveBeenCalledWith(24000)
    play.playPcmBytes(samples)
    await voice.closePanel()
    await vi.advanceTimersByTimeAsync(3000)
    expect(voice.audio.output.rms).toBe(0)
  })

  it('minimizes for Agent work without ending the voice session and restores the same panel', async () => {
    const voice = new DesktopVoiceController({
      settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: vi.fn() }) },
      remote: { credentials: { describe: vi.fn().mockResolvedValue({ ok: true, value: {} }) } },
    } as never, { openTab: vi.fn() }, 'overlay')
    const socket = { send: vi.fn(), close: vi.fn() }
    const internal = voice as unknown as { socket: unknown; handleSocketMessage(socket: unknown, event: unknown): Promise<void> }
    internal.socket = socket
    voice.open('work-session')
    await internal.handleSocketMessage(socket, { data: JSON.stringify({ type: 'agent.request.accepted', callId: 'task-1' }) })
    expect(voice.minimized.getSnapshot()).toBe(true)
    expect(voice.task.getSnapshot().status).toBe('running')
    expect(socket.close).not.toHaveBeenCalled()
    expect(voice.panel.getSnapshot()).toBe('work-session')
    voice.restorePanel()
    expect(voice.minimized.getSnapshot()).toBe(false)
    await internal.handleSocketMessage(socket, { data: JSON.stringify({ type: 'agent.task.finished', status: 'completed' }) })
    expect(voice.task.getSnapshot().status).toBe('completed')
  })

  it('uses a browser-permitted close code when a voice connection fails', () => {
    const voice = new DesktopVoiceController({
      settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: vi.fn() }) },
      remote: { credentials: { describe: vi.fn().mockResolvedValue({ ok: true, value: {} }) } },
    } as never, { openTab: vi.fn() })
    vi.stubGlobal('WebSocket', { CLOSING: 2 })
    const close = vi.fn((code: number) => {
      if (code !== 1000 && (code < 3000 || code > 4999)) throw new Error('Invalid browser close code')
    })
    const internals = voice as unknown as { socket: unknown; fail(message: string): void }
    internals.socket = { readyState: 1, close }
    expect(() => internals.fail('connection failed')).not.toThrow()
    expect(close).toHaveBeenCalledWith(4001, 'voice_error')
    expect(voice.getSnapshot().error).toBe('connection failed')
  })

  it('does not open a microphone after the user closes a pending voice dialog', async () => {
    let answer: ((response: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { answer = resolve })))
    const getUserMedia = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const voice = new DesktopVoiceController({
      settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: vi.fn() }) },
      remote: { credentials: { describe: vi.fn().mockResolvedValue({ ok: true, value: {} }) } },
    } as never, { openTab: vi.fn() }, 'overlay')
    voice.store.set({ ...voice.getSnapshot(), settings: { ...voice.getSnapshot().settings, enabled: true } })
    const starting = voice.start('session')
    await voice.closePanel()
    answer!(new Response(JSON.stringify({ ticket: 'fixture', wsPath: '/fixture', sessionId: 'voice-1' })))
    await starting
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(voice.getSnapshot().status).toBe('ended')
  })

  it('opens a compatibility overlay and clears it on close without requiring sidebar presentation', async () => {
    const openTab = vi.fn()
    const voice = new DesktopVoiceController({
      settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: vi.fn() }) },
      remote: { credentials: { describe: vi.fn().mockResolvedValue({ ok: true, value: {} }) } },
    } as never, { openTab }, 'overlay')
    voice.open('compatibility-session')
    expect(voice.panel.getSnapshot()).toBe('compatibility-session')
    expect(openTab).not.toHaveBeenCalled()
    await voice.closePanel()
    expect(voice.panel.getSnapshot()).toBeNull()
    expect(voice.getSnapshot().status).toBe('ended')
  })

  it('opens voice and requests a ticket for the current session instead of reading removed props.session', async () => {
    const openTab = vi.fn()
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'fixture ticket refusal' }), { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const voice = new DesktopVoiceController({
      settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: vi.fn() }) },
      remote: { credentials: { describe: vi.fn().mockResolvedValue({ ok: true, value: { DASHSCOPE_API_KEY: { configured: true } } }) } },
    } as never, { openTab })
    voice.store.set({ ...voice.getSnapshot(), settings: { ...voice.getSnapshot().settings, enabled: true } })
    await voice.refreshCredentials()
    const button = VoiceComposerButton({ sessionId: 'rc1-session' as never, controller: voice, t: key => key })
    expect(button).not.toBeNull()
    expect(() => button!.props.onClick()).not.toThrow()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(VOICE_TICKET_PATH, expect.objectContaining({ body: JSON.stringify({ sessionId: 'rc1-session' }) })))
    expect(openTab).toHaveBeenCalledWith(expect.objectContaining({ type: 'desktop:voice' }), { sessionId: 'rc1-session' })
    await vi.waitFor(() => expect(voice.getSnapshot().error).toBe('fixture ticket refusal'))
  })
})
