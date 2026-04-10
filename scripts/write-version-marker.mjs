import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION_MARKER_FILE = 'version'
const LEGACY_VERSION_MARKER_PREFIX = 'PreviewV version '
const LEGACY_VERSION_MARKER_SUFFIX = '.txt'

async function syncVersionMarker(targetDir, version) {
  const markerPath = path.join(targetDir, VERSION_MARKER_FILE)
  const markerContent = `${version}\n`

  let entries = []
  try {
    entries = await fs.readdir(targetDir, { withFileTypes: true })
  } catch {
    return null
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name === VERSION_MARKER_FILE ||
            (entry.name.startsWith(LEGACY_VERSION_MARKER_PREFIX) &&
              entry.name.endsWith(LEGACY_VERSION_MARKER_SUFFIX))) &&
          entry.name !== VERSION_MARKER_FILE,
      )
      .map((entry) => fs.rm(path.join(targetDir, entry.name), { force: true })),
  )

  let currentContent = null
  try {
    currentContent = await fs.readFile(markerPath, 'utf8')
  } catch {
    currentContent = null
  }

  if (currentContent !== markerContent) {
    await fs.writeFile(markerPath, markerContent, 'utf8')
  }

  return markerPath
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const rootDir = path.resolve(scriptDir, '..')
  const releaseDir = path.join(rootDir, 'release')
  const packageJsonPath = path.join(rootDir, 'package.json')

  const packageJsonRaw = await fs.readFile(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonRaw)
  const version = String(packageJson.version ?? '').trim()

  if (!version) {
    throw new Error('package.json version is empty')
  }

  let releaseEntries = []
  try {
    releaseEntries = await fs.readdir(releaseDir, { withFileTypes: true })
  } catch {
    console.log('[version-marker] release folder not found, nothing to sync')
    return
  }

  const unpackedDirs = releaseEntries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-unpacked'))
    .map((entry) => path.join(releaseDir, entry.name))

  if (unpackedDirs.length === 0) {
    console.log('[version-marker] no unpacked build folders found')
    return
  }

  const written = []
  for (const dir of unpackedDirs) {
    const markerPath = await syncVersionMarker(dir, version)
    if (markerPath) written.push(markerPath)
  }

  if (written.length === 0) {
    console.log('[version-marker] no marker files were written')
    return
  }

  for (const filePath of written) {
    console.log(`[version-marker] ${filePath}`)
  }
}

main().catch((error) => {
  console.error('[version-marker] failed:', error)
  process.exitCode = 1
})
