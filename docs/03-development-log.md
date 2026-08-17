# 分阶段开发记录

> 本文记录从方案文档进入代码实现后的阶段性结果。每个阶段都记录范围、改动、验证和未完成项，避免把未验证的功能当作完成状态。

## 2026-08-17：P0 版本与仓库基线

### 范围

- 以 DSH Desktop `v2` 分支作为目标仓库初始代码基线。
- 将远程仓库切换为 `https://github.com/rw0104/-DSH-desktop.git`。
- 保留 `deepseek-harness/` 为固定上游 Git 子模块，不修改其源码。
- 将可行性分析和开发任务规划纳入仓库。

### 结果

- 当前分支：`main`。
- 基线提交：上游 DSH Desktop `v2` 的 shallow commit `5968db6`。
- 文档提交：`728e68f docs: add feasibility analysis and development plan`。
- 运行时：Node `v24.16.0`、Yarn `4.18.0`。
- Yarn 使用 `node-modules` linker，并关闭未审查 install scripts。

### 验证

- `corepack yarn install --immutable`：通过。
- `corepack yarn workspace dsh-plugin-desktop typecheck`：通过。
- 根级 `corepack yarn check`：暂未通过，原因是上游子模块尚未 checkout。

### 环境限制

`git submodule update --init --recursive` 两次尝试均因当前环境连接 GitHub 失败，未能下载 `deepseek-harness`。子模块索引和 `upstream.json` 未被修改；完成完整根级检查前必须在可访问 GitHub 的环境重新执行该命令。

## 2026-08-17：P2-01/P2-02 默认插件组合

### 范围

- 将 Vision Toolkit `0.1.24` 和 Better Sidebar `0.12.3` 固定为桌面 Profile 的产品插件。
- 保持用户第三方插件顺序，并消除用户已经安装的同名插件重复项。
- 修复 `react-dom` peer 供给，保证 Sidebar 的 React 运行时契约明确。
- 对两个刚发布的产品插件增加 Yarn 精确版本预批准，保留其他依赖的最小发布年龄门禁。

### 代码改动

- `dsh-plugin-desktop/src/profile.ts`：新增 `DEFAULT_DESKTOP_PLUGIN_BUNDLES`，并在 `desktopBundleList()` 中统一插入和去重。
- `dsh-plugin-desktop/package.json`：加入 Vision、Sidebar、React DOM 的精确依赖。
- `.yarnrc.yml`：只预批准两个已审查的精确插件版本。
- `dsh-plugin-desktop/tests/profile.spec.ts`：覆盖默认顺序、重复安装、Profile 修复和用户禁用行为。
- `yarn.lock`：记录新增插件及其依赖闭包。

### 验证

- `corepack yarn install`：通过，插件依赖成功解析和链接。
- `corepack yarn workspace dsh-plugin-desktop exec vitest run tests/profile.spec.ts`：12 个测试通过。
- `corepack yarn workspace dsh-plugin-desktop typecheck`：通过。
- `corepack yarn workspace dsh-plugin-desktop build`：通过。
- `corepack yarn workspace dsh-plugin-desktop verify:profile`：通过，Profile/Host/Web 组装 smoke 可运行，renderer manifest 包含两个产品插件的 client entries。
- `corepack yarn workspace dsh-plugin-desktop verify:loader`：通过，桌面插件和 Profile-local Loader smoke 可运行。
- `corepack yarn workspace dsh-plugin-desktop verify:cli`：通过，Electron-backed CLI 和 pnpm shim smoke 可运行。
- `corepack yarn workspace dsh-plugin-desktop verify:closure`：通过，197 个 first-party runtime 节点闭包完整。

### 未完成项

- 还没有在真实 DSH Web/Headless Profile 中做插件挂载 E2E。
- 还没有验证 Better Sidebar 与 Desktop Advanced Shell 的联合布局。
- Vision 的 Python、Chrome、远程 Endpoint 和数据告知仍属于 P4。
- 目标仓库尚未完成本阶段 Git 提交和远程推送。

## 下一阶段

下一阶段进入 P2-03/P2-05：建立真实 Profile 挂载 smoke，验证两个插件的 Host/Client bundle、无重复 Sidebar、Vision 图片入口和 Sidebar 基础文件工作台。由于上游子模块当前未下载，完整 Loader smoke 需要先恢复网络或在可访问 GitHub 的环境运行。
