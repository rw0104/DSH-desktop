import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDesktopLogWriter } from '../src/desktop-log.ts'

describe('desktop file log', () => {
  it('writes UTF-8 records below the Electron user-data logs directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-log-'))
    try {
      const log = createDesktopLogWriter(root, () => new Date('2026-08-19T12:00:00.000Z'))
      log.info('profile=%s started', '桌面')
      log.warn('warning %d', 2)
      log.error('failure: %s', 'repair')
      expect(log.directory).toBe(join(root, 'logs'))
      expect(log.filePath).toBe(join(root, 'logs', 'dsh-desktop.log'))
      expect(existsSync(log.filePath)).toBe(true)
      expect(readFileSync(log.filePath, 'utf8')).toBe([
        '2026-08-19T12:00:00.000Z [INFO] profile=桌面 started',
        '2026-08-19T12:00:00.000Z [WARN] warning 2',
        '2026-08-19T12:00:00.000Z [ERROR] failure: repair',
        '',
      ].join('\n'))
      expect(statSync(log.filePath).size).toBeGreaterThan(0)
      log.close()
      log.info('ignored after close')
      expect(readFileSync(log.filePath, 'utf8')).not.toContain('ignored after close')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
