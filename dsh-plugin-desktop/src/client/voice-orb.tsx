import { useEffect, useRef } from 'react'
import type { VoiceAudioFeatures, VoiceStatus } from './voice-controller.ts'

interface VoiceOrbProps {
  status: VoiceStatus
  inputFeatures: VoiceAudioFeatures
  outputFeatures: VoiceAudioFeatures
  label: string
}

const MOTION: Record<VoiceStatus, { flow: number; response: number; scale: number }> = {
  idle: { flow: 0.12, response: 0.04, scale: 0.98 },
  requesting: { flow: 0.18, response: 0.08, scale: 1 },
  connecting: { flow: 0.24, response: 0.1, scale: 1 },
  listening: { flow: 0.2, response: 0.12, scale: 1 },
  'user-speaking': { flow: 0.38, response: 0.34, scale: 1.03 },
  thinking: { flow: 0.3, response: 0.12, scale: 1.01 },
  'assistant-speaking': { flow: 0.34, response: 0.18, scale: 1.02 },
  finishing: { flow: 0.1, response: 0.03, scale: 0.97 },
  ended: { flow: 0.06, response: 0.02, scale: 0.96 },
  error: { flow: 0.08, response: 0.02, scale: 0.98 },
}

function statusColor(status: VoiceStatus): string {
  if (status === 'error') return '#d45b55'
  if (status === 'ended' || status === 'idle') return '#8993ba'
  return '#7d84ff'
}

function drawOrb(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  energy: number,
  status: VoiceStatus,
  reducedMotion: boolean,
): void {
  const motion = MOTION[status]
  const centerX = width / 2
  const centerY = height / 2
  const baseRadius = Math.min(width, height) * 0.285 * motion.scale
  const pulse = Math.sin(elapsed * 1.1) * (reducedMotion ? 0.002 : 0.008)
  const radius = baseRadius * (1 + pulse + energy * motion.response * 0.09)
  const speed = reducedMotion ? motion.flow * 0.12 : motion.flow

  context.clearRect(0, 0, width, height)
  context.save()
  context.shadowColor = status === 'error' ? 'rgba(212, 91, 85, .18)' : 'rgba(85, 105, 255, .2)'
  context.shadowBlur = radius * (0.18 + energy * 0.1)
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  const body = context.createLinearGradient(centerX, centerY - radius, centerX, centerY + radius)
  body.addColorStop(0, statusColor(status))
  body.addColorStop(0.4, '#8a9eff')
  body.addColorStop(0.6, '#fafbff')
  body.addColorStop(1, '#e8ecff')
  context.fillStyle = body
  context.fill()
  context.shadowBlur = 0
  context.clip()

  const phase = elapsed * speed
  const clouds = [
    { x: -0.38, y: -0.12, size: 0.72, color: 'rgba(211, 221, 255, .62)', phase: 0.2 },
    { x: 0.34, y: -0.02, size: 0.82, color: 'rgba(241, 244, 255, .66)', phase: 2.1 },
    { x: -0.08, y: 0.3, size: 0.9, color: 'rgba(255, 255, 255, .78)', phase: 4.2 },
    { x: 0.48, y: 0.34, size: 0.62, color: 'rgba(224, 232, 255, .64)', phase: 5.4 },
  ]
  for (const cloud of clouds) {
    const driftX = Math.sin(phase + cloud.phase) * radius * (0.09 + energy * 0.035)
    const driftY = Math.cos(phase * 0.78 + cloud.phase) * radius * (0.07 + energy * 0.025)
    const x = centerX + radius * cloud.x + driftX
    const y = centerY + radius * cloud.y + driftY
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius * cloud.size)
    gradient.addColorStop(0, cloud.color)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = gradient
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2)
  }

  const sheen = context.createRadialGradient(
    centerX - radius * 0.24,
    centerY - radius * 0.28,
    0,
    centerX - radius * 0.24,
    centerY - radius * 0.28,
    radius * 0.8,
  )
  sheen.addColorStop(0, `rgba(255, 255, 255, ${String(0.35 + energy * 0.12)})`)
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = sheen
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2)
  context.restore()
}

export function VoiceOrb({ status, inputFeatures, outputFeatures, label }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef({ status, inputFeatures, outputFeatures })
  sceneRef.current = { status, inputFeatures, outputFeatures }

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let frame = 0
    let active = true
    let intersecting = true
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let smoothedEnergy = 0
    let lastFrame = performance.now()
    let elapsed = 0

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 1.6)
      const width = Math.max(1, Math.round(rect.width * ratio))
      const height = Math.max(1, Math.round(rect.height * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
    }
    const draw = (now: number): void => {
      frame = 0
      if (!active || !intersecting || document.hidden) return
      resize()
      const delta = Math.min(50, Math.max(0, now - lastFrame))
      lastFrame = now
      elapsed += delta / 1000
      const features = sceneRef.current.status === 'assistant-speaking' ? sceneRef.current.outputFeatures : sceneRef.current.inputFeatures
      const target = Math.max(features.rms, features.low, features.mid, features.high)
      const timeConstant = target > smoothedEnergy ? 45 : 300
      smoothedEnergy += (target - smoothedEnergy) * (1 - Math.exp(-delta / timeConstant))
      drawOrb(context, canvas.width, canvas.height, elapsed, smoothedEnergy, sceneRef.current.status, reducedMotion)
      frame = window.requestAnimationFrame(draw)
    }
    const sync = (): void => {
      active = !document.hidden
      if (active && intersecting && frame === 0) {
        lastFrame = performance.now()
        frame = window.requestAnimationFrame(draw)
      } else if ((!active || !intersecting) && frame !== 0) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motionChanged = (): void => { reducedMotion = motion.matches }
    const resizeObserver = new ResizeObserver(resize)
    const intersectionObserver = new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting)
      sync()
    }, { threshold: 0.01 })
    resizeObserver.observe(canvas)
    intersectionObserver.observe(canvas)
    motion.addEventListener?.('change', motionChanged)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      motion.removeEventListener?.('change', motionChanged)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return (
    <figure className={`dshVoiceOrb is-${status}`} aria-label={label}>
      <canvas ref={canvasRef} className="dshVoiceOrbCanvas" aria-hidden="true" />
      <span className="dshVoiceOrbFallback" aria-hidden="true" />
      <figcaption><span aria-hidden="true" />{label}</figcaption>
    </figure>
  )
}
