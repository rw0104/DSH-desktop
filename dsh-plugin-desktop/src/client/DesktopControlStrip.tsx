import { useSyncExternalStore } from 'react'
import type { DesktopLayoutState } from './layout-state.ts'

interface DesktopControlStripProps {
  layout: DesktopLayoutState
}

/** Compact workbench controls kept above the conversation surface. */
export function DesktopControlStrip({ layout }: DesktopControlStripProps) {
  const subscribe = (listener: () => void) => layout.subscribe(listener)
  const read = () => layout.getSnapshot()
  const snapshot = useSyncExternalStore(subscribe, read)
  const sidebarOpen = snapshot.narrow ? snapshot.narrowExpanded : snapshot.sidebar !== 0
  const detailsOpen = snapshot.details !== 0

  return (
    <div className="dshDesktopControlStrip" role="toolbar" aria-label="Workspace controls">
      <span className="dshDesktopControlStripLabel">Workspace</span>
      <div className="dshDesktopControlStripActions">
        <button
          type="button"
          className="dshDesktopControlButton"
          aria-pressed={sidebarOpen}
          onClick={() => { layout.toggleSidebar() }}
        >
          Sidebar
        </button>
        <button
          type="button"
          className="dshDesktopControlButton"
          aria-pressed={detailsOpen}
          onClick={() => { detailsOpen ? layout.closeDetails() : layout.openDetails() }}
        >
          Details
        </button>
      </div>
    </div>
  )
}
