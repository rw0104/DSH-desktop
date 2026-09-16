import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as JSX from 'react/jsx-runtime'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'

export interface ClientRegistration {
  options: { name: string; inject?: () => Record<string, unknown> }
  component: React.ComponentType<Record<string, unknown>>
}

/** Materialize the published browser factory and its real registered components.
 * Primitive chrome is a DOM fixture; component state, effects and handlers are real React.
 */
export function loadPublishedClient(name: string, services: Record<string, unknown> = {}) {
  const registrations: ClientRegistration[] = []
  const disposers: Array<() => void> = []
  const primitives = new Proxy({
    Modal: ({ open, children }: { open: boolean; children?: React.ReactNode }) => open ? <div role="dialog">{children}</div> : null,
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: React.MouseEventHandler; disabled?: boolean }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    Menu: ({ anchor, open, items, onSelect }: { anchor: React.ReactNode; open: boolean; items: Array<{ id: string; label?: React.ReactNode }>; onSelect(id: string): void }) => <>{anchor}{open && <div role="menu">{items.map(item => <button key={item.id} onClick={() => onSelect(item.id)}>{item.label}</button>)}</div>}</>,
    classifyLinkPath: () => 'file',
    fileExtension: (path: string) => path.split('.').at(-1) ?? '',
  }, { get(target, key) { return key in target ? Reflect.get(target, key) : () => <span /> } })
  type Factory = (require: (name: string) => unknown) => { apply(ctx: unknown): void }
  let factory: Factory | undefined
  const target = window as unknown as { __ModuleLoader__?: { load(value: { factory: Factory }): void } }
  const previous = target.__ModuleLoader__
  target.__ModuleLoader__ = { load(value) { factory = value.factory } }
  const filename = createRequire(import.meta.url).resolve(`${name}/client`)
  try {
    new Script(readFileSync(filename, 'utf8'), { filename }).runInNewContext({
      window, document, HTMLElement, HTMLInputElement, Element, Node, MutationObserver,
      AbortController, URL, URLSearchParams, DOMRect, console, setTimeout, clearTimeout, queueMicrotask,
      fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    })
  } finally {
    if (previous === undefined) delete target.__ModuleLoader__; else target.__ModuleLoader__ = previous
  }
  if (!factory) throw new Error(`No client factory in ${filename}`)
  const client = factory(moduleName => {
    if (moduleName === 'react') return React
    if (moduleName === 'react-dom') return ReactDOM
    if (moduleName === 'react/jsx-runtime') return JSX
    // Native-open controller state is outside these copy-action tests; owner hooks are supplied below.
    if (moduleName === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: (initial: unknown) => ({
      getSnapshot: () => initial, subscribe: () => () => {}, set: () => {},
      update: () => { throw new Error('Native-open store update is outside this component fixture') },
    }) }
    if (moduleName === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`Unprovided client dependency: ${moduleName}`)
  })
  function collect(result: unknown): void {
    if (typeof result === 'function') disposers.push(result as () => void)
    else if (typeof result === 'object' && result !== null && Symbol.iterator in result) {
      for (const value of result as Iterable<unknown>) collect(value)
    }
  }
  const ctx = {
    effect: (fn: () => unknown) => { collect(fn()) },
    on: () => () => {},
    provide: () => {},
    get: (key: string) => services[key],
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: {
      inject: (_name: string, run: () => unknown) => { collect(run()); return () => {} },
      register: (options: ClientRegistration['options'], component: ClientRegistration['component']) => {
        registrations.push({ options, component }); return () => {}
      },
    },
    ...services,
  }
  client.apply(ctx)
  return { registrations, dispose: () => { for (const dispose of disposers.reverse()) dispose() } }
}
