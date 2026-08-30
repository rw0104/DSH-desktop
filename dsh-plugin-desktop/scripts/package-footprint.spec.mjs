import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyProductionPath,
  packageFootprintFailures,
  packageOwner,
} from './package-footprint.mjs'

test('classifies development artifacts without treating licenses or skills as docs', () => {
  assert.equal(classifyProductionPath('node_modules/pkg/dist/index.js.map').sourceMap, true)
  assert.equal(classifyProductionPath('node_modules/pkg/dist/index.d.mts').declaration, true)
  assert.equal(classifyProductionPath('node_modules/pkg/tests/unit.js').test, true)
  assert.equal(classifyProductionPath('node_modules/pkg/examples/demo.js').example, true)
  assert.equal(classifyProductionPath('node_modules/pkg/docs/guide.md').documentation, true)
  assert.equal(classifyProductionPath('node_modules/yaml/dist/doc/Document.js').documentation, false)
  assert.equal(classifyProductionPath('node_modules/jsdom/lib/generated/idl/History.js').documentation, false)
  assert.equal(classifyProductionPath('node_modules/pkg/LICENSE.md').documentation, false)
  assert.equal(classifyProductionPath('node_modules/pkg/skills/example/SKILL.md').documentation, false)
})

test('attributes nested dependency files to their closest package', () => {
  assert.equal(packageOwner('node_modules/@scope/parent/node_modules/leaf/index.js'), 'leaf')
  assert.equal(packageOwner('node_modules/@scope/pkg/lib/index.js'), '@scope/pkg')
  assert.equal(packageOwner('lib/main.js'), '(application)')
})

test('reports every hard release budget independently', () => {
  const report = {
    physical: { fileCount: 19, bytes: 101 },
    violations: {
      sourceMaps: ['a.map'],
      declarations: ['a.d.ts'],
      testPaths: ['tests/a.js'],
      examplePaths: ['examples/a.js'],
      documentationPaths: ['README.md'],
    },
  }
  const failures = packageFootprintFailures(report, {
    physicalFiles: 18,
    physicalBytes: 100,
    sourceMaps: 0,
    declarations: 0,
    testFiles: 0,
    exampleFiles: 0,
    documentationFiles: 0,
  })
  assert.equal(failures.length, 7)
})
