import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceComposerButton } from '../src/client/voice-ui.tsx'
import { DesktopVoiceController, VOICE_TICKET_PATH } from '../src/client/voice-controller.ts'

// The event test supplies the actual RC1 slot shape (top-level sessionId).
// Only the external-store hook is flattened; the button and controller run unchanged.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}))
afterEach(() => { vi.unstubAllGlobals() })

describe('voice composer click with the RC1 slot contract', () => {
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
