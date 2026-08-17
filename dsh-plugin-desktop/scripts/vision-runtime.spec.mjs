import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSupportedPython,
  parsePythonVersion,
  probeVisionRuntime,
} from './verify-vision-runtime.mjs'

test('parses Python versions from stdout and stderr', () => {
  assert.deepEqual(parsePythonVersion('Python 3.12.4\n'), { major: 3, minor: 12, patch: 4 })
  assert.deepEqual(parsePythonVersion('Python 3.10.14\n'), { major: 3, minor: 10, patch: 14 })
  assert.equal(parsePythonVersion('not python'), undefined)
})

test('accepts Python 3.11 and newer only', () => {
  assert.equal(isSupportedPython({ major: 3, minor: 11, patch: 0 }), true)
  assert.equal(isSupportedPython({ major: 3, minor: 10, patch: 9 }), false)
  assert.equal(isSupportedPython({ major: 4, minor: 0, patch: 0 }), true)
})

test('reports Python readiness independently from optional browser readiness', () => {
  const report = probeVisionRuntime({
    platform: 'win32',
    environment: { DSH_VISION_PYTHON: 'python.exe' },
    browserPaths: ['C:\\Chrome\\chrome.exe'],
    browserExists: () => false,
    run: () => ({ status: 0, stdout: 'Python 3.12.4\\n', stderr: '' }),
  })
  assert.equal(report.overall, 'ok')
  assert.equal(report.python.status, 'ok')
  assert.equal(report.browser.status, 'warning')
})

test('fails runtime readiness for an unsupported Python version', () => {
  const report = probeVisionRuntime({
    environment: { DSH_VISION_PYTHON: 'python' },
    browserPaths: [],
    browserExists: () => false,
    run: () => ({ status: 0, stdout: 'Python 3.10.9\\n', stderr: '' }),
  })
  assert.equal(report.overall, 'error')
  assert.equal(report.python.detail, 'Python 3.11 or newer is required')
})
