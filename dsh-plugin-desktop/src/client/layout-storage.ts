/** Minimal storage surface used by the desktop layout state. */
export interface LayoutStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Resolve browser storage without making client boot depend on localStorage. */
export function createLayoutStorage(): LayoutStorage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
