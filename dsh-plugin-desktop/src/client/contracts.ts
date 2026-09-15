import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

/** Sidebar geometry passed by the desktop root slot. */
export interface DesktopSidebarOwnerProps {
  /** Whether the sidebar is showing its compact rail. */
  collapsed: boolean
  /** Current rendered sidebar width. */
  width: number
}

/** The desktop carrier implements the same public panel-navigation contract as Web. */
export type { ILayout as DesktopLayoutService } from '@deepseek-ai/dsh-client-ui-layout/client'
