# Electron screenshot evidence

These screenshots were captured from a real Electron `43.4.0` BrowserWindow through CDP on Windows, using a temporary `DSH_HOME` and `--remote-debugging-port=9223`.

| Screenshot | Scenario | Observation |
| --- | --- | --- |
| `compatibility.png` | First launch before onboarding dismissal | DSH onboarding notice is visible and the compatibility renderer is loaded behind it |
| `compatibility-after-onboarding.png` | Compatibility mode after dismissing onboarding | Official DSH Web UI renders without the desktop control strip, as designed |
| `advanced.png` | Advanced mode after onboarding dismissal | Desktop control strip renders above the conversation surface |
| `advanced-sidebar-details.png` | Advanced mode after pressing Sidebar and Details | CDP reports both buttons as `aria-pressed=true`; the left workbench expands without covering the composer |

The reusable capture script is [electron-cdp-smoke.mjs](../../../scripts/electron-cdp-smoke.mjs). It expects an Electron instance listening on `127.0.0.1:9223` and writes a PNG plus a JSON inspection line.
