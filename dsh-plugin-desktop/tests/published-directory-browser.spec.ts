// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installDesktopDirectoryPickerBridge } from '../src/client/directory-picker.ts'
import { DESKTOP_DIRECTORY_VALIDATOR_PATH } from '../src/directory-picker-contract.ts'
import { loadPublishedClient } from './fixtures/published-client.tsx'

let root: Root
let container: HTMLDivElement
let releaseClient: (() => void) | undefined
let releaseBridge: (() => void) | undefined
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  releaseClient?.(); releaseClient = undefined
  releaseBridge?.(); releaseBridge = undefined
  container.remove(); vi.unstubAllGlobals()
})
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
async function mountFlow(request?: typeof fetch) {
  if (request) releaseBridge = installDesktopDirectoryPickerBridge(undefined, request)
  const client = loadPublishedClient('@deepseek-ai/dsh-client-ui-directory-picker-browse', {
    uiWorkspace: { listDirectory: async () => ({ path: 'C:\\', home: 'C:\\', crumbs: [{ path: 'C:\\', name: 'C:' }], entries: [], truncated: false }), createDirectory: vi.fn() },
  })
  releaseClient = client.dispose
  const flow = client.registrations.find(value => value.options.name === 'sidebar.workspaces.directoryFlow')!
  const picked = vi.fn()
  const props = { ...flow.options.inject?.(), busy: false, onPicked: picked, onCancel: vi.fn(), onError: vi.fn() }
  const render = async (open: boolean) => { await act(async () => root.render(createElement(flow.component, { ...props, open }))) }
  await render(true)
  return {
    picked, render,
    native: () => container.querySelector<HTMLButtonElement>('button[aria-label="browser.nativePicker"]'),
    confirm: () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'browser.open')!,
  }
}

describe('published directory flow reaches Desktop admission', () => {
  it.each([true, false])('validates a native selection before admitting it: %s', async allowed => {
    const request = vi.fn<typeof fetch>().mockImplementation(async url => json(
      String(url) === DESKTOP_DIRECTORY_VALIDATOR_PATH ? { allowed } : { path: 'C:\\chosen' }))
    const flow = await mountFlow(request)
    expect(flow.native(), 'the registered flow must expose the actual native bridge').not.toBeNull()
    await act(async () => flow.native()!.click())
    expect(request).toHaveBeenCalledTimes(2)
    expect(flow.picked).toHaveBeenCalledTimes(allowed ? 1 : 0)
    if (allowed) expect(flow.picked).toHaveBeenCalledWith('C:\\chosen')
  })
  it('validates the normal browse confirmation as well as native selection', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({ allowed: false }))
    const flow = await mountFlow(request)
    await act(async () => flow.confirm().click())
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0]?.[0]).toBe(DESKTOP_DIRECTORY_VALIDATOR_PATH)
    expect(flow.picked).not.toHaveBeenCalled()
  })
  it('does not validate or admit a cancelled native selection', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({ path: null }))
    const flow = await mountFlow(request)
    await act(async () => flow.native()!.click())
    expect(request).toHaveBeenCalledOnce()
    expect(flow.picked).not.toHaveBeenCalled()
    expect(flow.native()!.disabled).toBe(false)
  })
  it('coalesces clicks and ignores a picker result from a closed generation', async () => {
    const pending = deferred<Response>()
    const request = vi.fn<typeof fetch>().mockReturnValue(pending.promise)
    const flow = await mountFlow(request)
    await act(async () => { flow.native()!.click(); flow.native()!.click() })
    expect(request).toHaveBeenCalledOnce()
    expect(flow.native()!.disabled).toBe(true)
    await flow.render(false)
    await act(async () => pending.resolve(json({ path: 'C:\\stale' })))
    expect(request).toHaveBeenCalledOnce()
    expect(flow.picked).not.toHaveBeenCalled()
    await flow.render(true)
    expect(flow.native()!.disabled).toBe(false)
  })
  it('ignores validation approval after the owner closes the dialog', async () => {
    const validation = deferred<Response>()
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ path: 'C:\\chosen' })).mockReturnValueOnce(validation.promise)
    const flow = await mountFlow(request)
    await act(async () => flow.native()!.click())
    expect(request).toHaveBeenCalledTimes(2)
    await flow.render(false)
    await act(async () => validation.resolve(json({ allowed: true })))
    expect(flow.picked).not.toHaveBeenCalled()
    await flow.render(true)
    expect(flow.native()!.disabled).toBe(false)
  })
  it('shows an error and permits retry after a native picker failure', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValueOnce(json({ path: null }))
    const flow = await mountFlow(request)
    await act(async () => flow.native()!.click())
    expect(flow.picked).not.toHaveBeenCalled()
    expect(container.textContent).toContain('could not open the system folder picker')
    expect(flow.native()!.disabled).toBe(false)
    await act(async () => flow.native()!.click())
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('keeps the plain upstream browse flow functional without a Desktop bridge', async () => {
    const flow = await mountFlow()
    expect(flow.native()).toBeNull()
    await act(async () => flow.confirm().click())
    expect(flow.picked).toHaveBeenCalledWith('C:\\')
  })
})
