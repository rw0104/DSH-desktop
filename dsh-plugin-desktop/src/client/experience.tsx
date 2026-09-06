import type { Context } from '@deepseek-ai/cordis'
import { useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DesktopComposerAttachments, DesktopMessageImages } from './experience-images.tsx'
import { installExperienceStyles } from './experience-styles.ts'
import { showContentMenu, closeContentMenu } from './content-menu.ts'
import { installConversationContextMenu } from './conversation-context-menu.ts'
import { workspaceFileReference } from './workspace-file-reference.ts'

interface AddOwner {
  locked: boolean
  onAddImages(files: readonly File[]): void
  onCommands(): void
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Optional audited upstream extension, with the original Commands button as fallback. */
    'conversation.input.add': { kind: 'single'; scope: 'session-maybe'; owner: AddOwner }
  }
}

interface UploadResult { name: string; path: string; bytes: number }
interface UploadState { busy: boolean; message: string; files: readonly UploadResult[] }
interface ExperienceController {
  subscribe(listener: () => void): () => void
  snapshot(): UploadState
  upload(files: readonly File[]): Promise<void>
  insert(file: UploadResult): boolean
}
const EMPTY: UploadState = { busy: false, message: '', files: [] }

function uploadController(ctx: Context, sessionId: SessionId, zh: () => boolean): ExperienceController {
  let state = EMPTY
  const listeners = new Set<() => void>()
  const update = (value: UploadState) => { state = value; for (const listener of listeners) listener() }
  const insert = (file: UploadResult): boolean => {
    const scoped = ctx.sessions.scope(sessionId)
    if (scoped === undefined) return false
    const conversation = scoped.get('conversation')
    if (conversation === undefined) return false
    const input = conversation.input.for(scoped)
    const snapshot = input.state.getSnapshot()
    const reference = workspaceFileReference(snapshot, file.path, zh())
    return reference !== undefined && scoped.bail('slash/input-insert-text', reference) === true
  }
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    snapshot: () => state,
    insert,
    async upload(files) {
      if (state.busy) return
      if (files.length > 10 || files.some(file => file.size > 25 * 1024 * 1024)) {
        update({ ...state, message: zh() ? '每次最多 10 个文件，每个不超过 25 MiB。' : 'Select at most 10 files, up to 25 MiB each.' }); return
      }
      update({ ...state, busy: true, message: zh() ? '正在保存到工作区…' : 'Saving to workspace…' })
      const saved = [...state.files]
      const errors: string[] = []
      let pending = false
      for (const file of files) {
        try {
          const url = new URL('/dsh-desktop/api/workspace/upload', location.origin)
          url.searchParams.set('sessionId', sessionId)
          url.searchParams.set('name', file.name)
          const response = await fetch(url, { method: 'POST', headers: { 'x-dsh-desktop-action': 'upload-file', 'Content-Type': 'application/octet-stream' }, body: file, signal: AbortSignal.timeout(35_000) })
          const result = await response.json() as UploadResult & { error?: string }
          if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
          saved.push(result)
          if (!insert(result)) pending = true
        } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`) }
      }
      update({ busy: false, files: saved, message: errors.length ? errors.join('\n') : pending
        ? zh() ? '文件已保存；请在输入空闲时点击“插入引用”。' : 'Files saved. Insert references when the composer is ready.'
        : zh() ? '文件已保存，路径已加入草稿。' : 'Files saved; paths added to the draft.' })
    },
  }
}

interface Injected { controller?: ExperienceController | undefined; language: { subscribe(listener: () => void): () => void; getSnapshot(): string } }

function AddButton({ locked, onAddImages, onCommands, controller, language }: PropsRuntime<'conversation.input.add'> & Injected) {
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lang = useSyncExternalStore(language.subscribe, language.getSnapshot, language.getSnapshot)
  const zh = lang === 'zh'
  const state = useSyncExternalStore(controller?.subscribe ?? (() => () => {}), controller?.snapshot ?? (() => EMPTY))
  return <div className="dsh-add">
    <button type="button" aria-label={zh ? '添加图片或文件' : 'Add images or files'} aria-haspopup="menu" disabled={locked || state.busy || !controller} onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      showContentMenu([
        { label: zh ? '添加图片…' : 'Add images…', run: () => imageInput.current?.click() },
        { label: zh ? '上传文件到工作区…' : 'Upload files to workspace…', run: () => fileInput.current?.click() },
        { label: zh ? '指令 /' : 'Commands /', run: onCommands },
      ], { x: rect.left, y: rect.top - 140 })
    }}>+</button>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden aria-label="Desktop image picker" onChange={event => { onAddImages([...event.currentTarget.files ?? []]); event.currentTarget.value = '' }} />
    <input ref={fileInput} type="file" multiple hidden aria-label="Desktop workspace file picker" onChange={event => { void controller?.upload([...event.currentTarget.files ?? []]); event.currentTarget.value = '' }} />
  </div>
}

function UploadStatus({ controller, language }: Injected) {
  const state = useSyncExternalStore(controller?.subscribe ?? (() => () => {}), controller?.snapshot ?? (() => EMPTY))
  const lang = useSyncExternalStore(language.subscribe, language.getSnapshot, language.getSnapshot)
  const [notice, setNotice] = useState('')
  if (!state.message && !state.files.length) return null
  return <div className="dsh-file-status" role="status"><div>{state.message}</div>{state.files.map(file => <div key={file.path}><code>{file.path}</code> · {file.bytes} B <button type="button" disabled={state.busy} onClick={() => setNotice(controller?.insert(file) ? lang === 'zh' ? '引用已插入' : 'Reference inserted' : lang === 'zh' ? '请等待输入恢复后再试' : 'Wait until the composer is ready')}>{lang === 'zh' ? '插入引用' : 'Insert reference'}</button></div>)}{notice}</div>
}

/** Desktop-only occupants; compatibility leaves every upstream fallback untouched. */
export function installClientExperience(ctx: Context): void {
  const controllers = new Map<SessionId, ExperienceController>()
  const language = { subscribe: (listener: () => void) => ctx.locale.subscribe(listener), getSnapshot: () => String(ctx.locale.getLocale().active) }
  const forSession = (id: SessionId | undefined): Injected => {
    if (id === undefined) return { language }
    let controller = controllers.get(id)
    if (!controller) { controller = uploadController(ctx, id, () => language.getSnapshot() === 'zh'); controllers.set(id, controller) }
    return { controller, language }
  }
  ctx.effect(installExperienceStyles, 'desktop: file interaction styles')
  ctx.effect(() => { const off = installConversationContextMenu(() => language.getSnapshot() === 'zh'); return () => { off(); controllers.clear(); closeContentMenu() } }, 'desktop: conversation content actions')
  ctx.slots.inject('conversation.input.add', () => ctx.slots.register({ name: 'conversation.input.add', inject: forSession }, AddButton))
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({ name: 'conversation.input.attachments', priority: -10, locale: 'conversation' }, DesktopComposerAttachments))
  ctx.slots.inject('conversation.message.images', () => ctx.slots.register({ name: 'conversation.message.images', priority: -10, locale: 'conversation' }, DesktopMessageImages))
  ctx.slots.inject('conversation.trajectory.images', () => ctx.slots.register({ name: 'conversation.trajectory.images', priority: -10, locale: 'conversation' }, DesktopMessageImages))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'desktop-upload-status', inject: forSession }, UploadStatus))
}
