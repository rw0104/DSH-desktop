import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DesktopVoiceState } from './voice-controller.ts'
import type { VoicePanelCopy } from './voice-panel-copy.ts'

export function isTranscriptNearEnd(top: number, height: number, total: number): boolean {
  return total - height - top <= 32
}
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Captions own their scroll. Reading history suspends following until explicitly resumed. */
export const VoiceTranscript = memo(function VoiceTranscript({ state, copy, view }: { state: DesktopVoiceState; copy: VoicePanelCopy; view?: { following: boolean; top: number } | undefined }) {
  const scroll = useRef<HTMLDivElement>(null)
  const following = useRef(view?.following ?? true)
  const mounted = useRef(false)
  const [paused, setPaused] = useState(!following.current)
  const latest = (): void => {
    following.current = true
    if (view) view.following = true
    setPaused(false)
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }
  useClientLayoutEffect(() => {
    if (scroll.current) {
      if (following.current) scroll.current.scrollTop = scroll.current.scrollHeight
      else if (!mounted.current) scroll.current.scrollTop = view?.top ?? 0
    }
    mounted.current = true
  }, [state.turns, state.liveInput, state.liveOutput])
  useEffect(() => {
    if (!scroll.current) return
    const observer = new ResizeObserver(() => { if (following.current) latest() })
    observer.observe(scroll.current)
    return () => { observer.disconnect() }
  }, [])
  return <div className="dshVoiceCaptions">
    <div ref={scroll} className={`dshVoiceTranscript${state.turns.length ? ' has-content' : ''}`} role="log" aria-label={copy.captions} aria-live="polite" tabIndex={0}
      onScroll={event => {
        const node = event.currentTarget
        following.current = isTranscriptNearEnd(node.scrollTop, node.clientHeight, node.scrollHeight)
        if (view) { view.following = following.current; view.top = node.scrollTop }
        setPaused(!following.current)
      }}>
      {state.turns.length === 0 && !state.liveInput && !state.liveOutput && <div className="dshVoiceEmpty">{state.settings.enabled ? copy.empty : copy.disabled}</div>}
      {state.turns.map(turn => <article key={turn.id} className={`dshVoiceTurn is-${turn.role}`}><span>{turn.role === 'user' ? copy.you : copy.agent}</span><p>{turn.text}</p></article>)}
      {state.liveInput && <article className="dshVoiceTurn is-user is-live"><span>{copy.you}</span><p>{state.liveInput}</p></article>}
      {state.liveOutput && <article className="dshVoiceTurn is-assistant is-live"><span>{copy.agent}</span><p>{state.liveOutput}</p></article>}
    </div>
    {paused && <button className="dshVoiceLatest" type="button" onClick={latest}>{copy.latest} ↓</button>}
  </div>
}, (before, after) => before.copy === after.copy && before.state.turns === after.state.turns && before.state.liveInput === after.state.liveInput && before.state.liveOutput === after.state.liveOutput && before.state.settings.enabled === after.state.settings.enabled)
