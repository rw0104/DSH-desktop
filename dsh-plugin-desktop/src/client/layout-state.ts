/** Advanced-shell panel state shared by the root slot and layout-service adapter. */
import type { LayoutStorage } from './layout-storage.ts'

export interface DesktopLayoutSnapshot {
  /** Preferred sidebar width; zero means the compact rail. */
  sidebar: number
  /** Preferred details width; zero means closed. */
  details: number
  /** Whether the current viewport is below the automatic-collapse breakpoint. */
  narrow: boolean
  /** Manual narrow-screen override that temporarily expands the rail. */
  narrowExpanded: boolean
}

/** Column geometry after preserving the center surface. */
export interface DesktopColumns {
  /** Rendered sidebar width. */
  sidebar: number
  /** Rendered center width. */
  center: number
  /** Rendered details width. */
  details: number
}

/** Compatibility-mode compact rail used by the upstream Windows sidebar. */
export const SIDEBAR_COLLAPSED = 56
/** Wider compact rail reserved for the desktop-owned macOS sidebar. */
export const MACOS_SIDEBAR_COLLAPSED = 90
export const SIDEBAR_DEFAULT = 240
export const SIDEBAR_MIN = 220
export const SIDEBAR_MAX = 360
export const SIDEBAR_AUTO_COLLAPSE = 1024
export const DETAILS_DEFAULT = 360
export const DETAILS_MIN = 300
export const DETAILS_MAX = 520
export const CENTER_MIN = 640
export const DESKTOP_LAYOUT_STORAGE_KEY = 'dsh-desktop:layout:v1'

/** Optional persistence boundary for the desktop workbench state. */
export interface DesktopLayoutOptions {
  storage?: LayoutStorage
  storageKey?: string
}

/**
 * Resolve three desktop columns without allowing details to squeeze the conversation below its floor.
 * @param viewport - available frame width.
 * @param sidebar - sidebar preference, where zero selects the compact rail.
 * @param details - details preference, where zero closes the panel.
 * @returns rendered column widths.
 */
export function computeDesktopColumns(
  viewport: number,
  sidebar: number,
  details: number,
  collapsedWidth: number = SIDEBAR_COLLAPSED,
): DesktopColumns {
  const sidebarWidth = sidebar === 0 ? collapsedWidth : clamp(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const preferredDetails = details === 0 ? 0 : clamp(details, DETAILS_MIN, DETAILS_MAX)
  if (sidebarWidth + preferredDetails + CENTER_MIN <= viewport) {
    return { sidebar: sidebarWidth, center: viewport - sidebarWidth - preferredDetails, details: preferredDetails }
  }
  const reducedDetails = preferredDetails === 0 ? 0 : Math.max(DETAILS_MIN, viewport - sidebarWidth - CENTER_MIN)
  if (sidebarWidth + reducedDetails + CENTER_MIN <= viewport) {
    return { sidebar: sidebarWidth, center: CENTER_MIN, details: reducedDetails }
  }
  return { sidebar: sidebarWidth, center: Math.max(0, viewport - sidebarWidth), details: 0 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Small observable panel controller used by the advanced root registration. */
export class DesktopLayoutState {
  private readonly storage: LayoutStorage | undefined
  private readonly storageKey: string
  private snapshot: DesktopLayoutSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(options: DesktopLayoutOptions = {}) {
    this.storage = options.storage
    this.storageKey = options.storageKey ?? DESKTOP_LAYOUT_STORAGE_KEY
    this.snapshot = Object.freeze(readSnapshot(this.storage, this.storageKey))
  }

  /** @returns the immutable current panel snapshot. */
  getSnapshot(): DesktopLayoutSnapshot {
    return this.snapshot
  }

  /** @param listener - callback notified after a snapshot replacement. @returns its disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Toggle the wide sidebar and the platform-selected compact rail. */
  toggleSidebar(): void {
    if (this.snapshot.narrow) {
      this.publish({ ...this.snapshot, narrowExpanded: !this.snapshot.narrowExpanded }, false)
      return
    }
    this.publish({ ...this.snapshot, sidebar: this.snapshot.sidebar === 0 ? SIDEBAR_DEFAULT : 0 })
  }

  /** @param narrow - whether the frame is below the automatic-collapse breakpoint. */
  setNarrow(narrow: boolean): void {
    if (this.snapshot.narrow === narrow) return
    this.publish({ ...this.snapshot, narrow, narrowExpanded: false }, false)
  }

  /** Open details at its default width. */
  openDetails(): void {
    if (this.snapshot.details === 0) this.publish({ ...this.snapshot, details: DETAILS_DEFAULT })
  }

  /** Close details while keeping its slot mounted. */
  closeDetails(): void {
    if (this.snapshot.details !== 0) this.publish({ ...this.snapshot, details: 0 })
  }

  /** @param width - requested sidebar width from a resize gesture. */
  setSidebar(width: number): void {
    this.publish({ ...this.snapshot, sidebar: clamp(width, SIDEBAR_MIN, SIDEBAR_MAX) })
  }

  /** @param width - requested details width from a resize gesture. */
  setDetails(width: number): void {
    this.publish({ ...this.snapshot, details: clamp(width, DETAILS_MIN, DETAILS_MAX) })
  }

  private publish(next: DesktopLayoutSnapshot, persist = true): void {
    this.snapshot = Object.freeze(next)
    if (persist) writeSnapshot(this.storage, this.storageKey, next)
    for (const listener of this.listeners) listener()
  }
}

function readSnapshot(storage: LayoutStorage | undefined, key: string): DesktopLayoutSnapshot {
  const fallback: DesktopLayoutSnapshot = {
    sidebar: SIDEBAR_DEFAULT,
    details: 0,
    narrow: false,
    narrowExpanded: false,
  }
  if (storage === undefined) return fallback
  try {
    const raw = storage.getItem(key)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return fallback
    const record = value as Record<string, unknown>
    if (record.version !== 1 || typeof record.sidebar !== 'number' || typeof record.details !== 'number') {
      return fallback
    }
    if (!Number.isFinite(record.sidebar) || !Number.isFinite(record.details)) return fallback
    return {
      sidebar: record.sidebar === 0 ? 0 : clamp(record.sidebar, SIDEBAR_MIN, SIDEBAR_MAX),
      details: record.details === 0 ? 0 : clamp(record.details, DETAILS_MIN, DETAILS_MAX),
      narrow: false,
      narrowExpanded: false,
    }
  } catch {
    return fallback
  }
}

function writeSnapshot(storage: LayoutStorage | undefined, key: string, snapshot: DesktopLayoutSnapshot): void {
  if (storage === undefined) return
  try {
    storage.setItem(key, JSON.stringify({ version: 1, sidebar: snapshot.sidebar, details: snapshot.details }))
  } catch {
    // Private browsing and quota errors should not break layout interactions.
  }
}
