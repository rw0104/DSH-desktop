export const VOICE_ORB_MOTION_PROFILES: Readonly<Record<string, readonly number[]>>
export const VOICE_ORB_MIN_FLOW_RATE: number
export const VOICE_ORB_MAX_FLOW_RATE: number
export function getVoiceOrbMotionProfile(status: string): number[]
export function smoothVoiceOrbAudioBand(current: number, target: number, deltaMs: number): number
