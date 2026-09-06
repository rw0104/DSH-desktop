import { useEffect, useRef, useState } from 'react'
import type { AttachmentPreviewProps } from '@deepseek-ai/dsh-client-ui-attachment/client'
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

/** Keep the upstream rail/gallery intact; enhance only its original-image preview. */
export function DesktopImagePreview({ src, alt, labels, onClose }: AttachmentPreviewProps) {
  return <ImagePreview src={src} name={alt} zh={/[\u3400-\u9fff]/u.test(labels.dialog)} onClose={onClose} />
}
