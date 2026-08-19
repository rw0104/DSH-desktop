import { describe, expect, it, vi } from 'vitest'
import { WorkspaceTerminalRegistry } from '../src/workspace-terminal.ts'

describe('Workspace terminal lifecycle', () => {
  it('keeps UI and Agent terminals in one Session-scoped registry', () => {
    const registry = new WorkspaceTerminalRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)

    registry.register({ sessionId: 'session-1', source: 'ui', sourceId: 'terminal-1', cwd: 'C:\\workspace' })
    registry.applyAdapterEvent({ sessionId: 'session-1', source: 'ui', sourceId: 'terminal-1', kind: 'attached' })
    registry.applyAdapterEvent({ sessionId: 'session-1', source: 'ui', sourceId: 'terminal-1', kind: 'input', data: { text: 'dir\r' } })
    registry.applyAdapterEvent({ sessionId: 'session-1', source: 'ui', sourceId: 'terminal-1', kind: 'output', data: { text: 'ready' } })
    registry.applyAdapterEvent({ sessionId: 'session-1', source: 'ui', sourceId: 'terminal-1', kind: 'exited', data: { exitCode: 0 } })

    const terminal = registry.terminal('terminal:ui:session-1:terminal-1')
    expect(terminal).toMatchObject({ status: 'exited', exitCode: 0, transcriptBytes: 5, lastOutput: 'ready' })
    expect(registry.snapshot().events.map(event => event.kind)).toEqual(['created', 'attached', 'input', 'output', 'exited'])
    expect(listener).toHaveBeenCalled()
  })

  it('projects Agent terminal tool results and rejects cross-session updates', () => {
    const registry = new WorkspaceTerminalRegistry()
    registry.projectAgentEvent('session-1', { type: 'tool/call', data: { name: 'terminal_create', callId: 'call-1', arguments: JSON.stringify({ uuid: 'agent-1', cwd: 'C:\\repo' }) } } as any)
    registry.projectAgentEvent('session-1', { type: 'tool/result', data: { message: { source: { callId: 'call-1' }, content: [{ type: 'text', text: 'Opened terminal "agent-1".' }] } } } as any)

    expect(registry.forSession('session-1')).toHaveLength(1)
    expect(registry.forSession('session-1')[0]).toMatchObject({ source: 'agent', sourceId: 'agent-1', cwd: 'C:\\repo', status: 'running' })
    expect(() => registry.applyAdapterEvent({ sessionId: 'session-2', source: 'agent', sourceId: 'agent-1', kind: 'output', data: { text: 'forged' } })).toThrow('terminal registration')
  })
})
