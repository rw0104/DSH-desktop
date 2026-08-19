# DSH Desktop

面向 DeepSeek Harness 的原生桌面工作台。把 Agent 会话、代码、终端、Git、子代理和视觉工具放在一个可直接使用的桌面应用中。

![DSH Desktop 工作台](assets/dsh-desktop-workbench.png)

## 下载

当前 Windows x64 安装包：

[下载 DSH Desktop v1.0.6](https://github.com/rw0104/DSH-desktop/releases/tag/v1.0.6) · [直接下载 Windows 安装器](https://github.com/rw0104/DSH-desktop/releases/download/v1.0.6/DSH-Desktop-1.0.6-x64-Setup.exe)

安装包支持当前用户安装、选择安装目录、开始菜单和桌面快捷方式。当前安装包未进行 Authenticode 签名，Windows 可能显示 SmartScreen 或 Unknown Publisher 提示。

## 交流群

DSH Desktop 交流 QQ 群：**1106941154**。

![DSH Desktop 交流群二维码](assets/dsh-desktop-qq-group.png)

## 产品能力

- **桌面工作台**：原生 Electron 窗口、单实例、托盘、启动反馈和受管 DSH Profile。
- **会话与 Agent**：沿用 DSH 的会话、Agent、Tool、Credential 和 Profile 能力。
- **代码工作区**：Explorer、编辑器、Git、浏览器、终端、子代理和后台任务集中在工作台中。
- **Vision Toolkit**：图片问答、Grounding、OCR、UI 还原、像素差异和素材提取；首次使用会说明图片外发边界。
- **Better Sidebar**：右侧 Explorer、编辑器、Git、浏览器、终端和任务面板；新用户默认收起，用户手动展开。
- **原生窗口体验**：Windows Mica、macOS vibrancy、持久化布局和 Windows 标题栏控件避让。
- **工作区选择**：Windows 目录选择器只显示当前机器真实存在的盘符，并支持从盘符根目录开始浏览。
- **系统语言**：中文系统显示中文隐私提示和界面文案，其他系统语言使用对应的英文文案。

## 基于 DeepSeek Harness 的新增内容

DSH Desktop 使用官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 作为 Agent 和 Web Runtime，在不修改官方 DSH 源码的前提下增加桌面产品层：

- Electron 原生桌面壳、托盘、窗口生命周期和安装更新交接；
- Windows Mica/macOS vibrancy 的 Advanced Shell，以及官方左侧栏和 Better Sidebar 右侧工作区的布局组合；
- Vision Toolkit `0.1.24` 与 Better Sidebar `0.13.1` 的固定产品组合；
- Vision 隐私同意、Python/Chrome 运行时健康检查和失败时的可见反馈；
- Profile 管理、受管终端、Windows 目录选择增强和发布体积/内存门禁；
- Windows x64 NSIS 安装包和 GitHub Release 发布流程。

官方 Runtime 继续负责 Agent、Session、Tool、Profile、Credential 和 Web Runtime；DSH Desktop 负责桌面窗口、工作区体验和产品插件组合。

## 安装与首次启动

1. 从 [v1.0.6 Release](https://github.com/rw0104/DSH-desktop/releases/tag/v1.0.6) 下载 Windows x64 安装器。
2. 选择安装目录并完成安装。
3. 启动 DSH Desktop。首次启动会显示 Vision Toolkit 隐私提示；中文 Windows 会显示中文提示。
4. 在 DSH Settings 中配置模型、凭据和视觉服务。Python 是 Vision 本地工具的前置条件；Chrome、Chromium 或 Edge 只在使用 HTML 截图时需要。

安装器已经包含 DSH Runtime、Vision Toolkit 和 Better Sidebar，不要求客户电脑预装 Node.js 才能启动桌面应用。

## 从源码运行

源码开发需要 Node.js 22.19+ 或 24.x，以及 Corepack：

```powershell
git clone https://github.com/rw0104/DSH-desktop.git
cd DSH-desktop
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn dev
```

`deepseek-harness/` 是固定版本的上游 Git 子模块；桌面产品代码和打包配置维护在本仓库。

## 许可证

本项目使用 MIT License。再分发时请保留 DeepSeek Harness、Vision Toolkit、Better Sidebar 及传递依赖的许可证和版权声明。DeepSeek、DeepSeek Harness 及相关标识属于各自权利人，本项目不代表官方背书或商业合作关系。
