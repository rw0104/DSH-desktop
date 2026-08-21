import { useEffect, useRef, useState } from 'react'
import { IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contracts.ts'

interface WorkspaceDirectoryMenuFace {
  openPath(path: string): Promise<void>
}

export type WorkspaceDirectoryMenuProps = PropsRuntime<'shell.overlay'> & {
  workspaceDirectoryMenu: WorkspaceDirectoryMenuFace
}

interface MenuState {
  x: number
  y: number
  path: string
}

const MENU_WIDTH = 188
const MENU_HEIGHT = 42
const EDGE_INSET = 8

/** Keep the workspace menu inside the visible BrowserWindow. */
export function workspaceMenuPosition(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  return {
    x: Math.max(EDGE_INSET, Math.min(clientX, viewportWidth - MENU_WIDTH - EDGE_INSET)),
    y: Math.max(EDGE_INSET, Math.min(clientY, viewportHeight - MENU_HEIGHT - EDGE_INSET)),
  }
}

function copy(): { open: string; failed: string } {
  const language = document.documentElement.lang || navigator.language
  return language.toLowerCase().startsWith('zh')
    ? { open: '打开目录', failed: '无法打开目录' }
    : { open: 'Open folder', failed: 'Could not open folder' }
}

/** Context menu for real upstream Workspace project rows only. */
export function WorkspaceDirectoryMenu({ workspaceDirectoryMenu }: WorkspaceDirectoryMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const itemRef = useRef<HTMLButtonElement>(null)
  const text = copy()

  useEffect(() => {
    if (menu !== null) itemRef.current?.focus()
  }, [menu])

  useEffect(() => {
    const close = (event: Event): void => {
      if (event.target instanceof Element
        && event.target.closest('.dshDesktopWorkspaceContextMenu') !== null) return
      setMenu(null)
    }
    const onContextMenu = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return
      const row = event.target.closest<HTMLElement>('[data-dsh-workspace-path]')
      const path = row?.dataset.dshWorkspacePath?.trim()
      if (path === undefined || path.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      const position = workspaceMenuPosition(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
      setError(null)
      setMenu({ ...position, path })
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [])

  const open = (): void => {
    const path = menu?.path
    if (path === undefined) return
    setMenu(null)
    void workspaceDirectoryMenu.openPath(path).catch((cause: unknown) => {
      const detail = cause instanceof Error ? cause.message : String(cause)
      setError(`${text.failed}: ${detail}`)
    })
  }

  return <>
    {menu !== null && <div
      className="dshDesktopWorkspaceContextMenu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={event => { event.stopPropagation() }}
    >
      <button ref={itemRef} type="button" role="menuitem" onClick={open}>
        <IconFolderOpenOutline16 />
        <span>{text.open}</span>
      </button>
    </div>}
    {error !== null && <div className="dshDesktopWorkspaceContextToast" role="alert">{error}</div>}
  </>
}
