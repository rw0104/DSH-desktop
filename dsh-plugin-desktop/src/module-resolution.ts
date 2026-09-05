/** Profile-relative package resolution for Electron's restricted Node runtime. */

import { createRequire, isBuiltin, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const LOADER_ENTRY_URL = import.meta.resolve('@deepseek-ai/cordis-plugin-loader')
const DESKTOP_ENTRY_URL = new URL('../lib/index.js', import.meta.url).href
const INSTALLATION_BASE_URL = new URL('../package.json', import.meta.url).href
const DESKTOP_PACKAGE_NAME = 'dsh-plugin-desktop'

/** Return whether a Loader request needs Node package resolution. */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !URL.canParse(specifier)
}

/**
 * Resolve Cordis Loader bare imports from the selected persistent profile.
 * @param profileBaseUrl - file URL inside the profile that owns plugin dependencies.
 * @returns an idempotent hook disposer.
 */
export function installProfilePackageResolver(
  profileBaseUrl: string,
  installationBaseUrl: string = INSTALLATION_BASE_URL,
): () => void {
  const profileDirectoryUrl = new URL('.', profileBaseUrl).href
  const installationRequire = createRequire(installationBaseUrl)
  const profileRequire = createRequire(profileBaseUrl)
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const fromLoader = context.parentURL === LOADER_ENTRY_URL
      if (fromLoader && specifier === DESKTOP_PACKAGE_NAME) {
        return { shortCircuit: true, url: DESKTOP_ENTRY_URL }
      }
      if (specifier === `${DESKTOP_PACKAGE_NAME}/package.json`) {
        return {
          shortCircuit: true,
          url: new URL('../package.json', import.meta.url).href,
        }
      }
      if (!isBareSpecifier(specifier) || isBuiltin(specifier)) {
        return nextResolve(specifier, context)
      }
      if (fromLoader) {
        // Changing nextResolve's parentURL does not retarget the underlying
        // CommonJS Module.paths. Use an actually anchored require for CJS.
        if (context.conditions?.includes('require') === true) {
          let filename: string
          try {
            filename = installationRequire.resolve(specifier)
          } catch (cause) {
            if (!isMissingModule(cause)) throw cause
            filename = profileRequire.resolve(specifier)
          }
          return { shortCircuit: true, url: pathToFileURL(filename).href }
        }
        try {
          return nextResolve(specifier, { ...context, parentURL: installationBaseUrl })
        } catch (cause) {
          if (!isMissingModule(cause)) throw cause
          return nextResolve(specifier, { ...context, parentURL: profileBaseUrl })
        }
      }
      if (context.parentURL?.startsWith(profileDirectoryUrl) === true
        && context.parentURL !== installationBaseUrl) {
        try {
          return nextResolve(specifier, context)
        } catch (cause) {
          if (!isMissingModule(cause)) throw cause
          if (context.conditions?.includes('require') === true) {
            return { shortCircuit: true, url: pathToFileURL(installationRequire.resolve(specifier)).href }
          }
          return nextResolve(specifier, { ...context, parentURL: installationBaseUrl })
        }
      }
      return nextResolve(specifier, context)
    },
  })
  let active = true
  return () => {
    if (!active) return
    active = false
    hooks.deregister()
  }
}

function isMissingModule(cause: unknown): boolean {
  return cause instanceof Error
    && 'code' in cause
    && (cause.code === 'ERR_MODULE_NOT_FOUND' || cause.code === 'MODULE_NOT_FOUND')
}
