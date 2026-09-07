import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Prepare Electron's lazy binary before independent Windows workers can race. */
export default function prepareTestElectron(project) {
  // Requiring the package resolves/prepares its executable; it does not launch a GUI.
  const executable = createRequire(join(project.config.root, 'package.json'))('electron')
  if (typeof executable !== 'string') throw new TypeError('Electron executable path is unavailable')
}
