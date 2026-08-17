import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const output = process.argv[2]
if (output === undefined) throw new Error('screenshot output path is required')
const dismissOnboarding = process.argv.includes('--dismiss-onboarding')
const toggleSidebar = process.argv.includes('--toggle-sidebar')
const toggleDetails = process.argv.includes('--toggle-details')

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json()
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
for (const label of [toggleSidebar ? 'Sidebar' : null, toggleDetails ? 'Details' : null]) {
  if (label === null) continue
  await command('Runtime.evaluate', {
    expression: `([...document.querySelectorAll('.dshDesktopControlButton')].find(node => node.textContent === ${JSON.stringify(label)}))?.click()`,
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
