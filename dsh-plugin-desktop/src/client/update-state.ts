import {
  DESKTOP_UPDATE_STATE_EVENTS_PATH,
  DESKTOP_UPDATE_STATE_PATH,
  parseDesktopUpdateUiState,
  type DesktopUpdateUiState,
} from '../update-ui-state.ts'

/** Read the current Host-owned update status without mutating update work. */
export async function readDesktopUpdateUiState(signal?: AbortSignal): Promise<DesktopUpdateUiState> {
  const response = await fetch(DESKTOP_UPDATE_STATE_PATH, {
    method: 'GET',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`update state request failed: HTTP ${String(response.status)}`)
  const state = parseDesktopUpdateUiState(await response.json())
  if (state === undefined) throw new Error('update state request returned an invalid snapshot')
  return state
}

/** Subscribe to generation-scoped Host status events. Invalid payloads are ignored. */
export function subscribeDesktopUpdateUiState(
  listener: (state: DesktopUpdateUiState) => void,
): () => void {
  if (typeof EventSource === 'undefined') return () => {}
  let source: EventSource
  try {
    source = new EventSource(DESKTOP_UPDATE_STATE_EVENTS_PATH)
  } catch {
    return () => {}
  }
  const receive = (event: Event): void => {
    const state = parseDesktopUpdateUiState(JSON.parse((event as MessageEvent<string>).data) as unknown)
    if (state !== undefined) listener(state)
  }
  const safeReceive = (event: Event): void => {
    try {
      receive(event)
    } catch {
      // A malformed event is isolated to this read-only UI observer.
    }
  }
  source.addEventListener('state', safeReceive)
  return () => {
    source.removeEventListener('state', safeReceive)
    source.close()
  }
}
