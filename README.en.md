<h1 align="center">DSH Desktop</h1>

<p align="center"><strong>Chat, voice, images, and your code workspace in one desktop app.</strong><br>An open-source workbench built on DeepSeek Harness. The desktop itself is a plugin.</p>

<p align="center"><a href="https://github.com/rw0104/DSH-desktop/releases/download/v2.2.7/DSH-Desktop-2.2.7-x64-Setup.exe">Download Windows v2.2.7</a> · <a href="#features">Features</a> · <a href="#getting-started">Get started</a> · <a href="README.md">中文</a></p>

<p align="center"><img src="assets/desktop-hero-en.png" alt="DSH Desktop, an open-source desktop client built on DeepSeek Harness" width="100%"></p>

DSH Desktop brings Agent sessions, models, terminals, Git, file editing, and optional plugins into a desktop app. Type a task, continue the discussion by voice, analyze or generate images with a capable model, and inspect the Agent's file changes and execution in the same workspace.

This page describes the published **v2.2.7** release. DSH Desktop is independently maintained by the community and is not affiliated with, authorized by, or endorsed by DeepSeek.

## Download

| Platform | Get it | Status |
| --- | --- | --- |
| Windows x64 | [Download 2.2.7 installer](https://github.com/rw0104/DSH-desktop/releases/download/v2.2.7/DSH-Desktop-2.2.7-x64-Setup.exe) · [Release notes](https://github.com/rw0104/DSH-desktop/releases/tag/v2.2.7) | Stable / Latest, approximately 224 MB |
| macOS | [Build from v2.2.7 source](https://github.com/rw0104/DSH-desktop/tree/v2.2.7) | Build support retained; no signed and notarized DMG published |

The Windows installer includes its runtime, so Node.js is not required. It supports choosing an installation directory and creating Start menu and desktop shortcuts. The installer is currently unsigned; Windows may display SmartScreen or Unknown Publisher prompts.

<a id="features"></a>

## What you can do

<table>
  <tr>
    <td width="50%" valign="top"><h3>Realtime voice and Agent tasks</h3><p>Speak through Qwen or Doubao, then let the Agent use tools and handle the task. The voice window offers captions, audio visualization, and a compact task bar that can be restored.</p></td>
    <td width="50%" valign="top"><h3>Understand, generate, and save images</h3><p>Select, paste, or drop images for models that support image input. Create images through an integrated generation protocol, preview and save originals, and reference earlier results.</p></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><h3>Bring files into the conversation</h3><p>Save files in the current workspace and insert references into your draft. Messages, code blocks, and links offer context actions such as copy and open, with keyboard support.</p></td>
    <td width="50%" valign="top"><h3>Code, terminals, and side conversations</h3><p>Inspect files, the editor, Git/diffs, browser tabs, and tasks in the workbench. Extend a discussion with Sidechat and keep a pinned terminal running across session switches.</p></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><h3>Built-in plugin marketplace</h3><p>Browse and search plugins, inspect details, install, and manage them. Enable cooperating 1024Store and dshfind catalogs; other sources can integrate through public contracts and adapters.</p></td>
    <td width="50%" valign="top"><h3>A desktop app with visible update progress</h3><p>Use a dedicated window, system tray, work profiles, and saved layouts. About shows actual download progress, verification, and installation handoff so you can follow an update.</p></td>
  </tr>
</table>

### Move tasks forward by voice

Configure a provider and enable the entry in **Settings → Realtime voice**, then use the voice button in a session.

- **Qwen cascade:** speech transcription → the current DSH Agent → spoken response, for tasks that need tools and approvals.
- **Doubao cascade:** Seed-ASR 2 transcription, DSH Agent execution, and Seed-TTS 2 playback.
- **Qwen native voice Agent (experimental):** ordinary conversation uses the native realtime audio model; files, terminals, and tasks connect through DSH capabilities.

Captions scroll independently and pause automatic following while you read history. During a task, the voice window can collapse into a draggable compact bar with status, mute, end, and restore controls. Collapsing does not end the call or approve Agent operations automatically.

[Configure Qwen / Doubao credentials (Chinese)](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/user-guide-realtime-voice-credentials.md)

### From image input to generation and original-image saving

Image input and image output are separate capabilities:

| What you want to do | Action and requirements |
| --- | --- |
| Ask a model about an image | In Advanced mode, use **+ → Add images**, paste, or drag and drop; the selected model must support image input |
| Generate or continue editing an image | Select an image-output model whose provider has an integrated image protocol, then send a generation or editing request |
| Save a result | Open the original-image preview and select **Save image** to save the stored attachment locally |
| Configure a custom model | Model discovery reads provider capabilities; image-input detection supports manual overrides and distinguishes name-based inference from explicit declarations |

The original attachment rail, multi-image display, scrolling, and retry behavior remain available. Image generation uses reusable provider protocols, including the integrated Aliyun Qwen-Image path. Availability depends on the provider API, model, and account permissions. Adding a model name alone does not integrate a new image protocol.

[Image protocol integration (Chinese)](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-image-protocols.md)

### Bring documents into the workspace

In Advanced mode, select **+ → Upload files to workspace**. Files are saved in the workspace or Git worktree bound to the current session, and their relative paths are inserted into the draft. If the composer is unavailable, use **Insert reference** later.

- Select up to **10 files** at a time, at most **25 MiB each**. Duplicate names are saved separately without overwriting existing content.
- Files live under `.dsh-uploads/` in the workspace, where the Agent can read them with available tools.
- Uploading a PDF or Office document does not automatically parse it; reading and conversion depend on installed tools.
- **+ → Commands /** retains the existing commands. Right-click or press `Shift+F10` on messages and code blocks for relevant actions: copy selection, code, or a whole message, and copy or open links.

### Complete code tasks in one workbench

The maintained **Better Sidebar 0.18.0** supplies Explorer, the editor, unified file changes and Git/diffs, browser tabs, terminals, subagents, and background tasks.

- **Sidechat:** extend a session into a side conversation, distinguish inherited history from the parent's pending input, and restore model selection after reloading.
- **Pinned terminals:** keep a terminal at workspace or global scope across session switches; open supported links with Ctrl/Cmd+Click.
- **Markdown preview:** split preview supports local image references, including relative paths, Chinese characters, and spaces.
- **Git worktrees:** give tasks separate working directories through managed worktrees and inspect their changes.
- **Session reading:** Harness RC1 supplies collapsible process content, width and font controls, history navigation, and usage and timing information.

### Extend the workbench with plugins

Open **Plugin Market** in the left sidebar to discover and search, inspect details, install, and manage plugins. Cooperating sources must be explicitly added and enabled; catalog inclusion is not an audit or recommendation of a plugin.

The desktop shell itself runs as a DSH plugin. Models, tools, and interfaces compatible with the pinned Runtime can join through the composition mechanism; Desktop exposes profile, plugin-management, and native services. The community interoperability RFC is still evolving, and proposed contracts are not all implemented.

[Plugin marketplace](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/dsh-community-market/README.md) · [Plugin development](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-development.en.md) · [Build the plugin ecosystem together](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-ecosystem.en.md)

## Recent improvements in 2.2.7

- Advanced mode adds image/file entry points, original-image saving, and conversation context actions. Ordinary chat and voice receive accurate desktop product context.
- Fixes cover local Markdown images, Sidechat history inheritance, and model selection after a cold resume.
- Submenus fit window edges and narrow windows better, with focus restored after keyboard dismissal.
- Windows plugin installation and non-interactive subprocesses hide background consoles; temporary-directory cleanup does not follow directory links.

[Full release notes, compatibility boundaries, and verification](https://github.com/rw0104/DSH-desktop/releases/tag/v2.2.7)

## Modes and platforms

| Item | Details |
| --- | --- |
| Advanced mode | Desktop layout and native materials, plus the **+ menu, original-image save toolbar, and conversation context menus** described here |
| Compatibility mode | Retains the upstream default client and the product-composed workbench; Advanced-only controls are not shown |
| Shared foundation | Managed Runtime/profiles, native desktop text menus, Host product context, and plugin composition |
| Windows / macOS | Windows has a published installer and Mica; macOS retains source builds and vibrancy, with no published DMG |

Mobile remote control, Channels, and unreviewed upstream file operations and preview enhancements are not current features. The native Qwen voice Agent remains experimental even though the desktop release is stable.

<a id="getting-started"></a>

## Get started

1. [Download the Windows 2.2.7 installer](https://github.com/rw0104/DSH-desktop/releases/download/v2.2.7/DSH-Desktop-2.2.7-x64-Setup.exe), choose a directory, and install.
2. Open **Settings → Models** to configure a provider, credentials, and available models.
3. Select or create a workspace and start a session. Add images or upload files as needed.
4. To use voice, configure credentials and a mode in **Settings → Realtime voice**.

Harness Runtime and Better Sidebar are included. Native image capabilities do not require Vision Toolkit; this product no longer bundles or loads it.

## Documentation and source

| Goal | Entry point |
| --- | --- |
| Installation, sessions, profiles, terminals, and plugins | [2.2.7 user guide](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/user-guide.en.md) |
| Configure realtime voice | [Qwen / Doubao credentials (Chinese)](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/user-guide-realtime-voice-credentials.md) |
| Extend models, tools, or desktop capabilities | [Plugin development](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-development.en.md) · [Desktop services](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/dsh-plugin-desktop/docs/plugin-services.md) |
| Understand the product boundary | [Architecture](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/architecture.en.md) · [Why Desktop](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/why-desktop.en.md) |
| Find more documentation | [Documentation index](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/README.en.md) · [Contributing](CONTRIBUTING.en.md) |

Start from the **v2.2.7 tag** corresponding to the release, rather than assuming the default branch contains the latest published code. Development requires Node.js `^22.19.0` or `>=24.0.0`, with the root Yarn release through Corepack:

```sh
git clone --branch v2.2.7 --recurse-submodules https://github.com/rw0104/DSH-desktop.git
cd DSH-desktop
corepack yarn install --immutable
corepack yarn dev
```

The release pins Harness `0.1.2-rc.1` and Sidebar `0.18.0`. `deepseek-harness/` is an upstream submodule without direct source edits; desktop adaptations live in owned plugins and audited Yarn patches. The root workspace uses Yarn, while the upstream submodule retains its pnpm workspace. Run `corepack yarn check` for the complete headless gate.

## Community and acknowledgements

DSH Desktop QQ group: **1106941154**. Technical team contact: [1576186341@qq.com](mailto:1576186341@qq.com).

<img src="assets/dsh-desktop-qq-group.png" alt="DSH Desktop QQ group QR code" width="220">

Thanks to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), [Cordis](https://github.com/cordiverse/cordis), [Better Sidebar](https://github.com/omdsh-dev/DSH-better-sidebar), the [Koishi](https://koishi.chat/) community, and everyone contributing plugins, testing, feedback, and documentation. Inherited upstream contributions preserve provenance; they do not imply upstream participation in or endorsement of this repository.

<details>
<summary>Community projects and related links</summary>

These are independent projects, not a list of bundled features or certified integrations.

| Project | About |
| --- | --- |
| [dshfind](https://github.com/hikariming/dshfind) | Harness learning and sharing community |
| [DSH 1024Store](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) | Community plugin catalog and marketplace API |
| [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | Curated plugin list |
| [dsh-market](https://github.com/dsh-market/dsh-market) | Visual plugin marketplace |
| [ModLens](https://github.com/liustack/modlens) | Independent vision and OCR plugin project |
| [DeepSeek Harness Orange Book](https://github.com/alchaincyf/deepseek-harness-orange-book) | Community field manual |
| [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) | Web UI plugins and themes |
| [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) | Terminal user interface |
| [dsh-tianshu-tui](https://github.com/huiliyi37/dsh-tianshu-tui) | Interactive terminal UI plugin |
| [dsh-context](https://github.com/bowenliang123/dsh-context) | Context visualization and management |
| [Agents-Anywhere](https://github.com/anywhere-labs/Agents-Anywhere) | Independent mobile remote-control project |
| [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | Files, terminal, Git, and subagent workbench |
| [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness) | Plugin, tool, and infrastructure list |
| [MkSaaS / TanStarter](https://mksaas.com) | Community links: commercial SaaS templates · [TanStarter](https://tanstarter.dev) |

Suggest a community project through [DSH Desktop Issues](https://github.com/rw0104/DSH-desktop/issues).

</details>

## License

This project uses the [MIT License](LICENSE). Redistribution must preserve the licenses and copyright notices of Harness, Sidebar, optional plugins, and transitive dependencies. DeepSeek and related marks belong to their respective owners; this is an independent community product.
