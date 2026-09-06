import { useEffect, useRef, useState } from 'react'
import type { ComposerAttachmentsProps, MessageImageLoader, MessageImageSource } from '@deepseek-ai/dsh-client-ui-conversation/client'
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

function ImageTile({ source, load, zh }: { source: MessageImageSource; load: MessageImageLoader; zh: boolean }) {
  const [src, setSrc] = useState('preview' in source ? source.preview.url : load.peek?.(source.attachment) ?? '')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const name = ('preview' in source ? source.preview.name : source.attachment.name) || (zh ? '图片' : 'image')
  useEffect(() => {
    let active = true
    setError('')
    if ('preview' in source) { setSrc(source.preview.url); return }
    setSrc(load.peek?.(source.attachment) ?? '')
    void load(source.attachment).then(url => { if (active) setSrc(url) }, error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [source, load])
  return <div className="dsh-image-tile">
    {src ? <button type="button" aria-label={`${zh ? '打开原图' : 'Open original image'}: ${name}`} onClick={() => setOpen(true)} onKeyDown={event => {
      if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
      event.preventDefault(); event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      showContentMenu([{ label: zh ? '保存图片' : 'Save image', run: async () => { await exportImage(src, name) } }], { x: rect.left, y: rect.bottom }, error => setError(String(error)))
    }} onContextMenu={event => {
      event.preventDefault(); event.stopPropagation()
      showContentMenu([{ label: zh ? '保存图片' : 'Save image', run: async () => { await exportImage(src, name) } }], { x: event.clientX, y: event.clientY }, error => setError(String(error)))
    }}><img src={src} alt={name} /></button> : <span role="status">{error || (zh ? '加载图片…' : 'Loading image…')}</span>}
    {error && <span role="alert">{error}</span>}
    {open && src && <ImagePreview src={src} name={name} zh={zh} onClose={() => setOpen(false)} />}
  </div>
}

export function DesktopMessageImages({ images, loadImage, align, t }: MessageImagesProps) {
  const zh = t('image.original') !== 'Original image'
  return <div className="dsh-images" data-align={align}>{images.map((source, index) => <ImageTile key={'attachment' in source ? source.attachment.attachmentId : source.preview.url + index} source={source} load={loadImage} zh={zh} />)}</div>
}

export function DesktopComposerAttachments({ attachments, canAcceptDrop, onAddImages, onRemoveImage, t }: ComposerAttachmentsProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const zh = t('image.original') !== 'Original image'
  const current = attachments.find(item => item.id === preview)
  useEffect(() => {
    const drop = (event: DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return
      // Sidebar and workspace-folder drop keep their existing ownership.
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest('[data-dsh-conversation-drop-target]')) return
      event.preventDefault()
      if (canAcceptDrop) onAddImages([...event.dataTransfer.files])
    }
    const over = (event: DragEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-dsh-conversation-drop-target]') && event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    document.addEventListener('drop', drop)
    document.addEventListener('dragover', over)
    return () => { document.removeEventListener('drop', drop); document.removeEventListener('dragover', over) }
  }, [canAcceptDrop, onAddImages])
  return <><div className="dsh-images">{attachments.map(item => <div className="dsh-image-tile" key={item.id}>
    <button type="button" aria-label={item.file.name} onClick={() => setPreview(item.id)}><img src={item.previewUrl} alt={item.file.name} /></button>
    <button type="button" className="dsh-remove-image" aria-label={t('image.remove', { name: item.file.name })} onClick={() => onRemoveImage(item.id)}>×</button>
  </div>)}</div>{current && <ImagePreview src={current.previewUrl} name={current.file.name} zh={zh} onClose={() => setPreview(null)} />}</>
}
