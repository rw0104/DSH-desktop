import { describe, expect, it } from 'vitest'
import {
  classifyEmbeddedBrowserUrl,
  sanitizeEmbeddedBrowserPreferences,
} from '../src/embedded-browser-policy.ts'

describe('embedded browser security policy', () => {
  it('allows public web navigation and keeps mail external', () => {
    expect(classifyEmbeddedBrowserUrl('https://example.com/path')).toBe('webview')
    expect(classifyEmbeddedBrowserUrl('http://example.com/path')).toBe('webview')
    expect(classifyEmbeddedBrowserUrl('mailto:test@example.com')).toBe('external')
  })

  it('blocks local, privileged, and malformed targets', () => {
    for (const url of [
      'http://127.0.0.1:43120/',
      'http://localhost/',
      'http://sub.localhost/',
      'http://[::1]/',
      'file:///C:/Windows/System32/',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(classifyEmbeddedBrowserUrl(url)).toBe('blocked')
    }
  })

  it('removes guest privilege inputs and forces isolation', () => {
    const preferences: Record<string, unknown> = {
      preload: 'C:/unsafe.js',
      preloadURL: 'file:///C:/unsafe.js',
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    }
    sanitizeEmbeddedBrowserPreferences(preferences)
    expect(preferences).toEqual({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    })
  })
})
