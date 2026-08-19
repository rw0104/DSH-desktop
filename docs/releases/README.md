# Release notes workflow

每次桌面功能完成或版本升级，都必须在创建 tag 前新增 `docs/releases/vX.Y.Z.md`。Release 说明不是一句摘要，而是用户和维护者都能执行的交接记录。

## 必须记录

- 版本、发布日期、目标平台和升级方式。
- 用户可见的新功能、修复、行为变化和已知限制。
- 影响到的桌面模块、配置、数据迁移或手动操作。
- 验证命令及结果，包含发布 gate 和打包产物名称。
- 安装包、Release URL，以及签名或未签名状态。

## 发布顺序

1. 完成功能与测试，写入版本说明。
2. 运行对应平台的 headless gate 和打包验证。
3. 在同一版本提交中更新两个 `package.json`、README 下载链接和文档。
4. 创建版本 tag 并推送；GitHub Release 正文链接到对应文档。
5. 核对 Release 的 Setup、Update、blockmap 和 `latest.yml` 资产。

## 模板

```markdown
# DSH Desktop vX.Y.Z

## 用户摘要

一句话说明这次版本解决了什么。

## 变更

### 新功能

- ...

### 修复

- ...

### 更新方式

- ...

## 验证

- `command`: result

## 产物与限制

- Release URL: ...
- Artifacts: ...
- Known limitations: ...
```
