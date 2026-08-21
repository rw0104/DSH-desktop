import { describe, expect, it } from 'vitest'
import { workspaceMenuPosition } from '../src/client/WorkspaceDirectoryMenu.tsx'

describe('workspace directory context menu', () => {
  it('keeps the menu inside every viewport edge', () => {
    expect(workspaceMenuPosition(-10, -20, 1000, 700)).toEqual({ x: 8, y: 8 })
    expect(workspaceMenuPosition(990, 690, 1000, 700)).toEqual({ x: 804, y: 650 })
    expect(workspaceMenuPosition(300, 250, 1000, 700)).toEqual({ x: 300, y: 250 })
  })
})
