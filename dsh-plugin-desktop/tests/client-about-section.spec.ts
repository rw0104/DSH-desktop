import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DesktopAboutSection, DesktopUpdateStatus } from '../src/client/about-section.tsx'
import { DESKTOP_ABOUT_LOCALE_DICTIONARY } from '../src/client/release-metadata.ts'
import type { DesktopUpdateUiState } from '../src/update-ui-state.ts'

const t = (key: string): string => (DESKTOP_ABOUT_LOCALE_DICTIONARY.en as Record<string, string>)[key] ?? key

describe('desktop About section', () => {
  it('renders product links as fixed bridge actions instead of browser anchors', () => {
    const html = renderToStaticMarkup(createElement(DesktopAboutSection, {
      about: { t: (key: string) => key },
      productVersion: '2.0.12',
      checkForUpdates: async () => {},
      readUpdateState: async () => ({ generation: 1, revision: 0, phase: 'idle' }),
      subscribeUpdateState: () => () => {},
      openExternal: async () => {},
    } as unknown as ComponentProps<typeof DesktopAboutSection>))

    expect(html).not.toContain('<a')
    expect(html).toContain('data-external-action="repository"')
    expect(html).toContain('data-external-action="release-notes"')
  })

  it('renders real byte progress accessibly and never reports 100% before verification', () => {
    const state: DesktopUpdateUiState = {
      generation: 2,
      revision: 8,
      phase: 'downloading',
      version: '2.0.12',
      receivedBytes: 116 * 1024 * 1024,
      totalBytes: 276 * 1024 * 1024,
    }
    const html = renderToStaticMarkup(createElement(DesktopUpdateStatus, { state, t }))

    expect(html).toContain('data-update-phase="downloading"')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="42"')
    expect(html).toContain('Downloading 42% · 116 MB / 276 MB')

    const completeStream = renderToStaticMarkup(createElement(DesktopUpdateStatus, {
      state: { ...state, revision: 9, receivedBytes: state.totalBytes! },
      t,
    }))
    expect(completeStream).toContain('aria-valuenow="99"')
    expect(completeStream).not.toContain('Downloading 100%')
  })

  it('uses indeterminate checking/verifying states and a verified ready message', () => {
    for (const state of [
      { generation: 3, revision: 1, phase: 'checking' },
      { generation: 3, revision: 2, phase: 'verifying', version: '2.0.12', totalBytes: 100 },
    ] satisfies DesktopUpdateUiState[]) {
      const html = renderToStaticMarkup(createElement(DesktopUpdateStatus, { state, t }))
      expect(html).toContain('data-indeterminate="true"')
      expect(html).not.toContain('aria-valuenow=')
    }
    const ready = renderToStaticMarkup(createElement(DesktopUpdateStatus, {
      state: { generation: 3, revision: 3, phase: 'ready-to-install', version: '2.0.12' },
      t,
    }))
    expect(ready).toContain('verified and awaiting install confirmation')
    expect(ready).not.toContain('role="progressbar"')
  })

  it('keeps idle height-free and exposes failures as alerts without raw details', () => {
    expect(renderToStaticMarkup(createElement(DesktopUpdateStatus, {
      state: { generation: 4, revision: 0, phase: 'idle' },
      t,
    }))).toBe('')
    const failed = renderToStaticMarkup(createElement(DesktopUpdateStatus, {
      state: { generation: 4, revision: 1, phase: 'failed', code: 'integrity-mismatch' },
      t,
    }))
    expect(failed).toContain('role="alert"')
    expect(failed).not.toContain('integrity-mismatch')
    expect(failed).not.toContain('C:\\')
  })
})
