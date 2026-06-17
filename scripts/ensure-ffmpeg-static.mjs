import { createGunzip } from 'node:zlib'
import { createWriteStream } from 'node:fs'
import { access, chmod, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const releaseTag = 'b6.1.1'

const PLATFORM_SPECS = {
  'win32-x64': {
    fileName: 'ffmpeg.exe',
    downloadName: 'ffmpeg-win32-x64.gz',
  },
  'darwin-x64': {
    fileName: 'ffmpeg',
    downloadName: 'ffmpeg-darwin-x64.gz',
  },
  'darwin-arm64': {
    fileName: 'ffmpeg',
    downloadName: 'ffmpeg-darwin-arm64.gz',
  },
}

const spec = PLATFORM_SPECS[`${os.platform()}-${os.arch()}`]
if (!spec) {
  console.log(`[ensure-ffmpeg] skipped: unsupported platform ${os.platform()}-${os.arch()}`)
  process.exit(0)
}

const targetPath = resolve(projectRoot, 'node_modules', 'ffmpeg-static', spec.fileName)
const downloadUrl = `https://github.com/eugeneware/ffmpeg-static/releases/download/${releaseTag}/${spec.downloadName}`

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function streamFromUrl(url) {
  return new Promise((resolveStream, reject) => {
    const req = https.get(url, (res) => {
      if (!res || !res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Failed to download ffmpeg-static binary: HTTP ${res?.statusCode ?? 'unknown'}`))
        return
      }
      resolveStream(res)
    })
    req.on('error', reject)
  })
}

async function main() {
  if (await exists(targetPath)) {
    console.log(`[ensure-ffmpeg] ${spec.fileName} already exists`)
    return
  }

  await mkdir(dirname(targetPath), { recursive: true })
  const tmpPath = `${targetPath}.download`

  try {
    const source = await streamFromUrl(downloadUrl)
    await pipeline(source, createGunzip(), createWriteStream(tmpPath))
    await rm(targetPath, { force: true })
    await rename(tmpPath, targetPath)
    if (spec.fileName === 'ffmpeg') {
      await chmod(targetPath, 0o755)
    }
    console.log(`[ensure-ffmpeg] downloaded ${spec.fileName}`)
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {})
    throw error
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
