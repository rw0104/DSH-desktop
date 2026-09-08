import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DesktopWindowStyle } from '../desktop-experience.ts'

export interface DesktopAppearanceProps {
  current: DesktopWindowStyle
  platform: string
  locale: { subscribe(listener: () => void): () => void; getSnapshot(): string }
  preference: {
    subscribe(listener: () => void): () => void
    getSnapshot(): { value: { windowStyle?: DesktopWindowStyle } | undefined }
    setWindowStyle(style: DesktopWindowStyle): Promise<void>
  }
}

/** Window decoration changes never select a different set of product tools. */
export function DesktopAppearanceSection({ current, platform, locale, preference }: DesktopAppearanceProps) {
  const language = useSyncExternalStore(locale.subscribe, locale.getSnapshot, locale.getSnapshot)
  const saved = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
  const selected = platform === 'linux' ? 'system' : saved.value?.windowStyle ?? current
  const [draft, setDraft] = useState(selected)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setDraft(selected) }, [selected])
  const zh = language.toLowerCase().startsWith('zh')
  const save = async () => {
    setBusy(true); setError('')
    try { await preference.setWindowStyle(draft) }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (alive.current) setBusy(false) }
  }
  return <section className="dshDesktopAppearance">
    <h2>{zh ? '窗口外观' : 'Window appearance'}</h2>
    <p>{zh ? '两种外观都提供完整的文件操作、图片和实时语音功能。Agent 预设决定工具组合，不受窗口外观影响。' : 'Both appearances provide the same file, image and realtime voice features. Agent presets select tools independently from window appearance.'}</p>
    <fieldset disabled={busy}>
      <legend>{zh ? '标题栏与材质' : 'Title bar and material'}</legend>
      <label><input type="radio" name="dsh-window-style" value="system" checked={draft === 'system'} onChange={() => setDraft('system')} /><span>{zh ? '系统窗口' : 'System window'}<small>{zh ? '使用系统标题栏与清晰、不透明的窗口表面。' : 'Use the system title bar and opaque window surfaces.'}</small></span></label>
      <label><input type="radio" name="dsh-window-style" value="native" checked={draft === 'native'} disabled={platform === 'linux'} onChange={() => setDraft('native')} /><span>{zh ? '原生桌面外观' : 'Native desktop appearance'}<small>{zh ? '使用桌面标题栏与系统支持的原生材质；功能保持一致。' : 'Use desktop window chrome and supported native material, with the same features.'}</small></span></label>
    </fieldset>
    {platform === 'linux' && <p>{zh ? '此平台使用系统窗口，完整桌面功能仍然可用。' : 'This platform uses the system window with all desktop features.'}</p>}
    <button type="button" disabled={busy || draft === current && draft === selected} onClick={() => { void save() }}>{busy ? zh ? '正在保存…' : 'Saving…' : zh ? '应用并重启' : 'Apply and restart'}</button>
    {selected !== current && <p role="status">{zh ? '已保存，窗口外观将在重启后生效。' : 'Saved. Window appearance will change after restart.'}</p>}
    {error && <p role="alert">{zh ? '无法保存窗口外观：' : 'Could not save appearance: '}{error}</p>}
  </section>
}
