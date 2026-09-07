<h1 align="center">DSH Desktop</h1>

<p align="center"><strong>把对话、语音、图片与代码工作区放在同一个桌面应用中。</strong><br>基于 DeepSeek Harness 的开源桌面工作台，桌面本身也是插件。</p>

<p align="center"><a href="https://github.com/rw0104/DSH-desktop/releases/download/v2.2.7/DSH-Desktop-2.2.7-x64-Setup.exe">下载 Windows v2.2.7</a> · <a href="#features">功能一览</a> · <a href="#getting-started">开始使用</a> · <a href="README.en.md">English</a></p>

<p align="center"><img src="assets/desktop-hero-zh.png" alt="DSH Desktop：基于 DeepSeek Harness 的开源桌面客户端" width="100%"></p>

DSH Desktop 将 Agent 会话、模型、终端、Git、文件编辑和可选插件组合成桌面应用。你可以输入任务、用语音继续讨论、让支持图片的模型看图或生成图片，并在同一工作区查看 Agent 的文件改动与执行过程。

本页功能以正式发布的 **v2.2.7** 为准。DSH Desktop 由社区独立维护，与 DeepSeek 无隶属、授权或背书关系。

## 下载

| 平台 | 获取方式 | 状态 |
| --- | --- | --- |
| Windows x64 | [下载 2.2.7 安装器](https://github.com/rw0104/DSH-desktop/releases/download/v2.2.7/DSH-Desktop-2.2.7-x64-Setup.exe) · [Release 与更新说明](https://github.com/rw0104/DSH-desktop/releases/tag/v2.2.7) | 正式版 / Latest，约 224 MB |
| macOS | [从 v2.2.7 源码构建](https://github.com/rw0104/DSH-desktop/tree/v2.2.7) | 保留构建支持，尚未提供签名与公证的 DMG |

Windows 安装器内置所需运行环境，无需预装 Node.js；支持选择安装目录、开始菜单和桌面快捷方式。安装器目前未进行 Authenticode 签名，Windows 可能显示 SmartScreen / Unknown Publisher 提示。

<a id="features"></a>

## 你可以用它做什么

<table>
  <tr>
    <td width="50%" valign="top"><h3>实时语音与 Agent 任务</h3><p>通过 Qwen 或豆包说出需求，继续由 Agent 使用工具和处理任务。语音窗口支持字幕、动态音频反馈，以及任务期间可恢复的小型控制条。</p></td>
    <td width="50%" valign="top"><h3>图片理解、生成与保存</h3><p>选择、粘贴或拖入图片，让支持图片输入的模型分析内容。使用已接入的图片生成协议创建图片，预览、保存原图，并继续引用已有结果。</p></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><h3>上传资料，接着讨论</h3><p>把文件保存到当前工作区，直接在草稿中插入文件引用。消息、代码块和链接提供对应的复制、打开等操作，也支持键盘菜单。</p></td>
    <td width="50%" valign="top"><h3>代码、终端与侧边对话</h3><p>在右侧工作台查看文件、编辑器、Git/diff、浏览器和任务。用 Sidechat 延展讨论，用固定终端在切换会话时保留工作状态。</p></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><h3>内置插件市场</h3><p>浏览和搜索插件，查看详情、安装与管理。可启用 1024Store、dshfind 合作目录；其他目录可按公开合同和适配机制接入。</p></td>
    <td width="50%" valign="top"><h3>原生桌面与可见的更新进度</h3><p>独立窗口、系统托盘、工作 Profile 与持久化布局。About 页显示真实下载进度、校验状态和安装交接，便于了解更新进展。</p></td>
  </tr>
</table>

### 用语音推进任务

在 **设置 → 实时语音** 中配置提供方并启用入口，再使用会话中的语音按钮。

- **Qwen 级联**：语音转写 → 当前 DSH Agent → 语音回复，适合需要工具与审批的任务。
- **豆包级联**：Seed-ASR 2 转写、DSH Agent 执行、Seed-TTS 2 播放回复。
- **Qwen 原生语音 Agent（实验）**：普通对话由原生实时音频模型处理，文件、终端与任务通过 DSH 能力接入。

字幕可独立滚动，阅读历史时暂停自动跟随；任务开始后，语音窗口可收起为可拖动的小型控制条，继续显示状态并提供静音、结束和恢复操作。收起窗口不会结束通话，也不会自动批准 Agent 操作。

[配置 Qwen / 豆包凭据](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/user-guide-realtime-voice-credentials.md)

### 从看图到生成、保存原图

图片输入与图片输出是两种不同能力：

| 你想做的事 | 操作与条件 |
| --- | --- |
| 让模型看图 | 高级模式下点击 **+ → 添加图片**，或粘贴、拖放图片；当前模型需要支持图片输入 |
| 生成或继续编辑图片 | 选择支持图片输出、且提供方已接入对应图片协议的模型，再发送生成或编辑请求 |
| 保存结果 | 打开原图预览，点击 **保存图片**，将已存储的原始附件保存到本地 |
| 配置自定义模型 | “获取模型”读取供应商能力；支持图片输入自动识别与手动覆盖，名称推断会与明确声明区分 |

原有附件栏、多图显示、滚动与失败重试继续保留。图片生成已接入可复用的供应商协议，包括已适配的阿里云 Qwen-Image 路径；实际可用性仍取决于提供方接口、模型和账号权限。仅添加一个模型名称不会自动接入新的图片协议。

[图片协议接入说明](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-image-protocols.md)

### 把资料带进工作区

高级模式点击 **+ → 上传文件到工作区**，文件会保存到当前会话绑定的工作区或 Git worktree，并把相对路径加入草稿。输入暂不可用时，可以稍后点击 **插入引用**。

- 每次最多 **10 个文件**，单个文件不超过 **25 MiB**；同名文件独立保存，不覆盖已有内容。
- 文件保存在工作区的 `.dsh-uploads/` 下，Agent 可以使用当前工具读取。
- 上传 PDF、Office 等资料并不等于自动解析；读取和转换能力由已安装工具提供。
- **+ → 指令 /** 保留原有 Commands；消息和代码块支持右键或 `Shift+F10`，按内容提供复制文本、复制代码、复制整条消息、复制/打开链接等操作。

### 在同一个工作台完成代码任务

维护中的 **Better Sidebar 0.18.0** 提供 Explorer、编辑器、统一文件变动与 Git/diff、浏览器、终端、子 Agent 和后台任务面板。

- **Sidechat**：从会话延展侧边讨论，正确区分继承历史和父会话待处理输入；重载后恢复模型选择。
- **固定终端**：支持工作区级或全局固定，跨会话继续使用同一终端；Ctrl/Cmd+Click 打开受支持的链接。
- **Markdown 预览**：拆分预览支持本地图片引用，包括相对路径、中文与空格。
- **Git worktree**：用受管工作树为任务提供独立的工作目录，并查看对应改动。
- **会话阅读**：过程内容折叠、宽度与字号调节、历史导航、用量和耗时信息沿用 Harness RC1。

### 通过插件扩展工作台

从左侧 **插件市场** 进入发现与搜索，查看详情后执行安装和管理。合作来源需要明确添加并启用；目录收录不等于对插件的审核或推荐。

桌面壳本身也以 DSH 插件运行。兼容所固定 Runtime 的模型、工具和界面插件可按组合机制接入；Desktop 提供 Profile、插件管理及原生桌面服务。社区互操作 RFC 仍在演进，不能把提案中的合同当作已实现功能。

[插件市场](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/dsh-community-market/README.zh.md) · [插件开发](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-development.md) · [一起建设插件生态](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-ecosystem.md)

## 2.2.7 最近改进

- 高级模式新增图片/文件添加入口、原图保存和会话内容菜单；普通聊天与语音获得准确的桌面产品上下文。
- 修复 Sidebar Markdown 本地图片显示、Sidechat 历史继承和模型冷恢复。
- 改善窗口边缘、窄窗口中的子菜单定位，以及键盘关闭后的焦点恢复。
- Windows 插件安装和非交互子进程隐藏后台控制台；临时目录清理不跟随目录链接。

[完整更新说明、兼容边界与验证结果](https://github.com/rw0104/DSH-desktop/releases/tag/v2.2.7)

## 模式与平台

| 项目 | 说明 |
| --- | --- |
| 高级模式 | 提供 Desktop 布局、原生材质，以及本文的 **+ 菜单、原图保存工具栏和会话内容菜单** |
| 兼容模式 | 保留上游默认客户端，通过产品组合提供右侧工作台；不展示高级模式专属控件 |
| 共同基础 | 受管 Runtime/Profile、桌面原生文本菜单、Host 产品上下文与插件组合 |
| Windows / macOS | Windows 提供正式安装器与 Mica；macOS 保留源码构建与 vibrancy 支持，未发布 DMG |

手机远程控制、Channels，以及尚未审查的上游文件操作和预览增强不属于当前功能。Qwen 原生语音 Agent 的实验标记不因桌面版本正式发布而改变。

<a id="getting-started"></a>

## 开始使用

1. [下载 Windows 2.2.7 安装器](https://github.com/rw0104/DSH-desktop/releases/download/v2.2.7/DSH-Desktop-2.2.7-x64-Setup.exe)，选择目录并安装。
2. 打开 **设置 → 模型**，配置提供方、凭据和可用模型。
3. 选择或创建工作区，开始会话；按需添加图片或上传文件。
4. 需要语音时，再配置 **设置 → 实时语音** 中的凭据与模式。

安装包已包含 Harness Runtime 和 Better Sidebar。原生图片能力不需要 Vision Toolkit；本产品不再捆绑或加载该插件。

## 文档与源码

| 目标 | 入口 |
| --- | --- |
| 安装、会话、Profile、终端与插件 | [2.2.7 用户指南](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/user-guide.md) |
| 配置实时语音 | [Qwen / 豆包凭据指南](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/user-guide-realtime-voice-credentials.md) |
| 扩展模型、工具或桌面能力 | [插件开发](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/plugin-development.md) · [Desktop 服务](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/dsh-plugin-desktop/docs/plugin-services.md) |
| 理解产品边界 | [架构](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/architecture.md) · [为什么做 Desktop](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/why-desktop.md) |
| 查找更多文档 | [文档索引](https://github.com/rw0104/DSH-desktop/blob/v2.2.7/docs/README.md) · [参与贡献](CONTRIBUTING.md) |

从与正式安装器对应的 **v2.2.7 tag** 开始运行，避免把默认分支的历史代码误当作最新发布版。开发环境需要 Node.js `^22.19.0` 或 `>=24.0.0`，通过 Corepack 使用根 Yarn：

```sh
git clone --branch v2.2.7 --recurse-submodules https://github.com/rw0104/DSH-desktop.git
cd DSH-desktop
corepack yarn install --immutable
corepack yarn dev
```

正式版固定 Harness `0.1.2-rc.1` 和 Sidebar `0.18.0`。`deepseek-harness/` 是未直接修改的上游子模块；桌面适配位于自有插件和受审查的 Yarn patch。根工作区使用 Yarn，上游子模块保留自己的 pnpm 工作区。运行 `corepack yarn check` 执行完整无界面检查。

## 社区与致谢

DSH Desktop 交流 QQ 群：**1106941154**。技术团队联系：[1576186341@qq.com](mailto:1576186341@qq.com)。

<img src="assets/dsh-desktop-qq-group.png" alt="DSH Desktop 交流群二维码" width="220">

感谢 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[Cordis](https://github.com/cordiverse/cordis)、[Better Sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 与 [Koishi](https://koishi.chat/) 社区，以及参与插件、测试、反馈和文档的贡献者。上游贡献记录保留其来源，不表示上游团队参与或背书本仓库。

<details>
<summary>社区项目与友情链接</summary>

以下是独立社区项目，不代表内置功能或兼容性认证。

| 项目 | 说明 |
| --- | --- |
| [dshfind](https://github.com/hikariming/dshfind) | Harness 学习与分享社区 |
| [DSH 1024Store](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) | 社区插件目录与市场 API |
| [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | 插件精选列表 |
| [dsh-market](https://github.com/dsh-market/dsh-market) | 可视化插件市场 |
| [ModLens](https://github.com/liustack/modlens) | 独立的视觉与 OCR 插件项目 |
| [DeepSeek Harness Orange Book](https://github.com/alchaincyf/deepseek-harness-orange-book) | 社区使用手册 |
| [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) | Web 界面插件与主题 |
| [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) | 终端交互界面 |
| [dsh-tianshu-tui](https://github.com/huiliyi37/dsh-tianshu-tui) | 交互式终端 UI 插件 |
| [dsh-context](https://github.com/bowenliang123/dsh-context) | 上下文可视化与管理 |
| [Agents-Anywhere](https://github.com/anywhere-labs/Agents-Anywhere) | 独立的移动端远程控制项目 |
| [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | 文件、终端、Git 与子代理工作台 |
| [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness) | 插件、工具与基础设施列表 |
| [MkSaaS / TanStarter](https://mksaas.com) | 社区友情链接：商业 SaaS 模板 · [TanStarter](https://tanstarter.dev) |

推荐社区项目可通过 [DSH Desktop Issues](https://github.com/rw0104/DSH-desktop/issues)。

</details>

## 许可证

本项目使用 [MIT License](LICENSE)。再分发时请保留 Harness、Sidebar、可选插件和传递依赖的许可证与版权声明。DeepSeek 及相关标识属于各自权利人；本项目为独立社区产品。
