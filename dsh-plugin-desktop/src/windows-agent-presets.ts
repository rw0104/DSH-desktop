/** Windows guard for upstream agent presets that require unsupported PTY inspection. */

import type { Context } from '@deepseek-ai/cordis'
import AgentPresets, { type AgentPreset } from '@deepseek-ai/dsh-agent-presets'

/** Local errors preserve the Desktop policy's stable test and diagnostic face. */
export class UnknownPresetError extends Error {
  constructor(readonly id: string, readonly available: readonly string[]) {
    super(`unknown agent preset ${JSON.stringify(id)} (available: ${available.join(', ') || 'none'})`)
    this.name = 'UnknownPresetError'
  }
}

export class PresetExistsError extends Error {
  constructor(readonly id: string) {
    super(`agent preset already exists: ${JSON.stringify(id)}`)
    this.name = 'PresetExistsError'
  }
}

/** Upstream preset whose persistent Bash terminal cannot run on win32. */
export const WINDOWS_UNSUPPORTED_PRESET = 'minimal'

/** Upstream preset that selects the supported PowerShell toolchain on win32. */
export const WINDOWS_SAFE_PRESET = 'standard'

/** Agent-preset roster that keeps Windows sessions on a supported shell composition. */
export class WindowsAgentPresets extends AgentPresets {
  override get defaultId(): string {
    const id = super.defaultId
    return id === WINDOWS_UNSUPPORTED_PRESET ? WINDOWS_SAFE_PRESET : id
  }

  override async list(): Promise<AgentPreset[]> {
    return (await super.list()).filter(preset => preset.id !== WINDOWS_UNSUPPORTED_PRESET)
  }

  override async resolve(id?: string): Promise<AgentPreset> {
    if (id !== WINDOWS_UNSUPPORTED_PRESET) return await super.resolve(id)
    const preset = (await super.list()).find(candidate => candidate.id === id)
    if (preset !== undefined) return preset
    throw new UnknownPresetError(id, (await this.list()).map(candidate => candidate.id))
  }

  override async recompose(agentCtx: Context, id: string): Promise<AgentPreset> {
    if (id === WINDOWS_UNSUPPORTED_PRESET) {
      throw new UnknownPresetError(id, (await this.list()).map(candidate => candidate.id))
    }
    return await super.recompose(agentCtx, id)
  }

  override async copy(from: string, id: string, name?: string): Promise<void> {
    if (id === WINDOWS_UNSUPPORTED_PRESET) throw new PresetExistsError(id)
    await super.copy(from, id, name)
  }
}

export default WindowsAgentPresets
