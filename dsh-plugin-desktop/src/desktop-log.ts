import { appendFileSync, chmodSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'

const LOG_DIRECTORY = 'logs'
const LOG_FILENAME = 'dsh-desktop.log'
const ROTATED_FILENAME = 'dsh-desktop.log.1'
const MAX_LOG_BYTES = 5 * 1024 * 1024

export type DesktopLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DesktopLogWriter {
  readonly directory: string
  readonly filePath: string
  write(level: DesktopLogLevel, message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  close(): void
}

/** UTF-8, user-data-scoped log writer used by the Electron bootstrap and Host. */
export function createDesktopLogWriter(userDataDir: string, now: () => Date = () => new Date()): DesktopLogWriter {
  const directory = join(userDataDir, LOG_DIRECTORY)
  const filePath = join(directory, LOG_FILENAME)
  const rotatedPath = join(directory, ROTATED_FILENAME)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  try { chmodSync(directory, 0o700) } catch { /* Windows ACLs provide the effective boundary. */ }
  let closed = false
  const write = (level: DesktopLogLevel, message: string, ...args: unknown[]): void => {
    if (closed) return
    const line = `${now().toISOString()} [${level.toUpperCase()}] ${format(message, ...args)}\n`
    try {
      rotateIfNeeded(filePath, rotatedPath, Buffer.byteLength(line, 'utf8'))
      appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600 })
      try { chmodSync(filePath, 0o600) } catch { /* Windows ACLs provide the effective boundary. */ }
    } catch {
      // Logging must never take down startup or hide the original failure.
    }
  }
  return {
    directory,
    filePath,
    write,
    debug: (message, ...args) => { write('debug', message, ...args) },
    info: (message, ...args) => { write('info', message, ...args) },
    warn: (message, ...args) => { write('warn', message, ...args) },
    error: (message, ...args) => { write('error', message, ...args) },
    close: () => { closed = true },
  }
}

function rotateIfNeeded(filePath: string, rotatedPath: string, incomingBytes: number): void {
  let size = 0
  try { size = statSync(filePath).size } catch { return }
  if (size + incomingBytes <= MAX_LOG_BYTES) return
  try { renameSync(filePath, rotatedPath) } catch { /* best effort; append remains safe */ }
}

export { LOG_DIRECTORY, LOG_FILENAME, MAX_LOG_BYTES }

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopLog?: DesktopLogWriter
  }
}
