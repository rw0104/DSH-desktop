import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type convergence: locale/theme/settings declarations expose desktop slots.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { DesktopAboutSection, DESKTOP_ABOUT_LOCALE } from './about-section.tsx'
import { DesktopPluginMarketSection, DESKTOP_PLUGIN_MARKET_LOCALE } from './plugin-market-section.tsx'
import { applyAdvancedShell } from './advanced-shell.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { installWindowsDrivePickerEnhancement } from './drive-picker-enhancement.ts'
import { DESKTOP_ABOUT_LOCALE_DICTIONARY, DESKTOP_PLUGIN_MARKET_LOCALE_DICTIONARY } from './release-metadata.ts'
import { installDesktopAboutStyles, installDesktopIntegrationStyles } from './styles.ts'
import { WorkspaceChangesTab } from './WorkspaceChangesTab.tsx'

type DesktopSidebarRegistry = {
  registerTab(descriptor: {
    id: string
    title: () => string
    order: number
    single: boolean
    component: (props: Parameters<typeof WorkspaceChangesTab>[0]) => unknown
  }): () => void
}

export { applyAdvancedShell } from './advanced-shell.ts'
export { parseDesktopClientEnvironment } from './environment.ts'
export type { DesktopClientEnvironment, DesktopClientMode, DesktopClientPlatform } from './environment.ts'

/** Services required by advanced presentation. */
export const inject = [
  'slots',
  'sessions',
  'theme',
  'locale',
  'betterSidebar',
]

/** Register desktop-owned client surfaces for the current BrowserWindow mode. @param ctx - browser Cordis context. */
export function apply(ctx: ClientContext): void {
  const environment = parseDesktopClientEnvironment(window.location.search)
  if (environment.platform === 'win32') {
    ctx.effect(
      () => installDesktopIntegrationStyles(),
      'desktop: plugin chrome integration',
    )
    ctx.effect(
      () => installWindowsDrivePickerEnhancement(environment.platform, ctx.locale, environment.driveLetters),
      'desktop: Windows drive picker enhancement',
    )
  }
  ctx.effect(() => {
    const descriptor = {
      id: 'desktop:changes',
      title: () => 'Changes',
      order: 5,
      single: true,
      component: (props: Parameters<typeof WorkspaceChangesTab>[0]) => createElement(WorkspaceChangesTab, props),
    }
    const sidebar = (ctx as ClientContext & { betterSidebar?: DesktopSidebarRegistry }).betterSidebar
    return sidebar?.registerTab(descriptor) ?? (() => {})
  }, 'desktop: Workspace Changes tab')
  ctx.effect(() => {
    const removeStyles = installDesktopAboutStyles()
    const disposeLocaleZh = ctx.locale.register(DESKTOP_ABOUT_LOCALE, 'zh', DESKTOP_ABOUT_LOCALE_DICTIONARY.zh)
    const disposeLocaleEn = ctx.locale.register(DESKTOP_ABOUT_LOCALE, 'en', DESKTOP_ABOUT_LOCALE_DICTIONARY.en)
    const t = ctx.locale.bind(DESKTOP_ABOUT_LOCALE)
    const disposeSlot = ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'desktop-about',
      order: 900,
      label: () => t('nav'),
      inject: () => ({ about: { t } }),
    }, DesktopAboutSection))
    return () => {
      disposeSlot()
      disposeLocaleZh()
      disposeLocaleEn()
      removeStyles()
    }
  }, 'desktop: About settings section')
  ctx.effect(() => {
    const removeStyles = installDesktopAboutStyles()
    const disposeLocaleZh = ctx.locale.register(DESKTOP_PLUGIN_MARKET_LOCALE, 'zh', DESKTOP_PLUGIN_MARKET_LOCALE_DICTIONARY.zh)
    const disposeLocaleEn = ctx.locale.register(DESKTOP_PLUGIN_MARKET_LOCALE, 'en', DESKTOP_PLUGIN_MARKET_LOCALE_DICTIONARY.en)
    const t = ctx.locale.bind(DESKTOP_PLUGIN_MARKET_LOCALE)
    const disposeSlot = ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'desktop-plugin-market',
      order: 890,
      label: () => t('nav'),
      inject: () => ({ market: { t } }),
    }, DesktopPluginMarketSection))
    return () => {
      disposeSlot()
      disposeLocaleZh()
      disposeLocaleEn()
      removeStyles()
    }
  }, 'desktop: Plugin market settings section')
  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment)
}
