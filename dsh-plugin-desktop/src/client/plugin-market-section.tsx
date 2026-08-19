import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export const DESKTOP_PLUGIN_MARKET_LOCALE = 'dsh-desktop-plugin-market'

interface MarketEntry {
  id: string
  name: string
  repository: string
  description: string
  installed: boolean
  removable: boolean
}

interface MarketSnapshot {
  profile: string
  entries: MarketEntry[]
}

export type DesktopPluginMarketSectionProps = PropsRuntime<'settings.section'> & {
  market: { t: (key: string) => string }
}

/** Settings surface for the Host-owned allowlisted plugin market. */
export function DesktopPluginMarketSection({ market }: DesktopPluginMarketSectionProps) {
  const { t } = market
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    try {
      const response = await fetch('/dsh-desktop/api/plugins/market')
      if (!response.ok) throw new Error(`${response.status}`)
      setSnapshot(await response.json() as MarketSnapshot)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => { void load() }, [])

  const mutate = async (entry: MarketEntry): Promise<void> => {
    const action = entry.installed ? 'remove' : 'install'
    setBusy(entry.id)
    try {
      const response = await fetch('/dsh-desktop/api/plugins/market', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-workbench-action': 'plugins' },
        body: JSON.stringify({ action, id: entry.id }),
      })
      const body = await response.json() as { snapshot?: MarketSnapshot; message?: string }
      if (!response.ok || body.snapshot === undefined) throw new Error(body.message ?? `${response.status}`)
      setSnapshot(body.snapshot)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="dshDesktopPluginMarket" aria-labelledby="dsh-desktop-plugin-market-title">
      <div className="dshDesktopPluginMarketIntro">
        <h2 id="dsh-desktop-plugin-market-title" className="dshDesktopAboutTitle">{t('title')}</h2>
        <p className="dshDesktopAboutSubtitle">{t('subtitle')}</p>
        {snapshot !== null && <p className="dshDesktopPluginMarketProfile">{t('profile')}: <code>{snapshot.profile}</code></p>}
      </div>
      {error !== null && <div className="dshDesktopAboutError" role="alert">{t('error')}: {error}</div>}
      <div className="dshDesktopPluginMarketEntries">
        {(snapshot?.entries ?? []).map(entry => (
          <article key={entry.id} className="dshDesktopPluginMarketEntry">
            <div className="dshDesktopPluginMarketHead">
              <div>
                <h3>{entry.name}</h3>
                <p>{entry.description}</p>
              </div>
              <button
                type="button"
                className="dshDesktopAboutAction"
                disabled={busy !== null || (entry.installed && !entry.removable)}
                onClick={() => { void mutate(entry) }}
              >
                {busy === entry.id ? t('working') : entry.installed ? t('remove') : t('install')}
              </button>
            </div>
            <a href={entry.repository} target="_blank" rel="noreferrer">{entry.repository}</a>
            {entry.installed && <span className="dshDesktopPluginMarketInstalled">{t('installed')}</span>}
          </article>
        ))}
      </div>
      {busy === null && snapshot !== null && <p className="dshDesktopPluginMarketHint">{t('restart')}</p>}
    </section>
  )
}
