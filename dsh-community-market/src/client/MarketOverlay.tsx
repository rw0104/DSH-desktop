import { useEffect, useRef } from 'react'
import {
  Button,
  IconCloseOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { MarketSurface, type MarketView } from './MarketSettingsTab.js'
import type { createMarketViewStore } from './market-view-store.js'

export type MarketOverlayProps = PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createMarketViewStore>>
  & PropsLocale<'community-market'>
  & { readLocale: () => string; initialView?: MarketView }

export function MarketOverlay({ useStore, actions, readLocale, t, initialView = 'discover' }: MarketOverlayProps) {
  const open = useStore(state => state.open)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      const nestedDialogOpen = document.querySelectorAll('[role="dialog"]').length > 1
      if (event.key === 'Escape') {
        if (!nestedDialogOpen) actions.close()
        return
      }
      if (event.key !== 'Tab' || nestedDialogOpen || panel.current === null) return
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      const first = focusable[0]
      const last = focusable.at(-1)
      if (first === undefined || last === undefined) {
        event.preventDefault()
        return
      }
      if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [actions, open])

  if (!open) return null
  return (
    <div className="dshMarketOverlay" role="dialog" aria-modal="true" aria-label={t('title')}>
      <button className="dshMarketOverlayMask" type="button" aria-label={t('closeMarket')} onClick={() => actions.close()} />
      <section ref={panel} className="dshMarketOverlayPanel">
        <header className="dshMarketOverlayHeader">
          <div>
            <h1>{t('title')}</h1>
            <p>{t('subtitle')}</p>
          </div>
          <Tooltip label={t('closeMarket')}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('closeMarket')}
              icon={<IconCloseOutline16 />}
              onClick={() => actions.close()}
            />
          </Tooltip>
        </header>
        <div className="dshMarketOverlayBody">
          <MarketSurface
            initialView={initialView}
            readLocale={readLocale}
            showHeader={false}
            t={t}
          />
        </div>
      </section>
    </div>
  )
}
