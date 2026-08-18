/** Verify the unsigned Windows x64 NSIS installer and unpacked executable. */

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/** Paths returned after Windows installer verification succeeds. */
export interface WindowsInstallerArtifacts {
  /** Fast ZIP-backed NSIS installer path. */
  readonly setupInstallerPath: string
  /** Differential-aware NSIS updater path. */
  readonly updateInstallerPath: string
  /** External blockmap paired with the updater. */
  readonly updateBlockmapPath: string
  /** electron-builder update metadata pointing to the updater. */
  readonly latestMetadataPath: string
  /** Unpacked application executable path. */
  readonly applicationPath: string
}

/** Injectable Windows installer verification boundary. */
export interface WindowsInstallerVerificationOptions {
  /** Desktop package root containing package.json and dist. */
  readonly desktopRoot: string
  /** Product version embedded in the expected artifact name. */
  readonly version: string
}

function readVersion(desktopRoot: string): string {
  const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`desktop package at ${desktopRoot} has no valid version`)
  }
  return manifest.version
}

function assertPortableExecutable(path: string, label: string): void {
  const stat = statSync(path)
  if (!stat.isFile() || stat.size < 68) {
    throw new Error(`${label} is not a non-empty regular file: ${path}`)
  }
  const descriptor = openSync(path, 'r')
  const dosHeader = Buffer.alloc(64)
  try {
    const dosBytesRead = readSync(descriptor, dosHeader, 0, dosHeader.byteLength, 0)
    if (dosBytesRead !== dosHeader.byteLength || dosHeader.subarray(0, 2).toString('ascii') !== 'MZ') {
      throw new Error(`${label} does not have a Windows PE header: ${path}`)
    }
    const peOffset = dosHeader.readUInt32LE(0x3c)
    if (peOffset > stat.size - 4) {
      throw new Error(`${label} has an invalid Windows PE offset: ${path}`)
    }
    const signature = Buffer.alloc(4)
    const signatureBytesRead = readSync(descriptor, signature, 0, signature.byteLength, peOffset)
    if (signatureBytesRead !== signature.byteLength || !signature.equals(Buffer.from('PE\0\0'))) {
      throw new Error(`${label} does not have a Windows PE signature: ${path}`)
    }
  } finally {
    closeSync(descriptor)
  }
}

function assertNonEmptyFile(path: string, label: string): void {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const stat = statSync(path)
  if (!stat.isFile() || stat.size === 0) throw new Error(`${label} is not a non-empty file: ${path}`)
}

function verifyLatestMetadata(path: string, version: string, updateName: string): void {
  assertNonEmptyFile(path, 'latest.yml')
  let value: unknown
  try {
    value = parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(`latest.yml is not valid YAML: ${path}`, { cause })
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(`latest.yml must contain an object: ${path}`)
  }
  const metadata = value as {
    version?: unknown
    path?: unknown
    files?: Array<{ url?: unknown }>
  }
  if (metadata.version !== version) {
    throw new Error(`latest.yml must declare version ${version}: ${path}`)
  }
  if (metadata.path !== updateName) {
    throw new Error(`latest.yml must point to ${updateName}: ${path}`)
  }
  if (!Array.isArray(metadata.files) || metadata.files[0]?.url !== updateName) {
    throw new Error(`latest.yml files must point to ${updateName}: ${path}`)
  }
}

function defaultOptions(): WindowsInstallerVerificationOptions {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  return {
    desktopRoot,
    version: readVersion(desktopRoot),
  }
}

/**
 * Verify fast Setup, differential Update metadata, and the unpacked application executable.
 * @param options - Artifact root and expected product version.
 * @returns The verified artifact paths.
 */
export function verifyWindowsInstaller(
  options: WindowsInstallerVerificationOptions = defaultOptions(),
): WindowsInstallerArtifacts {
  const distDir = join(options.desktopRoot, 'dist')
  const setupName = `DSH-Desktop-${options.version}-x64-Setup.exe`
  const updateName = `DSH-Desktop-${options.version}-x64-Update.exe`
  const setupInstallerPath = join(distDir, setupName)
  const setupBlockmapPath = `${setupInstallerPath}.blockmap`
  const updateInstallerPath = join(distDir, updateName)
  const updateBlockmapPath = `${updateInstallerPath}.blockmap`
  const latestMetadataPath = join(distDir, 'latest.yml')
  const applicationPath = join(distDir, 'win-unpacked', 'DSH Desktop.exe')

  assertPortableExecutable(setupInstallerPath, 'fast Windows Setup installer')
  if (existsSync(setupBlockmapPath)) {
    throw new Error(`fast Setup installer unexpectedly has a blockmap: ${setupBlockmapPath}`)
  }
  assertPortableExecutable(updateInstallerPath, 'differential Windows Update installer')
  assertNonEmptyFile(updateBlockmapPath, 'Update blockmap')
  verifyLatestMetadata(latestMetadataPath, options.version, updateName)
  assertPortableExecutable(applicationPath, 'unpacked Windows application')
  return {
    setupInstallerPath,
    updateInstallerPath,
    updateBlockmapPath,
    latestMetadataPath,
    applicationPath,
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    const verified = verifyWindowsInstaller()
    console.log(
      `Windows installer verification passed: ${verified.setupInstallerPath} and ${verified.updateInstallerPath}`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
