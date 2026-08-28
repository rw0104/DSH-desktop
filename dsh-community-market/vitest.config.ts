import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.tsx'],
    // npm lockfile rollback fixtures touch many files on Windows and can exceed
    // Vitest's five-second default under Defender/NTFS contention.
    maxWorkers: process.platform === 'win32' ? 2 : undefined,
    testTimeout: process.platform === 'win32' ? 30_000 : undefined,
  },
})
