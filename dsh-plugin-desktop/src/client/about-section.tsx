import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { RELEASES_URL } from './release-metadata.ts'

/** Namespace for the desktop-owned About section copy. */
export const DESKTOP_ABOUT_LOCALE = 'dsh-desktop-about'

/** Props supplied by the settings section slot and desktop locale face. */
export type DesktopAboutSectionProps = PropsRuntime<'settings.section'> & {
  about: { t: (key: string) => string }
}

/** Render a compact product identity and manual update handoff. */
export function DesktopAboutSection({ about }: DesktopAboutSectionProps) {
  const { t } = about
  const version = new URLSearchParams(window.location.search).get('dsh-desktop-version') ?? 'unknown'
  const releaseUrl = version === 'unknown' ? RELEASES_URL : `${RELEASES_URL}/tag/v${version}`
  const openExternal = (event: React.MouseEvent<HTMLAnchorElement>): void => {
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
          <span className="dshDesktopAboutValue"><code>v{version}</code></span>
        </div>
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('updateMethod')}</span>
          <span className="dshDesktopAboutValue">{t('manualInstall')}</span>
        </div>
        <div className="dshDesktopAboutRow">
          <span className="dshDesktopAboutLabel">{t('repository')}</span>
          <a className="dshDesktopAboutLink dshDesktopAboutValue" href="https://github.com/rw0104/DSH-desktop" target="_blank" rel="noreferrer" onClick={openExternal}>
            github.com/rw0104/DSH-desktop
          </a>
        </div>
      </div>
      <div className="dshDesktopAboutActions">
        <a className="dshDesktopAboutAction" href={releaseUrl} target="_blank" rel="noreferrer" onClick={openExternal}>
          {t('viewRelease')}
        </a>
      </div>
    </section>
  )
}
