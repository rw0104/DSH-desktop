import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FOOTPRINT_LIMITS = Object.freeze({
  installerMiB: 220,
  unpackedMiB: 650,
  privateMemoryMiB: 512,
  workingSetMiB: 700,
})

const desktopRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const requireArtifacts = process.argv.includes('--require-artifacts')
const memoryReportPath = process.env.DSH_PACKAGED_MEMORY_REPORT
const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))

export function assertWithinLimit(label, value, limit) {
  if (value > limit) throw new Error(`${label} is ${value} MiB, above the ${limit} MiB budget`)
}

function directoryBytes(path) {
  return walkFiles(path).reduce((total, file) => total + statSync(file).size, 0)
}

function walkFiles(path) {
  const files = []
  const entries = readdirSync(path, { withFileTypes: true })
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(child))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

function mib(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(1))
}

function verifyArtifacts() {
  const setupInstallerPath = join(desktopRoot, 'dist', `DSH-Desktop-${manifest.version}-x64-Setup.exe`)
  const updateInstallerPath = join(desktopRoot, 'dist', `DSH-Desktop-${manifest.version}-x64-Update.exe`)
  const unpackedPath = join(desktopRoot, 'dist', 'win-unpacked')
  if (!existsSync(setupInstallerPath) || !existsSync(updateInstallerPath) || !existsSync(unpackedPath)) {
    if (requireArtifacts) throw new Error('Windows package artifacts are missing; run dist:win first')
    return { skipped: true }
  }
  const setupInstallerMiB = mib(statSync(setupInstallerPath).size)
  const updateInstallerMiB = mib(statSync(updateInstallerPath).size)
  const unpackedMiB = mib(directoryBytes(unpackedPath))
  assertWithinLimit('Windows Setup installer', setupInstallerMiB, FOOTPRINT_LIMITS.installerMiB)
  assertWithinLimit('Windows Update installer', updateInstallerMiB, FOOTPRINT_LIMITS.installerMiB)
  assertWithinLimit('Windows unpacked directory', unpackedMiB, FOOTPRINT_LIMITS.unpackedMiB)
  return { setupInstallerMiB, updateInstallerMiB, unpackedMiB }
}

function verifyMemoryReport() {
  if (memoryReportPath === undefined || memoryReportPath === '') return { skipped: true }
  if (!existsSync(memoryReportPath)) throw new Error(`Windows memory report is missing: ${memoryReportPath}`)
  const report = JSON.parse(readFileSync(memoryReportPath, 'utf8'))
  assertWithinLimit('Packaged Private Memory', report.totalPrivateMiB, FOOTPRINT_LIMITS.privateMemoryMiB)
  assertWithinLimit('Packaged Working Set', report.totalWorkingSetMiB, FOOTPRINT_LIMITS.workingSetMiB)
  return {
    privateMemoryMiB: report.totalPrivateMiB,
    workingSetMiB: report.totalWorkingSetMiB,
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = { artifacts: verifyArtifacts(), memory: verifyMemoryReport() }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
