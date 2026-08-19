import { isIP } from 'node:net'

export type EmbeddedBrowserDisposition = 'webview' | 'external' | 'blocked'

function isLoopbackHostname(raw: string): boolean {
  const hostname = raw.replace(/^\[|\]$/gu, '').toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1') return true
  if (isIP(hostname) === 4) {
    const first = Number(hostname.split('.')[0])
    return first === 127 || hostname === '0.0.0.0'
  }
  return false
}

/** Classify a guest target before Electron creates or navigates a webview. */
export function classifyEmbeddedBrowserUrl(raw: string): EmbeddedBrowserDisposition {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'blocked'
  }
  if (url.protocol === 'mailto:') return 'external'
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'blocked'
  return isLoopbackHostname(url.hostname) ? 'blocked' : 'webview'
}

/** Strip renderer-provided privilege inputs and force an isolated guest. */
export function sanitizeEmbeddedBrowserPreferences(preferences: Record<string, unknown>): void {
  delete preferences.preload
  delete preferences.preloadURL
  preferences.nodeIntegration = false
  preferences.contextIsolation = true
  preferences.sandbox = true
  preferences.webSecurity = true
  preferences.allowRunningInsecureContent = false
}
