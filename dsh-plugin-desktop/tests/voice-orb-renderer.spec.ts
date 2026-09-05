import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVoiceOrbRenderer, resolveVoiceOrbAudioTarget, VOICE_ORB_FRAGMENT_SHADER } from '../src/client/realtime-presence/voiceOrbRenderer.js'
import { getVoiceOrbMotionProfile, smoothVoiceOrbAudioBand } from '../src/client/realtime-presence/voiceOrbMotion.js'
import { voiceOrbEnergy, voiceOrbRadius } from '../src/client/realtime-presence/voiceOrbFeedback.js'

afterEach(() => vi.unstubAllGlobals())
function gpu(options: { fragmentFailure?: boolean; noBuffer?: boolean } = {}) {
  let now = 0, nextId = 0
  const frames = new Map<number, FrameRequestCallback>()
  const uniforms = new Map<string, number[]>()
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
    createShader: vi.fn((type: number) => ({ type })), createProgram: vi.fn(() => ({})),
    createBuffer: vi.fn((): object | null => options.noBuffer ? null : {}),
    getShaderParameter: vi.fn((shader: { type: number }) => !(options.fragmentFailure && shader.type === 2)),
    getProgramParameter: vi.fn(() => true), getShaderInfoLog: vi.fn(() => 'fixture compile error'),
    getAttribLocation: vi.fn(() => 0), getUniformLocation: vi.fn((_p: unknown, name: string) => name),
    uniform1f: (name: string, a: number) => uniforms.set(name, [a]),
    uniform2f: (name: string, a: number, b: number) => uniforms.set(name, [a, b]),
    uniform4f: (name: string, a: number, b: number, c: number, d: number) => uniforms.set(name, [a, b, c, d]),
    shaderSource: vi.fn(), compileShader: vi.fn(), attachShader: vi.fn(), linkProgram: vi.fn(), deleteShader: vi.fn(),
    deleteProgram: vi.fn(), deleteBuffer: vi.fn(), bindBuffer: vi.fn(), bufferData: vi.fn(), useProgram: vi.fn(),
    enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(), viewport: vi.fn(), clearColor: vi.fn(), clear: vi.fn(), drawArrays: vi.fn(),
  }
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('document', { hidden: false })
  vi.stubGlobal('window', { devicePixelRatio: 1, requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++nextId, fn); return nextId }, cancelAnimationFrame: (id: number) => frames.delete(id) })
  const canvas = { width: 0, height: 0, getContext: () => gl, getBoundingClientRect: () => ({ width: 240, height: 180 }) } as unknown as HTMLCanvasElement
  return { canvas, gl, frames, uniforms, tick(count = 1) { for (let i = 0; i < count; i++) { const batch = [...frames.values()]; frames.clear(); now += 16; batch.forEach(fn => fn(now)) } } }
}

describe('pm01 rendering with DSH audio feedback', () => {
  it('retains band mixing while adding visible, bounded radius feedback', () => {
    expect(VOICE_ORB_FRAGMENT_SHADER).toContain('float radius = uRadius;')
    expect(voiceOrbRadius(0, .8) / voiceOrbRadius(0, 0)).toBeCloseTo(1.06)
    expect(voiceOrbRadius(100, 1, true)).toBe(.292)
    expect(voiceOrbEnergy('user_speaking', { rms: .1 }, { rms: .8 })).toBe(.8)
    expect(voiceOrbEnergy('ended', { rms: 1 }, { rms: 1 })).toBe(0)
    const mixed = resolveVoiceOrbAudioTarget('assistant_speaking', { rms: .2, low: .2, mid: .2, high: .2 }, { rms: .8, low: .8, mid: .8, high: .8 })
    for (const [i, value] of [.8288, .8256, .8328, .836].entries()) expect(mixed[i]).toBeCloseTo(value, 8)
    expect(getVoiceOrbMotionProfile('listening')).toEqual([.045, .18, 1, .09, 0])
    expect(smoothVoiceOrbAudioBand(0, 1, 45)).toBeCloseTo(1 - Math.exp(-1), 10)
    expect(smoothVoiceOrbAudioBand(1, 0, 300)).toBeCloseTo(Math.exp(-1), 10)
  })
  it('reads continuous audio by reference, separates onset from sustained flow and cleans up', () => {
    const test = gpu()
    const renderer = createVoiceOrbRenderer(test.canvas)!
    const input = { rms: 0, peak: 0, low: 0, mid: 0, high: 0 }
    renderer.setScene('listening', input, { ...input })
    test.tick(60)
    const phase = () => test.uniforms.get('uDynamics')![0]!
    const before = phase(); test.tick(30); const quiet = phase() - before
    Object.assign(input, { rms: .8, low: .8, mid: .8, high: .8 })
    let peak = 0
    for (let i = 0; i < 20; i++) { test.tick(); peak = Math.max(peak, test.uniforms.get('uDynamics')![1]!) }
    test.tick(120)
    expect(peak).toBeGreaterThan(.1)
    expect(test.uniforms.get('uDynamics')![1]!).toBeLessThan(peak / 100)
    const loudStart = phase(); test.tick(30)
    expect(phase() - loudStart).toBeGreaterThan(quiet * 2)
    expect(test.uniforms.get('uRadius')![0]).toBeGreaterThan(.292 * 1.04)
    renderer.setReducedMotion(true); test.tick(150)
    expect(test.uniforms.get('uAudio')![0]).toBeCloseTo(.8 * .32, 3)
    expect(test.uniforms.get('uRadius')![0]).toBe(.292)
    renderer.setActive(false); expect(test.frames.size).toBe(0)
    renderer.setActive(true); expect(test.frames.size).toBe(1)
    renderer.destroy(); expect(test.frames.size).toBe(0)
    expect(test.gl.deleteBuffer).toHaveBeenCalledTimes(1)
    expect(test.gl.deleteProgram).toHaveBeenCalledTimes(1)
  })
  it('releases partially initialized GPU resources on shader or buffer failure', () => {
    const shader = gpu({ fragmentFailure: true })
    expect(createVoiceOrbRenderer(shader.canvas)).toBeNull()
    expect(shader.gl.deleteProgram).toHaveBeenCalledTimes(1)
    expect(shader.gl.deleteShader).toHaveBeenCalledTimes(2)
    const buffer = gpu({ noBuffer: true })
    expect(createVoiceOrbRenderer(buffer.canvas)).toBeNull()
    expect(buffer.gl.deleteProgram).toHaveBeenCalledTimes(1)
  })
})
