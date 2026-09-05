import { useEffect, useRef, useState } from 'react'
import type { VoiceAudioFeatures, VoiceStatus } from './voice-controller.ts'
import { createVoiceOrbRenderer, type VoiceOrbRenderer } from './realtime-presence/voiceOrbRenderer.js'
import { drawVoiceOrbFallback } from './realtime-presence/voiceOrbFallback.js'
import { voiceOrbEnergy, voiceOrbRadius } from './realtime-presence/voiceOrbFeedback.js'
import { smoothVoiceOrbAudioBand } from './realtime-presence/voiceOrbMotion.js'

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

/** pm01 texture with DSH envelope feedback in WebGL, 2D and CSS, with one visibility lifecycle. */
export function VoiceOrb({ status, inputFeatures, outputFeatures, label, active = true }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLCanvasElement>(null)
  const figureRef = useRef<HTMLElement>(null)
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
    let renderer = createVoiceOrbRenderer(canvas, { maxPixelRatio: 1.6 })
    rendererRef.current = renderer
    let fallbackFrame = 0, lastFrame = performance.now(), energy = 0, elapsed = 0
    let fallbackKind: '2d' | 'css' = fallbackRef.current?.getContext('2d') ? '2d' : 'css'
    setRendererKind(renderer ? 'webgl' : fallbackKind)
    renderer?.setScene(voiceOrbState(scene.current.status), scene.current.inputFeatures, scene.current.outputFeatures)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const visible = (): boolean => activeRef.current && intersecting.current && !document.hidden
    const drawFallback = (now: number): void => {
      fallbackFrame = 0
      if (renderer || !visible()) return
      const delta = Math.min(50, Math.max(0, now - lastFrame)); lastFrame = now; elapsed += delta / 1000
      const current = scene.current
      energy = smoothVoiceOrbAudioBand(energy, voiceOrbEnergy(voiceOrbState(current.status), current.inputFeatures, current.outputFeatures), delta)
      const radius = voiceOrbRadius(elapsed, energy, motion.matches)
      const figure = figureRef.current
      figure?.style.setProperty('--dsh-voice-scale', String(radius / .292))
      figure?.style.setProperty('--dsh-voice-brightness', String(1 + energy * .28))
      if (fallbackKind === '2d' && fallbackRef.current && !drawVoiceOrbFallback(fallbackRef.current, voiceOrbState(current.status), 1.6, { radius, energy })) {
        fallbackKind = 'css'; setRendererKind('css')
      }
      fallbackFrame = requestAnimationFrame(drawFallback)
    }
    const applyMotion = (): void => { renderer?.setReducedMotion(motion.matches) }
    const sync = (): void => {
      renderer?.setActive(visible())
      if (!visible() || renderer) { cancelAnimationFrame(fallbackFrame); fallbackFrame = 0 }
      else if (!fallbackFrame) { lastFrame = performance.now(); fallbackFrame = requestAnimationFrame(drawFallback) }
    }
    syncActive.current = sync
    const resize = new ResizeObserver(() => { renderer?.resize() })
    const visibility = new IntersectionObserver(entries => {
      intersecting.current = entries.some(entry => entry.isIntersecting)
      sync()
    }, { threshold: 0.01 })
    const recover = (): void => { setRevision(value => value + 1) }
    const lost = (event: Event): void => {
      event.preventDefault()
      renderer?.destroy(); renderer = null; rendererRef.current = null
      setRendererKind(fallbackKind)
      sync()
    }
    applyMotion()
    sync()
    resize.observe(canvas)
    visibility.observe(figureRef.current!)
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
      cancelAnimationFrame(fallbackFrame)
      renderer?.destroy()
      rendererRef.current = null
      syncActive.current = () => {}
    }
  }, [revision])
  useEffect(() => { syncActive.current() }, [active])
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setScene(voiceOrbState(status), inputFeatures, outputFeatures)
  }, [status, inputFeatures, outputFeatures])

  return <figure ref={figureRef} className={`dshVoiceOrb is-${status}`} data-renderer={rendererKind} aria-label={label}>
    <canvas ref={canvasRef} className="dshVoiceOrbCanvas dshVoiceOrbGpu" aria-hidden="true" />
    <canvas ref={fallbackRef} className="dshVoiceOrbCanvas dshVoiceOrb2d" aria-hidden="true" />
    {rendererKind === 'css' && <span className="dshVoiceOrbFallback" aria-hidden="true" />}
    <figcaption><span aria-hidden="true" />{label}</figcaption>
  </figure>
}
