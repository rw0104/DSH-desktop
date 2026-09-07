/** Fail before publishing local notes or generated artifacts, including force-add. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const reviewedReleaseEvidence = new Set([
  'docs/evidence/electron/better-sidebar-restored-v2.0.4.png',
  'docs/evidence/electron/directory-picker-2.0.8.png',
  'docs/evidence/electron/workspace-context-menu-restored-v2.0.4.png',
])

export function publicationViolation(path) {
  if (path === 'docs/local/.gitkeep') return undefined
  if (/^docs\/local\//iu.test(path)) return 'local development material'
  if (/^docs\/(?:\d{2}-|20\d{2}-\d{2}-\d{2}[_-])/iu.test(path)) return 'legacy local development material'
  if (/^docs\//iu.test(path) && !reviewedReleaseEvidence.has(path)
    && !/^docs\/(?:releases\/|user-guide|architecture|plugin-|faq|why-desktop|README|PRODUCT\.md$|upstream-sync\.md$)/iu.test(path)) {
    return 'unreviewed documentation outside the public document families'
  }
  if (/(?:^|\/)(?:node_modules|\.tmp-[^/]+|win-unpacked)\//iu.test(path)
    || /^dsh-plugin-desktop\/(?:dist|lib)\//iu.test(path)
    || /^dsh-community-market\/lib\//iu.test(path)) return 'generated artifact or dependency tree'
  return undefined
}

export function hasLocalDocumentationLink(contents, documentPath) {
  const targets = [...contents.matchAll(/\]\(<?([^\r\n)>]+)>?\)|(?:href|src)=["']([^"']+)["']/giu)]
  return targets.some(match => {
    const target = (match[1] ?? match[2]).replace(/%2f/giu, '/').replace(/%5c/giu, '/').replaceAll('\\', '/')
    if (/(?:^|\/)docs\/local(?:\/|$)/iu.test(target)) return true
    const local = posix.normalize(posix.join(posix.dirname(documentPath), target))
    return /^docs\/local(?:\/|$)/iu.test(local)
  })
}

export function verifyDocumentationBoundary(root = resolve(import.meta.dirname, '..')) {
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const failures = paths.flatMap(path => {
    const reason = publicationViolation(path)
    return reason ? [`${path}: ${reason}`] : []
  })
  for (const path of paths.filter(path => /^(?:docs\/|README)/u.test(path) && /\.md$/u.test(path) && !path.startsWith('docs/local/'))) {
    const contents = readFileSync(resolve(root, path), 'utf8')
    // Mentions of the policy are allowed. Actual Markdown/HTML links to local
    // working material are not; percent-encoded separators are normalized.
    if (hasLocalDocumentationLink(contents, path)) failures.push(`${path}: public link to local development material`)
  }
  if (failures.length) throw new Error(`Documentation publication boundary failed:\n${failures.join('\n')}`)
  console.log(`verify-documentation-boundary: ${paths.length} indexed paths checked; local notes and build outputs excluded`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyDocumentationBoundary()
