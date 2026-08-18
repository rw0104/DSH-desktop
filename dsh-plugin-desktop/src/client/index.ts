import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type convergence only: locale/theme declarations expose settings slot rows.
// The desktop client does not load or register a settings surface.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { applyAdvancedShell } from './advanced-shell.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { installWindowsDrivePickerEnhancement } from './drive-picker-enhancement.ts'
import { installDesktopIntegrationStyles } from './styles.ts'

export { applyAdvancedShell } from './advanced-shell.ts'
export { parseDesktopClientEnvironment } from './environment.ts'
export type { DesktopClientEnvironment, DesktopClientMode, DesktopClientPlatform } from './environment.ts'

/** Services required by advanced presentation. */
export const inject = [
  'slots',
  'sessions',
  'theme',
  'locale',
]

/** Register desktop-owned client surfaces for the current BrowserWindow mode. @param ctx - browser Cordis context. */
export function apply(ctx: ClientContext): void {
  const environment = parseDesktopClientEnvironment(window.location.search)
  if (environment.platform === 'win32') {
    ctx.effect(
      () => installDesktopIntegrationStyles(),
      'desktop: Windows plugin chrome integration',
    )
    ctx.effect(
      () => installWindowsDrivePickerEnhancement(environment.platform, ctx.locale, environment.driveLetters),
      'desktop: Windows drive picker enhancement',
    )
  }
  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment)
}
