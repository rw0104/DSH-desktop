import assert from 'node:assert/strict'
import test from 'node:test'

import { collectProductionPackageNames } from './production-package-closure.mjs'

test('walks dependencies and optional dependencies without following dev dependencies', () => {
  const manifests = new Map([
    ['/root/package.json', { name: 'root', dependencies: { runtime: '1' }, devDependencies: { test: '1' } }],
    ['/runtime/package.json', { name: 'runtime', optionalDependencies: { native: '1' }, devDependencies: { compiler: '1' } }],
    ['/native/package.json', { name: 'native' }],
  ])
  const names = collectProductionPackageNames(
    '/root/package.json',
    name => `/${name}/package.json`,
    path => manifests.get(path),
  )
  assert.deepEqual([...names].sort(), ['native', 'root', 'runtime'])
})

test('keeps a package that is both hoisted for development and reached in production', () => {
  const manifests = new Map([
    ['/root/package.json', { name: 'root', dependencies: { shared: '1' }, devDependencies: { shared: '1' } }],
    ['/shared/package.json', { name: 'shared' }],
  ])
  const names = collectProductionPackageNames(
    '/root/package.json',
    name => `/${name}/package.json`,
    path => manifests.get(path),
  )
  assert.equal(names.has('shared'), true)
})
