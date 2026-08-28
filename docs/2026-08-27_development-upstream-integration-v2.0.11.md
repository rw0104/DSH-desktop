# DSH Desktop v2.0.11 上游集成开发记录

## 目标

本轮跟进官方 DeepSeek Harness、Better Sidebar 和桌面参考仓库的最新信号，在不修改官方 Harness 子模块的前提下，把已证明兼容的桌面改进接入 DSH Desktop，并生成新的 Windows x64 本地安装包。

## 上游审计

审计日期：2026-08-27。GitHub 访问通过 `http://127.0.0.1:10808` 代理完成。

| 组件 | 远端/registry 最新信号 | 处理 |
| --- | --- | --- |
| 官方 Harness | `master`、`dsh-v0.1.1-rc.2`、本地 submodule 均为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；npm `latest/next` 为 `0.1.1-rc.2` | 不升级；继续使用官方 pin |
| Better Sidebar | npm/tag 仍为 `0.16.1`；`main` 为 `20da6479f14689db126a3f147670220a70dfbf6b`，包含尚未发布的 `0.17.0` pinned-terminal 设计 | 不接入未发布 API；继续使用 `0.16.1` |
| 桌面参考 | `master` 为 `1eb398d78108de1303ce29b1aeaf70aaf96acee4`；最新 tag `v2.0.3` 为 `681ba66091fc5b1e827650137f69b3ee4c435922` | 只移植独立、可审计的 UI/诊断/拖拽改进 |

## 接入内容

### Community Market

- Market launcher 使用本地 storefront SVG 图标，避免把插件图标误认为 Cordis 插件入口。
- Desktop 设置导航增加独立显示器图标，通过 rc2 下游 patch 注入，不修改 `deepseek-harness/`。
- package manager 执行期间捕获最多 32 KiB 的 stdout/stderr 尾部，并将异常原因限制在 4 KiB。
- 失败诊断同时写入 Desktop 日志和 loopback API 响应；Renderer 只显示 Host 生成的命令和受限输出。
- 自动安装失败后不复用一次性确认 token；失败弹窗提供打开 DSH Terminal 的显式入口。

### Workspace 文件夹拖拽

- 在 Chromium 尚未暴露 `File` 时，使用目录 entry/空 MIME 类型识别悬停目录。
- 捕获阶段优先声明 Workspace drop target，避免官方聊天附件的 document-level mask 抢占拖拽事件。
- `dsh-client-ui-attachment` 和 `dsh-client-ui-conversation` 继续锁定官方 `0.1.1-rc.2`，仅通过可审查 Yarn patch 添加 drop-target 边界。

## 修改边界

- 没有修改 `deepseek-harness/` 子模块内容或 gitlink。
- 没有合并参考仓库的根 README、版本号、市场实现或 setup/recovery 大批量改动。
- 没有接入 Better Sidebar `main` 的未发布 `0.17.0` pinned-terminal 状态迁移。
- 产品版本由 `2.0.10` 升至 `2.0.11`；官方 Harness 与 Sidebar runtime pin 不变。

## 验证

```powershell
corepack yarn install --immutable
corepack yarn typecheck
corepack yarn check
corepack yarn workspace dsh-plugin-desktop package:dir
```

本轮结果：

- Market 聚焦测试：80 passed；桌面拖拽/包面聚焦测试：43 passed；
- 完整 `corepack yarn check`：Market 270 passed，Desktop 707 passed、11 skipped；
- Runtime closure：201 个 first-party 节点闭合；
- `package:dir`：Windows x64 unpacked 应用构建成功，afterPack 与 PE 结构验证通过；
- immutable install 仅有既存 peer warning（`YN0086`），未导致门禁失败。
- Windows 冷缓存下 Profile junction 解析和 Market worker 启动受到 Defender/NTFS 扫描影响；测试只提高 Windows 超时与 worker 上限，生产 Profile 和 Market 行为未改变。

## 本地安装包

安装器由本机 `corepack yarn dist:win` 构建，Electron 43.4.0 使用机器级缓存，未把 Electron 压缩包复制进仓库。

- 文件：`dsh-plugin-desktop/dist/DSH-Desktop-2.0.11-x64-Setup.exe`
- `latest.yml`：`dsh-plugin-desktop/dist/latest.yml`
- 安装器大小：构建后记录
- 安装器 SHA-256：构建后记录
- `latest.yml` 大小/SHA-256：构建后记录
- Authenticode：本产品延续 unsigned 策略，构建后由 verifier 回读

发布前只上传版本化 Setup 与 `latest.yml`，不上传 `win-unpacked`、缓存、Profile 或临时目录。
