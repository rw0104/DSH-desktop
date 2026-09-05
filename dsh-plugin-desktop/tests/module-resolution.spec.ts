import { beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({
  resolve: undefined as undefined | ((
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context: { parentURL?: string }) => unknown,
  ) => unknown),
  deregister: vi.fn(),
}))

vi.mock('node:module', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:module')>(),
  registerHooks: vi.fn((definition: { resolve: typeof hooks.resolve }) => {
    hooks.resolve = definition.resolve
    return { deregister: hooks.deregister }
  }),
}))

const { installProfilePackageResolver } = await import('../src/module-resolution.ts')

describe('installProfilePackageResolver', () => {
  beforeEach(() => {
    hooks.resolve = undefined
    hooks.deregister.mockClear()
  })

  it('prefers installed bundles and keeps relative imports unchanged', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/'
    const installationBaseUrl = 'file:///C:/Program%20Files/DSH/resources/app.asar/package.json'
    const dispose = installProfilePackageResolver(profileBaseUrl, installationBaseUrl)
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => ({
      specifier,
      context,
    }))
    const loaderEntryUrl = import.meta.resolve('@deepseek-ai/cordis-plugin-loader')

    expect(hooks.resolve?.(
      'dsh-plugin-desktop',
      { parentURL: loaderEntryUrl },
      nextResolve,
    )).toEqual({
      shortCircuit: true,
      url: new URL('../lib/index.js', new URL('../src/module-resolution.ts', import.meta.url)).href,
    })

    expect(hooks.resolve?.(
      'left-pad',
      { parentURL: loaderEntryUrl },
      nextResolve,
    )).toEqual({
      specifier: 'left-pad',
      context: { parentURL: installationBaseUrl },
    })

    expect(hooks.resolve?.(
      './relative.js',
      { parentURL: loaderEntryUrl },
      nextResolve,
    )).toEqual({
      specifier: './relative.js',
      context: { parentURL: loaderEntryUrl },
    })

    expect(hooks.resolve?.(
      'left-pad',
      { parentURL: 'file:///C:/Users/test/other.js' },
      nextResolve,
    )).toEqual({
      specifier: 'left-pad',
      context: { parentURL: 'file:///C:/Users/test/other.js' },
    })

    dispose()
    expect(hooks.deregister).toHaveBeenCalledTimes(1)
  })

  it('falls back across the installation and profile boundary only for missing packages', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/package.json'
    const installationBaseUrl = 'file:///C:/Program%20Files/DSH/resources/app.asar/package.json'
    installProfilePackageResolver(profileBaseUrl, installationBaseUrl)
    const loaderEntryUrl = import.meta.resolve('@deepseek-ai/cordis-plugin-loader')
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => {
      if (specifier === 'profile-only' && context.parentURL === installationBaseUrl) {
        throw Object.assign(new Error('missing'), { code: 'ERR_MODULE_NOT_FOUND' })
      }
      if (specifier === 'installed-peer' && context.parentURL?.includes('/profile/peer.js') === true) {
        throw Object.assign(new Error('missing'), { code: 'ERR_MODULE_NOT_FOUND' })
      }
      if (specifier === 'broken') throw new Error('invalid package exports')
      return { specifier, context }
    })

    expect(hooks.resolve?.('profile-only', { parentURL: loaderEntryUrl }, nextResolve)).toEqual({
      specifier: 'profile-only',
      context: { parentURL: profileBaseUrl },
    })
    expect(hooks.resolve?.(
      'installed-peer',
      { parentURL: 'file:///C:/Users/test/profile/peer.js' },
      nextResolve,
    )).toEqual({
      specifier: 'installed-peer',
      context: { parentURL: installationBaseUrl },
    })
    expect(() => hooks.resolve?.('broken', { parentURL: loaderEntryUrl }, nextResolve))
      .toThrow('invalid package exports')
  })

  it('deregisters hooks only once even if the disposer is reused', () => {
    const dispose = installProfilePackageResolver('file:///C:/Users/test/profile/')

    dispose()
    dispose()

    expect(hooks.deregister).toHaveBeenCalledTimes(1)
  })
})
