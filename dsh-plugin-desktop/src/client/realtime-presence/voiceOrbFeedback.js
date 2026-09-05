/** DSH audio feedback enhancement. The pm01 palette and texture remain attributed separately. */
export function voiceOrbEnergy(status, input, output) {
  if (['idle', 'ended', 'error', 'finishing'].includes(status)) return 0;
  const band = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return Math.max(band(input?.rms), band(output?.rms));
}

/** Sustained full-scale voice increases diameter by 7.5%; reduced motion uses color feedback only. */
export function voiceOrbRadius(seconds, energy, reducedMotion = false) {
  if (reducedMotion) return 0.292;
  const level = Number.isFinite(energy) ? Math.max(0, Math.min(1, energy)) : 0;
  return 0.292 * (1 + 0.075 * level + Math.sin(seconds * 1.122) * 0.008);
}
