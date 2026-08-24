/** Same-origin contract for copying one authorized conversation deliverable. */

export const DESKTOP_DELIVERABLE_COPY_PATH = '/dsh-desktop/api/deliverables/copy'
export const DESKTOP_DELIVERABLE_COPY_ACTION = 'copy-deliverable'

export type DesktopDeliverableCopyKind = 'absolute-path' | 'text-content'

export interface DesktopDeliverableCopyRequest {
  readonly sessionId: string
  readonly path: string
  readonly kind: DesktopDeliverableCopyKind
}

export interface DesktopDeliverableCopyResponse {
  readonly ok: true
}

export interface DesktopDeliverableCopyErrorResponse {
  readonly ok: false
  readonly error: {
    readonly code: string
    readonly message: string
  }
}
