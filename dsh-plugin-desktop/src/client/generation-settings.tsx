import { useEffect, useState } from 'react'
import type { VoicePanelLocale } from './voice-panel-copy.ts'
import { useSyncExternalStore } from 'react'

interface Route { provider: string; model: string; protocol: 'openai-images'; endpoint: string; credentialRef: string; responseFormat: 'b64_json' | 'native' }
const path = '/dsh-desktop/api/generation/settings'
const headers = { 'content-type': 'application/json', 'x-dsh-desktop-action': 'generation-settings' }
const empty = (): Route => ({ provider: '', model: '', protocol: 'openai-images', endpoint: '', credentialRef: '', responseFormat: 'b64_json' })

export function GenerationSettingsSection({ locale }: { locale: VoicePanelLocale }) {
  const language = useSyncExternalStore(locale.subscribe, locale.getSnapshot, locale.getSnapshot)
  const zh = language.startsWith('zh')
  const [routes, setRoutes] = useState<Route[]>([])
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    void fetch(path, { headers, signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = await response.json() as { routes: Route[] }; setRoutes(value.routes); setLoaded(true)
    }).catch(() => { if (!abort.signal.aborted) setError(zh ? '无法读取生图配置。' : 'Could not load image routes.') })
    return () => abort.abort()
  }, [zh])
  const change = (index: number, patch: Partial<Route>): void => { setRoutes(current => current.map((route, i) => i === index ? { ...route, ...patch } : route)); setSaved(false) }
  const save = async (): Promise<void> => {
    setBusy(true); setError(''); setSaved(false)
    try {
      const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify({ routes }) })
      if (!response.ok) throw new Error(zh ? '配置无效：请核对供应商唯一标识、生图模型、HTTPS 接口和凭据引用。' : 'Invalid route: check provider ID, image model, HTTPS endpoint and credential reference.')
      setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save image routes.') }
    finally { setBusy(false) }
  }
  return <section className="dshVoiceSettings">
    <div className="dshVoiceSettingsIntro"><h2>{zh ? '受控生成' : 'Controlled generation'}</h2>
      <p>{zh ? '使用 /image 描述图片，或 /generation on 进入受控模式。每次生成绑定当前聊天供应商的一条明确生图配置。模型不能更改路由，失败后停止。' : 'Use /image with a description, or /generation on. Each image request uses an explicit image route for the selected chat provider. The model cannot change that route; failures stop.'}</p>
      <p>{zh ? '受控模式仅开放生图工具，禁用 Shell、技能、MCP 和委托。/generation off 恢复普通 Agent 权限；普通模式的任意进程不受供应商网络隔离。' : 'Controlled mode allows only the image tool, disabling shell, skills, MCP and delegation. /generation off restores ordinary Agent permissions. Arbitrary processes in ordinary mode are not isolated to one provider.'}</p>
      <p>{zh ? '图片输入能力和模型列表不代表生图能力。请使用文档确认的输出模型与协议。凭据填写已保存的名称（如 API_KEY）或供应商记录（如 llm-pi-ai/provider-id），不填写 API Key 本身。' : 'Image input and model listings do not imply image generation. Use a documented output model and protocol. Enter a saved reference (e.g. API_KEY) or provider record (e.g. llm-pi-ai/provider-id), never the API key itself.'}</p>
    </div>
    {routes.map((route, index) => <fieldset key={index} disabled={busy} style={{ display: 'grid', gap: 12, minWidth: 0, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 12 }}>
      <legend>{zh ? `生图路由 ${index + 1}` : `Image route ${index + 1}`}</legend>
      {([
        ['provider', zh ? '当前聊天供应商的精确 ID' : 'Exact chat provider ID'],
        ['model', zh ? '图片输出模型 ID' : 'Image output model ID'],
        ['endpoint', zh ? '完整 Images API 地址（HTTPS，含 /images/generations）' : 'Full HTTPS Images API URL (including /images/generations)'],
        ['credentialRef', zh ? '已保存的凭据名称' : 'Saved credential reference'],
      ] as const).map(([key, label]) => <div className="dshVoiceField" key={key}><label htmlFor={`generation-${index}-${key}`}>{label}</label>
        <input id={`generation-${index}-${key}`} autoComplete="off" spellCheck={false} value={route[key]} onChange={event => change(index, { [key]: event.target.value })} />
      </div>)}
      <div className="dshVoiceField"><label htmlFor={`generation-${index}-protocol`}>{zh ? '生图协议与响应形式' : 'Image protocol and response format'}</label>
        <select id={`generation-${index}-protocol`} value={route.responseFormat} onChange={event => change(index, { responseFormat: event.target.value as Route['responseFormat'] })}>
          <option value="b64_json">OpenAI Images — response_format: b64_json</option>
          <option value="native">OpenAI Images — {zh ? '原生返回 base64（如 GPT Image）' : 'native base64 (e.g. GPT Image)'}</option>
        </select>
      </div>
      <button type="button" onClick={() => { setRoutes(current => current.filter((_, i) => i !== index)); setSaved(false) }}>{zh ? '移除此路由' : 'Remove route'}</button>
    </fieldset>)}
    <div className="dshVoiceSettingsActions">
      <button type="button" disabled={!loaded || busy || routes.length >= 50} onClick={() => { setRoutes(current => [...current, empty()]); setSaved(false) }}>{zh ? '添加路由' : 'Add route'}</button>
      <button type="button" disabled={!loaded || busy} onClick={() => { void save() }}>{busy ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存配置' : 'Save routes')}</button>
      {saved && <span role="status">{zh ? '已保存' : 'Saved'}</span>}
    </div>
    {error && <p role="alert" className="dshVoiceSettingsError">{error}</p>}
  </section>
}
