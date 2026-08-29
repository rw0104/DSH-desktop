import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { DesktopShellMode } from './runtime.ts'

const STATE_VERSION = 1
const STATE_ROOT = 'profile-preferences'
const STATE_FILE = 'state.json'
const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600
const MAX_STATE_BYTES = 2048
const HASH_PATTERN = /^[0-9a-f]{64}$/u

export interface DesktopProfilePreferences {
  readonly mode: DesktopShellMode
  readonly port: number
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export interface DesktopProfilePreferencesStateV1 extends DesktopProfilePreferences {
  readonly version: 1
  readonly profileHash: string
  readonly recordedAt: string
}

export const desktopProfilePreferencesConstants = Object.freeze({
  rootDirectory: STATE_ROOT,
  stateFilename: STATE_FILE,
  maxBytes: MAX_STATE_BYTES,
})

function absolute(label: string, value: string): string {
  if (!isAbsolute(value) || value.includes('\0')) {
    throw new TypeError(`dsh-plugin-desktop: ${label} must be an absolute path without NUL`)
  }
  return resolve(value)
}

export function desktopProfilePreferencesProfileHash(profileDir: string): string {
  return createHash('sha256').update(absolute('Profile directory', profileDir)).digest('hex')
}

export function desktopProfilePreferencesStatePath(userDataDir: string, profileDir: string): string {
  return join(absolute('user-data directory', userDataDir), STATE_ROOT, desktopProfilePreferencesProfileHash(profileDir), STATE_FILE)
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE })
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`dsh-plugin-desktop: Profile preference directory is not a real directory: ${path}`)
  if (process.platform !== 'win32' && (stat.mode & 0o777) !== DIRECTORY_MODE) chmodSync(path, DIRECTORY_MODE)
}

function assertStateTarget(path: string): void {
  if (!existsSync(path)) return
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`dsh-plugin-desktop: Profile preference state must be a regular file: ${path}`)
  if (stat.size > MAX_STATE_BYTES) throw new Error(`dsh-plugin-desktop: Profile preference state exceeds ${MAX_STATE_BYTES} bytes`)
  if (process.platform !== 'win32' && (stat.mode & 0o777) !== FILE_MODE) chmodSync(path, FILE_MODE)
}

function validate(value: unknown, profileHash: string): DesktopProfilePreferencesStateV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('dsh-plugin-desktop: Profile preference state must be an object')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== 'logLevel,mode,port,profileHash,recordedAt,version') throw new Error('dsh-plugin-desktop: Profile preference state has unsupported fields')
  if (record.version !== STATE_VERSION || record.profileHash !== profileHash || !HASH_PATTERN.test(profileHash)) throw new Error('dsh-plugin-desktop: Profile preference state identity does not match')
  if (record.mode !== 'compatibility' && record.mode !== 'advanced') throw new Error('dsh-plugin-desktop: Profile preference mode is invalid')
  if (typeof record.port !== 'number' || !Number.isInteger(record.port) || record.port < 0 || record.port > 65_535) throw new Error('dsh-plugin-desktop: Profile preference port is invalid')
  if (record.logLevel !== 'debug' && record.logLevel !== 'info' && record.logLevel !== 'warn' && record.logLevel !== 'error') throw new Error('dsh-plugin-desktop: Profile preference log level is invalid')
  if (typeof record.recordedAt !== 'string' || new Date(record.recordedAt).toISOString() !== record.recordedAt) throw new Error('dsh-plugin-desktop: Profile preference recordedAt is invalid')
  return Object.freeze({
    version: 1,
    profileHash,
    mode: record.mode,
    port: record.port,
    logLevel: record.logLevel,
    recordedAt: record.recordedAt,
  }) as DesktopProfilePreferencesStateV1
}

export function readDesktopProfilePreferences(userDataDir: string, profileDir: string): DesktopProfilePreferencesStateV1 | undefined {
  const path = desktopProfilePreferencesStatePath(userDataDir, profileDir)
  if (!existsSync(path)) return undefined
  assertStateTarget(path)
  const text = readFileSync(path, 'utf8')
  if (Buffer.byteLength(text, 'utf8') > MAX_STATE_BYTES) throw new Error(`dsh-plugin-desktop: Profile preference state exceeds ${MAX_STATE_BYTES} bytes`)
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('dsh-plugin-desktop: Profile preference state is not valid JSON') }
  return validate(value, desktopProfilePreferencesProfileHash(profileDir))
}

export async function writeDesktopProfilePreferences(
  userDataDir: string,
  profileDir: string,
  preferences: DesktopProfilePreferences,
): Promise<DesktopProfilePreferencesStateV1> {
  const profileHash = desktopProfilePreferencesProfileHash(profileDir)
  if (preferences.mode !== 'compatibility' && preferences.mode !== 'advanced') throw new TypeError('dsh-plugin-desktop: Profile preference mode is invalid')
  if (!Number.isInteger(preferences.port) || preferences.port < 0 || preferences.port > 65_535) throw new TypeError('dsh-plugin-desktop: Profile preference port is invalid')
  if (!['debug', 'info', 'warn', 'error'].includes(preferences.logLevel)) throw new TypeError('dsh-plugin-desktop: Profile preference log level is invalid')
  const path = desktopProfilePreferencesStatePath(userDataDir, profileDir)
  const directory = resolve(path, '..')
  ensureDirectory(resolve(directory, '..'))
  ensureDirectory(directory)
  assertStateTarget(path)
  const state = validate({ version: 1, profileHash, ...preferences, recordedAt: new Date().toISOString() }, profileHash)
  const temporary = join(directory, `.${STATE_FILE}.${process.pid}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: FILE_MODE, flag: 'wx' })
    if (process.platform !== 'win32') chmodSync(temporary, FILE_MODE)
    renameSync(temporary, path)
  } finally {
    try { unlinkSync(temporary) } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause }
  }
  return state
}

export async function clearDesktopProfilePreferences(userDataDir: string, profileDir: string): Promise<void> {
  const path = desktopProfilePreferencesStatePath(userDataDir, profileDir)
  if (!existsSync(path)) return
  assertStateTarget(path)
  unlinkSync(path)
}
