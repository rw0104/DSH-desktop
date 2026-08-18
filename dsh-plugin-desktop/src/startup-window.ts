/** Small native feedback window shown while the first DSH generation boots. */

import { BrowserWindow } from 'electron'
import { isChineseLocale } from './vision-consent-dialog.ts'

export const STARTUP_WINDOW_WIDTH = 520
export const STARTUP_WINDOW_HEIGHT = 300

export function createStartupWindow(locale: string): BrowserWindow {
  const chinese = isChineseLocale(locale)
  const title = chinese ? '正在启动 DSH Desktop' : 'Starting DSH Desktop'
  const message = chinese ? '正在加载 DeepSeek Harness 工作区…' : 'Loading the DeepSeek Harness workbench…'
  const window = new BrowserWindow({
    width: STARTUP_WINDOW_WIDTH,
    height: STARTUP_WINDOW_HEIGHT,
    center: true,
    show: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    title,
    backgroundColor: '#15171a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><style>html,body{width:100%;height:100%;margin:0}body{display:grid;place-items:center;background:#15171a;color:#f4f5f6;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{text-align:center}strong{display:block;font-size:22px;font-weight:600;letter-spacing:.01em}span{display:block;margin-top:14px;color:#aeb4bf}</style><main><strong>DSH Desktop</strong><span>${message}</span></main>`
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {})
  return window
}

export function closeStartupWindow(window: BrowserWindow | undefined): void {
  if (window === undefined || window.isDestroyed()) return
  window.close()
}
