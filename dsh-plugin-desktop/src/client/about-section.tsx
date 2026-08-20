import type { MouseEvent } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { RELEASES_URL, REPOSITORY_URL } from './release-metadata.ts'

/** Namespace for the desktop-owned About section copy. */
export const DESKTOP_ABOUT_LOCALE = 'dsh-desktop-about'

export type DesktopAboutSectionProps = PropsRuntime<'settings.section'> & {
  about: { t: (key: string) => string }
  productVersion: string
}

/** Render product identity, update behavior, repository, and release notes. */
export function DesktopAboutSection({ about, productVersion }: DesktopAboutSectionProps) {
  const { t } = about
  const releaseUrl = productVersion === 'unknown' ? RELEASES_URL : `${RELEASES_URL}/tag/v${productVersion}`
  const openExternal = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault()
    window.open(event.currentTarget.href, '_blank', 'noopener,noreferrer')
  }
  return (
    <section className="dshDesktopAbout" aria-labelledby="dsh-desktop-about-title">
      <div className="dshDesktopAboutIntro">
        <h2 id="dsh-desktop-about-title" className="dshDesktopAboutTitle">{t('title')}</h2>
        <p className="dshDesktopAboutSubtitle">{t('subtitle')}</p>
      </div>
      <div className="dshDesktopAboutRows">
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('version')}</span>
          <span className="dshDesktopAboutValue"><code>v{productVersion}</code></span>
        </div>
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('updateMethod')}</span>
          <span className="dshDesktopAboutValue">{t('confirmedInstall')}</span>
        </div>
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('repository')}</span>
          <a className="dshDesktopAboutLink dshDesktopAboutValue" href={REPOSITORY_URL} target="_blank" rel="noreferrer" onClick={openExternal}>github.com/rw0104/DSH-desktop</a>
        </div>
      </div>
      <div className="dshDesktopAboutActions">
        <a className="dshDesktopAboutAction" href={releaseUrl} target="_blank" rel="noreferrer" onClick={openExternal}>{t('viewRelease')}</a>
      </div>
    </section>
  )
}
