import { DESKTOP_CONTENT_BRIDGE, MAX_IMAGE_EXPORT_BYTES, imageExportName, type DesktopContentBridge } from '../content-actions-contract.ts'

/** Export the already loaded image; never revisit a provider URL. */
export async function exportImage(src: string, name: string): Promise<'saved' | 'cancelled' | 'downloaded'> {
  const url = new URL(src, location.href)
  if (url.protocol !== 'blob:' || url.origin !== location.origin) throw new Error('Image is not a local attachment')
  const response = await fetch(url.href)
  if (!response.ok) throw new Error('Image bytes could not be read')
  const blob = await response.blob()
  if (blob.size > MAX_IMAGE_EXPORT_BYTES) throw new Error('Image exceeds the export size limit')
  const bytes = await blob.arrayBuffer()
  const filename = imageExportName(name, new Uint8Array(bytes))
  const bridge = (window as unknown as Record<string, DesktopContentBridge | undefined>)[DESKTOP_CONTENT_BRIDGE]
  if (bridge) return (await bridge.saveImage(bytes, filename)).status
  const link = document.createElement('a')
  link.href = url.href
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  return 'downloaded'
}
