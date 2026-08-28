# Product

## Register

product

## Users

DSH Desktop 面向在 Windows 与 macOS 上使用 DeepSeek Harness 的开发者和高阶用户。他们在长时间工作会话中管理工作目录、Agent 会话、文件、终端、Git、插件和更新，希望开箱即用，不需要先安装 Node.js、pnpm 或手工维护 DSH profile。主要任务是持续推进代码与自动化工作，而不是配置桌面壳本身。

## Product Purpose

产品把固定版本、未经修改的官方 DeepSeek Harness Runtime 与 Web UI 放进原生 Electron 生命周期，并通过合法的 Cordis 插件组合提供窗口、托盘、profile、受管终端、Better Sidebar、安装和更新。原生视觉模型直接使用官方 `image` 附件链，不再加载 Vision Toolkit。成功意味着官方兼容模式保持原样，Advanced 模式提供更适合桌面的工作台组合，安装、启动、目录选择、侧栏和工具行为稳定且可验证。

## Brand Personality

克制、可靠、原生。界面应像成熟的开发工具：安静、精确、密度合理，控件与 Windows/macOS 平台习惯一致。Codex Desktop 是信息架构和工作台节奏参考，但产品保持 DSH Desktop 自己的品牌、图标和实现。

## Anti-references

- 不复制 Codex 品牌、图标、源码或专有视觉资产。
- 不使用营销落地页式的大标题、渐变文字、玻璃卡片或装饰动画。
- 不增加与官方 DSH 或 Better Sidebar 重复的控制条和入口。
- 不用硬编码英文破坏系统语言，也不为了“像原生”而覆盖标准键盘、焦点和窗口行为。
- 不让隐藏标题栏控件与内容工具栏重叠、漂移或形成不一致的按钮基线。

## Design Principles

1. 工作优先：所有视觉调整都应缩短定位文件、切换面板和执行任务的距离。
2. 组合而非复制：保留官方 DSH surface，通过记录过的 Slot、Service 和桌面插件边界增强它。
3. 原生可信：窗口、标题栏、焦点、快捷键、系统语言和错误反馈遵循平台预期。
4. 一致胜过装饰：同一工具栏中的控件共享尺寸、垂直中心、图标权重和交互状态。
5. 证据驱动：DOM、截图和真实 packaged Electron 共同决定 UI 是否完成。

## Accessibility & Inclusion

桌面控件必须可通过键盘操作，保留清晰的 focus-visible 状态和可读的 aria-label；颜色不能成为唯一状态信号。界面跟随系统语言，并尊重 reduced-motion。当前不宣称已完成正式 WCAG 认证，但新增与修改的交互以 WCAG 2.2 AA 的键盘、焦点、对比度和语义要求作为工程目标。
