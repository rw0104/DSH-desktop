import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import { placeSidebarSubmenu, markSidebarMenuItems } from 'dsh-better-sidebar/src/client/menu-placement.ts'

describe('Sidebar submenu placement based on actual dimensions', () => {
  it.each([
    [20, 184, 42, 800, 600], [604, 768, 42, 800, 600],
    [20, 184, 570, 800, 600], [604, 768, 570, 800, 600],
    [12, 176, 42, 320, 260], [12, 200, 110, 240, 180],
  ])('keeps the submenu within viewport at %j', (left, right, bottom, vw, vh) => {
    const placement = placeSidebarSubmenu({ left, right, bottom }, 180, 220, vw, vh)
    expect(placement.left).toBeGreaterThanOrEqual(12)
    expect(placement.top).toBeGreaterThanOrEqual(12)
    expect(placement.left + Math.min(180, placement.maxWidth)).toBeLessThanOrEqual(vw - 12)
    expect(placement.top + Math.min(220, placement.maxHeight)).toBeLessThanOrEqual(vh - 12)
  })
  it('places a right-edge submenu to the left and caps oversized content', () => {
    expect(placeSidebarSubmenu({ left: 600, right: 780, bottom: 45 }, 180, 200, 800, 600).side).toBe('left')
    expect(placeSidebarSubmenu({ left: 100, right: 270, bottom: 45 }, 600, 700, 320, 240)).toMatchObject({ maxWidth: 296, maxHeight: 216, left: 12, top: 12 })
  })
  it('marks only owned row labels and preserves action identity and separators', () => {
    const separator = { id: 'sep', type: 'separator' } as const
    const entries = markSidebarMenuItems([{ id: 'open', label: 'Open' }, separator], 'owner-1')
    expect(entries[0]?.id).toBe('open')
    const entry = entries[0]
    if (entry === undefined || !('label' in entry) || !isValidElement(entry.label)) throw new Error('Expected an owned menu label')
    expect(entry.label.props).toMatchObject({ 'data-dsh-sidebar-menu-owner': 'owner-1', children: 'Open' })
    expect(entries[1]).toBe(separator)
  })
})
