import { chmodSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'

const retryCodes = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM'])

/** Remove this disposable tree without traversing directory links or their targets. */
export function removeIsolatedTree(root) {
  if (!isAbsolute(root)) throw new Error('An absolute isolated tree path is required')
  function removeEntry(path) {
    const child = relative(root, path)
    if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) throw new Error(`Cleanup escaped ${root}`)
    try {
      const info = lstatSync(path)
      if (info.isSymbolicLink()) {
        unlinkSync(path)
      } else if (info.isDirectory()) {
        for (const name of readdirSync(path)) removeEntry(join(path, name))
        rmdirSync(path)
      } else {
        try { unlinkSync(path) } catch (cause) {
          // Only relax an owned, unlinked file's read-only bit, never a link target.
          if (cause.code !== 'EPERM' || info.nlink !== 1) throw cause
          chmodSync(path, info.mode | 0o200)
          unlinkSync(path)
        }
      }
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause
    }
  }
  for (let attempt = 0; ; attempt++) {
    try { removeEntry(root); return } catch (cause) {
      if (attempt >= 3 || !retryCodes.has(cause.code)) throw cause
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1))
    }
  }
}
