import type { VoiceAudioFeatures } from '../voice-controller.ts'
export const VOICE_ORB_FRAGMENT_SHADER: string
export const VOICE_ORB_ASSISTANT_INPUT_WEIGHTS: readonly number[]
export interface VoiceOrbRenderer {
  resize(): void
  setActive(value: boolean): void
  setReducedMotion(value: boolean): void
  setScene(status: string, input: VoiceAudioFeatures, output: VoiceAudioFeatures): void
  destroy(): void
}
export function createVoiceOrbRenderer(canvas: HTMLCanvasElement, options?: { maxPixelRatio?: number }): VoiceOrbRenderer | null
export function resolveVoiceOrbAudioTarget(status: string, input: Partial<VoiceAudioFeatures>, output: Partial<VoiceAudioFeatures>): number[]
