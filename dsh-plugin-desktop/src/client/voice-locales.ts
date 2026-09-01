export type VoiceKey =
  | 'button.start' | 'button.stop' | 'button.unavailable'
  | 'settings.title' | 'settings.intro' | 'settings.enabled' | 'settings.provider'
  | 'settings.model' | 'settings.voice' | 'settings.workspace' | 'settings.apiKey'
  | 'settings.endpointMode' | 'settings.apiKeyOnly' | 'settings.workspaceDedicated' | 'settings.workspaceHint'
  | 'settings.endpoint' | 'settings.resource' | 'settings.appKey' | 'settings.appId'
  | 'settings.accessKey' | 'settings.secretNote' | 'settings.doubaoNotice'
  | 'settings.saveAll' | 'settings.saving' | 'settings.saved'
  | 'settings.ttsEnabled' | 'settings.ttsModel' | 'settings.ttsVoice'
  | 'settings.ttsEndpoint' | 'settings.ttsResource'
  | 'settings.credentialsGuide'

export const voiceLocales = {
  zh: {
    'button.start': '开始语音对话',
    'button.stop': '结束语音对话',
    'button.unavailable': '语音对话尚未配置',
    'settings.title': '实时语音',
    'settings.intro': '在输入框显示语音按钮。实时字幕只在一句话结束时提交给当前 DSH Agent，工具调用仍走原有权限链路。',
    'settings.enabled': '显示语音按钮',
    'settings.provider': '默认服务商',
    'settings.ttsEnabled': '使用服务商自然音色朗读 Agent 回复',
    'settings.ttsModel': '语音合成模型',
    'settings.ttsVoice': '回复音色',
    'settings.ttsEndpoint': '语音合成端点',
    'settings.ttsResource': '语音合成资源 ID',
    'settings.credentialsGuide': 'API Key 与 Workspace 配置教程',
    'settings.model': '模型',
    'settings.voice': '声音',
    'settings.workspace': 'Qwen Workspace ID',
    'settings.endpointMode': '访问模式',
    'settings.apiKeyOnly': '共享 endpoint（仅 API Key）',
    'settings.workspaceDedicated': 'Workspace 专属 endpoint',
    'settings.workspaceHint': '仅在使用专属 endpoint 时填写，可从 Model Studio 右上角工作空间菜单中复制。',
    'settings.apiKey': 'API Key',
    'settings.endpoint': '实时端点',
    'settings.resource': '资源 ID',
    'settings.appKey': '应用 Key',
    'settings.appId': '应用 ID',
    'settings.accessKey': '访问 Key',
    'settings.secretNote': '密钥只通过 DSH credentials 存储，不会写入前端设置或 URL。',
    'settings.doubaoNotice': '豆包 Seed-ASR 2 负责实时语音识别；最终文本会提交给当前 DSH Agent，工具调用仍由 Agent 执行。',
    'settings.saveAll': '保存实时语音设置',
    'settings.saving': '正在保存…',
    'settings.saved': '已保存',
  },
  en: {
    'button.start': 'Start voice conversation',
    'button.stop': 'End voice conversation',
    'button.unavailable': 'Voice conversation is not configured',
    'settings.title': 'Realtime voice',
    'settings.intro': 'Show a voice button in the composer. Partial captions stay local to the voice panel; only final turns enter the current DSH Agent and its tool permission chain.',
    'settings.enabled': 'Show voice button',
    'settings.provider': 'Default provider',
    'settings.ttsEnabled': 'Read Agent replies with the provider voice',
    'settings.ttsModel': 'Speech synthesis model',
    'settings.ttsVoice': 'Reply voice',
    'settings.ttsEndpoint': 'Speech synthesis endpoint',
    'settings.ttsResource': 'Speech synthesis resource ID',
    'settings.credentialsGuide': 'API key and Workspace setup guide',
    'settings.model': 'Model',
    'settings.voice': 'Voice',
    'settings.workspace': 'Qwen Workspace ID',
    'settings.endpointMode': 'Endpoint mode',
    'settings.apiKeyOnly': 'API key only (recommended)',
    'settings.workspaceDedicated': 'Workspace-dedicated endpoint',
    'settings.workspaceHint': 'Only required for the dedicated endpoint. Copy it from the Workspace menu in the top-right of Model Studio.',
    'settings.apiKey': 'API key',
    'settings.endpoint': 'Realtime endpoint',
    'settings.resource': 'Resource ID',
    'settings.appKey': 'App key',
    'settings.appId': 'App ID',
    'settings.accessKey': 'Access key',
    'settings.secretNote': 'Keys are stored through DSH credentials and never written to the client settings or URL.',
    'settings.doubaoNotice': 'Doubao Seed-ASR 2 provides realtime speech recognition; final text is submitted to the current DSH Agent for tool execution.',
    'settings.saveAll': 'Save realtime voice settings',
    'settings.saving': 'Saving...',
    'settings.saved': 'Saved',
  },
} as const
