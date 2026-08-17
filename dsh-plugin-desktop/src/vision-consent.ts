import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const VISION_CONSENT_VERSION = 1
export type VisionConsentDecision = 'accepted' | 'declined'

interface VisionConsentState {
  version: typeof VISION_CONSENT_VERSION
  decision: VisionConsentDecision
  acknowledgedAt: string
}

export interface VisionConsentPrompt {
  firstRun: boolean
}

export interface VisionConsentOptions {
  isPackaged: boolean
  statePath: string
  prompt(input: VisionConsentPrompt): Promise<boolean>
  now?: () => string
}

/** Return the persisted decision, ignoring malformed or replaced state files. */
export function readVisionConsent(statePath: string): VisionConsentDecision | undefined {
  if (!existsSync(statePath)) return undefined
  try {
    const value = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<VisionConsentState>
    if (value.version !== VISION_CONSENT_VERSION) return undefined
    return value.decision === 'accepted' || value.decision === 'declined' ? value.decision : undefined
  } catch {
    return undefined
  }
}

/** Persist a decision atomically in a user-private directory. */
export function writeVisionConsent(
  statePath: string,
  decision: VisionConsentDecision,
  now: () => string = () => new Date().toISOString(),
): void {
  const directory = dirname(statePath)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporary = `${statePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    const state: VisionConsentState = {
      version: VISION_CONSENT_VERSION,
      decision,
      acknowledgedAt: now(),
    }
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(temporary, statePath)
  } finally {
    try { unlinkSync(temporary) } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
    }
  }
}

/** Resolve consent before a packaged profile is assembled. */
export async function resolveVisionConsent(options: VisionConsentOptions): Promise<boolean> {
  if (!options.isPackaged) return true
  const previous = readVisionConsent(options.statePath)
  if (previous === 'accepted') return true
  const accepted = await options.prompt({ firstRun: previous === undefined })
  writeVisionConsent(options.statePath, accepted ? 'accepted' : 'declined', options.now)
  return accepted
}
