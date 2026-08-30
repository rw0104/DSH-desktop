import { describe, expect, it } from 'vitest'
import { clientFallbackPackageNames } from '../src/client-module-fallback.ts'

describe('packaged client module fallback', () => {
  it('finds only client package roots from the physical manifest', () => {
    expect(clientFallbackPackageNames({
      schemaVersion: 1,
      files: [
        { path: 'node_modules/@deepseek-ai/dsh-client-modules/package.json', consumers: ['client-bundles'] },
        { path: 'node_modules/@deepseek-ai/dsh-client-modules/lib/client.js', consumers: ['client-bundles'] },
        { path: 'node_modules/dsh-better-sidebar/package.json', consumers: ['client-bundles'] },
        { path: 'node_modules/openai/package.json', consumers: ['packaged-dsh-cli'] },
        { path: 'package.json', consumers: ['client-bundles'] },
      ],
    })).toEqual(['@deepseek-ai/dsh-client-modules', 'dsh-better-sidebar'])
  })

  it('rejects malformed manifest values before changing profile state', () => {
    expect(() => clientFallbackPackageNames({ schemaVersion: 2, files: [] }))
      .toThrow('schema is unsupported')
  })

  it('keeps the root package out of path-derived node_modules names', () => {
    expect(clientFallbackPackageNames({
      schemaVersion: 1,
      files: [{ path: 'package.json', consumers: ['client-bundles'] }],
    })).toEqual([])
  })
})
