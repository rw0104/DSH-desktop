import { describe, expect, it } from 'vitest'
import {
  parsePhysicalRuntimePolicy,
  selectPhysicalRuntimeFiles,
  type PhysicalArchiveEntry,
} from '../scripts/physical-runtime.ts'

const entries: PhysicalArchiveEntry[] = [
  { path: 'package.json', size: 1, unpacked: true, executable: false },
  { path: 'lib/main.js', size: 1, unpacked: true, executable: false },
  { path: 'node_modules/root/package.json', size: 1, unpacked: false, executable: false },
  { path: 'node_modules/root/index.js', size: 1, unpacked: false, executable: false },
  { path: 'node_modules/root/node_modules/nested/package.json', size: 1, unpacked: false, executable: false },
  { path: 'node_modules/root/node_modules/nested/index.js', size: 1, unpacked: false, executable: false },
  { path: 'node_modules/shared/package.json', size: 1, unpacked: false, executable: false },
  { path: 'node_modules/shared/index.js', size: 1, unpacked: false, executable: false },
  { path: 'node_modules/native/addon.node', size: 1, unpacked: true, executable: false },
  { path: 'node_modules/unrelated/package.json', size: 1, unpacked: false, executable: false },
]

const files = new Map<string, string>([
  ['node_modules/root/package.json', JSON.stringify({
    dependencies: { nested: '1.0.0', shared: '1.0.0' },
  })],
  ['node_modules/root/node_modules/nested/package.json', JSON.stringify({})],
  ['node_modules/shared/package.json', JSON.stringify({})],
])

describe('physical runtime projection', () => {
  it('materializes package closure, explicit paths, and native ASAR entries only', async () => {
    const policy = parsePhysicalRuntimePolicy({
      schemaVersion: 1,
      consumers: [
        { id: 'desktop', kind: 'path-prefix', entries: ['package.json', 'lib/'], reason: 'subprocess' },
        { id: 'cli', kind: 'package-closure', roots: ['root'], reason: 'CLI' },
        { id: 'native', kind: 'asar-unpacked', reason: 'native' },
      ],
    })
    const result = await selectPhysicalRuntimeFiles(
      entries,
      policy,
      async path => Buffer.from(files.get(path) ?? '{}'),
    )
    expect([...result.selected.keys()].sort()).toEqual([
      'lib/main.js',
      'node_modules/native/addon.node',
      'node_modules/root/index.js',
      'node_modules/root/node_modules/nested/index.js',
      'node_modules/root/node_modules/nested/package.json',
      'node_modules/root/package.json',
      'node_modules/shared/index.js',
      'node_modules/shared/package.json',
      'package.json',
    ])
    expect(result.selected.has('node_modules/unrelated/package.json')).toBe(false)
    expect(result.selected.get('package.json')).toEqual(new Set(['desktop', 'native']))
  })

  it('requires reasons and unique consumer ids', () => {
    expect(() => parsePhysicalRuntimePolicy({
      schemaVersion: 1,
      consumers: [{ id: 'cli', kind: 'package-tree', roots: ['pnpm'], reason: '' }],
    })).toThrow('requires a reason')
    expect(() => parsePhysicalRuntimePolicy({
      schemaVersion: 1,
      consumers: [
        { id: 'cli', kind: 'package-tree', roots: ['pnpm'], reason: 'one' },
        { id: 'cli', kind: 'asar-unpacked', reason: 'two' },
      ],
    })).toThrow('unique')
  })
})
