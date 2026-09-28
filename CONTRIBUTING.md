# 参与贡献

感谢你愿意参与 DSH Desktop。这是一个社区项目，无论你是普通用户、插件作者还是开发者，都有适合你的贡献方式。

## 普通用户：使用、反馈与传播

- 遇到问题或异常，[提 issue](https://github.com/rw0104/DSH-desktop/issues)：说明操作系统（macOS / Windows）、应用版本和复现步骤。
- 有功能想法或改进建议，也欢迎提 issue 讨论。
- 加入[交流群](README.md#交流群)（QQ 群：1106941154），帮助其他用户解决问题。
- 写使用教程、体验文章，或帮助完善和翻译文档。
- 在[友情链接](README.md#友情链接)中收录生态项目。

## 插件作者：扩展生态

DSH 的核心是插件。如果你写插件，请先阅读：

- [插件开发](docs/plugin-development.md)：如何编写普通 DSH 插件和 Desktop 插件。
- [DSH 插件生态倡议书](docs/plugin-ecosystem.md)：开放、可组合、可持续的生态愿景，以及组合优先、声明清晰、兼容优先三条原则。
- [DSH Community Fabric Draft](dsh-community-fabric/README.zh.md)：参与 Manifest、Capability、Host Descriptor 和事件 contract 的公开讨论。
- [Community Market 设计](dsh-community-market/docs/market-shell.zh.md)：市场如何发现插件，以及为什么收录不等于安全审核。

遵循倡议书的插件更容易与其他插件共存，也便于在插件市场中说明能力与兼容边界；收录不等于安全认证。

## 开发者：贡献代码

### 开发环境

```sh
corepack yarn check:runtime-boundary
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn check   # 完整 headless gate：构建、类型检查、测试与冒烟
corepack yarn dev     # 有图形环境时启动应用
```

`corepack yarn dev` 会构建并显式启动图形应用；`corepack yarn start` 使用已有构建。两者先只读检查真实 Profile 与当前 checkout 的依赖边界，再为这次运行建立独立的 Harness home、Electron user-data、临时目录和工作目录，最终退出后删除数据。不要在开发运行中保存需要长期保留的会话。

修改运行时代码、安装依赖或清理目录之前，先运行 `check:runtime-boundary`；自定义 Harness home 使用 `--home <绝对路径>`。发现真实 Profile 指向将要修改的 checkout 或 staging 时，先停止相关变更并安排经授权的恢复；不能通过删除用户依赖来让检查通过。测试与一次性冒烟使用 `scripts/run-isolated-check.mjs`，不得连接真实用户目录。

### 仓库边界（开始前务必了解）

- `deepseek-harness/` 是固定版本的上游子模块，**桌面开发不修改其中的任何文件**；上游内容更新走独立的 pin 提交。
- 桌面代码位于 `dsh-plugin-desktop/`；`dsh-community-fabric/` 是不可加载的社区标准文档 Draft；`dsh-community-market/` 已实现市场 Host/Client、目录合同、受审查适配器和安装边界。三个自有 package 共用外层 Yarn workspace。
- 构建、类型检查、单元测试和冒烟检查必须保持 headless-safe。

### 提交与 PR

- 提交信息使用 conventional commits 风格（例如 `fix(desktop): ...`、`docs: ...`）。
- 提交前运行 `corepack yarn check` 和 `corepack yarn check:docs` 并保证全绿。
- 变更生产依赖后，运行 `yarn workspace dsh-plugin-desktop verify:notices` 刷新第三方许可清单，并提交更新后的 `dsh-plugin-desktop/THIRD_PARTY_NOTICES.md`。
- 文档改动请中英同步，并更新 `README.i18n.yaml` 的双语 hash 记录。
- PR 描述说明改动内容、动机和验证方式；CI 通过后再合并。

## 加入技术团队

如果你希望加入我们的技术团队，欢迎通过 [1576186341@qq.com](mailto:1576186341@qq.com) 联系我们。

## 行为准则

请保持友善与尊重，就事论事。我们希望这是一个欢迎新人的社区。完整的[参与者公约](CODE_OF_CONDUCT.md)适用于所有项目空间。
