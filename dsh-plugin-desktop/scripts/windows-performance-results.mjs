/** Release decisions over baseline and same-payload installer measurements. */

function validSummary(summary, label) {
  if (summary?.schemaVersion !== 1 || summary.runs < 5) {
    throw new Error(`${label} requires at least five benchmark runs`)
  }
  for (const field of ['medianMs', 'p95Ms', 'fileCount', 'installedBytes']) {
    if (!Number.isSafeInteger(summary[field]) || summary[field] < 0) {
      throw new Error(`${label}.${field} must be a non-negative integer`)
    }
  }
  return summary
}

/** Enforce the P0 gate and record the performance-only payload decision. */
export function evaluateWindowsPerformanceResults({ baseline, zip, staged7z, inPlace7z }) {
  const base = validSummary(baseline, 'baseline')
  const candidate = validSummary(zip, 'zip')
  const staged = validSummary(staged7z, 'staged7z')
  const inPlace = validSummary(inPlace7z, 'inPlace7z')
  const failures = []
  const relativeImprovement = 1 - candidate.medianMs / base.medianMs
  if (relativeImprovement < 0.4) failures.push(`ZIP median improvement ${(relativeImprovement * 100).toFixed(1)}% is below 40%`)
  if (candidate.medianMs > 90_000) failures.push(`ZIP median ${candidate.medianMs}ms exceeds 90000ms`)
  if (candidate.p95Ms > 120_000) failures.push(`ZIP P95 ${candidate.p95Ms}ms exceeds 120000ms`)
  if (candidate.fileCount > 18_000) failures.push(`installed files ${candidate.fileCount} exceed 18000`)
  if (candidate.installedBytes > 650 * 1024 * 1024) {
    failures.push(`installed bytes ${candidate.installedBytes} exceed 650 MiB`)
  }
  const inPlaceMedianImprovement = 1 - inPlace.medianMs / candidate.medianMs
  const inPlacePerformanceQualified = inPlaceMedianImprovement >= 0.1 && inPlace.p95Ms <= candidate.p95Ms
  return {
    schemaVersion: 1,
    passed: failures.length === 0,
    failures,
    relativeImprovement,
    samePayload: {
      zipMedianMs: candidate.medianMs,
      staged7zMedianMs: staged.medianMs,
      inPlace7zMedianMs: inPlace.medianMs,
      inPlaceMedianImprovement,
      inPlacePerformanceQualified,
    },
    productionPayload: 'zip-direct',
    decision: inPlacePerformanceQualified
      ? '7z-in-place met the performance-only threshold but remains experimental until its recovery matrix passes.'
      : '7z-in-place did not meet the adoption threshold; retain zip-direct.',
  }
}
