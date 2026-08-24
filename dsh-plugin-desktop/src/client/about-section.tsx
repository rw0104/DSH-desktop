import { useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopExternalNavigationAction } from '../external-navigation-contract.ts'

/** Namespace for the desktop-owned About section copy. */
export const DESKTOP_ABOUT_LOCALE = 'dsh-desktop-about'

export type DesktopAboutSectionProps = PropsRuntime<'settings.section'> & {
  about: { t: (key: string) => string }
  productVersion: string
  checkForUpdates: () => Promise<void>
  openExternal: (action: DesktopExternalNavigationAction) => Promise<void>
}

/** Render product identity, update behavior, repository, and release notes. */
export function DesktopAboutSection({ about, productVersion, checkForUpdates, openExternal }: DesktopAboutSectionProps) {
  const { t } = about
  const [checking, setChecking] = useState(false)
  const runExternal = (action: DesktopExternalNavigationAction): void => {
    void openExternal(action).catch(() => {})
  }
  const runCheck = (): void => {
    if (checking) return
    setChecking(true)
    void checkForUpdates().finally(() => { setChecking(false) })
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
          <button className="dshDesktopAboutLink dshDesktopAboutValue" type="button" data-external-action="repository" onClick={() => { runExternal('repository') }}>github.com/rw0104/DSH-desktop</button>
        </div>
      </div>
      <div className="dshDesktopAboutActions">
        <button className="dshDesktopAboutAction" type="button" disabled={checking} onClick={runCheck}>
          {checking ? t('checkingUpdates') : t('checkUpdates')}
        </button>
        <button className="dshDesktopAboutAction" type="button" data-external-action="release-notes" onClick={() => { runExternal('release-notes') }}>{t('viewRelease')}</button>
      </div>
    </section>
  )
}
