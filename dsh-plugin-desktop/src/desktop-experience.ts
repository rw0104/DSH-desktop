/** Product capabilities are independent from the native window decoration. */
export type DesktopExperience = 'desktop' | 'upstream-diagnostic'
export type DesktopWindowStyle = 'system' | 'native'
export type LegacyDesktopMode = 'compatibility' | 'advanced'

export interface DesktopPresentation {
  readonly experience: DesktopExperience
  readonly windowStyle: DesktopWindowStyle
  /** Legacy geometry adapter; never use this to enable/disable product features. */
  readonly mode: LegacyDesktopMode
}

export function desktopWindowStyle(value: unknown, legacyMode?: unknown): DesktopWindowStyle {
  if (value !== undefined) {
    if (value === 'system' || value === 'native') return value
    throw new TypeError('dsh-plugin-desktop: windowStyle must be system or native')
  }
  if (legacyMode === undefined || legacyMode === 'compatibility') return 'system'
  if (legacyMode === 'advanced') return 'native'
  throw new TypeError('dsh-plugin-desktop: legacy mode must be "compatibility" or "advanced"')
}

export function legacyDesktopMode(style: DesktopWindowStyle): LegacyDesktopMode {
  return style === 'native' ? 'advanced' : 'compatibility'
}

/** Resolve once before composing either Host routes or Client surfaces. */
export function resolveDesktopPresentation(
  input: { experience?: unknown; windowStyle?: unknown; mode?: unknown },
  platform?: string,
): DesktopPresentation {
  const experience = input.experience ?? 'desktop'
  if (experience !== 'desktop' && experience !== 'upstream-diagnostic') throw new TypeError('dsh-plugin-desktop: unknown desktop experience')
  const requestedStyle = desktopWindowStyle(input.windowStyle, input.mode)
  const windowStyle = experience === 'upstream-diagnostic' || platform === 'linux' ? 'system' : requestedStyle
  return { experience, windowStyle, mode: legacyDesktopMode(windowStyle) }
}

export const UPSTREAM_DIAGNOSTIC_ARGUMENT = '--upstream-diagnostic'

/** One-run diagnostic choice, never a write to normal Profile preferences. */
export function desktopRelaunchArguments(argv: readonly string[], diagnostic: boolean): string[] {
  const args = argv.filter(value => value !== UPSTREAM_DIAGNOSTIC_ARGUMENT)
  return diagnostic ? [...args, UPSTREAM_DIAGNOSTIC_ARGUMENT] : args
}
