# Electron screenshot evidence

These screenshots were captured from a real Electron `43.4.0` BrowserWindow through CDP on Windows, using a temporary `DSH_HOME` and `--remote-debugging-port=9223`.

| Screenshot | Scenario | Observation |
| --- | --- | --- |
| `compatibility.png` | First launch before onboarding dismissal | DSH onboarding notice is visible and the compatibility renderer is loaded behind it |
| `compatibility-after-onboarding.png` | Compatibility mode after dismissing onboarding | Official DSH Web UI renders without the desktop control strip, as designed |
| `advanced.png` | Advanced mode after onboarding dismissal | Desktop control strip renders above the conversation surface |
| `advanced-sidebar-details.png` | Advanced mode after pressing Sidebar and Details | CDP reports both buttons as `aria-pressed=true`; the left workbench expands without covering the composer |
| `packaged-advanced.png` | Unpacked `DSH Desktop.exe` before onboarding dismissal | Packaged ASAR runtime starts a real BrowserWindow and reaches the DSH onboarding dialog |
| `packaged-advanced-after-onboarding.png` | Unpacked `DSH Desktop.exe` after dismissing onboarding | Packaged Advanced renderer reaches the same control strip and DSH surface |
| `packaged-advanced-sidebar-details.png` | Packaged renderer after pressing Sidebar and Details | CDP reports both controls pressed and the unpacked runtime keeps the workbench layout intact |
| `packaged-advanced-final.png` | Final optimized Windows x64 package after the performance changes | CDP reports `Workspace / Sidebar / Details`; both workbench toggles are pressed and the composer remains visible |
| `directory-picker-1.0.1-selected-c.png` | Windows x64 `1.0.1` directory picker after selecting `C` | The real picker shows `C:\`, lists the C: root, and reports no invalid-path error |

The reusable capture script is [electron-cdp-smoke.mjs](../../../scripts/electron-cdp-smoke.mjs). It expects an Electron instance listening on `127.0.0.1:9223` and writes a PNG plus a JSON inspection line.
