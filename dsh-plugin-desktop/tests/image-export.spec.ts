import { describe, expect, it, vi } from 'vitest'
import { saveImageBytes } from '../src/image-export.ts'
import { imageExportName, MAX_IMAGE_EXPORT_BYTES } from '../src/content-actions-contract.ts'

const headers = [
  ['png', [137, 80, 78, 71, 13, 10, 26, 10]],
  ['jpg', [255, 216, 255, 224]],
  ['gif', [71, 73, 70, 56, 57, 97]],
  ['webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
] as const
describe('stored image export', () => {
  it.each(headers)('keeps original %s bytes and a Unicode name', async (extension, header) => {
    const bytes = new Uint8Array(header).buffer
    const choose = vi.fn(async () => 'chosen-file')
    const write = vi.fn(async () => {})
    expect(await saveImageBytes(bytes, '海边图片.wrong', { choose, write })).toEqual({ status: 'saved' })
    expect(choose).toHaveBeenCalledWith(`海边图片.${extension}`)
    expect(write).toHaveBeenCalledWith('chosen-file', new Uint8Array(bytes))
  })
  it('does not write anything after cancellation', async () => {
    const write = vi.fn(async () => {})
    expect(await saveImageBytes(new Uint8Array(headers[0][1]).buffer, 'image', { choose: async () => undefined, write })).toEqual({ status: 'cancelled' })
    expect(write).not.toHaveBeenCalled()
  })
  it('propagates write errors and rejects invalid or oversized bytes before the dialog', async () => {
    const choose = vi.fn(async () => 'out')
    const write = vi.fn(async () => { throw new Error('disk full') })
    await expect(saveImageBytes(new Uint8Array(headers[0][1]).buffer, 'image', { choose, write })).rejects.toThrow('disk full')
    choose.mockClear()
    for (const input of [new ArrayBuffer(0), new ArrayBuffer(MAX_IMAGE_EXPORT_BYTES + 1), new Uint8Array([77, 90]).buffer, 'not bytes']) {
      await expect(saveImageBytes(input, 'bad', { choose, write })).rejects.toThrow()
    }
    expect(choose).not.toHaveBeenCalled()
    expect(imageExportName('../CON.exe', new Uint8Array(headers[0][1]))).not.toContain('/')
  })
})
