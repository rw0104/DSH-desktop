/** Shared, read-only update status contract between the Desktop Host and Renderer. */

/** Same-origin snapshot endpoint. */
export const DESKTOP_UPDATE_STATE_PATH = '/dsh-desktop/api/update-state'

/** Same-origin Server-Sent Events endpoint for generation-scoped status changes. */
export const DESKTOP_UPDATE_STATE_EVENTS_PATH = '/dsh-desktop/api/update-state/events'

interface DesktopUpdateUiStateBase {
  /** Host lifecycle generation; a remounted Host always receives a new value. */
  readonly generation: number
  /** Monotonic revision within one lifecycle generation. */
  readonly revision: number
}

/** Renderer-safe update state. Paths, URLs, response bodies, and raw errors never enter this contract. */
export type DesktopUpdateUiState = DesktopUpdateUiStateBase & (
  | { readonly phase: 'idle' }
  | { readonly phase: 'checking' }
  | { readonly phase: 'available'; readonly version: string; readonly totalBytes?: number }
  | { readonly phase: 'awaiting-download-confirmation'; readonly version: string; readonly totalBytes?: number }
  | {
      readonly phase: 'downloading'
      readonly version: string
      readonly receivedBytes: number
      readonly totalBytes?: number
    }
  | { readonly phase: 'verifying'; readonly version: string; readonly totalBytes?: number }
  | { readonly phase: 'ready-to-install'; readonly version: string }
  | { readonly phase: 'launching-installer'; readonly version: string }
  | { readonly phase: 'failed'; readonly code: string }
  | { readonly phase: 'cancelled' }
)

type WithoutSequence<T> = T extends unknown ? Omit<T, 'generation' | 'revision'> : never

/** Lifecycle-owned payload before generation and revision are attached. */
export type DesktopUpdateUiStatePayload = WithoutSequence<DesktopUpdateUiState>

/** Progress emitted by the native adapter while handling a confirmed artifact. */
export type DesktopUpdateAdapterProgress =
  | { readonly phase: 'downloading'; readonly receivedBytes: number; readonly totalBytes?: number }
  | { readonly phase: 'verifying'; readonly totalBytes?: number }
  | { readonly phase: 'ready-to-install' }
  | { readonly phase: 'launching-installer' }

/** Safe initial value used before a Renderer obtains the current Host snapshot. */
export const INITIAL_DESKTOP_UPDATE_UI_STATE: DesktopUpdateUiState = {
  generation: 0,
  revision: 0,
  phase: 'idle',
}

/** Validate an untrusted snapshot received by the Renderer. */
export function parseDesktopUpdateUiState(value: unknown): DesktopUpdateUiState | undefined {
  if (!isRecord(value)
    || !isCounter(value.generation)
    || !isCounter(value.revision)
    || typeof value.phase !== 'string') return undefined
  const base = { generation: value.generation, revision: value.revision }
  switch (value.phase) {
    case 'idle':
    case 'checking':
    case 'cancelled':
      return { ...base, phase: value.phase }
    case 'available':
    case 'awaiting-download-confirmation': {
      const version = stableDisplayVersion(value.version)
      const totalBytes = optionalBytes(value.totalBytes)
      if (version === undefined || totalBytes === null) return undefined
      return { ...base, phase: value.phase, version, ...(totalBytes === undefined ? {} : { totalBytes }) }
    }
    case 'downloading': {
      const version = stableDisplayVersion(value.version)
      const receivedBytes = bytes(value.receivedBytes, true)
      const totalBytes = optionalBytes(value.totalBytes)
      if (version === undefined || receivedBytes === undefined || totalBytes === null) return undefined
      return {
        ...base,
        phase: value.phase,
        version,
        receivedBytes,
        ...(totalBytes === undefined ? {} : { totalBytes }),
      }
    }
    case 'verifying': {
      const version = stableDisplayVersion(value.version)
      const totalBytes = optionalBytes(value.totalBytes)
      if (version === undefined || totalBytes === null) return undefined
      return { ...base, phase: value.phase, version, ...(totalBytes === undefined ? {} : { totalBytes }) }
    }
    case 'ready-to-install':
    case 'launching-installer': {
      const version = stableDisplayVersion(value.version)
      return version === undefined ? undefined : { ...base, phase: value.phase, version }
    }
    case 'failed':
      return typeof value.code === 'string' && /^[a-z0-9-]{1,64}$/u.test(value.code)
        ? { ...base, phase: value.phase, code: value.code }
        : undefined
    default:
      return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function bytes(value: unknown, allowZero: boolean): number | undefined {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= (allowZero ? 0 : 1)
    ? value
    : undefined
}

/** Undefined is valid for an unknown total; null means invalid. */
function optionalBytes(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  return bytes(value, false) ?? null
}

function stableDisplayVersion(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(?:\+[0-9A-Za-z.-]+)?$/u.test(value)
    ? value
    : undefined
}
