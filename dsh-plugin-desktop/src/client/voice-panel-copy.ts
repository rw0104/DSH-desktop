import { useSyncExternalStore } from 'react'

export interface VoicePanelLocale {
  subscribe(listener: () => void): () => void
  getSnapshot(): string
}
const english = {
  unset: 'Not supplied',
  title: 'Realtime voice', details: 'Connection details', minimize: 'Back to workspace', restore: 'Show voice conversation',
  end: 'End voice', close: 'Close realtime voice', latest: 'Jump to latest', captions: 'Live captions',
  you: 'You', agent: 'Agent', empty: 'Speak naturally. Your transcript will appear here.', disabled: 'Enable realtime voice in Settings to begin.',
  mute: 'Mute', unmute: 'Unmute', sound: 'Sound on', speaker: 'Speaker', start: 'Start voice', stop: 'End',
  privacy: 'Microphone audio is sent to the selected provider while connected.',
  taskRunning: 'Agent is working', taskCompleted: 'Task completed', taskFailed: 'Task failed', taskCancelled: 'Task interrupted',
  taskHint: 'Tasks and approvals stay in the main conversation. Minimize keeps voice connected; mute to avoid interrupting a native-voice task.',
  idle: 'Ready', requesting: 'Preparing voice', connecting: 'Connecting', listening: 'Listening',
  'user-speaking': 'Listening to you', thinking: 'Thinking', 'assistant-speaking': 'Speaking', finishing: 'Finishing', ended: 'Ended', error: 'Needs attention',
  mode: 'Mode', audio: 'Audio', model: 'Model', voice: 'Voice', authority: 'Authority', build: 'Build', level: 'Audio activity',
}
export type VoicePanelCopy = { [K in keyof typeof english]: string }
const chinese: VoicePanelCopy = {
  unset: '未提供',
  title: '实时语音', details: '连接信息', minimize: '返回工作区', restore: '展开语音对话',
  end: '结束语音', close: '关闭实时语音', latest: '回到最新', captions: '实时字幕',
  you: '你', agent: '助手', empty: '可以开始说话，字幕会显示在这里。', disabled: '请先在设置中启用实时语音。',
  mute: '静音', unmute: '取消静音', sound: '打开声音', speaker: '扬声器', start: '开始对话', stop: '结束',
  privacy: '连接期间，麦克风音频将发送给所选服务商。',
  taskRunning: 'Agent 正在执行任务', taskCompleted: '任务已完成', taskFailed: '任务失败', taskCancelled: '任务已中断',
  taskHint: '任务和审批在主会话中处理。收起不会结束语音；可静音以避免新发言打断原生语音任务。',
  idle: '准备就绪', requesting: '准备连接', connecting: '连接中', listening: '正在聆听',
  'user-speaking': '正在听你说话', thinking: '思考中', 'assistant-speaking': '正在回复', finishing: '结束中', ended: '已结束', error: '需要处理',
  mode: '模式', audio: '音频', model: '模型', voice: '音色', authority: '执行方', build: '构建', level: '声音活动',
}
const fallback: VoicePanelLocale = { subscribe: () => () => {}, getSnapshot: () => 'en' }
export function useVoicePanelCopy(locale: VoicePanelLocale = fallback): VoicePanelCopy {
  const language = useSyncExternalStore(locale.subscribe, locale.getSnapshot, locale.getSnapshot)
  return language.toLowerCase().startsWith('zh') ? chinese : english
}
