import { describe, expect, it } from 'vitest'
import { desktopRelaunchArguments, isolatedDevelopmentRelaunchExitCode, resolveDesktopPresentation } from '../src/desktop-experience.ts'

describe('complete desktop capabilities with independent window style', () => {
  it.each([
    ['compatibility', 'system'], ['advanced', 'native'],
  ])('maps legacy %s to the complete desktop with %s decoration', (mode, windowStyle) => {
    expect(resolveDesktopPresentation({ mode }, 'win32')).toMatchObject({ experience: 'desktop', windowStyle })
  })

  it('uses the full system-window desktop by default, including on Linux', () => {
    expect(resolveDesktopPresentation({}, 'win32')).toEqual({ experience: 'desktop', windowStyle: 'system', mode: 'compatibility' })
    expect(resolveDesktopPresentation({ windowStyle: 'native' }, 'linux')).toEqual({ experience: 'desktop', windowStyle: 'system', mode: 'compatibility' })
  })

  it('lets migrated decoration override the old geometry key without changing capabilities', () => {
    expect(resolveDesktopPresentation({ mode: 'advanced', windowStyle: 'system' })).toEqual({ experience: 'desktop', windowStyle: 'system', mode: 'compatibility' })
  })

  it('keeps the upstream diagnostic experience explicit and transient', () => {
    expect(resolveDesktopPresentation({ experience: 'upstream-diagnostic', mode: 'advanced' }, 'win32')).toEqual({ experience: 'upstream-diagnostic', windowStyle: 'system', mode: 'compatibility' })
    const args = ['app.js', '--upstream-diagnostic', '--user-data-dir=test']
    expect(desktopRelaunchArguments(args, false)).toEqual(['app.js', '--user-data-dir=test'])
    expect(desktopRelaunchArguments(args, true)).toEqual(['app.js', '--user-data-dir=test', '--upstream-diagnostic'])
    expect(args).toHaveLength(3)
  })

  it('rejects corrupted explicit settings instead of silently falling back', () => {
    expect(() => resolveDesktopPresentation({ experience: 'premium' })).toThrow('experience')
    expect(() => resolveDesktopPresentation({ windowStyle: 'advanced' })).toThrow('windowStyle')
    expect(() => resolveDesktopPresentation({ mode: 'bad' })).toThrow('legacy mode')
  })
})
it('keeps installed relaunch independent from the isolated development supervisor', () => {
  expect(isolatedDevelopmentRelaunchExitCode(true, '1', false)).toBeUndefined()
  expect(isolatedDevelopmentRelaunchExitCode(false, undefined, false)).toBeUndefined()
  expect(isolatedDevelopmentRelaunchExitCode(false, '1', false)).toBe(75)
  expect(isolatedDevelopmentRelaunchExitCode(false, '1', true)).toBe(76)
})
