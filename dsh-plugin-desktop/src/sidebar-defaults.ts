import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

const BETTER_SIDEBAR_NAMESPACE = settingsNamespace('dsh-better-sidebar')
const RETRY_DELAY_MS = 50
const MAX_RETRIES = 40

export interface DesktopSidebarDefaultPatch {
  openByDefault?: boolean
  titleBarCompat?: boolean
}

/** Only fill fields the user has not explicitly configured. */
export function desktopSidebarDefaultPatch(
  user: unknown,
  platform: NodeJS.Platform,
): DesktopSidebarDefaultPatch {
  const section = user !== null && typeof user === 'object' && !Array.isArray(user)
    ? user as Record<string, unknown>
    : undefined
  const patch: DesktopSidebarDefaultPatch = {}
  if (section?.openByDefault === undefined) patch.openByDefault = false
  if (platform === 'win32' && section?.titleBarCompat === undefined) patch.titleBarCompat = true
  return patch
}

/** Seed product-friendly defaults after the Better Sidebar settings row mounts. */
export function installDesktopSidebarDefaults(ctx: Context): void {
  const settings = ctx.settings
  if (typeof settings.describe !== 'function' || typeof settings.update !== 'function') return
  ctx.effect(() => {
    let disposed = false
    let retries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const apply = (): void => {
      if (disposed) return
      const descriptor = settings.describe().find(row => String(row.ns) === String(BETTER_SIDEBAR_NAMESPACE))
      if (descriptor === undefined) {
        if (retries < MAX_RETRIES) {
          retries += 1
          timer = setTimeout(apply, RETRY_DELAY_MS)
        }
        return
      }
      const patch = desktopSidebarDefaultPatch(descriptor.user, ctx.desktopRuntime.platform)
      if (Object.keys(patch).length === 0) return
      void settings.update(BETTER_SIDEBAR_NAMESPACE, patch, descriptor.revision).catch(() => {})
    }
    apply()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, 'dsh-plugin-desktop: Better Sidebar presentation defaults')
}
