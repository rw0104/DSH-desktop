import { useLayoutEffect, useRef, type MutableRefObject, type PointerEvent } from 'react'
import type { DesktopVoiceController, DesktopVoiceState } from './voice-controller.ts'
import type { VoicePanelCopy } from './voice-panel-copy.ts'
import { clampVoicePosition, placeVoiceCompact, voiceObstacles, voiceViewport, VOICE_OBSTACLES, type VoicePoint } from './voice-position.ts'

export function VoiceCompact({ controller, state, copy, taskLabel, position }: {
  controller: DesktopVoiceController; state: DesktopVoiceState; copy: VoicePanelCopy; taskLabel: string;
  position: MutableRefObject<VoicePoint | null>;
}) {
  const root = useRef<HTMLElement>(null)
  const move = useRef((point: VoicePoint | null) => { position.current = point })
  const drag = useRef<{ id: number; x: number; y: number; origin: VoicePoint } | null>(null)
  useLayoutEffect(() => {
    const node = root.current!
    let frame = 0
    const update = (): void => {
      const viewport = voiceViewport()
      node.style.maxWidth = `${Math.max(0, Math.min(300, viewport.width - 24))}px`
      const size = node.getBoundingClientRect()
      const point = position.current === null
        ? placeVoiceCompact(size, viewport, voiceObstacles())
        : clampVoicePosition(position.current, size, viewport)
      if (position.current !== null) position.current = point
      node.style.transform = `translate3d(${point.x}px,${point.y}px,0)`
    }
    move.current = point => { position.current = point; update() }
    const schedule = (): void => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update() }) }
    const resize = new ResizeObserver(schedule)
    const observe = (): void => {
      resize.disconnect()
      resize.observe(node)
      document.querySelectorAll(VOICE_OBSTACLES).forEach(element => resize.observe(element))
      schedule()
    }
    const changes = new MutationObserver(observe)
    changes.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'class'] })
    observe()
    update()
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect(); changes.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
    }
  }, [position])
  const finishDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <section ref={root} className="dshVoiceCompact" aria-label={copy.title}>
    <button className="dshVoiceDrag" type="button" title={copy.move} aria-label={copy.move} aria-describedby="dsh-voice-move-help"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0 || drag.current) return
        event.preventDefault(); event.stopPropagation()
        event.currentTarget.focus()
        const rect = root.current!.getBoundingClientRect()
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { x: rect.left, y: rect.top } }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const start = drag.current
        if (start?.id !== event.pointerId) return
        event.preventDefault()
        move.current({ x: start.origin.x + event.clientX - start.x, y: start.origin.y + event.clientY - start.y })
      }}
      onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={() => { drag.current = null }}
      onClick={event => { event.preventDefault(); event.stopPropagation() }}
      onKeyDown={event => {
        if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); move.current(null); return }
        const directions: Record<string, VoicePoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
        const direction = directions[event.key]
        if (!direction) return
        event.preventDefault(); event.stopPropagation()
        const rect = root.current!.getBoundingClientRect(), step = event.shiftKey ? 32 : 8
        move.current({ x: rect.left + direction.x * step, y: rect.top + direction.y * step })
      }}>⠿</button>
    <span id="dsh-voice-move-help" className="dshVoiceVisuallyHidden">{copy.moveHelp}</span>
    <button className="dshVoiceCompactRestore" type="button" onClick={() => controller.restorePanel()} aria-label={copy.restore} title={copy.restore}>
      <span className="dshVoiceCompactIndicator" aria-hidden />
      <span>{copy[state.status]}{taskLabel && <small title={taskLabel}>{taskLabel}</small>}</span>
    </button>
    <button type="button" className="dshVoiceCompactIcon" title={state.microphoneMuted ? copy.unmute : copy.mute} aria-label={state.microphoneMuted ? copy.unmute : copy.mute} aria-pressed={state.microphoneMuted} onClick={() => { void controller.toggleMicrophone() }}>
      <span className={`dshVoiceGlyph is-mic${state.microphoneMuted ? ' is-muted' : ''}`} aria-hidden />
    </button>
    <button type="button" className="dshVoiceCompactIcon" title={copy.resetPosition} aria-label={copy.resetPosition} onClick={() => move.current(null)}>⌖</button>
    <button className="dshVoiceEnd dshVoiceCompactIcon" type="button" aria-label={copy.end} title={copy.end} onClick={() => { void controller.closePanel() }}><span className="dshVoiceGlyph is-stop" aria-hidden /></button>
  </section>
}
