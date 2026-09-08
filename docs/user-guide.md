# DSH Desktop 用户指南

## 安装与首次启动

从产品下载入口获取 macOS 或 Windows 安装包。安装后的 DSH Desktop 自带运行所需的 Electron、Node 和 DSH 依赖，普通用户不需要另行安装 Node.js 或 pnpm。

首次启动时，应用会准备默认 profile，并在本机启动官方 DSH Web surface。关闭窗口通常只会隐藏窗口；可以从托盘重新打开，选择 **退出** 才会结束应用和 Host 进程。

## Profile

Profile 是一组 DSH bundle、依赖和 patch 的组合。托盘中的 **Profile** 菜单会列出现有 profile，以及可按需创建的 `desktop` 和 `web` 默认 profile。

选择 profile 后应用会有序重启。新 profile 在 Host、窗口和浏览器客户端都成功启动后才会被记录为最近一次可用 profile；启动失败会回到上一次可用选择。官方 profile 默认使用同一个 DSH home，所以 sessions、settings 和 storage 通常不需要迁移。自定义配置（patch）如果主动改写持久化路径，则以该 profile 自己的设置为准。

切换 profile 不会把旧 profile 的插件偷偷复制到新 profile。要管理目标 profile，请在终端中显式写出 profile，或者在切换后使用终端里的默认命令。

## 窗口外观与 Agent 预设

- **系统窗口**与**原生桌面外观**位于设置的“窗口外观”页。两者都提供完整的 + 菜单、图片保存、会话菜单、语音浮窗和工作台；外观不决定功能。
- **标准模式、PTC、创造模式**是 Agent 预设，决定工具组合，与窗口外观无关。语音和上传不要求更换标准 Agent。

选择外观后点击“应用并重启”。Linux 使用系统窗口并保留完整桌面能力。旧 `compatibility`/`advanced` 设置分别迁移为 `system`/`native`，不重置模型、凭据或会话。

语音启用并配置凭据后，输入框入口打开独立浮窗；侧栏可以保持收起。任务期间可收起成控制条，再恢复原通话。Escape 只收起语音窗口，明确的“结束”或“关闭”才停止通话。

需要排查桌面扩展时，从托盘的“故障排查”选择“使用上游原始界面”，或运行 `dsh-desktop --upstream-diagnostic`。该次启动不加载第三方界面，也不覆盖正常外观偏好或推进待确认的安装事务。通过托盘“返回 DSH Desktop”，或退出后普通启动，恢复完整桌面。它不是日常的另一档功能模式。

## 本地 Web 端口

Desktop 默认让系统随机分配本地 Web 端口（`dsh-desktop.port: 0`），可避免与其他服务发生端口冲突。依赖浏览器 `localStorage` 的界面插件按 origin 隔离数据；如果这类插件需要在 Desktop 重启后继续读取设置，请在设置中指定一个固定端口：

```yaml
dsh-desktop:
  port: 43189
```

端口必须是 `0` 到 `65535` 之间的整数。修改后应用会有序重启，服务仍只监听 `127.0.0.1`。固定端口如果已被其他程序占用，Desktop 将无法启动；此时需要释放该端口，或把设置改回 `0` 或另一个空闲端口。

## 插件管理

插件是给 DSH 添加能力的扩展包，例如模型、工具、界面和工作流。DSH Desktop 使用的就是官方 Harness 的插件体系，官方插件可以直接安装使用；多个插件遵循统一的约定，可以一起安装、一起工作。

普通 DSH 插件仍使用官方 CLI 语义：

```sh
dsh plugin --profile desktop add <plugin>
dsh plugin --profile desktop remove <plugin>
dsh plugin --profile desktop update
```

在 DSH Desktop 托盘打开的终端中，裸 `dsh` 和不带 `--profile` 的 plugin 命令默认使用当前激活 profile：

```sh
dsh plugin add <plugin>
dsh plugin remove <plugin>
dsh plugin update
```

显式 `--profile <name>` 始终优先。插件变更后需要重启 DSH Desktop，才能让新的 bundle 进入 Loader 组合。

## 打开终端

从托盘选择 **Open DSH Terminal**。macOS 会打开 Terminal，Windows 会优先使用 Windows Terminal，找不到时回退到 PowerShell 或命令提示符。

欢迎信息会显示：应用版本、当前 profile、profile 目录和 DSH home。Desktop 会在自己的 user-data 目录生成 `dsh`、`pnpm` 和 `node` 私有 shim，只对这个终端进程设置 PATH，不会修改系统 PATH 或用户 shell 配置。

## 更新

打包后的应用会在后台检查 `rw0104/DSH-desktop` 的 GitHub 最新稳定 Release。后台检查不阻塞启动；网络错误、GitHub 限流、非 200、draft/prerelease、非法 tag 或远端版本不新时保持静默。

托盘中的 **Check for Updates…** 是手动检查：即使已经是当前版本，也会显示结果；检查失败会提示稍后重试。只有稳定 Release 版本严格高于本地版本时，应用才会询问是否下载。用户取消不会请求安装包。

确认下载后，Windows 应用会先打开原生的“保存更新安装包”对话框，默认建议保存到 Downloads；你可以改用其他目录和文件名，取消对话框则不会开始下载。保存后应用才会请求精确 tag 下的 `DSH-Desktop-<version>-x64-Setup.exe`，验证 PE 文件并记录安装包位置，然后再次询问是否退出并启动安装。升级完成并重新启动后，应用会询问是否删除安装包，也可以选择保留。下载和安装失败不会破坏当前版本，托盘仍可重试。当前下游未发布 macOS DMG，因此 macOS 只报告新版本，不显示下载确认。

## 排查

- **应用能够进入托盘**：右键托盘图标，选择 **导出诊断信息…**。确认隐私提示后，Desktop 会生成 `diagnostics-*.zip` 并在文件管理器中显示它。
- **应用持续闪退，无法进入托盘**：在 PowerShell 中直接运行安装后的程序并加上恢复参数。默认安装位置的命令如下；如果安装时修改过目录，请替换为实际的 EXE 路径。

  ```powershell
  & "$env:LOCALAPPDATA\Programs\DSH Desktop\DSH Desktop.exe" --export-diagnostics
  ```

  通过 npm 安装过桌面启动器时，也可以运行 `dsh-desktop --export-diagnostics`。这个命令不会启动 Host、profile、插件或窗口；完成后会在终端输出诊断 ZIP 的绝对路径。
- **诊断包内容**：包含最近的应用日志、本地 Crashpad `.dmp`、当前运行标记和 `system-info.txt`。系统信息会记录 Desktop、Electron、Node、平台和架构版本。日志会对可识别的认证凭据脱敏，但本地路径、工作区 ID、会话 ID 和崩溃时的内存片段仍可能存在。公开上传前必须检查；不适合公开的 dump 应通过可信渠道提供。
- **窗口消失了**：先检查系统托盘，关闭窗口不是退出。
- **插件没有出现**：确认命令作用于目标 profile，并重启应用。
- **终端命令找不到**：从托盘重新打开 Desktop 终端；系统 shell 的全局 PATH 不会被 Desktop 修改。
- **更新没有提示**：后台错误会静默；使用托盘手动检查查看结果。

更底层的生命周期、打包和平台限制属于开发者文档，见[文档索引](README.md)。
