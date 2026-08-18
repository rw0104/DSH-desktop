import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const output = process.argv[2]
if (output === undefined) throw new Error('screenshot output path is required')
const dismissOnboarding = process.argv.includes('--dismiss-onboarding')
const toggleSidebar = process.argv.includes('--toggle-sidebar')
const toggleDetails = process.argv.includes('--toggle-details')
const openDirectoryPicker = process.argv.includes('--open-directory-picker')
const openCurrentDirectory = process.argv.includes('--open-current-directory')
const selectedDrive = process.argv.find(value => value.startsWith('--select-drive='))?.slice('--select-drive='.length)

const cdpPort = process.env.DSH_CDP_PORT ?? '9223'
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
const target = targets.find(value => value.type === 'page')
if (target?.webSocketDebuggerUrl === undefined) throw new Error('Electron page target not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  const resolve = pending.get(message.id)
  if (resolve === undefined) return
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
      const button = [...document.querySelectorAll('button')].find(node => labels.some(label => [node.textContent, node.getAttribute('aria-label'), node.title].includes(label)) && node.getBoundingClientRect().width > 0)
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
    buttonLabels: [...document.querySelectorAll('button')].slice(0, 40).map(node => ({
      text: (node.textContent ?? '').trim(),
      aria: node.getAttribute('aria-label'),
      title: node.title || null,
    })),
  })`,
  returnByValue: true,
})
const screenshot = await command('Page.captureScreenshot', { format: 'png' })
if (inspection.result?.result?.value === undefined || screenshot.result?.data === undefined) {
  throw new Error('Electron CDP inspection did not return page data')
}
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, Buffer.from(screenshot.result.data, 'base64'))
process.stdout.write(`${inspection.result.result.value}\n`)
socket.close()
