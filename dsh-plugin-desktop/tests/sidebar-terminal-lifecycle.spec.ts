import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

interface TerminalPump {
  (
    manager: { scheduleClose: (key: string, delayMs: number) => void },
    handle: {
      key: string
      transcript: string
      exited: boolean
      pty: {
        onData: (listener: (data: string) => void) => { dispose: () => void }
        onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => { dispose: () => void }
        resize: (cols: number, rows: number) => void
        write: (data: string) => void
      }
    },
    socket: FakeTerminalSocket,
    reconnectGraceMs: number,
    registry?: { applyAdapterEvent(event: { sessionId: string; source: 'ui'; sourceId: string; kind: string; cwd?: string; data?: Record<string, unknown> }): void },
  ): void
}

class FakeTerminalSocket extends EventEmitter {
  readyState = 1
  bufferedAmount = 0
  readonly sent: string[] = []
  readonly closes: Array<{ code: number | undefined; reason: string | undefined }> = []

  send(data: string): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason })
  }
}

describe('Better Sidebar UI terminal lifecycle', () => {
  it('closes the socket when the shell exits so the client can reconnect', async () => {
    const sidebar = await vi.importActual<Record<string, unknown>>('dsh-better-sidebar')
    const pumpUiTerminal = sidebar.pumpUiTerminal as TerminalPump
    const ptyEvents = new EventEmitter()
    const socket = new FakeTerminalSocket()
    const scheduleClose = vi.fn()
    const write = vi.fn()
    const handle = {
      key: 'session-1:terminal-1',
      sessionId: 'session-1',
      tabId: 'terminal-1',
      cwd: 'C:\\workspace',
      transcript: '',
      exited: false,
      pty: {
        onData: (listener: (data: string) => void) => {
          ptyEvents.on('data', listener)
          return { dispose: () => { ptyEvents.off('data', listener) } }
        },
        onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => {
          ptyEvents.on('exit', listener)
          return { dispose: () => { ptyEvents.off('exit', listener) } }
        },
        resize: vi.fn(),
        write,
      },
    }

    pumpUiTerminal({ scheduleClose }, handle, socket, 30_000)

    handle.exited = true
    ptyEvents.emit('exit', { exitCode: 0 })

    expect(socket.sent).toContain('\r\n[process exited with code 0]\r\n')
    expect(socket.closes).toEqual([{ code: 1000, reason: 'terminal process exited' }])

    socket.emit('message', Buffer.from('dir\r'))
    expect(write).not.toHaveBeenCalled()

    socket.emit('close')
    expect(scheduleClose).toHaveBeenCalledWith(handle.key, 30_000)
  })

  it('projects UI attach, input, output, exit, and disconnect into the desktop registry', async () => {
    const sidebar = await vi.importActual<Record<string, unknown>>('dsh-better-sidebar')
    const pumpUiTerminal = sidebar.pumpUiTerminal as TerminalPump
    const ptyEvents = new EventEmitter()
    const socket = new FakeTerminalSocket()
    const registry = { applyAdapterEvent: vi.fn() }
    const handle = {
      key: 'session-2:terminal-2',
      sessionId: 'session-2',
      tabId: 'terminal-2',
      cwd: 'C:\\workspace',
      transcript: '',
      exited: false,
      pty: {
        onData: (listener: (data: string) => void) => { ptyEvents.on('data', listener); return { dispose: () => { ptyEvents.off('data', listener) } } },
        onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => { ptyEvents.on('exit', listener); return { dispose: () => { ptyEvents.off('exit', listener) } } },
        resize: vi.fn(),
        write: vi.fn(),
      },
    }
    pumpUiTerminal({ scheduleClose: vi.fn() }, handle, socket, 30_000, registry)
    ptyEvents.emit('data', 'ready')
    socket.emit('message', Buffer.from('dir\r'))
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 100, rows: 30 })))
    handle.exited = true
    ptyEvents.emit('exit', { exitCode: 7 })
    socket.emit('close')
    expect(registry.applyAdapterEvent.mock.calls.map(call => call[0].kind)).toEqual(['attached', 'output', 'input', 'resized', 'output', 'exited', 'disconnected'])
  })
})
