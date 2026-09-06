# 接入新的图片供应商

DSH Desktop 在普通 Agent 会话内使用所选模型的图片能力。供应商配置描述能力和协议，协议适配器转换请求与响应，共用执行器负责网络请求、图片保存和异步任务。聊天、生图、编辑可以使用同一供应商的不同接口，供应商的聊天协议不等于图片协议。

## 复用已有协议

当供应商提供已支持的图片 API 时，接入只需配置该供应商的图片协议和模型能力。以下是供应商接入维护者使用的配置示例，不是每次会话的操作步骤：

```yaml
llm-pi-ai:
  providers:
    example:
      api: openai-completions
      baseURL: https://api.example.com/v1
      apiKeyEnv: EXAMPLE_API_KEY
      imageGenerationApi: openai-images
      imageResultHosts:
        - images.example.com
      models:
        - id: chat-model
          output: [text]
        - id: image-model
          input: [text, image]
          output: [image]
```

供应商级 `imageGenerationApi` 只应用于声明图片输出的模型，不改变文本模型的聊天调用。模型条目可以用同名字段覆盖供应商默认值。模型发现会保留供应商返回的输入、输出和协议信息；已审查的供应商规则可以补齐缺失信息。阿里云的已知 Qwen 图片模型提供自动补全，其他有图片输出声明的新模型可以复用同一供应商规则。

当前内置协议：`chat-completions`、`openai-images`、`openrouter-images`、`google-generative-ai`、`openai-responses`、`dashscope-images`。不同供应商可以复用同一种协议。兼容声明不足以证明供应商实现了所有接口，接入维护者应核对实际合同。

## 接入不同的协议

已加载且受信任的 Host 插件可从 `@deepseek-ai/dsh-llm-pi-ai/image-protocols` 导入 `registerImageProtocol` 和 `ImageProtocol`，在配置使用该协议的模型前完成注册，并在插件卸载时调用返回的释放函数。禁止覆盖已有协议 ID。

适配器仅需实现：

- `prepare(context)`：返回请求地址、方法和请求体。
- `normalize(record)`：将供应商响应转换为文字、图片数据/URL、用量、完成状态或任务状态。
- `poll(job, context)`：可选，描述异步任务查询。执行器提交生成请求一次，随后只查询该任务。
- `history(options)`：可选，将会话转换成供应商允许的历史形式，例如单轮图片编辑。
- `assetURLAllowed(url, context)`：可选，声明供应商结果存储域名；默认接受所选 API 的同源地址及配置的 `imageResultHosts`。

静态配置和模型目录不能直接提供可执行代码。真正的新协议需要一个经过审查的适配器；系统不会凭模型名称试探接口、寻找凭据或切换供应商。

## 共用执行行为

执行器统一处理内联 base64 图片和允许域名上的 HTTPS 图片结果，验证格式并保存到正式附件存储。URL 下载不携带 API 密钥，不接受重定向；请求和任务查询保持在选定 API 的同一 origin。接入新的 CDN 时，在供应商描述中声明其准确主机名。

生成响应上限为 64 MiB，单图上限为 20 MiB，图片数量和总大小还受附件存储配置约束。支持 PNG、JPEG、WebP、GIF。异步查询受请求超时、取消信号和最多 120 次查询限制；取消会停止后续查询，不代表远端已经取消计费任务。

协议未知时返回 `UNSUPPORTED_PROTOCOL`，不尝试其他地址。无正文的普通 HTTP 400/413 不再通用地标为上下文超限；真实上下文超限仍按供应商明确错误或已确认的供应商特例识别。

## 新供应商验收

每个新协议至少应验证：模型能力发现与保存、请求格式、文字模型不受图片默认协议影响、同步图片、后续编辑、URL 图片保存、异步提交/查询、取消、错误分类及凭据不被发送到其他 origin。默认使用录制响应或本地服务；真实账号验收单独记录模型、地区和接口版本。

核心合同回归：`corepack yarn workspace dsh-plugin-desktop test tests/model-native-image.spec.ts tests/model-auto-capability.spec.ts`。测试包括两个仅配置不同的供应商，以及不修改 Agent 即可接入的异步协议。通过这些测试不代表任意未接入供应商已被验证。
