import type { InputState, InsertTextRequest } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Append without replacing existing draft text or structured reference chips. */
export function workspaceFileReference(snapshot: InputState, path: string, zh: boolean): InsertTextRequest | undefined {
  if (snapshot.phase !== 'plain') return undefined
  // TokenSpan uses the detection projection: a chip occupies one character,
  // whereas InputState.draft expands its clipboard text.
  const end = snapshot.draft.length - snapshot.occurrences.reduce((sum, occurrence) => sum + occurrence.length - 1, 0)
  return {
    text: `\n${zh ? '工作区文件' : 'Workspace file'}: ${JSON.stringify(path)}\n`,
    span: { start: end, end, draftRev: snapshot.draftRev },
  }
}
