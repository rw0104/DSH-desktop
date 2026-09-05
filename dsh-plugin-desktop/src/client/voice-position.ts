/** Positioning is UI state only; it never owns a voice connection or Agent task. */
export interface VoicePoint { x: number; y: number }
export interface VoiceRect { left: number; top: number; right: number; bottom: number }
export interface VoiceViewport extends VoiceRect { width: number; height: number }
const GAP = 12

export function clampVoicePosition(point: VoicePoint, size: { width: number; height: number }, viewport: VoiceViewport): VoicePoint {
  return {
    x: Math.max(viewport.left + GAP, Math.min(point.x, viewport.right - size.width - GAP)),
    y: Math.max(viewport.top + GAP, Math.min(point.y, viewport.bottom - size.height - GAP)),
  }
}

/** Search edges of the actual composer/approval rectangles before falling back to a viewport edge. */
export function placeVoiceCompact(size: { width: number; height: number }, viewport: VoiceViewport, obstacles: readonly VoiceRect[]): VoicePoint {
  const xs = [viewport.right - size.width - GAP, viewport.left + GAP]
  const ys = [viewport.bottom - size.height - GAP]
  for (const rect of obstacles) {
    xs.push(rect.left - size.width - GAP, rect.right + GAP)
    ys.push(rect.top - size.height - GAP, rect.bottom + GAP)
  }
  ys.push(viewport.top + GAP)
  const candidates = ys.flatMap(y => xs.map(x => clampVoicePosition({ x, y }, size, viewport)))
  const overlap = (p: VoicePoint): number => obstacles.reduce((area, r) => area
    + Math.max(0, Math.min(p.x + size.width + GAP, r.right) - Math.max(p.x - GAP, r.left))
    * Math.max(0, Math.min(p.y + size.height + GAP, r.bottom) - Math.max(p.y - GAP, r.top)), 0)
  return candidates.reduce((best, p) => overlap(p) < overlap(best) ? p : best, candidates[0]!)
}

export function voiceViewport(): VoiceViewport {
  const view = window.visualViewport
  const left = view?.offsetLeft ?? 0, top = view?.offsetTop ?? 0
  const width = view?.width ?? window.innerWidth, height = view?.height ?? window.innerHeight
  return { left, top, width, height, right: left + width, bottom: top + height }
}

export const VOICE_OBSTACLES = '[data-composer-seat], [data-composer-card], [data-approval-key], [role="dialog"][aria-modal="true"]'

export function voiceObstacles(): VoiceRect[] {
  return [...document.querySelectorAll<HTMLElement>(VOICE_OBSTACLES)]
    .filter(node => node.getClientRects().length > 0)
    .map(node => node.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
}
