import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DesktopAboutSection } from '../src/client/about-section.tsx'

describe('desktop About section', () => {
  it('renders product links as fixed bridge actions instead of browser anchors', () => {
    const html = renderToStaticMarkup(createElement(DesktopAboutSection, {
      about: { t: (key: string) => key },
      productVersion: '2.0.10',
      checkForUpdates: async () => {},
      openExternal: async () => {},
    } as unknown as ComponentProps<typeof DesktopAboutSection>))

    expect(html).not.toContain('<a')
    expect(html).toContain('data-external-action="repository"')
    expect(html).toContain('data-external-action="release-notes"')
  })
})
