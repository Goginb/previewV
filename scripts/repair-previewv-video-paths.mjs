#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const out = {
    project: '',
    roots: [],
    write: false,
    backup: true,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--project') {
      out.project = argv[i + 1] ?? ''
      i += 1
    } else if (token === '--search-root') {
      const value = argv[i + 1] ?? ''
      if (value) out.roots.push(value)
      i += 1
    } else if (token === '--write') {
      out.write = true
    } else if (token === '--no-backup') {
      out.backup = false
    }
  }
  return out
}

function isLegacyProxyPath(filePath) {
  const normalized = path.normalize(filePath).toLowerCase()
  return (
    normalized.includes(`${path.sep}previewv-video-proxy-cache${path.sep}`) ||
    normalized.includes(`${path.sep}cache${path.sep}video-proxy${path.sep}`)
  )
}

async function walkFiles(dir, out) {
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      await walkFiles(full, out)
    } else if (ent.isFile()) {
      out.push(full)
    }
  }
}

async function buildFileIndex(searchRoots) {
  const map = new Map()
  for (const root of searchRoots) {
    const files = []
    await walkFiles(path.normalize(root), files)
    for (const filePath of files) {
      const key = path.basename(filePath).toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(filePath)
    }
  }
  return map
}

async function fileExists(filePath) {
  try {
    const st = await fs.stat(filePath)
    return st.isFile()
  } catch {
    return false
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/repair-previewv-video-paths.mjs --project "<path\\to\\project.previewv>" --search-root "<path>" [--search-root "<path2>"] [--write]

Notes:
  - Without --write, runs as dry-run only.
  - By default creates "<project>.backup.previewv" before writing.
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.project || args.roots.length === 0) {
    printUsage()
    process.exitCode = 1
    return
  }

  const projectPath = path.normalize(args.project)
  const raw = await fs.readFile(projectPath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error('Invalid .previewv: missing items array')
  }

  const index = await buildFileIndex(args.roots)
  let totalVideo = 0
  let alreadyValid = 0
  let repaired = 0
  let unresolved = 0

  for (const item of parsed.items) {
    if (!item || item.type !== 'video') continue
    totalVideo += 1
    const videoPath = typeof item.videoPath === 'string' ? item.videoPath : ''
    const fileName = typeof item.fileName === 'string' ? item.fileName : ''
    const hasPath = Boolean(videoPath)
    const exists = hasPath ? await fileExists(videoPath) : false

    if (exists && !isLegacyProxyPath(videoPath)) {
      alreadyValid += 1
      continue
    }

    const candidateKey = fileName.toLowerCase()
    const candidates = index.get(candidateKey) ?? []
    if (candidates.length === 1) {
      item.videoPath = candidates[0]
      repaired += 1
    } else {
      unresolved += 1
      const reason = candidates.length > 1 ? 'multiple candidates' : 'not found'
      console.log(`[unresolved] ${fileName || '<no fileName>'} (${reason})`)
    }
  }

  console.log(`Videos total: ${totalVideo}`)
  console.log(`Already valid: ${alreadyValid}`)
  console.log(`Repaired: ${repaired}`)
  console.log(`Unresolved: ${unresolved}`)

  if (!args.write) {
    console.log('Dry-run complete. Re-run with --write to save.')
    return
  }

  if (args.backup) {
    const backupPath = `${projectPath}.backup.previewv`
    await fs.writeFile(backupPath, raw, 'utf8')
    console.log(`Backup created: ${backupPath}`)
  }

  await fs.writeFile(projectPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  console.log(`Saved repaired project: ${projectPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
