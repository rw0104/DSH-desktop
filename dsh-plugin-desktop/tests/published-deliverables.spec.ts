// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPublishedClient } from './fixtures/published-client.tsx'

let root: Root
let container: HTMLDivElement
let release: (() => void) | undefined
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState({}, '', '/?dsh-desktop-experience=desktop')
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  release?.(); release = undefined
  container.remove(); window.history.replaceState({}, '', '/'); vi.unstubAllGlobals()
})
async function mount() {
  const client = loadPublishedClient('@deepseek-ai/dsh-client-ui-deliverables', { uiConversation: { events: { register: vi.fn() } } })
  release = client.dispose
  const entry = client.registrations.find(value => value.options.name === 'conversation.chat.turnTail')!
  const openFile = vi.fn()
  await act(async () => root.render(createElement(entry.component, {
    ...entry.options.inject?.(), matched: { produced: ['notes.txt'], presented: [{ path: 'report.pdf', seq: 1, index: 0 }] },
    sessionId: 'fixture-session', openFile, t: (key: string) => key,
    useSessions: () => 'C:\\fixture', usePresentedOpen: () => ({}), usePresentedHost: () => ({ available: true }),
  })))
  return openFile
}
describe('published deliverables preserve upstream cards and authorized Desktop copy', () => {
  it.each(['absolute-path', 'text-content'] as const)('copies %s through the existing authorized route', async kind => {
    const request = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', request)
    const openFile = await mount()
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="produced.copyActions"]')
    expect(trigger, 'the real turn-tail component must expose copy, not just its package strings').not.toBeNull()
    await act(async () => trigger!.click())
    const label = kind === 'absolute-path' ? 'produced.copyAbsolutePath' : 'produced.copyTextContent'
    const action = [...container.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find(button => button.textContent === label)!
    await act(async () => action.click())
    expect(request).toHaveBeenCalledWith('/dsh-desktop/api/deliverables/copy', expect.objectContaining({
      method: 'POST', headers: { 'content-type': 'application/json', 'x-dsh-desktop-action': 'copy-deliverable' },
      body: JSON.stringify({ sessionId: 'fixture-session', path: 'notes.txt', kind }),
    }))
    expect(container.querySelector('[role="status"]')?.textContent).toBe(kind === 'absolute-path' ? 'produced.copyPathSuccess' : 'produced.copyContentSuccess')
    expect(container.querySelector('button button')).toBeNull()
    expect(container.querySelector('[data-presented-file]')).not.toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="produced.open"]')!.click())
    expect(openFile).toHaveBeenCalledWith('notes.txt')
  })
  it.each(['upstream-diagnostic', ''])('does not add Desktop copy controls outside the normal experience: %s', async experience => {
    window.history.replaceState({}, '', `/?dsh-desktop-experience=${experience}`)
    await mount()
    expect(container.querySelector('button[aria-label="produced.copyActions"]')).toBeNull()
    expect(container.querySelector('button[aria-label="produced.open"]')).not.toBeNull()
    expect(container.querySelector('[data-presented-file]')).not.toBeNull()
  })
})
