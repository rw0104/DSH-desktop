import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type convergence: locale/theme/settings/conversation declarations expose the
// shared client services and slots used by desktop-owned contributions.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { DesktopAboutSection, DESKTOP_ABOUT_LOCALE } from './about-section.tsx'
import { applyAdvancedShell } from './advanced-shell.ts'
import { startRendererBootReporter } from './boot-health.ts'
import { installDesktopDirectoryPickerBridge, requestDesktopDirectoryValidation } from './directory-picker.ts'
import { installWindowsDrivePickerEnhancement } from './drive-picker-enhancement.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { requestDesktopExternalNavigation } from './external-navigation.ts'
import { DESKTOP_ABOUT_LOCALE_DICTIONARY } from './release-metadata.ts'
import { installWorkspaceFolderDrop } from './workspace-folder-drop.ts'
import { WorkspaceChangesTab } from './WorkspaceChangesTab.tsx'
import { installDesktopAboutStyles, installWorkspaceChangesStyles } from './styles.ts'
import { readDesktopUpdateUiState, subscribeDesktopUpdateUiState } from './update-state.ts'
import { DesktopVoiceController } from './voice-controller.ts'
import { VoiceComposerButton, VoiceSettingsSection, VoiceSidebarTab } from './voice-ui.tsx'
import { voiceLocales, type VoiceKey } from './voice-locales.ts'
import { installVoiceStyles } from './voice-styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desktop.voice': VoiceKey
  }
  interface SlotMap {
    'conversation.input.right': { kind: 'list'; scope: 'session'; owner: { readonly session: { readonly sessionId: string }; readonly input: unknown } }
  }
}

async function requestDesktopUpdateCheck(): Promise<void> {
  const response = await fetch('/dsh-desktop/api/check-updates', {
    method: 'POST',
    headers: { 'x-dsh-desktop-action': 'check-updates' },
  })
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null)
    const detail = value !== null && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
      ? (value as { error: string }).error
      : `HTTP ${String(response.status)}`
    throw new Error(`update check failed: ${detail}`)
  }
}

/** Minimal upstream service face; avoids importing the public `cordis` type graph into NodeNext. */
interface BetterSidebarRegistry {
  registerTab(descriptor: {
    id: string
    title: string | (() => string)
    order?: number
    single?: boolean
    component(props: { scope: { sessionId: string; cwd?: string }; visible?: boolean }): unknown
  }): () => void
  openTab(seed: { type: string; title?: string; meta?: unknown }, scope?: { sessionId: string }): void
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
  'connection',
  'locale',
  'sessions',
  'settingsScope',
  'theme',
  'workspaces',
  'betterSidebar',
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
      () => installWindowsDrivePickerEnhancement(environment.platform, ctx.locale, environment.driveLetters),
      'dsh-plugin-desktop: Windows drive picker enhancement',
    )
    ctx.effect(
      () => installDesktopDirectoryPickerBridge(),
      'dsh-plugin-desktop: native directory picker bridge',
    )
  }
  const sidebar = ctx.get('betterSidebar') as BetterSidebarRegistry | undefined
  if (sidebar === undefined) throw new Error('dsh-plugin-desktop: upstream Better Sidebar service is unavailable')
  const voice = new DesktopVoiceController(ctx, sidebar)
  ctx.effect(() => {
    const disposeLocale = ctx.locale.register('desktop.voice', voiceLocales)
    const disposeStyles = installVoiceStyles()
    return () => { disposeLocale(); disposeStyles() }
  }, 'dsh-plugin-desktop: realtime voice styles and dictionaries')
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'desktop-voice',
    order: 20,
    locale: 'desktop.voice',
    inject: () => ({ controller: voice }),
  }, VoiceComposerButton))
  ctx.effect(() => sidebar.registerTab({
    id: 'desktop:voice',
    title: () => ctx.locale.bind('desktop.voice')('settings.title'),
    order: 25,
    single: true,
    component: ({ scope }) => createElement(VoiceSidebarTab, { controller: voice, scope: { sessionId: scope.sessionId } }),
  }), 'dsh-plugin-desktop: realtime voice sidebar tab')
  ctx.effect(() => {
    return sidebar.registerTab({
      id: 'desktop:changes',
      title: () => 'Changes',
      order: 35,
      single: true,
      component: ({ scope }) => createElement(WorkspaceChangesTab, { scope }),
    })
  }, 'desktop: Workspace Changes tab in upstream Better Sidebar')
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
      inject: () => ({
        about: { t },
        productVersion: environment.productVersion,
        checkForUpdates: requestDesktopUpdateCheck,
        readUpdateState: readDesktopUpdateUiState,
        subscribeUpdateState: subscribeDesktopUpdateUiState,
        openExternal: requestDesktopExternalNavigation,
      }),
    }, DesktopAboutSection))
    const disposeVoiceSlot = ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'desktop-voice',
      order: 40,
      label: () => ctx.locale.bind('desktop.voice')('settings.title'),
      locale: 'desktop.voice',
      inject: () => ({ controller: voice, openExternal: requestDesktopExternalNavigation }),
    }, VoiceSettingsSection))
    return () => {
      disposeVoiceSlot()
      disposeSlot()
      disposeLocaleZh()
      disposeLocaleEn()
      removeStyles()
    }
  }, 'desktop: About settings section')
  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment)
}
