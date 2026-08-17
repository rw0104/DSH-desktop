import { dirname, join } from 'node:path'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readVisionConsent,
  resolveVisionConsent,
  writeVisionConsent,
} from '../src/vision-consent.ts'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function temporaryState(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-vision-consent-'))
  homes.push(home)
  return join(home, 'privacy', 'vision-consent.json')
}

describe('Vision Toolkit consent', () => {
  it('keeps development launches enabled without prompting', async () => {
    const prompt = vi.fn(async () => false)
    await expect(resolveVisionConsent({
      isPackaged: false,
      statePath: temporaryState(),
      prompt,
    })).resolves.toBe(true)
    expect(prompt).not.toHaveBeenCalled()
  })

  it('persists an accepted packaged decision and does not prompt again', async () => {
    const statePath = temporaryState()
    const prompt = vi.fn(async () => true)
    await expect(resolveVisionConsent({ isPackaged: true, statePath, prompt })).resolves.toBe(true)
    await expect(resolveVisionConsent({
      isPackaged: true,
      statePath,
      prompt: vi.fn(async () => false),
    })).resolves.toBe(true)
    expect(prompt).toHaveBeenCalledWith({ firstRun: true })
    expect(readVisionConsent(statePath)).toBe('accepted')
  })

  it('can reconsider a declined decision on a later packaged launch', async () => {
    const statePath = temporaryState()
    const firstPrompt = vi.fn(async () => false)
    await expect(resolveVisionConsent({ isPackaged: true, statePath, prompt: firstPrompt })).resolves.toBe(false)
    const secondPrompt = vi.fn(async () => true)
    await expect(resolveVisionConsent({ isPackaged: true, statePath, prompt: secondPrompt })).resolves.toBe(true)
    expect(secondPrompt).toHaveBeenCalledWith({ firstRun: false })
  })

  it('ignores malformed state and writes a versioned atomic decision', () => {
    const statePath = temporaryState()
    mkdirSync(dirname(statePath), { recursive: true })
    writeFileSync(statePath, '{"version":99,"decision":"accepted"}\n')
    expect(readVisionConsent(statePath)).toBeUndefined()
    writeVisionConsent(statePath, 'declined', () => '2026-08-17T00:00:00.000Z')
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual({
      version: 1,
      decision: 'declined',
      acknowledgedAt: '2026-08-17T00:00:00.000Z',
    })
  })
})
