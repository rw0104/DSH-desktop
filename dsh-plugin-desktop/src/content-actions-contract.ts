export const DESKTOP_CONTENT_BRIDGE = 'dshDesktopContent'
export const DESKTOP_SAVE_IMAGE_CHANNEL = 'dsh-desktop:save-image'
export const DESKTOP_OPEN_CONTENT_LINK_CHANNEL = 'dsh-desktop:open-content-link'
export const MAX_IMAGE_EXPORT_BYTES = 32 * 1024 * 1024
export type ImageSaveResult = { status: 'saved' | 'cancelled' }
export interface DesktopContentBridge {
  saveImage(bytes: ArrayBuffer, name: string): Promise<ImageSaveResult>
  openLink(url: string): Promise<void>
}

/** Derive the extension from bytes rather than an untrusted filename. */
export function imageExtension(bytes: Uint8Array): string {
  const starts = (header: readonly number[]) => header.every((value, index) => bytes[index] === value)
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'png'
  if (starts([255, 216, 255])) return 'jpg'
  if (starts([71, 73, 70, 56]) && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return 'gif'
  if (starts([82, 73, 70, 70]) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return 'webp'
  throw new Error('Unsupported image bytes (PNG, JPEG, WebP or GIF required)')
}

export function imageExportName(name: string, bytes: Uint8Array): string {
  const extension = imageExtension(bytes)
  const base = name.replace(/\.[^.]*$/u, '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, '_').replace(/[. ]+$/u, '').slice(0, 140) || 'image'
  return `${/^(con|prn|aux|nul|com\d|lpt\d)$/iu.test(base) ? '_' : ''}${base}.${extension}`
}
