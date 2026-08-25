import { resolve, relative, isAbsolute, sep } from 'node:path'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionWorkspaceBinding } from './workspace-workbench.ts'

export interface WorkspaceReviewComment {
  readonly repository: string
  readonly path: string
  readonly side: 'old' | 'new'
  readonly line: number
  readonly hunkId: string
  readonly comment: string
}

export interface WorkspaceReviewHunkRange {
  readonly id: string
  readonly oldStart: number
  readonly oldCount: number
  readonly newStart: number
  readonly newCount: number
}

export type WorkspaceReviewErrorCode =
  | 'session-not-found'
  | 'checkout-mismatch'
  | 'line-stale'
  | 'invalid-comment'

export class WorkspaceReviewError extends Error {
  constructor(public readonly code: WorkspaceReviewErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'WorkspaceReviewError'
  }
}

export type WorkspaceReviewSender = (sessionId: string, comment: WorkspaceReviewComment) => void

/** Validates review anchors and returns them to the current DSH Session as context. */
export class WorkspaceReviewService {
  constructor(private readonly send: WorkspaceReviewSender = defaultReviewSender) {}

  submit(binding: SessionWorkspaceBinding, comment: WorkspaceReviewComment, hunk: WorkspaceReviewHunkRange | undefined): void {
    if (comment.repository.trim() === '' || comment.path.trim() === '' || comment.hunkId.trim() === '' || comment.comment.trim() === '') {
      throw new WorkspaceReviewError('invalid-comment', 'repository, path, hunkId, and comment are required')
    }
    if (comment.path.length > 4_096 || comment.hunkId.length > 256 || comment.comment.length > 16_384) {
      throw new WorkspaceReviewError('invalid-comment', 'review comment exceeds the supported size')
    }
    if (!Number.isSafeInteger(comment.line) || comment.line < 1) {
      throw new WorkspaceReviewError('invalid-comment', 'comment line must be a positive integer')
    }
    const repository = binding.repositoryRoot ?? binding.worktreePath ?? binding.cwd
    if (!samePath(comment.repository, repository) || !isCheckoutRelative(comment.path, repository)) {
      throw new WorkspaceReviewError('checkout-mismatch', 'review comment is outside the active checkout')
    }
    if (hunk === undefined || hunk.id !== comment.hunkId || !lineInHunk(comment.side, comment.line, hunk)) {
      throw new WorkspaceReviewError('line-stale', 'the diff changed; refresh before commenting')
    }
    try {
      this.send(binding.sessionId, {
        repository,
        path: comment.path,
        side: comment.side,
        line: comment.line,
        hunkId: comment.hunkId,
        comment: comment.comment.trim(),
      })
    } catch (error) {
      if (error instanceof WorkspaceReviewError) throw error
      throw new WorkspaceReviewError('session-not-found', 'the current Session is no longer available', { cause: error })
    }
  }
}

function lineInHunk(side: WorkspaceReviewComment['side'], line: number, hunk: WorkspaceReviewHunkRange): boolean {
  const start = side === 'old' ? hunk.oldStart : hunk.newStart
  const count = side === 'old' ? hunk.oldCount : hunk.newCount
  return count > 0 && line >= start && line < start + count
}

function isCheckoutRelative(path: string, cwd: string): boolean {
  const value = path.replaceAll('\\', '/')
  if (value === '' || value.includes('\0') || isAbsolute(value) || /^[A-Za-z]:\//u.test(value)) return false
  const resolved = resolve(cwd, value)
  const child = relative(resolve(cwd), resolved)
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replaceAll('\\', '/').replace(/\/+$/u, '')
  const a = normalize(left)
  const b = normalize(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function defaultReviewSender(sessionId: string, _comment: WorkspaceReviewComment): void {
  throw new WorkspaceReviewError('session-not-found', `no Agent is attached to Session ${sessionId}; review comment was not sent`)
}

/** Build the structured notice used by the Host adapter when sending a comment. */
export function createWorkspaceReviewMessage(comment: WorkspaceReviewComment) {
  return createUserMessage({
    content: [{ type: 'text', text: JSON.stringify({ type: 'workspace-review-comment', ...comment }) }],
    source: {
      kind: 'plugin',
      plugin: 'dsh-desktop-workbench',
      form: 'notice',
      summary: boundContextSummary(`Review comment on ${comment.path}:${String(comment.line)}`),
    },
  })
}
