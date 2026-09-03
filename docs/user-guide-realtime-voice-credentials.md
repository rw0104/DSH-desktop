# 实时语音凭据申请与配置

> 适用于 DSH Desktop `2.1.0`。文档核对日期：2026-09-02。云厂商控制台名称可能调整，请以链接页面的当前字段为准。

DSH Desktop 的实时语音侧栏支持 Qwen 和豆包。Qwen 提供稳定的 Agent 级联和实验性的原生语音 Agent；豆包当前接入实时 ASR，再由 DSH Agent 负责文本回复和工具执行。普通设置页只展示这两种用户模式，Qwen Agent 桥接是开发诊断路径，不是第三个日常选项。

## 配置前先确认

| Provider | DSH Desktop 当前需要 | 还需开通 | 可选信息 |
| --- | --- | --- | --- |
| Qwen 级联模式 | DashScope/Model Studio 按量付费 API Key | `qwen3-asr-flash-realtime`、`qwen3-tts-flash-realtime` 调用权限 | Workspace ID |
| Qwen 原生语音 Agent | DashScope/Model Studio 按量付费 API Key | `qwen3-asr-flash-realtime`、`qwen-audio-3.0-realtime-flash` 调用权限 | Workspace ID |
| 豆包 | 语音应用 App ID、Access Token/Access Key | 流式 ASR 2.0、TTS 2.0、目标音色 | 自定义 TTS Resource ID/音色 |

安全要求：

- 不要把 API Key、Access Token、AccessKey Secret 写入 Git、截图、Issue 或聊天记录。
- DSH Desktop 的密钥输入通过 DSH credentials 存储；设置文件不保存明文。
- 阿里云账号 AccessKey ID/Secret 与 Model Studio API Key 不是同一种凭据。
- 火山引擎账号 AccessKey ID/Secret 与豆包语音应用的 Access Token/Access Key 也不是同一种凭据。

## 配置 Qwen

### 创建 Model Studio API Key

1. 登录[阿里云百炼控制台](https://bailian.console.aliyun.com/)。首次使用时按页面提示开通 Model Studio；中国大陆账号可能需要实名认证。
2. 在控制台右上角将地域切换到**华北 2（北京）**。DSH Desktop 当前 Qwen 共享域名和 Workspace 专属域名都使用北京地域，其他地域创建的 Key 不能混用。
3. 进入[API Key 管理](https://bailian.console.aliyun.com/?tab=model#/api-key)，选择“创建 API Key”。
4. “归属业务空间”优先选择默认业务空间。默认业务空间的 Key 可以调用标准模型；子业务空间的 Key 受该空间授权范围约束。
5. 权限建议先选“全部”。若选择“自定义”，至少允许以下模型：

   - `qwen3-asr-flash-realtime`
   - 级联模式需要 `qwen3-tts-flash-realtime`
   - 原生语音 Agent 需要 `qwen-audio-3.0-realtime-flash`

6. 若配置 IP 白名单，确认当前电脑出口公网 IP 在白名单中。排查阶段可先使用控制台默认的 IPv4 全放通策略，验证成功后再收紧。
7. 创建后立即复制完整 API Key。关闭弹窗后通常不能再次查看完整明文；丢失时应重置或重新创建。

官方参考：[获取与配置 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)、[API Key 权限](https://help.aliyun.com/en/model-studio/application-permission-management-overview)。

### 获取 Workspace ID

Workspace ID 不是音色，也不是 API Key。它是业务空间标识，用于组成 Workspace 专属访问域名。

1. 保持控制台地域为**华北 2（北京）**。
2. 在百炼控制台首页点击右上角的业务空间入口。
3. 在当前业务空间弹窗中复制 Workspace ID；需要查看所有空间时进入“业务空间管理”，在 Workspace ID 列复制。
4. RAM 子账号只能看到自己已加入的空间。查看全部业务空间通常需要主账号或 `AliyunBailianFullAccess`/`AliyunBailianControlFullAccess` 权限。
5. Workspace ID 当前只能从控制台手动获取，官方不提供普通 API 或 CLI 枚举。

官方参考：[获取 APP ID 和 Workspace ID](https://help.aliyun.com/zh/model-studio/obtain-the-app-id-and-workspace-id)。

### 选择 Qwen 对话模式

在“设置 → 实时语音”中选择 Qwen 后，按使用目标选择：

| 模式 | 音频链路 | 适合场景 |
| --- | --- | --- |
| `Agent 级联（稳定）` | ASR → DSH Agent → Qwen TTS | 稳定使用完整文本 Agent 和工具链 |
| `Qwen 原生语音 Agent（实验）` | Qwen 原生全双工音频；需要文件、终端或审批时才调用 DSH capability gateway | 更低延迟的自然对话 |

`Qwen Agent 桥接` 只用于开发诊断。若旧测试配置仍处于该模式，设置页会要求你明确改为级联或原生模式，不会自动改变对话主体。原生模式不显示独立 TTS 开关；级联模式才需要打开“使用服务商自然音色朗读 Agent 回复”。

### 填入 DSH Desktop

1. 打开“设置 → 实时语音”。
2. 服务商选择“Qwen 实时语音识别”。
3. 普通用户选择“共享 endpoint（仅 API Key）”，无需填写 Workspace ID。
4. 需要 Workspace 流量隔离和更高服务保证时选择“Workspace 专属 endpoint”，再填写北京地域 Workspace ID。
5. 在 API Key 输入框粘贴 Key。原生模式选择实时语音音色；级联模式选择 TTS 回复音色。
6. 点击“保存实时语音设置”，再打开“显示语音按钮”。
7. 仅在级联模式下打开“使用服务商自然音色朗读 Agent 回复”。

共享 DashScope 域名目前仍可用；官方建议生产环境逐步迁移到 Workspace 专属域名，以获得更高吞吐、较低延迟和空间级流量隔离。[Base URL 说明](https://help.aliyun.com/en/model-studio/base-url)。

### Qwen 常见错误

| 表现 | 排查 |
| --- | --- |
| WebSocket `401/403` | Key 是否为北京地域按量付费 Key；是否误填 Coding Plan/Token Plan Key；IP 白名单是否放行 |
| 模型无权限 | 自定义权限中是否同时勾选 ASR 与 TTS 模型 |
| Workspace 域名无法解析 | Workspace ID 是否来自北京地域；是否包含空格或复制了名称而非 ID |
| 共享模式可用、专属模式失败 | Key 与 Workspace 是否属于同一地域；RAM 用户是否加入该空间 |
| ASR 正常但没有自然音色 | `qwen3-tts-flash-realtime` 是否有调用权限；音色是否属于该模型 |
| 原生语音模式无法开始 | 是否已为 `qwen-audio-3.0-realtime-flash` 开通权限；测试账号是否具备 Realtime 访问资格 |

## 配置豆包

### 为什么不只是一个 API Key

火山引擎豆包语音同时存在两套控制台与鉴权方式：

- 新版控制台部分 V3 API 支持单一 `X-Api-Key`。
- 旧应用模式使用 App ID 与 Access Token/Access Key，并按应用开通具体语音服务。

DSH Desktop 当前为了同时接入 Seed-ASR 2 和 Seed-TTS 2，采用**旧应用凭据模式**。因此只从新版“API Key 管理”复制一个 Key，不能直接填满当前设置；必须准备 App ID 与该语音应用的 Access Token/Access Key。豆包不会显示 Qwen 原生语音 Agent 模式。

### 创建语音应用并开通能力

1. 注册并登录[火山引擎控制台](https://console.volcengine.com/)，按要求完成实名认证，并确认账户可用于后付费或已有试用额度。
2. 进入[豆包语音控制台](https://console.volcengine.com/speech/app)。
3. 创建语音应用。应用名称可使用 `DSH Desktop Voice`，并在服务选择中至少开通：

   - 大模型流式语音识别 2.0 / Seed-ASR 2
   - 豆包语音合成模型 2.0 / Seed-TTS 2

4. 试用额度只适合连通性验证。正式使用前进入“开通管理/服务中心”，将两项服务转为正式版或确认按量后付费已启用；欠费、试用到期或并发额度耗尽都会导致调用失败。
5. 在应用详情或接口认证信息中复制：

   - App ID
   - Access Token/Access Key

   控制台可能显示“Access Token”或“Access Key”。这里需要的是**豆包语音应用凭据**，不是火山引擎 IAM 账号的 AccessKey ID/Secret。

官方参考：[旧版控制台快速入门](https://www.volcengine.com/docs/6561/163043?lang=zh)、[新版/旧版控制台与 API 参数](https://www.volcengine.com/docs/6561/1167802?lang=zh)。

### 确认资源 ID 与音色

DSH Desktop 默认值为：

| 用途 | 默认值 |
| --- | --- |
| ASR endpoint | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async` |
| ASR Resource ID | `volc.seedasr.sauc.duration` |
| ASR App Key | `PlgvMymc7f3tQnJ6`（协议默认值，一般无需修改） |
| TTS endpoint | `https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse` |
| TTS Resource ID | `seed-tts-2.0` |
| 默认音色 | `zh_female_vv_uranus_bigtts`（Vivi 2.0） |

需要注意：

- Resource ID 决定模型族和计费资源，必须与应用已开通的能力一致。
- Speaker/音色必须属于对应 Resource ID。资源与音色不匹配通常会返回 `resource ID is mismatched` 或音色无权限错误。
- 部分公版音色虽然免费，也可能需要在控制台完成 0 元购买或显式开通。
- 自定义/复刻音色还需要音色槽位、训练完成状态和目标模型权限；仅有 App ID/Token 不等于拥有所有音色。

官方参考：[语音合成大模型能力](https://www.volcengine.com/docs/6561/1257543?lang=zh)、[音色列表](https://www.volcengine.com/docs/6561/1257544?lang=zh)、[ASR 2.0 产品说明](https://www.volcengine.com/docs/6561/1354871?lang=zh)。

### 填入 DSH Desktop

1. 打开“设置 → 实时语音”。
2. 服务商选择“豆包 Seed-ASR 2”。
3. “应用 ID”填写语音应用 App ID。
4. “访问 Key”填写该应用的 Access Token/Access Key。
5. 保留默认 ASR/TTS endpoint 和 Resource ID，除非控制台为你的应用明确提供了不同值。
6. 选择已开通的 TTS 音色，点击“保存实时语音设置”。
7. 打开语音按钮与 Provider 自然音色开关。

### 豆包常见错误

| 表现 | 排查 |
| --- | --- |
| 鉴权失败 | 是否把 IAM AccessKey 当成语音 Access Token；App ID 与 Token 是否属于同一应用 |
| `access denied` / grant not found | 应用是否开通对应 ASR/TTS 正式服务和 Resource ID |
| `resource ID is mismatched` | TTS Resource ID 与 speaker 所属模型是否一致 |
| 试用时可用、之后失败 | 试用额度是否到期；是否已开通正式版；账户是否欠费 |
| ASR 可用但 TTS 失败 | 是否只开通了 ASR；目标音色是否购买/授权；`seed-tts-2.0` 是否开通 |
| 只有新版单一 API Key | 当前 DSH Desktop 稳定模式暂不接受该模式；需创建语音应用并获取 App ID + Access Token/Access Key |

## 使用与安全边界

1. 保存设置后，输入框才会显示语音按钮；关闭“显示语音按钮”会立即隐藏入口。
2. 点击输入框中的语音按钮开始会话，再次点击结束会话；侧栏会显示连接、聆听、思考和播放状态。
3. 麦克风音频只在活动会话期间转发给当前选中的 Provider。密钥由 DSH credentials 存储，不写入设置文件、URL 或诊断导出。
4. 文件、终端、审批和其他副作用仍由 DSH Agent/Capability Gateway 控制；Provider 不直接获得本地权限。

## Evidence → Finding → 配置路径

| Evidence | Finding | 配置路径 |
| --- | --- | --- |
| 阿里云一个 Workspace 内的 Key 权限一致 | Qwen 无需为 ASR/TTS 创建两个 Key | 一个北京地域按量付费 Key，同时授权两个模型 |
| Workspace ID 是专属域名组成部分 | 它不是 Key 或音色 | 共享模式留空；专属模式从北京地域业务空间复制 |
| 豆包新版与旧版控制台并存 | “API Key”一词可能指不同凭据 | 按 DSH Desktop 字段使用旧应用 App ID + Access Token/Access Key |
| 豆包资源与音色强绑定 | 凭据正确仍可能因资源不匹配失败 | 同时核对 ASR Resource、TTS Resource 与 speaker 授权 |
| Qwen 原生语音 Agent 使用独立 Realtime 模型权限 | ASR/TTS 权限不能自动授予原生语音模型 | 为 `qwen-audio-3.0-realtime-flash` 单独确认权限 |
| 豆包当前 Host 路由是 ASR → DSH Agent → TTS | 豆包 RTC 或单一新版 API Key 不是当前桌面合同 | 使用语音应用 App ID + Access Token/Access Key |

## 官方资料索引

- Qwen：[API Key](https://help.aliyun.com/zh/model-studio/get-api-key)、[Workspace ID](https://help.aliyun.com/zh/model-studio/obtain-the-app-id-and-workspace-id)、[实时 ASR](https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-interaction-process)、[实时 TTS](https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide)
- 豆包：[快速入门](https://www.volcengine.com/docs/6561/163043?lang=zh)、[ASR 2.0](https://www.volcengine.com/docs/6561/1354871?lang=zh)、[TTS 2.0](https://www.volcengine.com/docs/6561/1257543?lang=zh)、[音色列表](https://www.volcengine.com/docs/6561/1257544?lang=zh)
