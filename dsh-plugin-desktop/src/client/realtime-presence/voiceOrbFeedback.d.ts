import type { VoiceAudioFeatures } from '../voice-controller.ts'
export function voiceOrbEnergy(status: string, input: Partial<VoiceAudioFeatures>, output: Partial<VoiceAudioFeatures>): number
export function voiceOrbRadius(seconds: number, energy: number, reducedMotion?: boolean): number
