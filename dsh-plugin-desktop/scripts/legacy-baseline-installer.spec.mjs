import assert from 'node:assert/strict'
import test from 'node:test'

import {
  legacyBaselineArtifactName,
  legacyBaselineBuilderArgs,
} from './legacy-baseline-installer.mjs'

test('uses a distinct compatibility-baseline installer name', () => {
  assert.equal(
    legacyBaselineArtifactName('2.0.15'),
    'DSH-Desktop-2.0.15-baseline-x64-Setup.exe',
  )
})

test('reuses the current ZIP NSIS shell without the production afterPack hook', () => {
  assert.deepEqual(legacyBaselineBuilderArgs({
    builderConfig: 'D:/repo/scripts/electron-builder.config.mjs',
    payloadDir: 'C:/temp/legacy-payload',
    outputDir: 'C:/temp/legacy-output',
  }), [
    '--config', 'D:/repo/scripts/electron-builder.config.mjs',
    '--win', 'nsis',
    '--x64',
    '--prepackaged', 'C:/temp/legacy-payload',
    '--publish', 'never',
    '--config.directories.output', 'C:/temp/legacy-output',
    '--config.win.signExecutable=false',
    '--config.npmRebuild=false',
    '--config.nsis.useZip=true',
    '--config.nsis.include=installer.nsh',
    '--config.nsis.artifactName=DSH-Desktop-2.0.15-baseline-x64-Setup.${ext}',
  ])
})
