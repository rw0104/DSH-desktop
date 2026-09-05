import { useEffect, useRef, useState } from 'react'
import type { VoiceAudioFeatures, VoiceStatus } from './voice-controller.ts'
import { createVoiceOrbRenderer, type VoiceOrbRenderer } from './realtime-presence/voiceOrbRenderer.js'
import { drawVoiceOrbFallback } from './realtime-presence/voiceOrbFallback.js'

interface VoiceOrbProps {
  status: VoiceStatus
  inputFeatures: VoiceAudioFeatures
  outputFeatures: VoiceAudioFeatures
  label: string
  active?: boolean
}
/** DSH lifecycle names mapped to the unchanged pm01 motion profiles. */
export function voiceOrbState(status: VoiceStatus): string {
  if (status === 'requesting') return 'requesting_microphone'
  return status.replaceAll('-', '_')
}

/** pm01 WebGL renderer, adapted only at the DSH lifecycle and desktop geometry boundary. */
export function VoiceOrb({ status, inputFeatures, outputFeatures, label, active = true }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<VoiceOrbRenderer | null>(null)
  const scene = useRef({ status, inputFeatures, outputFeatures })
  const activeRef = useRef(active)
  const intersecting = useRef(true)
  const syncActive = useRef(() => {})
  const [rendererKind, setRendererKind] = useState<'webgl' | '2d' | 'css'>('css')
  const [revision, setRevision] = useState(0)
  scene.current = { status, inputFeatures, outputFeatures }
  activeRef.current = active

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createVoiceOrbRenderer(canvas, { maxPixelRatio: 1.6 })
    if (!renderer) {
      rendererRef.current = null
      const draw = (): void => { setRendererKind(drawVoiceOrbFallback(canvas, voiceOrbState(scene.current.status), 1.6) ? '2d' : 'css') }
      draw()
      const observer = new ResizeObserver(draw)
      observer.observe(canvas)
      return () => { observer.disconnect() }
    }
    rendererRef.current = renderer
    setRendererKind('webgl')
    renderer.setScene(voiceOrbState(scene.current.status), scene.current.inputFeatures, scene.current.outputFeatures)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyMotion = (): void => { renderer.setReducedMotion(motion.matches) }
    const sync = (): void => { renderer.setActive(activeRef.current && intersecting.current && !document.hidden) }
    syncActive.current = sync
    const resize = new ResizeObserver(renderer.resize)
    const visibility = new IntersectionObserver(entries => {
      intersecting.current = entries.some(entry => entry.isIntersecting)
      sync()
    }, { threshold: 0.01 })
    const recover = (): void => { setRevision(value => value + 1) }
    const lost = (event: Event): void => {
      event.preventDefault()
      renderer.setActive(false)
      setRendererKind('css')
      recover()
    }
    applyMotion()
    sync()
    resize.observe(canvas)
    visibility.observe(canvas)
    motion.addEventListener('change', applyMotion)
    document.addEventListener('visibilitychange', sync)
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', recover)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', recover)
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', applyMotion)
      resize.disconnect()
      visibility.disconnect()
      renderer.destroy()
      rendererRef.current = null
      syncActive.current = () => {}
    }
  }, [revision])
  useEffect(() => { syncActive.current() }, [active])
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setScene(voiceOrbState(status), inputFeatures, outputFeatures)
    else if (canvasRef.current) setRendererKind(drawVoiceOrbFallback(canvasRef.current, voiceOrbState(status), 1.6) ? '2d' : 'css')
  }, [status, inputFeatures, outputFeatures])

  return <figure className={`dshVoiceOrb is-${status}`} data-renderer={rendererKind} aria-label={label}>
    <canvas key={revision} ref={canvasRef} className="dshVoiceOrbCanvas" aria-hidden="true" />
    {rendererKind === 'css' && <span className="dshVoiceOrbFallback" aria-hidden="true" />}
    <figcaption><span aria-hidden="true" />{label}</figcaption>
  </figure>
}
