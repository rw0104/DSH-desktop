import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const output = process.argv[2]
if (output === undefined) throw new Error('screenshot output path is required')
const dismissOnboarding = process.argv.includes('--dismiss-onboarding')
const toggleSidebar = process.argv.includes('--toggle-sidebar')
const toggleDetails = process.argv.includes('--toggle-details')
const openDirectoryPicker = process.argv.includes('--open-directory-picker')
const openCurrentDirectory = process.argv.includes('--open-current-directory')
const openBetterSidebar = process.argv.includes('--open-better-sidebar')
const openBetterBrowser = process.argv.includes('--open-better-browser')
const unlockBetterBrowser = process.argv.includes('--unlock-better-browser')
const browserUrl = process.argv.find(value => value.startsWith('--browser-url='))?.slice('--browser-url='.length)
const selectedDrive = process.argv.find(value => value.startsWith('--select-drive='))?.slice('--select-drive='.length)

const cdpPort = process.env.DSH_CDP_PORT ?? '9223'
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
const target = targets.find(value => value.type === 'page')
if (target?.webSocketDebuggerUrl === undefined) throw new Error('Electron page target not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()
const events = []
const requestUrls = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  const resolve = pending.get(message.id)
  if (resolve === undefined) {
    if (message.method === 'Network.requestWillBeSent') {
      requestUrls.set(message.params.requestId, message.params.request.url)
      if (message.params.type === 'Document') events.push(message)
    } else if (
      ['Log.entryAdded', 'Runtime.consoleAPICalled', 'Network.loadingFailed'].includes(message.method)
      || (message.method === 'Network.responseReceived' && message.params.type === 'Document')
    ) {
      events.push(message)
    }
    return
  }
  pending.delete(message.id)
  resolve(message)
})
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

function command(method, params = {}) {
  return new Promise(resolve => {
    const id = nextId++
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function clickVisibleButton(labels) {
  const probe = await command('Runtime.evaluate', {
    expression: `JSON.stringify((() => {
      const labels = ${JSON.stringify(labels)}
      const button = [...document.querySelectorAll('button, [role="menuitem"]')].find(node => labels.some(label => [node.textContent?.trim(), node.getAttribute('aria-label'), node.title].includes(label)) && node.getBoundingClientRect().width > 0)
      if (button === undefined) return null
      const rect = button.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })())`,
    returnByValue: true,
  })
  const value = probe.result?.result?.value
  if (typeof value !== 'string') return false
  const point = JSON.parse(value)
  if (point === null) return false
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  return true
}

await command('Page.enable')
await command('Runtime.enable')
await command('Log.enable')
await command('Network.enable')
if (dismissOnboarding) {
  await command('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent?.includes('继续'))
      button?.click()
    })()`,
  })
  await new Promise(resolve => setTimeout(resolve, 1000))
}
if (openDirectoryPicker || openCurrentDirectory) {
  await clickVisibleButton(['新建会话', 'New session'])
  await new Promise(resolve => setTimeout(resolve, 1000))
  await clickVisibleButton(['选择工作区', 'Select workspace'])
  await new Promise(resolve => setTimeout(resolve, 500))
  await clickVisibleButton(['添加工作区...', '添加工作区…', 'Add workspace...'])
  await new Promise(resolve => setTimeout(resolve, 1500))
}
if (openCurrentDirectory) {
  await command('Runtime.evaluate', {
    expression: `([...document.querySelectorAll('[role="dialog"] button')].find(node => /^(打开|Open)$/.test((node.textContent ?? '').trim())))?.click()`,
  })
  await new Promise(resolve => setTimeout(resolve, 2500))
}
if (selectedDrive !== undefined) {
  await command('Runtime.evaluate', {
    expression: `(() => {
      const picker = document.querySelector('[data-dsh-desktop-drive-picker]')
      if (!(picker instanceof HTMLSelectElement)) return
      picker.value = ${JSON.stringify(selectedDrive.toUpperCase())}
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })()`,
  })
  await new Promise(resolve => setTimeout(resolve, 2000))
}
for (const label of [toggleSidebar ? 'Sidebar' : null, toggleDetails ? 'Details' : null]) {
  if (label === null) continue
  await command('Runtime.evaluate', {
    expression: `(() => {
      const direct = document.querySelector('[data-control="${label.toLowerCase()}"]')
      if (direct instanceof HTMLElement) { direct.click(); return }
      const labels = ${JSON.stringify(label === 'Sidebar' ? ['Sidebar', '侧栏'] : ['Details', '详情'])}
      [...document.querySelectorAll('.dshDesktopControlButton')].find(node => labels.includes(node.textContent ?? ''))?.click()
    })()`,
  })
  await new Promise(resolve => setTimeout(resolve, 500))
}
if (openBetterSidebar || openBetterBrowser) {
  await clickVisibleButton(['展开侧边栏', 'Expand sidebar'])
  await new Promise(resolve => setTimeout(resolve, 750))
}
if (openBetterBrowser) {
  await clickVisibleButton(['新建标签页', 'New tab'])
  await new Promise(resolve => setTimeout(resolve, 400))
  await command('Runtime.evaluate', {
    expression: `(() => {
      const labels = ['浏览器', 'Browser']
      const item = [...document.querySelectorAll('[role="menuitem"]')]
        .find(node => labels.includes((node.textContent ?? '').trim()))
      if (!(item instanceof HTMLElement)) return false
      item.click()
      return true
    })()`,
  })
  await new Promise(resolve => setTimeout(resolve, 600))
}
if (browserUrl !== undefined) {
  await command('Runtime.evaluate', {
    expression: `(() => {
      const input = [...document.querySelectorAll('input')].find(node => node.className.includes('browserInput'))
      if (!(input instanceof HTMLInputElement)) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, ${JSON.stringify(browserUrl)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
      return true
    })()`,
  })
  await new Promise(resolve => setTimeout(resolve, 3500))
}
if (unlockBetterBrowser) {
  await clickVisibleButton(['临时解锁（不安全）', 'Unlock temporarily (unsafe)'])
  await new Promise(resolve => setTimeout(resolve, 3500))
}

const inspection = await command('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    url: location.href,
    controlStrip: document.querySelector('.dshDesktopControlStrip')?.innerText ?? null,
    buttons: [...document.querySelectorAll('.dshDesktopControlButton')].map(button => ({
      text: button.textContent,
      pressed: button.getAttribute('aria-pressed'),
    })),
    bootEntries: Array.isArray(window.__DSH_BOOT__?.entries) ? window.__DSH_BOOT__.entries.length : null,
    drivePicker: document.querySelector('[data-dsh-desktop-drive-picker]')?.getAttribute('aria-label') ?? null,
    driveOptions: [...document.querySelectorAll('[data-dsh-desktop-drive-picker] option')].map(option => option.textContent),
    pathInputs: [...document.querySelectorAll('[role="dialog"] input')].map(input => ({
      aria: input.getAttribute('aria-label'),
      value: input.value,
    })),
    errors: [...document.querySelectorAll('[role="dialog"] [role="alert"], [role="dialog"] [data-error]')]
      .map(node => (node.textContent ?? '').trim())
      .filter(Boolean),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => (dialog.textContent ?? '').trim().slice(0, 120)),
    betterSidebarHost: document.querySelector('[data-dsh-better-sidebar]') !== null,
    betterSidebarPanel: document.querySelector('[data-dsh-better-sidebar] [class*="panel"]') !== null,
    titleBarCompat: document.body.hasAttribute('data-dsh-title-bar-compat'),
    titleBarStrip: getComputedStyle(document.body).getPropertyValue('--dsh-title-bar-strip').trim(),
    betterSidebarToggles: [...document.querySelectorAll('button')]
      .filter(node => /(?:底部面板|侧边栏|bottom panel|sidebar)/iu.test(node.getAttribute('aria-label') ?? ''))
      .map(node => {
        const rect = node.getBoundingClientRect()
        return {
          aria: node.getAttribute('aria-label'),
          top: rect.top,
          bottom: rect.bottom,
          centerY: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        }
      }),
    browserInputs: [...document.querySelectorAll('input')]
      .filter(node => node.className.includes('browserInput'))
      .map(node => ({ value: node.value, placeholder: node.placeholder })),
    browserFrames: [...document.querySelectorAll('iframe')]
      .filter(node => node.className.includes('browserFrame'))
      .map(node => ({ src: node.src, sandbox: node.getAttribute('sandbox'), title: node.title })),
    browserMessages: [...document.querySelectorAll('[class*="browserMessage"], [class*="browserBlocked"]')]
      .map(node => (node.textContent ?? '').trim())
      .filter(Boolean),
    menuItems: [...document.querySelectorAll('[role="menuitem"]')]
      .map(node => (node.textContent ?? '').trim())
      .filter(Boolean),
    buttonLabels: [...document.querySelectorAll('button')].slice(0, 40).map(node => ({
      text: (node.textContent ?? '').trim(),
      aria: node.getAttribute('aria-label'),
      title: node.title || null,
    })),
  })`,
  returnByValue: true,
})
const frameTree = await command('Page.getFrameTree')
const flattenFrames = (node, depth = 0) => [
  {
    depth,
    id: node.frame.id,
    parentId: node.frame.parentId ?? null,
    url: node.frame.url,
    mimeType: node.frame.mimeType,
    unreachableUrl: node.frame.unreachableUrl ?? null,
  },
  ...(node.childFrames ?? []).flatMap(child => flattenFrames(child, depth + 1)),
]
const eventSummary = events.map(event => ({
  method: event.method,
  text: event.params?.entry?.text
    ?? event.params?.args?.map(arg => arg.value ?? arg.description).join(' ')
    ?? event.params?.errorText
    ?? null,
  url: event.params?.entry?.url
    ?? event.params?.request?.url
    ?? event.params?.response?.url
    ?? requestUrls.get(event.params?.requestId)
    ?? null,
  status: event.params?.response?.status ?? null,
  type: event.params?.type ?? null,
})).filter(event => event.text !== null || event.url !== null)
const screenshot = await command('Page.captureScreenshot', { format: 'png' })
if (inspection.result?.result?.value === undefined || screenshot.result?.data === undefined) {
  throw new Error('Electron CDP inspection did not return page data')
}
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, Buffer.from(screenshot.result.data, 'base64'))
const inspectionValue = JSON.parse(inspection.result.result.value)
inspectionValue.cdpEvents = eventSummary
inspectionValue.frameTree = frameTree.result?.frameTree === undefined
  ? []
  : flattenFrames(frameTree.result.frameTree)
process.stdout.write(`${JSON.stringify(inspectionValue)}\n`)
socket.close()
