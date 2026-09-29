// Reproduction stand-in for the *unpatched* alpha.2 Windows Job runner launch
// (spec windows-subprocess-runner-fix, task 8.2).
//
// The field failure: the Host runs inside the Electron main process, so
// `process.execPath` is the Electron binary. alpha.2 `launchWindowsJob` spawns the
// runner as `[process.execPath, <runner entry>]` with an env that does NOT carry
// `ELECTRON_RUN_AS_NODE`. In the packaged app that means `DSH Desktop.exe` boots the
// *desktop application* (it ignores the script argument), fails
// `app.requestSingleInstanceLock()` against the already-running installed instance,
// and `app.quit()`s with exit code 0 without ever performing the runner IPC
// handshake. The parent's `settleRange()` then throws
//   "subprocess-local: Windows Job runner exited with exit code 0 before proving its
//    managed range empty".
//
// This stand-in reproduces the *essential* mechanism safely with the dev Electron
// binary: launched WITHOUT `ELECTRON_RUN_AS_NODE`, it boots as a real Electron main
// (browser) process — proving the runner would start as a desktop app, not Node —
// and then exits 0 without ever touching the parent's runner IPC channel. It never
// creates a visible window and uses whatever isolated `--user-data-dir` the parent
// passed.
import { app } from 'electron'
import { writeFileSync } from 'node:fs'

const markerFile = process.argv.find(a => a.startsWith('--marker-file='))?.slice('--marker-file='.length)

function writeMarker() {
  const marker = {
    // process.type === 'browser' proves this booted as an Electron desktop app,
    // NOT in Node mode (which would be undefined). This is exactly why the runner
    // never speaks the IPC protocol.
    processType: process.type ?? null,
    execPathIsElectron: /electron(\.exe)?$/i.test(process.execPath),
    electron: process.versions.electron ?? null,
    runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
  }
  if (markerFile) writeFileSync(markerFile, JSON.stringify(marker))
}

// Deliberately DO NOT register a 'message' listener and DO NOT call process.send:
// the runner protocol is never performed, mirroring the desktop app that just quits.
const quit = () => {
  try { writeMarker() } finally { app.exit(0) }
}

if (app.isReady()) quit()
else app.whenReady().then(quit).catch(() => app.exit(0))
