/** Content-addressed installed-tree manifests for mixed-version detection. */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function normalized(filename) {
  return filename.replaceAll('\\', '/')
}

async function hashFile(filename) {
  const hash = createHash('sha256')
  await new Promise((resolveHash, reject) => {
    const stream = createReadStream(filename)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', resolveHash)
  })
  return hash.digest('hex')
}

async function treeFiles(root) {
  const files = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const filename = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile()) files.push(filename)
    }
  }
  return files.sort((left, right) => left.localeCompare(right))
}

/** Create a deterministic content manifest for one complete installed tree. */
export async function createInstallerTreeManifest(root) {
  const treeRoot = resolve(root)
  if (!existsSync(treeRoot)) throw new Error(`installer tree does not exist: ${treeRoot}`)
  const files = []
  const aggregate = createHash('sha256')
  for (const filename of await treeFiles(treeRoot)) {
    const value = await stat(filename)
    const path = normalized(relative(treeRoot, filename))
    const sha256 = await hashFile(filename)
    const row = { path, size: value.size, sha256 }
    aggregate.update(`${path}\0${String(value.size)}\0${sha256}\n`)
    files.push(row)
  }
  return {
    schemaVersion: 1,
    fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
    treeDigest: aggregate.digest('hex'),
    files,
  }
}

/** Reject a missing, extra, or content-mismatched installed file. */
export async function verifyInstallerTree(root, expected) {
  if (expected?.schemaVersion !== 1 || !Array.isArray(expected.files)) {
    throw new Error('installer tree manifest requires schemaVersion 1 and files')
  }
  const actual = await createInstallerTreeManifest(root)
  const expectedRows = new Map(expected.files.map(file => [file.path, file]))
  const actualRows = new Map(actual.files.map(file => [file.path, file]))
  const missing = [...expectedRows.keys()].filter(path => !actualRows.has(path))
  const extra = [...actualRows.keys()].filter(path => !expectedRows.has(path))
  const changed = [...expectedRows].filter(([path, file]) => {
    const current = actualRows.get(path)
    return current !== undefined && (current.size !== file.size || current.sha256 !== file.sha256)
  }).map(([path]) => path)
  if (missing.length > 0 || extra.length > 0 || changed.length > 0) {
    throw new Error(
      `installer tree mismatch: missing=${missing.slice(0, 8).join(', ')}; extra=${extra.slice(0, 8).join(', ')}; changed=${changed.slice(0, 8).join(', ')}`,
    )
  }
  if (actual.treeDigest !== expected.treeDigest) {
    throw new Error(`installer tree digest mismatch: ${actual.treeDigest} != ${expected.treeDigest}`)
  }
  return actual
}

export async function runInstallerTreeManifest(argv = process.argv.slice(2)) {
  const [command, root, manifestPath] = argv
  if ((command !== 'create' && command !== 'verify') || root === undefined || manifestPath === undefined) {
    throw new Error('usage: installer-tree-manifest.mjs <create|verify> <root> <manifest.json>')
  }
  if (command === 'create') {
    const manifest = await createInstallerTreeManifest(root)
    await writeFile(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    return manifest
  }
  return await verifyInstallerTree(root, JSON.parse(await readFile(resolve(manifestPath), 'utf8')))
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runInstallerTreeManifest().then((manifest) => {
    process.stdout.write(
      `installer-tree-manifest: ${manifest.fileCount} files, ${manifest.bytes} bytes, sha256:${manifest.treeDigest}\n`,
    )
  }).catch((cause) => {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}
