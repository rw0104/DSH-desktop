import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type convergence only: locale/theme declarations expose settings slot rows.
// The desktop client does not load or register a settings surface.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { DesktopAboutSection, DESKTOP_ABOUT_LOCALE } from './about-section.tsx'
import { applyAdvancedShell } from './advanced-shell.ts'
import { startRendererBootReporter } from './boot-health.ts'
import { installDesktopDirectoryPickerBridge, requestDesktopDirectoryValidation } from './directory-picker.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { DESKTOP_ABOUT_LOCALE_DICTIONARY } from './release-metadata.ts'
import { installWorkspaceFolderDrop } from './workspace-folder-drop.ts'
import { WorkspaceChangesTab } from './WorkspaceChangesTab.tsx'
import { installDesktopAboutStyles, installWorkspaceChangesStyles } from './styles.ts'

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
export {
  RENDERER_BOOT_REPORT_PATH,
  rendererBootReport,
  sendRendererBootReport,
  startRendererBootReporter,
} from './boot-health.ts'
export type { RendererBootLoader, RendererBootReport } from './boot-health.ts'
export { parseDesktopClientEnvironment } from './environment.ts'
export type { DesktopClientEnvironment, DesktopClientMode, DesktopClientPlatform } from './environment.ts'

/** Services required by advanced presentation. */
export const inject = [
  'slots',
  'locale',
  'sessions',
  'theme',
  'workspaces',
]

/** Register desktop-owned client surfaces for the current BrowserWindow mode. @param ctx - browser Cordis context. */
export function apply(ctx: ClientContext): void {
  const environment = parseDesktopClientEnvironment(window.location.search)
  if (!environment) return
  ctx.effect(
    () => startRendererBootReporter(ctx.loader),
    'dsh-plugin-desktop: renderer boot health report',
  )
  ctx.effect(
    () => installWorkspaceFolderDrop({
      create: input => ctx.workspaces.create(input),
      startSession: workspaceId => { ctx.workspaces.startSession(workspaceId) },
      ...(environment.platform === 'win32'
        ? { validateDirectory: (path: string) => requestDesktopDirectoryValidation(path) }
        : {}),
    }),
    'dsh-plugin-desktop: workspace folder drop',
  )
  if (environment.platform === 'win32') {
    ctx.effect(
      () => installDesktopDirectoryPickerBridge(),
      'dsh-plugin-desktop: native directory picker bridge',
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
    const sidebar = ctx.get('betterSidebar') as DesktopSidebarRegistry | undefined
    return sidebar?.registerTab(descriptor) ?? (() => {})
  }, 'desktop: Workspace Changes tab')
  ctx.effect(
    () => installWorkspaceChangesStyles(),
    'desktop: Workspace Changes styles',
  )
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
      inject: () => ({ about: { t }, productVersion: environment.productVersion }),
    }, DesktopAboutSection))
    return () => {
      disposeSlot()
      disposeLocaleZh()
      disposeLocaleEn()
      removeStyles()
    }
  }, 'desktop: About settings section')
  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment)
}
