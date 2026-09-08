# Agent Note: 完整桌面体验与临时诊断

Status: implemented

## 问题

旧 compatibility/advanced 呈现开关同时分流业务功能：文件操作在一个分支，完整语音浮窗在另一个分支。Sidebar 的类型标签打开操作可能创建隐藏的语音标签，模拟 openTab 的测试不能证明可见性。

## 决策

`desktop-experience.ts` 将日常桌面体验与 system/native 窗口外观分别解析。旧 mode 字符串保留为迁移输入及窗口适配值。标准、PTC、自定义 Agent 预设仍独立决定上游工具组合。

Host 上传路由和 Client 文件、语音能力在两种日常外观中共用；只有 native 外观替换 root/layout 几何。语音共用一个非模态窗口和 Controller，已保存的 Sidebar 语音标签作为启动入口。挂载的窗口必须通过可见性与模态遮挡检查后才请求票据和麦克风；恢复通话保留原会话归属，关闭和卸载取消等待并释放媒体及订阅。

设置呈现限定于公开的 sidebar.settings 锚点及已测试的当前语义子树。浅色遮罩 12%、深色 24%，关闭背景 blur，保留原有轻投影。协调器观察设置和 body portal 的直接子节点生命周期，保留所属菜单的交互性、恢复焦点/inert，并把 Escape 交给最高层受支持界面；不观察流式消息子树，也不替换上游内容组件。

## 迁移与恢复

Profile 外观写入固定 presentation-v2.json，严格保留旧 state.json v1 格式作为旧程序可读镜像。v2 最后原子提交并记录镜像摘要。写入间中断或旧程序修改 v1 后，下一次从完整且经过校验的 v1 值重新迁移。两份记录不复制凭据或会话。保留既有 Profile 私有偏好优先级；共享文档缺少 windowStyle 时，协调前不能用准备好的外观值填补该缺失。

显式 `--upstream-diagnostic` 参数选择临时内存组合，禁用第三方行并恢复官方 layout；Desktop Client 只运行最小启动报告。诊断只读选择状态，不消费 pending、不 claim 安装 WAL、不提交正常偏好、健康或回滚；启动状态所有者同时约束成功和失败路径。托盘通过同一重启协调器返回普通桌面，诊断标记不保存为日常偏好；第二实例的诊断请求也走该重启路径。

## 验证边界

单测覆盖当前与归档的 2.2.7 偏好读写器、两次原子提交前的中断、Profile 选择及真实安装 WAL 字节。Profile smoke 验证 native/system/diagnostic 的 Host 和 Client 图。`verify:surfaces` 在隐藏 Electron 中运行生产组件，覆盖设置遮罩、菜单、嵌套预览、焦点、反复开关、语音可见性与媒体清理。测试使用隔离 home 和合成供应商状态，不代表真实供应商音频或跨平台安装已通过。

旧 compatibility/advanced Agent Notes 继续作为原生几何的历史记录，其中的功能分流和单一共享 mode 持久化描述由本决策及当前用户指南取代。
