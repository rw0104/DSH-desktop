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
