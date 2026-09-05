/*! III.PICS Team, MIT. Adapted from pm01 realtime-presence, snapshot 5dcac08bdf9ab81c1c729ff50c5fadc8962eb45b. See THIRD_PARTY_NOTICES.md. */
const profiles = {
  idle: [0.04, 0.15, 1, 0.06, 0],
  requesting_microphone: [0.042, 0.16, 1, 0.07, 0],
  microphone_ready: [0.04, 0.15, 1, 0.06, 0],
  connecting: [0.05, 0.19, 1, 0.09, 0],
  listening: [0.045, 0.18, 1, 0.09, 0],
  user_speaking: [0.065, 0.28, 1.015, 0.28, 0],
  thinking: [0.05, 0.2, 1.005, 0.1, 0],
  assistant_speaking: [0.055, 0.22, 1.01, 0.08, 0],
  interrupted: [0.06, 0.25, 1.008, 0.18, 0],
  microphone_interrupted: [0.04, 0.14, 1, 0.04, 0],
  reconnecting: [0.05, 0.19, 1, 0.09, 0],
  finishing: [0.038, 0.13, 0.98, 0.04, 0],
  ended: [0.03, 0.1, 0.96, 0.02, 0],
  error: [0.04, 0.14, 1, 0.04, 0],
};

export const VOICE_ORB_MOTION_PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(profiles).map(([status, profile]) => [status, Object.freeze(profile)]),
  ),
);

export const VOICE_ORB_MIN_FLOW_RATE = 0.03;
export const VOICE_ORB_MAX_FLOW_RATE = 0.065;
export const VOICE_ORB_MIN_LUMINOSITY = 0.96;
export const VOICE_ORB_AUDIO_SCALE = 1;

export const VOICE_ORB_REFERENCE_PALETTE = Object.freeze({
  upper: Object.freeze([125 / 255, 132 / 255, 1]),
  middle: Object.freeze([134 / 255, 157 / 255, 1]),
  cloud: Object.freeze([250 / 255, 251 / 255, 1]),
  lower: Object.freeze([233 / 255, 237 / 255, 1]),
  aura: Object.freeze([125 / 255, 148 / 255, 1]),
});

export function getVoiceOrbMotionProfile(status) {
  return [...(VOICE_ORB_MOTION_PROFILES[status] || VOICE_ORB_MOTION_PROFILES.idle)];
}

export function smoothVoiceOrbAudioBand(current, target, deltaMs) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeTarget = Number.isFinite(target) ? target : 0;
  const timeConstantMs = safeTarget > safeCurrent ? 45 : 300;
  const amount = 1 - Math.exp(-Math.max(0, deltaMs) / timeConstantMs);
  return safeCurrent + (safeTarget - safeCurrent) * amount;
}
