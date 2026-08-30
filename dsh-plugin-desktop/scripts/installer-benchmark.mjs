/** Stable schema and statistics for isolated Windows installer measurements. */

const SCENARIOS = new Set(['fresh', 'upgrade', 'overwrite', 'uninstall'])
const REQUIRED_STRING_FIELDS = [
  'artifactSha256',
  'windowsBuild',
  'diskModel',
  'defenderSignatures',
  'scenario',
  'productVersion',
  'treeDigest',
  'isolationEvidence',
]
const REQUIRED_INTEGER_FIELDS = [
  'installPathLength',
  'elapsedMs',
  'exitCode',
  'fileCount',
  'installedBytes',
]

/** Reject a malformed benchmark record before release evidence is aggregated. */
export function validateInstallerBenchmarkRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('installer benchmark record must be an object')
  }
  if (record.schemaVersion !== 1) throw new Error('installer benchmark schemaVersion must be 1')
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      throw new Error(`installer benchmark ${field} must be a non-empty string`)
    }
  }
  if (!SCENARIOS.has(record.scenario)) throw new Error(`installer benchmark scenario is unsupported: ${record.scenario}`)
  for (const field of REQUIRED_INTEGER_FIELDS) {
    if (!Number.isSafeInteger(record[field]) || record[field] < 0) {
      throw new Error(`installer benchmark ${field} must be a non-negative safe integer`)
    }
  }
  for (const field of ['defenderEnabled', 'cleanupSucceeded']) {
    if (typeof record[field] !== 'boolean') throw new Error(`installer benchmark ${field} must be boolean`)
  }
  if (record.exitCode !== 0) throw new Error(`installer benchmark exited with ${record.exitCode}`)
  if (!record.cleanupSucceeded) throw new Error('installer benchmark cleanup did not succeed')
  return record
}

/** Nearest-rank percentile over non-negative millisecond measurements. */
export function percentile(values, probability) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('percentile requires at least one value')
  if (!(probability > 0 && probability <= 1)) throw new Error('percentile probability must be in (0, 1]')
  const sorted = values.map((value) => {
    if (!Number.isFinite(value) || value < 0) throw new Error('percentile values must be non-negative numbers')
    return value
  }).sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * probability) - 1]
}

/** Aggregate independent restored-image runs of one exact installer representation. */
export function summarizeInstallerBenchmarks(records, minimumRuns = 5) {
  if (!Array.isArray(records) || records.length < minimumRuns) {
    throw new Error(`installer benchmark requires at least ${minimumRuns} independent runs`)
  }
  const validated = records.map(validateInstallerBenchmarkRecord)
  const identityFields = ['artifactSha256', 'windowsBuild', 'diskModel', 'defenderEnabled', 'scenario']
  for (const field of identityFields) {
    const values = new Set(validated.map(record => String(record[field])))
    if (values.size !== 1) throw new Error(`installer benchmark runs disagree on ${field}`)
  }
  if (new Set(validated.map(record => record.isolationEvidence)).size !== validated.length) {
    throw new Error('installer benchmark isolationEvidence must be unique for every restored-image run')
  }
  const elapsed = validated.map(record => record.elapsedMs)
  const sorted = [...elapsed].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const medianMs = sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle]
  return {
    schemaVersion: 1,
    artifactSha256: validated[0].artifactSha256,
    windowsBuild: validated[0].windowsBuild,
    diskModel: validated[0].diskModel,
    defenderEnabled: validated[0].defenderEnabled,
    defenderSignatures: validated[0].defenderSignatures,
    scenario: validated[0].scenario,
    runs: validated.length,
    medianMs,
    p95Ms: percentile(elapsed, 0.95),
    minMs: sorted[0],
    maxMs: sorted.at(-1),
    fileCount: Math.max(...validated.map(record => record.fileCount)),
    installedBytes: Math.max(...validated.map(record => record.installedBytes)),
    productVersion: validated[0].productVersion,
    treeDigests: [...new Set(validated.map(record => record.treeDigest))].sort(),
  }
}
