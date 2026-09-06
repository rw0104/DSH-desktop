import { imageExportName, MAX_IMAGE_EXPORT_BYTES, type ImageSaveResult } from './content-actions-contract.ts'

export interface ImageExportTarget {
  choose(name: string): Promise<string | undefined>
  write(path: string, bytes: Uint8Array): Promise<void>
}

/** Validate before asking for a destination. Cancellation performs no write. */
export async function saveImageBytes(bytes: unknown, name: unknown, target: ImageExportTarget): Promise<ImageSaveResult> {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_EXPORT_BYTES
    || typeof name !== 'string' || name.length > 1024) throw new Error('Invalid image export')
  const data = new Uint8Array(bytes)
  const filename = imageExportName(name, data)
  const path = await target.choose(filename)
  if (path === undefined) return { status: 'cancelled' }
  await target.write(path, data)
  return { status: 'saved' }
}
