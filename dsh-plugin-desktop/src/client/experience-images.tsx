import { useEffect, useRef, useState } from 'react'
import type { MessageImagesProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { exportImage } from './image-export.ts'
import { showContentMenu } from './content-menu.ts'

export function ImagePreview({ src, name, zh, onClose }: { src: string; name: string; zh: boolean; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.showModal()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await exportImage(src, name)
      setStatus(result === 'cancelled' ? '' : zh ? '图片已保存或已开始下载' : 'Image saved or download started')
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
    finally { setSaving(false) }
  }
  return <dialog ref={ref} className="dsh-image-dialog" aria-label={zh ? '原图预览' : 'Original image preview'} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dsh-image-toolbar"><span>{name}</span><button type="button" disabled={saving} onClick={() => { void save() }}>{zh ? '保存图片' : 'Save image'}</button><button type="button" aria-label={zh ? '关闭原图预览' : 'Close original image preview'} onClick={onClose}>×</button></div>
    <img className="dsh-original-image" src={src} alt={name} tabIndex={0} onKeyDown={event => {
      if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
      event.preventDefault(); event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      showContentMenu([{ label: zh ? '保存图片' : 'Save image', run: save }], { x: rect.left, y: rect.top })
    }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); showContentMenu([{ label: zh ? '保存图片' : 'Save image', run: save }], { x: event.clientX, y: event.clientY }) }} />
    <p role="status" className="dsh-image-status">{status}</p>
  </dialog>
}

/** Desktop image gallery with the product's save/context-menu actions. */
export function DesktopMessageImages({ images, loadImage, align, compact, t }: MessageImagesProps) {
  const [urls, setUrls] = useState<Record<number, string>>(() => Object.fromEntries(
    images.flatMap((image, index) => 'preview' in image ? [[index, image.preview.url]] : []),
  ))
  const [active, setActive] = useState<number | undefined>()
  useEffect(() => {
    let disposed = false
    void Promise.all(images.map(async (image, index) => {
      if (!('attachment' in image)) return
      try {
        const url = await loadImage(image.attachment)
        if (!disposed) setUrls(previous => ({ ...previous, [index]: url }))
      } catch { /* the upstream gallery owns its retry surface; omit failed images here */ }
    }))
    return () => { disposed = true }
  }, [images, loadImage])
  const zh = /[\u3400-\u9fff]/u.test(t('image.preview'))
  const title = t('image.openOriginal')
  const visible = images.flatMap((image, index) => {
    const src = urls[index]
    if (src === undefined) return []
    const name = 'preview' in image ? image.preview.name ?? t('image.label') : t('image.label')
    const dimensions = 'preview' in image && image.preview.width !== undefined && image.preview.height !== undefined
      ? { width: image.preview.width, height: image.preview.height }
      : undefined
    return [{ index, src, name, dimensions }]
  })
  if (visible.length === 0) return null
  return <>
    <div className="dsh-desktop-message-images" data-align={align} data-compact={compact || undefined}>
      {visible.map(({ index, src, name, dimensions }) => <button
        key={index}
        type="button"
        data-variant={visible.length === 1 && !compact ? 'single' : 'tile'}
        aria-label={title}
        onClick={() => setActive(index)}
      ><img src={src} alt={name} {...dimensions} /></button>)}
    </div>
    {active !== undefined && urls[active] !== undefined && <ImagePreview
      src={urls[active]}
      name={visible.find(item => item.index === active)?.name ?? t('image.label')}
      zh={zh}
      onClose={() => setActive(undefined)}
    />}
  </>
}
