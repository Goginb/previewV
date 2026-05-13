import {
  app,
  BrowserWindow,
  shell,
  protocol,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
} from 'electron'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import ffmpegStatic from 'ffmpeg-static'
import { join, basename, dirname, extname, normalize } from 'path'
import { createReadStream } from 'fs'
import { promises as fs } from 'fs'
import { Readable } from 'stream'

import { imageTileViewSize } from '../../src/utils/tileSizing'
import {
  deserializeProject,
  isDataUrl,
  localPathToMediaUrl,
  mediaUrlToLocalPath,
  serializeProject,
} from '../../src/utils/projectSerializer'
import type { CanvasItem, ImageItem } from '../../src/types'
import type { DeserializedProject, ProjectFile } from '../../src/types/project'
import { scanDailiesFolder, getDailiesYears, getDailiesProjects, getDailiesScenes } from './dailiesScanner'
import { scanPrmFolder, getPrmYears, getPrmProjects, getPrmScenes } from './prmScanner'

const PROJECT_EXT = '.previewv'

interface EstimatingLaunchContext {
  helperBaseUrl: string
  sessionId: string
  selectedShotId: string
  saveDirectory: string
  linkedProjectPath: string
  writableTaskKeys: string[]
  language: 'en' | 'ru'
}

const PROJECT_OPEN_CHANNEL = 'app-open-project-by-path'
const VERSION_MARKER_FILE = 'version'
const LEGACY_VERSION_MARKER_PREFIX = 'PreviewV version '
const LEGACY_VERSION_MARKER_SUFFIX = '.txt'
const VIDEO_DEBUG_LOG_FILE = 'video-debug.log'

function videoDebugLogPath(): string {
  return join(app.getPath('userData'), VIDEO_DEBUG_LOG_FILE)
}

async function appendVideoDebugLog(message: string): Promise<void> {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`
    await fs.appendFile(videoDebugLogPath(), line, 'utf8')
    if (app.isPackaged) {
      const installLogPath = join(dirname(process.execPath), VIDEO_DEBUG_LOG_FILE)
      await fs.appendFile(installLogPath, line, 'utf8').catch(() => {})
    }
  } catch {
    // ignore log write errors
  }
}

async function syncVersionMarker(targetDir: string, version: string): Promise<string | null> {
  const markerPath = join(targetDir, VERSION_MARKER_FILE)
  const markerContent = `${version}\n`

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true })
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
        .map((entry) => fs.rm(join(targetDir, entry.name), { force: true })),
    )

    let currentContent: string | null = null
    try {
      currentContent = await fs.readFile(markerPath, 'utf8')
    } catch {
      currentContent = null
    }

    if (currentContent !== markerContent) {
      await fs.writeFile(markerPath, markerContent, 'utf8')
    }

    return markerPath
  } catch (error) {
    console.warn('[PreviewV] Failed to sync version marker:', error)
    return null
  }
}

async function syncInstalledVersionMarker(): Promise<string | null> {
  if (!app.isPackaged) return null
  return syncVersionMarker(dirname(process.execPath), app.getVersion())
}

function isKnownWebStreamCloseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown; stack?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : ''
  const stack = typeof e.stack === 'string' ? e.stack : ''
  return (
    code === 'ERR_INVALID_STATE' &&
    message.includes('Controller is already closed') &&
    stack.includes('node:internal/webstreams')
  )
}

process.on('uncaughtException', (error) => {
  if (isKnownWebStreamCloseError(error)) {
    // Avoid hard-crashing packaged app on known Node stream adapter edge-case.
    console.warn('[PreviewV] Ignored known webstream close error:', (error as Error).message)
    return
  }
  throw error
})

function findPreviewVPathFromArgv(argv: string[]): string | null {
  for (const entry of argv) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || trimmed.startsWith('--')) continue

    let decoded = trimmed
    try {
      decoded = decodeURIComponent(trimmed)
    } catch {
      decoded = trimmed
    }

    const normalized = decoded.trim().replace(/^"+|"+$/g, '')
    if (!normalized || normalized.startsWith('--')) continue
    if (!normalized.toLowerCase().endsWith(PROJECT_EXT)) continue
    return normalized
  }

  return null
}

function findArgValue(argv: string[], name: string): string {
  const prefix = `--${name}=`
  const entry = argv.find((value) => typeof value === 'string' && value.startsWith(prefix))
  if (!entry) return ''
  try {
    return decodeURIComponent(entry.slice(prefix.length))
  } catch {
    return entry.slice(prefix.length)
  }
}

function parseEstimatingLaunchContextFromArgv(argv: string[]): EstimatingLaunchContext | null {
  const helperBaseUrl = findArgValue(argv, 'estimating-helper-url').trim()
  const sessionId = findArgValue(argv, 'estimating-session-id').trim()

  if (!helperBaseUrl || !sessionId) {
    return null
  }

  let writableTaskKeys: string[] = []
  const rawWritableTaskKeys = findArgValue(argv, 'estimating-writable-task-keys').trim()
  if (rawWritableTaskKeys) {
    try {
      const parsed = JSON.parse(rawWritableTaskKeys)
      if (Array.isArray(parsed)) {
        writableTaskKeys = parsed
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      }
    } catch {
      writableTaskKeys = []
    }
  }

  const language = findArgValue(argv, 'estimating-language').trim().toLowerCase() === 'ru' ? 'ru' : 'en'

  return {
    helperBaseUrl,
    sessionId,
    selectedShotId: findArgValue(argv, 'estimating-selected-shot-id').trim(),
    saveDirectory: findArgValue(argv, 'estimating-save-directory').trim(),
    linkedProjectPath: findArgValue(argv, 'estimating-linked-project-path').trim(),
    writableTaskKeys,
    language,
  }
}

function mimeFromMediaExt(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    // Many H.264 MOV files decode reliably in Chromium when served as mp4 video.
    '.mov': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.ogv': 'video/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  }
  return map[ext] ?? 'application/octet-stream'
}

/**
 * MP4 seeking uses byte-range requests. net.fetch(file://) under a custom scheme often does not
 * return 206 + Content-Range; without that, video.currentTime seeks fail or snap back.
 */
async function serveMediaProtocolRequest(request: Request): Promise<Response> {
  const rest = request.url.startsWith('media:///')
    ? request.url.slice('media:///'.length)
    : request.url.slice('media://'.length)
  const filePath = normalize(decodeURIComponent(rest))

  try {
    await fs.access(filePath)
  } catch {
    return new Response(null, { status: 404, statusText: 'Not Found' })
  }

  const st = await fs.stat(filePath)
  const fileSize = st.size
  const mime = mimeFromMediaExt(filePath)
  const rangeHeader = request.headers.get('range')

  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
    if (m) {
      let start = m[1] === '' ? 0 : parseInt(m[1], 10)
      let end = m[2] === '' ? fileSize - 1 : parseInt(m[2], 10)
      if (Number.isNaN(start)) start = 0
      if (Number.isNaN(end)) end = fileSize - 1
      if (start >= fileSize) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        })
      }
      end = Math.min(end, fileSize - 1)
      const chunkSize = end - start + 1
      const nodeStream = createReadStream(filePath, { start, end })
      const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
        },
      })
    }
  }

  const nodeStream = createReadStream(filePath)
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
    },
  })
}

let pendingOpenPath: string | null = findPreviewVPathFromArgv(process.argv)
const launchEstimatingContext = parseEstimatingLaunchContextFromArgv(process.argv)

app.commandLine.appendSwitch('no-sandbox')
// Keep default Chromium video pipeline on Windows.
// For some H.264 MOV sources, forcing decode/overlay disable can result
// in black frames even when playback state advances.

// Intentionally allow multiple independent PreviewV processes/windows.
// This lets users open unrelated projects side-by-side without reusing a single app instance.

// Must be called before app is ready.
// Registers a privileged "media://" scheme that the renderer can use
// to stream local video files without any webSecurity or CORS issues.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      stream: true,       // essential for <video> seeking / range requests
      bypassCSP: true,
    },
  },
])

const RECENTS_FILE = 'recent-projects.json'
const PROJECT_ASSET_DIR_SUFFIX = '.assets'
const PREVIEW_CACHE_DIR = join(tmpdir(), 'previewv-raster-cache')
const VIDEO_STILL_CACHE_DIR = join(tmpdir(), 'previewv-video-still-cache')
const PREVIEW_IMAGE_EXT = new Set(['.tif', '.tiff', '.dpx', '.exr'])
const DIRECT_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])
// Keep runtime proxying for containers that frequently fail in Chromium,
// but do not auto-proxy generic .mov files: they should stay direct unless
// explicitly handled by the ProRes branch above.
const VIDEO_PROXY_EXT = new Set(['.mkv', '.avi', '.m4v'])
const PRORES_PROXY_DIR_NAME = 'Prores_proxy_temp'
const VIDEO_STILL_RENDER_CONCURRENCY = 2
const rasterPreviewCache = new Map<
  string,
  { mtimeMs: number; size: number; previewPath: string; width: number; height: number }
>()
const videoStillPreviewCache = new Map<
  string,
  { mtimeMs: number; size: number; previewPath: string; width: number; height: number }
>()
const videoStillPreviewInflight = new Map<
  string,
  Promise<{ previewPath: string; width: number; height: number; sourceFilePath: string }>
>()
const videoProxyCache = new Map<string, { mtimeMs: number; size: number; proxyPath: string }>()
const proresProbeCache = new Map<string, { mtimeMs: number; size: number; isProres: boolean }>()
const videoCodecProbeCache = new Map<string, { mtimeMs: number; size: number; codec: string | null }>()
let activeVideoStillRenderJobs = 0
const pendingVideoStillRenderJobs: Array<() => void> = []

/** Recursive folder import: same extensions as the canvas (video + raster). */
const FOLDER_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv'])
const FOLDER_IMAGE_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.dpx',
  '.exr',
])

function isMediaFileExt(ext: string): boolean {
  const e = ext.toLowerCase()
  return FOLDER_VIDEO_EXT.has(e) || FOLDER_IMAGE_EXT.has(e)
}

function normalizePathKey(filePath: string): string {
  return normalize(filePath).replace(/\\/g, '/').toLowerCase()
}

function projectAssetDir(projectPath: string): string {
  return `${projectPath}${PROJECT_ASSET_DIR_SUFFIX}`
}

function resolveProjectAssetPath(projectPath: string, relativePath: string): string {
  const parts = relativePath.split('/').filter(Boolean)
  return join(projectAssetDir(projectPath), ...parts)
}

function projectVideoSnapshotDir(projectPath: string): string {
  return `${projectPath}.video-proxy-cache`
}

function sanitizeAssetSegment(value: string): string {
  const trimmed = value.trim().replace(/\.[^.]+$/, '')
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
  return cleaned.replace(/^-|-$/g, '') || 'image'
}

function buildProjectAssetRelativePath(item: ImageItem, kind: 'asset' | 'preview'): string {
  const base = sanitizeAssetSegment(item.fileName ?? item.id)
  const suffix = kind === 'preview' ? 'preview' : 'image'
  return `images/${base}-${item.id}-${suffix}.png`
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:.*?;base64,(.+)$/i.exec(dataUrl)
  if (!match) {
    throw new Error('Unsupported data URL payload')
  }
  return Buffer.from(match[1], 'base64')
}

async function loadNativeImageSize(filePath: string): Promise<{ width: number; height: number }> {
  let img = nativeImage.createFromPath(filePath)
  if (img.isEmpty()) {
    const buf = await fs.readFile(filePath)
    img = nativeImage.createFromBuffer(buf)
  }
  const size = img.getSize()
  if (!size.width || !size.height) {
    throw new Error(`Failed to read image dimensions for "${basename(filePath)}"`)
  }
  return size
}

async function getUtifModule() {
  const mod = await import('utif')
  return (mod as { default?: typeof mod }).default ?? mod
}

async function ensurePreviewCacheDir(): Promise<void> {
  await fs.mkdir(PREVIEW_CACHE_DIR, { recursive: true })
}

async function ensureVideoStillCacheDir(): Promise<void> {
  await fs.mkdir(VIDEO_STILL_CACHE_DIR, { recursive: true })
}

async function ensureVideoProxyCacheDir(projectPath?: string | null): Promise<string> {
  const dir = projectPath ? projectVideoSnapshotDir(projectPath) : getVideoProxyCacheDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function ensureFfmpegRuntimeCacheDir(): Promise<void> {
  await fs.mkdir(getFfmpegRuntimeCacheDir(), { recursive: true })
}

function previewCacheFilePath(filePath: string): string {
  const hash = createHash('sha1').update(normalizePathKey(filePath)).digest('hex').slice(0, 16)
  return join(PREVIEW_CACHE_DIR, `${hash}.png`)
}

function videoStillCacheFilePath(filePath: string): string {
  const hash = createHash('sha1').update(`still:${normalizePathKey(filePath)}`).digest('hex').slice(0, 16)
  return join(VIDEO_STILL_CACHE_DIR, `${hash}.jpg`)
}

function buildVideoProxyCacheKey(filePath: string, projectPath?: string | null): string {
  const sourceKey = normalizePathKey(filePath)
  const projectKey = projectPath ? normalizePathKey(projectPath) : ''
  return projectKey ? `${projectKey}::${sourceKey}` : sourceKey
}

function videoProxyCacheFilePath(filePath: string, projectPath?: string | null): string {
  const hash = createHash('sha1')
    .update(`v3:${normalizePathKey(filePath)}`)
    .digest('hex')
    .slice(0, 16)
  const dir = projectPath ? projectVideoSnapshotDir(projectPath) : getVideoProxyCacheDir()
  return join(dir, `${hash}.mp4`)
}

function projectVideoSnapshotProxyPath(projectPath: string, sourceFilePath: string): string {
  const hash = createHash('sha1').update(normalizePathKey(sourceFilePath)).digest('hex').slice(0, 16)
  return join(projectVideoSnapshotDir(projectPath), `${hash}.mp4`)
}

function getVideoProxyCacheDir(): string {
  // Runtime-only proxy folder: ephemeral, not persisted as project cache.
  return join(tmpdir(), 'previewv-video-runtime-proxy')
}

function getDesktopProresProxyDir(): string {
  return join(app.getPath('desktop'), PRORES_PROXY_DIR_NAME)
}

function getProjectProresProxyDir(projectPath: string): string {
  return join(dirname(projectPath), PRORES_PROXY_DIR_NAME)
}

function getProjectPersistentVideoProxyDirs(projectPath: string): string[] {
  return [projectVideoSnapshotDir(projectPath), getProjectProresProxyDir(projectPath), getDesktopProresProxyDir()]
}

function runWithVideoStillRenderSlot<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeVideoStillRenderJobs += 1
      void job()
        .then(resolve, reject)
        .finally(() => {
          activeVideoStillRenderJobs = Math.max(0, activeVideoStillRenderJobs - 1)
          const next = pendingVideoStillRenderJobs.shift()
          if (next) {
            next()
          }
        })
    }

    if (activeVideoStillRenderJobs < VIDEO_STILL_RENDER_CONCURRENCY) {
      run()
      return
    }

    pendingVideoStillRenderJobs.push(run)
  })
}

function dedupeNormalizedPaths(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue
    const normalized = normalize(value.trim())
    const key = normalizePathKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

async function stageProjectScopedProxyIfAvailable(
  targetProxyPath: string,
  sourceMtimeMs: number,
  candidatePaths: Array<string | null | undefined>,
): Promise<string | null> {
  const candidates = dedupeNormalizedPaths([targetProxyPath, ...candidatePaths])
  for (const candidatePath of candidates) {
    try {
      const proxyStat = await fs.stat(candidatePath)
      if (!proxyStat.isFile()) continue
      if (proxyStat.mtimeMs < sourceMtimeMs) continue
      if (normalizePathKey(candidatePath) === normalizePathKey(targetProxyPath)) {
        return candidatePath
      }
      await fs.mkdir(dirname(targetProxyPath), { recursive: true })
      await fs.copyFile(candidatePath, targetProxyPath)
      await fs.utimes(targetProxyPath, proxyStat.atime, proxyStat.mtime)
      return targetProxyPath
    } catch {
      // Keep scanning other candidates.
    }
  }
  return null
}

/** Sanitize source file stem for a proxy filename (keep letters including Cyrillic; strip Windows-invalid chars). */
function sanitizeWindowsFileStem(stem: string): string {
  let s = stem.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  s = s.replace(/[. ]+$/g, '').trim()
  return s || 'video'
}

/**
 * Persistent H.264 proxies in `Prores_proxy_temp`: `<sourceStem>_proxy_<8hex>.mp4`.
 * Short hash keeps names unique when different sources share the same basename.
 */
function persistentProxyFileNameForSource(sourcePath: string): string {
  const ext = extname(sourcePath)
  const stem = basename(sourcePath, ext)
  const safe = sanitizeWindowsFileStem(stem)
  const id = createHash('sha1').update(normalizePathKey(sourcePath)).digest('hex').slice(0, 8)
  return `${safe}_proxy_${id}.mp4`
}

/** @deprecated — discover only; new proxies use {@link persistentProxyFileNameForSource} */
function legacyProresProxyFileName(normalizedPath: string): string {
  const ext = extname(normalizedPath)
  return `${basename(normalizedPath, ext)}-${createHash('sha1')
    .update(normalizePathKey(normalizedPath))
    .digest('hex')
    .slice(0, 10)}.mp4`
}

/** @deprecated — discover only */
function legacyPlaybackProxyFileName(normalizedPath: string): string {
  const ext = extname(normalizedPath)
  const base = basename(normalizedPath, ext)
  const hash = createHash('sha1')
    .update(`playback:${normalizePathKey(normalizedPath)}`)
    .digest('hex')
    .slice(0, 10)
  return `${base}-${hash}-playback.mp4`
}

async function findPersistentProxyInDirs(
  dirs: string[],
  normalizedPath: string,
  sourceMtimeMs: number,
  kind: 'prores' | 'mjpeg',
): Promise<string | null> {
  const names: string[] = [persistentProxyFileNameForSource(normalizedPath)]
  if (kind === 'prores') names.push(legacyProresProxyFileName(normalizedPath))
  if (kind === 'mjpeg') names.push(legacyPlaybackProxyFileName(normalizedPath))
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name)
      try {
        const proxyStat = await fs.stat(candidate)
        if (proxyStat.isFile() && proxyStat.mtimeMs >= sourceMtimeMs) return candidate
      } catch {
        // keep scanning
      }
    }
  }
  return null
}

function isLegacyTempProxyPath(filePath: string): boolean {
  const n = normalize(filePath).toLowerCase()
  return n.includes(`${normalize('\\previewv-video-proxy-cache\\').toLowerCase()}`)
}

async function resolveExistingVideoPath(filePath: string): Promise<string> {
  const normalizedPath = normalize(filePath)
  try {
    await fs.access(normalizedPath)
    return normalizedPath
  } catch {
    // continue to compatibility fallback
  }

  if (isLegacyTempProxyPath(normalizedPath) && app.isPackaged) {
    const migratedPath = join(getVideoProxyCacheDir(), basename(normalizedPath))
    await appendVideoDebugLog(`migrated legacy temp proxy path "${normalizedPath}" -> "${migratedPath}"`)
    return migratedPath
  }

  return normalizedPath
}

function getFfmpegRuntimeCacheDir(): string {
  // Keep runtime ffmpeg in userData to avoid endpoint policies that often block
  // execution from temp/network locations.
  return join(app.getPath('userData'), 'ffmpeg-runtime')
}

async function renderTiffPreview(filePath: string, outputPath: string): Promise<{ width: number; height: number }> {
  const UTIF = await getUtifModule()
  const input = await fs.readFile(filePath)
  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
  const ifds = UTIF.decode(ab)
  if (!ifds.length) throw new Error('TIFF: no frames')
  UTIF.decodeImage(ab, ifds[0])
  const ifd = ifds[0]
  const width = ifd.width
  const height = ifd.height
  if (!width || !height) throw new Error('TIFF: invalid dimensions')
  const rgba = UTIF.toRGBA8(ifd)
  const bitmap = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)
  const png = nativeImage.createFromBitmap(bitmap, { width, height }).toPNG()
  await fs.writeFile(outputPath, png)
  return { width, height }
}

let _cachedFfmpegPath: string | null = null

async function getFfmpegPath(): Promise<string> {
  if (_cachedFfmpegPath) return _cachedFfmpegPath

  const canExecuteFfmpeg = async (bin: string): Promise<boolean> => {
    return await new Promise<boolean>((resolve) => {
      const p = spawn(bin, ['-version'], { windowsHide: true })
      const timer = setTimeout(() => {
        try {
          p.kill()
        } catch {
          // ignore
        }
        resolve(false)
      }, 6000)
      p.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
      p.on('close', (code) => {
        clearTimeout(timer)
        resolve(code === 0)
      })
    })
  }

  const candidates: string[] = [join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')]
  if (ffmpegStatic) candidates.push(ffmpegStatic)

  let ff: string | null = null
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      if (await canExecuteFfmpeg(candidate)) {
        ff = candidate
        break
      }
    } catch {
      // try next candidate
    }
  }

  // Some endpoints block execution from Program Files/resources paths.
  // Mirror bundled binary to %TEMP% and run from there as a robust fallback.
  if (!ff) {
    const bundled = join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    try {
      await fs.access(bundled)
      await ensureFfmpegRuntimeCacheDir()
      const runtimeFfmpeg = join(getFfmpegRuntimeCacheDir(), 'ffmpeg.exe')
      await fs.copyFile(bundled, runtimeFfmpeg)
      if (await canExecuteFfmpeg(runtimeFfmpeg)) {
        ff = runtimeFfmpeg
      }
    } catch {
      // ignore, continue to PATH fallback
    }
  }

  if (!ff) ff = 'ffmpeg'
  _cachedFfmpegPath = ff
  return ff
}

async function renderViaFfmpegPreview(filePath: string, outputPath: string): Promise<{ width: number; height: number }> {
  const ff = await getFfmpegPath()

  await new Promise<void>((resolve, reject) => {
    const p = spawn(ff, ['-y', '-i', filePath, '-frames:v', '1', outputPath], { windowsHide: true })
    let err = ''
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      fn()
    }
    const timeoutId = setTimeout(() => {
      try {
        p.kill()
      } catch {
        // ignore
      }
      finish(() => reject(new Error(`ffmpeg preview timeout for "${basename(filePath)}"`)))
    }, 45_000)
    p.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })
    p.on('error', (error) => finish(() => reject(error)))
    p.on('close', (code) => {
      if (settled) return
      finish(() => {
        if (code === 0) resolve()
        else reject(new Error(err.trim() || `ffmpeg exited with code ${code}`))
      })
    })
  })

  return loadNativeImageSize(outputPath)
}

async function renderVideoStillPreview(filePath: string, outputPath: string): Promise<{ width: number; height: number }> {
  const ff = await getFfmpegPath()

  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      ff,
      [
        '-y',
        '-ss',
        '0.20',
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        'scale=640:-2:force_original_aspect_ratio=decrease',
        '-q:v',
        '5',
        outputPath,
      ],
      { windowsHide: true },
    )
    let err = ''
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      fn()
    }
    const timeoutId = setTimeout(() => {
      try {
        p.kill()
      } catch {
        // ignore
      }
      finish(() => reject(new Error(`ffmpeg still preview timeout for "${basename(filePath)}"`)))
    }, 60_000)
    p.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })
    p.on('error', (error) => finish(() => reject(error)))
    p.on('close', (code) => {
      if (settled) return
      finish(() => {
        if (code === 0) resolve()
        else reject(new Error(err.trim() || `ffmpeg exited with code ${code}`))
      })
    })
  })

  return loadNativeImageSize(outputPath)
}

async function transcodeVideoProxy(filePath: string, outputPath: string): Promise<void> {
  const ff = await getFfmpegPath()

  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      ff,
      [
        '-y',
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-vf',
        'scale=trunc(min(1280\\,iw)/2)*2:trunc((min(1280\\,iw)/a)/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-an',
        outputPath,
      ],
      { windowsHide: true },
    )
    let err = ''
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      fn()
    }
    const timeoutId = setTimeout(() => {
      try {
        p.kill()
      } catch {
        // ignore
      }
      finish(() => reject(new Error(`ffmpeg proxy timeout for "${basename(filePath)}"`)))
    }, 900_000)
    p.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })
    p.on('error', (error) => finish(() => reject(error)))
    p.on('close', (code) => {
      if (settled) return
      finish(() => {
        if (code === 0) resolve()
        else reject(new Error(err.trim() || `ffmpeg exited with code ${code}`))
      })
    })
  })
}

async function detectProResCodec(filePath: string): Promise<boolean> {
  const normalizedPath = normalize(filePath)
  const stat = await fs.stat(normalizedPath)
  const cacheKey = normalizePathKey(normalizedPath)
  const cached = proresProbeCache.get(cacheKey)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.isProres
  }

  const ff = await getFfmpegPath()
  const probeResult = await new Promise<boolean>((resolve) => {
    const p = spawn(ff, ['-hide_banner', '-i', normalizedPath], { windowsHide: true })
    let stderr = ''
    const timeoutId = setTimeout(() => {
      try {
        p.kill()
      } catch {
        // ignore
      }
      resolve(false)
    }, 15000)
    p.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    p.on('error', () => {
      clearTimeout(timeoutId)
      resolve(false)
    })
    p.on('close', () => {
      clearTimeout(timeoutId)
      resolve(/\bVideo:\s*prores\b/i.test(stderr))
    })
  })

  proresProbeCache.set(cacheKey, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    isProres: probeResult,
  })
  return probeResult
}

async function detectPrimaryVideoCodec(filePath: string): Promise<string | null> {
  const normalizedPath = normalize(filePath)
  const stat = await fs.stat(normalizedPath)
  const cacheKey = normalizePathKey(normalizedPath)
  const cached = videoCodecProbeCache.get(cacheKey)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.codec
  }

  const ff = await getFfmpegPath()
  const codec = await new Promise<string | null>((resolve) => {
    const p = spawn(ff, ['-hide_banner', '-i', normalizedPath], { windowsHide: true })
    let stderr = ''
    const timeoutId = setTimeout(() => {
      try {
        p.kill()
      } catch {
        // ignore
      }
      resolve(null)
    }, 15000)
    p.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    p.on('error', () => {
      clearTimeout(timeoutId)
      resolve(null)
    })
    p.on('close', () => {
      clearTimeout(timeoutId)
      const m = /\bVideo:\s*([a-zA-Z0-9_]+)/i.exec(stderr)
      resolve(m?.[1]?.toLowerCase() ?? null)
    })
  })

  videoCodecProbeCache.set(cacheKey, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    codec,
  })
  return codec
}

async function transcodeProresPersistentProxy(filePath: string, outputPath: string): Promise<void> {
  const ff = await getFfmpegPath()
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      ff,
      [
        '-y',
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '30',
        '-vf',
        'scale=trunc(min(960\\,iw)/2)*2:trunc((min(960\\,iw)/a)/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-an',
        outputPath,
      ],
      { windowsHide: true },
    )
    let err = ''
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      fn()
    }
    const timeoutId = setTimeout(() => {
      try {
        p.kill()
      } catch {
        // ignore
      }
      finish(() => reject(new Error(`ffmpeg prores proxy timeout for "${basename(filePath)}"`)))
    }, 900_000)
    p.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })
    p.on('error', (error) => finish(() => reject(error)))
    p.on('close', (code) => {
      if (settled) return
      finish(() => {
        if (code === 0) resolve()
        else reject(new Error(err.trim() || `ffmpeg exited with code ${code}`))
      })
    })
  })
}

async function resolveVideoSourceFromPath(
  filePath: string,
  options?: { projectPath?: string | null; existingProxyPath?: string | null; generateProxy?: boolean },
): Promise<{
  srcUrl: string
  sourceFilePath: string
  transcoded: boolean
  proxyFilePath?: string
  proxyForSourcePath?: string
}> {
  const requestedPath = normalize(filePath)
  const normalizedPath = await resolveExistingVideoPath(requestedPath)
  await appendVideoDebugLog(`resolve-video-source request "${requestedPath}" -> "${normalizedPath}"`)
  const stat = await fs.stat(normalizedPath)
  if (!stat.isFile()) throw new Error('Not a file')

  const ext = extname(normalizedPath).toLowerCase()
  const preferredProjectPath = options?.projectPath ?? null
  const existingProxyPath = options?.existingProxyPath ? normalize(options.existingProxyPath) : null
  const generateProxy = options?.generateProxy === true
  const shouldCheckProres = ext === '.mov'
  const isProres = shouldCheckProres ? await detectProResCodec(normalizedPath) : false
  const isMovMjpeg = shouldCheckProres && !isProres && (await detectPrimaryVideoCodec(normalizedPath)) === 'mjpeg'

  if (isProres) {
    const proxyDirs = preferredProjectPath
      ? getProjectPersistentVideoProxyDirs(preferredProjectPath)
      : [getDesktopProresProxyDir()]
    const proxyFileName = persistentProxyFileNameForSource(normalizedPath)
    const proxyPath = join(proxyDirs[0], proxyFileName)

    const resolveExistingPersistentProxy = async (): Promise<string | null> => {
      return findPersistentProxyInDirs(proxyDirs, normalizedPath, stat.mtimeMs, 'prores')
    }

    if (existingProxyPath) {
      try {
        const existingStat = await fs.stat(existingProxyPath)
        if (existingStat.isFile()) {
          const stagedProxyPath =
            preferredProjectPath && normalizePathKey(existingProxyPath) !== normalizePathKey(proxyPath)
              ? await stageProjectScopedProxyIfAvailable(proxyPath, stat.mtimeMs, [existingProxyPath])
              : null
          const usableProxyPath = stagedProxyPath || existingProxyPath
          await appendVideoDebugLog(`using saved prores proxy "${usableProxyPath}"`)
          return {
            srcUrl: localPathToMediaUrl(usableProxyPath),
            sourceFilePath: normalizedPath,
            transcoded: true,
            proxyFilePath: usableProxyPath,
            proxyForSourcePath: normalizedPath,
          }
        }
      } catch {
        // continue with target proxy path
      }
    }

    const discoveredProxyPath = await resolveExistingPersistentProxy()
    if (discoveredProxyPath) {
      const stagedProxyPath =
        preferredProjectPath && normalizePathKey(discoveredProxyPath) !== normalizePathKey(proxyPath)
          ? await stageProjectScopedProxyIfAvailable(proxyPath, stat.mtimeMs, [discoveredProxyPath])
          : null
      const usableProxyPath = stagedProxyPath || discoveredProxyPath
      await appendVideoDebugLog(`using discovered prores proxy "${usableProxyPath}"`)
      return {
        srcUrl: localPathToMediaUrl(usableProxyPath),
        sourceFilePath: normalizedPath,
        transcoded: true,
        proxyFilePath: usableProxyPath,
        proxyForSourcePath: normalizedPath,
      }
    }

    if (!generateProxy) {
      await appendVideoDebugLog(`prores detected, keeping direct source until explicit proxy generation "${normalizedPath}"`)
      return {
        srcUrl: localPathToMediaUrl(normalizedPath),
        sourceFilePath: normalizedPath,
        transcoded: false,
      }
    }

    await fs.mkdir(proxyDirs[0], { recursive: true })
    try {
      const proxyStat = await fs.stat(proxyPath)
      if (proxyStat.isFile() && proxyStat.mtimeMs >= stat.mtimeMs) {
        await appendVideoDebugLog(`using persistent prores proxy "${proxyPath}"`)
        return {
          srcUrl: localPathToMediaUrl(proxyPath),
          sourceFilePath: normalizedPath,
          transcoded: true,
          proxyFilePath: proxyPath,
          proxyForSourcePath: normalizedPath,
        }
      }
    } catch {
      // proxy does not exist yet
    }

    await appendVideoDebugLog(`transcoding persistent prores proxy "${normalizedPath}" -> "${proxyPath}"`)
    try {
      await transcodeProresPersistentProxy(normalizedPath, proxyPath)
      return {
        srcUrl: localPathToMediaUrl(proxyPath),
        sourceFilePath: normalizedPath,
        transcoded: true,
        proxyFilePath: proxyPath,
        proxyForSourcePath: normalizedPath,
      }
    } catch (error) {
      await appendVideoDebugLog(
        `persistent prores transcode failed for "${normalizedPath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return {
        srcUrl: localPathToMediaUrl(normalizedPath),
        sourceFilePath: normalizedPath,
        transcoded: false,
      }
    }
  }

  if (isMovMjpeg) {
    const proxyDirs = preferredProjectPath
      ? getProjectPersistentVideoProxyDirs(preferredProjectPath)
      : [getDesktopProresProxyDir()]
    const proxyFileName = persistentProxyFileNameForSource(normalizedPath)
    const proxyPath = join(proxyDirs[0], proxyFileName)

    const resolveExistingPlaybackProxy = async (): Promise<string | null> => {
      return findPersistentProxyInDirs(proxyDirs, normalizedPath, stat.mtimeMs, 'mjpeg')
    }

    if (existingProxyPath) {
      try {
        const existingStat = await fs.stat(existingProxyPath)
        if (existingStat.isFile()) {
          const stagedProxyPath =
            preferredProjectPath && normalizePathKey(existingProxyPath) !== normalizePathKey(proxyPath)
              ? await stageProjectScopedProxyIfAvailable(proxyPath, stat.mtimeMs, [existingProxyPath])
              : null
          const usableProxyPath = stagedProxyPath || existingProxyPath
          await appendVideoDebugLog(`using saved mjpeg playback proxy "${usableProxyPath}"`)
          return {
            srcUrl: localPathToMediaUrl(usableProxyPath),
            sourceFilePath: normalizedPath,
            transcoded: true,
            proxyFilePath: usableProxyPath,
            proxyForSourcePath: normalizedPath,
          }
        }
      } catch {
        // continue
      }
    }

    const discoveredPlayback = await resolveExistingPlaybackProxy()
    if (discoveredPlayback) {
      const stagedProxyPath =
        preferredProjectPath && normalizePathKey(discoveredPlayback) !== normalizePathKey(proxyPath)
          ? await stageProjectScopedProxyIfAvailable(proxyPath, stat.mtimeMs, [discoveredPlayback])
          : null
      const usableProxyPath = stagedProxyPath || discoveredPlayback
      await appendVideoDebugLog(`using discovered mjpeg playback proxy "${usableProxyPath}"`)
      return {
        srcUrl: localPathToMediaUrl(usableProxyPath),
        sourceFilePath: normalizedPath,
        transcoded: true,
        proxyFilePath: usableProxyPath,
        proxyForSourcePath: normalizedPath,
      }
    }

    if (!generateProxy) {
      await appendVideoDebugLog(
        `mjpeg mov detected, keeping direct source until proxy generation "${normalizedPath}"`,
      )
      return {
        srcUrl: localPathToMediaUrl(normalizedPath),
        sourceFilePath: normalizedPath,
        transcoded: false,
      }
    }

    await fs.mkdir(proxyDirs[0], { recursive: true })
    try {
      const proxyStat = await fs.stat(proxyPath)
      if (proxyStat.isFile() && proxyStat.mtimeMs >= stat.mtimeMs) {
        await appendVideoDebugLog(`using persistent mjpeg playback proxy "${proxyPath}"`)
        return {
          srcUrl: localPathToMediaUrl(proxyPath),
          sourceFilePath: normalizedPath,
          transcoded: true,
          proxyFilePath: proxyPath,
          proxyForSourcePath: normalizedPath,
        }
      }
    } catch {
      // proxy does not exist yet
    }

    await appendVideoDebugLog(`transcoding mjpeg playback proxy "${normalizedPath}" -> "${proxyPath}"`)
    try {
      await transcodeVideoProxy(normalizedPath, proxyPath)
      return {
        srcUrl: localPathToMediaUrl(proxyPath),
        sourceFilePath: normalizedPath,
        transcoded: true,
        proxyFilePath: proxyPath,
        proxyForSourcePath: normalizedPath,
      }
    } catch (error) {
      await appendVideoDebugLog(
        `mjpeg playback transcode failed for "${normalizedPath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return {
        srcUrl: localPathToMediaUrl(normalizedPath),
        sourceFilePath: normalizedPath,
        transcoded: false,
      }
    }
  }

  const shouldUseRuntimeProxy = VIDEO_PROXY_EXT.has(ext)
  if (!shouldUseRuntimeProxy) {
    await appendVideoDebugLog(`using direct media url for "${normalizedPath}"`)
    return {
      srcUrl: localPathToMediaUrl(normalizedPath),
      sourceFilePath: normalizedPath,
      transcoded: false,
    }
  }

  const cacheKey = buildVideoProxyCacheKey(normalizedPath, preferredProjectPath)
  const proxyPath = videoProxyCacheFilePath(normalizedPath, preferredProjectPath)
  const cached = videoProxyCache.get(cacheKey)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    try {
      await fs.access(cached.proxyPath)
      await appendVideoDebugLog(`using runtime in-memory proxy "${cached.proxyPath}"`)
      return {
        srcUrl: localPathToMediaUrl(cached.proxyPath),
        sourceFilePath: normalizedPath,
        transcoded: true,
        proxyFilePath: cached.proxyPath,
        proxyForSourcePath: normalizedPath,
      }
    } catch {
      videoProxyCache.delete(cacheKey)
    }
  }

  if (preferredProjectPath) {
    const stagedProxyPath = await stageProjectScopedProxyIfAvailable(proxyPath, stat.mtimeMs, [
      existingProxyPath,
      videoProxyCacheFilePath(normalizedPath),
    ])
    if (stagedProxyPath) {
      videoProxyCache.set(cacheKey, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        proxyPath: stagedProxyPath,
      })
      await appendVideoDebugLog(`using project runtime proxy "${stagedProxyPath}"`)
      return {
        srcUrl: localPathToMediaUrl(stagedProxyPath),
        sourceFilePath: normalizedPath,
        transcoded: true,
        proxyFilePath: stagedProxyPath,
        proxyForSourcePath: normalizedPath,
      }
    }
  }

  await ensureVideoProxyCacheDir(preferredProjectPath)
  try {
    const proxyStat = await fs.stat(proxyPath)
    if (proxyStat.isFile() && proxyStat.mtimeMs >= stat.mtimeMs) {
      videoProxyCache.set(cacheKey, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        proxyPath,
      })
      await appendVideoDebugLog(`using runtime proxy "${proxyPath}"`)
      return {
        srcUrl: localPathToMediaUrl(proxyPath),
        sourceFilePath: normalizedPath,
        transcoded: true,
        proxyFilePath: proxyPath,
        proxyForSourcePath: normalizedPath,
      }
    }
  } catch {
    // no runtime proxy yet
  }

  try {
    await appendVideoDebugLog(`transcoding runtime proxy "${normalizedPath}" -> "${proxyPath}"`)
    await transcodeVideoProxy(normalizedPath, proxyPath)
    videoProxyCache.set(cacheKey, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      proxyPath,
    })
    return {
      srcUrl: localPathToMediaUrl(proxyPath),
      sourceFilePath: normalizedPath,
      transcoded: true,
      proxyFilePath: proxyPath,
      proxyForSourcePath: normalizedPath,
    }
  } catch (error) {
    await appendVideoDebugLog(
      `runtime transcode failed for "${normalizedPath}": ${error instanceof Error ? error.message : String(error)}`,
    )
    await appendVideoDebugLog(`fallback to direct media url for "${normalizedPath}"`)
    return {
      srcUrl: localPathToMediaUrl(normalizedPath),
      sourceFilePath: normalizedPath,
      transcoded: false,
    }
  }
}

async function inspectVideoSourcePath(
  filePath: string,
  options?: { projectPath?: string | null },
): Promise<{ path: string; isProres: boolean; isMjpeg: boolean; hasProxy: boolean }> {
  const requestedPath = normalize(filePath)
  const normalizedPath = await resolveExistingVideoPath(requestedPath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext !== '.mov') {
    return { path: normalizedPath, isProres: false, isMjpeg: false, hasProxy: false }
  }

  const projectPath = options?.projectPath ?? null
  const proxyDirs = projectPath
    ? getProjectPersistentVideoProxyDirs(projectPath)
    : [getDesktopProresProxyDir()]

  const isProres = await detectProResCodec(normalizedPath).catch(() => false)
  if (isProres) {
    let hasProxy = false
    try {
      const sourceStat = await fs.stat(normalizedPath)
      hasProxy =
        (await findPersistentProxyInDirs(proxyDirs, normalizedPath, sourceStat.mtimeMs, 'prores')) != null
    } catch {
      hasProxy = false
    }

    return { path: normalizedPath, isProres: true, isMjpeg: false, hasProxy }
  }

  const isMjpeg = (await detectPrimaryVideoCodec(normalizedPath)) === 'mjpeg'
  if (!isMjpeg) {
    return { path: normalizedPath, isProres: false, isMjpeg: false, hasProxy: false }
  }

  let hasProxy = false
  try {
    const sourceStat = await fs.stat(normalizedPath)
    hasProxy =
      (await findPersistentProxyInDirs(proxyDirs, normalizedPath, sourceStat.mtimeMs, 'mjpeg')) != null
  } catch {
    hasProxy = false
  }

  return { path: normalizedPath, isProres: false, isMjpeg: true, hasProxy }
}

async function ensureSpecialImagePreview(filePath: string): Promise<{
  previewPath: string
  width: number
  height: number
}> {
  const stat = await fs.stat(filePath)
  const cacheKey = normalizePathKey(filePath)
  const cached = rasterPreviewCache.get(cacheKey)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    try {
      await fs.access(cached.previewPath)
      return {
        previewPath: cached.previewPath,
        width: cached.width,
        height: cached.height,
      }
    } catch {
      rasterPreviewCache.delete(cacheKey)
    }
  }

  await ensurePreviewCacheDir()
  const previewPath = previewCacheFilePath(filePath)
  const ext = extname(filePath).toLowerCase()
  const rendered =
    ext === '.tif' || ext === '.tiff'
      ? await renderTiffPreview(filePath, previewPath)
      : await renderViaFfmpegPreview(filePath, previewPath)

  rasterPreviewCache.set(cacheKey, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    previewPath,
    width: rendered.width,
    height: rendered.height,
  })

  return {
    previewPath,
    width: rendered.width,
    height: rendered.height,
  }
}

async function ensureVideoStillPreview(filePath: string): Promise<{
  previewPath: string
  width: number
  height: number
  sourceFilePath: string
}> {
  const normalizedPath = await resolveExistingVideoPath(filePath)
  const stat = await fs.stat(normalizedPath)
  if (!stat.isFile()) {
    throw new Error('Not a file')
  }

  const cacheKey = normalizePathKey(normalizedPath)
  const cached = videoStillPreviewCache.get(cacheKey)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    try {
      await fs.access(cached.previewPath)
      return {
        previewPath: cached.previewPath,
        width: cached.width,
        height: cached.height,
        sourceFilePath: normalizedPath,
      }
    } catch {
      videoStillPreviewCache.delete(cacheKey)
    }
  }

  const existing = videoStillPreviewInflight.get(cacheKey)
  if (existing) {
    return existing
  }

  const renderPromise = runWithVideoStillRenderSlot(async () => {
    await ensureVideoStillCacheDir()
    const previewPath = videoStillCacheFilePath(normalizedPath)

    try {
      const previewStat = await fs.stat(previewPath)
      if (previewStat.isFile() && previewStat.mtimeMs >= stat.mtimeMs) {
        const size = await loadNativeImageSize(previewPath)
        videoStillPreviewCache.set(cacheKey, {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          previewPath,
          width: size.width,
          height: size.height,
        })
        return {
          previewPath,
          width: size.width,
          height: size.height,
          sourceFilePath: normalizedPath,
        }
      }
    } catch {
      // still preview is missing or stale, regenerate it below.
    }

    const rendered = await renderVideoStillPreview(normalizedPath, previewPath)
    await fs.utimes(previewPath, stat.atime, stat.mtime).catch(() => {})

    videoStillPreviewCache.set(cacheKey, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      previewPath,
      width: rendered.width,
      height: rendered.height,
    })

    return {
      previewPath,
      width: rendered.width,
      height: rendered.height,
      sourceFilePath: normalizedPath,
    }
  }).finally(() => {
    videoStillPreviewInflight.delete(cacheKey)
  })

  videoStillPreviewInflight.set(cacheKey, renderPromise)
  return renderPromise
}

async function resolveImageSourceFromPath(filePath: string) {
  const normalizedPath = normalize(filePath)
  const st = await fs.stat(normalizedPath)
  if (!st.isFile()) {
    throw new Error('Not a file')
  }

  const ext = extname(normalizedPath).toLowerCase()
  if (DIRECT_IMAGE_EXT.has(ext)) {
    const natural = await loadNativeImageSize(normalizedPath)
    const view = imageTileViewSize(natural.width, natural.height)
    return {
      srcUrl: localPathToMediaUrl(normalizedPath),
      storage: 'linked' as const,
      naturalWidth: natural.width,
      naturalHeight: natural.height,
      width: view.width,
      height: view.height,
      sourceFilePath: normalizedPath,
    }
  }

  if (PREVIEW_IMAGE_EXT.has(ext)) {
    const preview = await ensureSpecialImagePreview(normalizedPath)
    const view = imageTileViewSize(preview.width, preview.height)
    return {
      srcUrl: localPathToMediaUrl(preview.previewPath),
      storage: 'linked' as const,
      naturalWidth: preview.width,
      naturalHeight: preview.height,
      width: view.width,
      height: view.height,
      sourceFilePath: normalizedPath,
      projectAssetPath: preview.previewPath,
    }
  }

  throw new Error(`Unsupported format: ${ext || 'unknown'}`)
}

async function walkDirCollectMediaFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...(await walkDirCollectMediaFiles(full)))
    } else if (ent.isFile()) {
      const x = extname(ent.name)
      if (isMediaFileExt(x)) out.push(full)
    }
  }
  return out
}

async function readRecentProjects(userDataDir: string): Promise<string[]> {
  const filePath = join(userDataDir, RECENTS_FILE)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const unique: string[] = []
    for (const p of parsed) {
      if (typeof p !== 'string') continue
      if (!unique.includes(p)) unique.push(p)
    }
    // Filter non-existing
    const existing: string[] = []
    for (const p of unique) {
      try {
        await fs.access(p)
        existing.push(p)
      } catch {
        // ignore
      }
    }
    return existing.slice(0, 10)
  } catch {
    return []
  }
}

async function writeRecentProjects(userDataDir: string, paths: string[]) {
  const filePath = join(userDataDir, RECENTS_FILE)
  await fs.writeFile(filePath, JSON.stringify(paths, null, 2), 'utf8')
}

async function touchRecentProject(userDataDir: string, projectPath: string) {
  await fs.access(projectPath)
  const existing = await readRecentProjects(userDataDir)
  const filtered = existing.filter((p) => p !== projectPath)
  return [projectPath, ...filtered].slice(0, 10)
}

function tokenizeVideoName(value: string): string[] {
  const base = basename(value, extname(value))
  return base
    .toLowerCase()
    .replace(/[\u0400-\u04ff]/g, ' ')
    .replace(/[^a-z0-9;]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function extractTimecodes(value: string): string[] {
  const normalized = value.toLowerCase()
  const matches = normalized.match(/\d{2};\d{2};\d{2};\d{2}/g)
  if (!matches) return []
  return Array.from(new Set(matches))
}

function scoreCandidateName(targetName: string, candidateName: string): number {
  const targetTokens = tokenizeVideoName(targetName)
  const candidateTokens = tokenizeVideoName(candidateName)
  const targetSet = new Set(targetTokens)
  const candidateSet = new Set(candidateTokens)

  let score = 0
  for (const token of targetSet) {
    if (candidateSet.has(token)) score += 10
  }

  const targetTimecodes = extractTimecodes(targetName)
  const candidateTimecodes = new Set(extractTimecodes(candidateName))
  for (const tc of targetTimecodes) {
    if (candidateTimecodes.has(tc)) score += 120
  }

  const targetBase = basename(targetName, extname(targetName)).toLowerCase()
  const candidateBase = basename(candidateName, extname(candidateName)).toLowerCase()
  const commonPrefixLen = Math.min(
    targetBase.length,
    candidateBase.length,
    (() => {
      let i = 0
      while (i < targetBase.length && i < candidateBase.length && targetBase[i] === candidateBase[i]) i += 1
      return i
    })(),
  )
  score += Math.min(40, commonPrefixLen)
  score -= Math.abs(targetBase.length - candidateBase.length)

  return score
}

async function findBestVideoFilenameMatch(
  dirs: Set<string>,
  fileName: string,
): Promise<string | null> {
  const wantedExt = extname(fileName).toLowerCase()
  let best: { path: string; score: number; size: number } | null = null

  for (const dir of dirs) {
    let entries: Awaited<ReturnType<typeof fs.readdir>>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (wantedExt && extname(entry.name).toLowerCase() !== wantedExt) continue
      const fullPath = join(dir, entry.name)
      let st: Awaited<ReturnType<typeof fs.stat>>
      try {
        st = await fs.stat(fullPath)
      } catch {
        continue
      }
      if (!st.isFile()) continue
      const score = scoreCandidateName(fileName, entry.name)
      if (best === null || score > best.score || (score === best.score && st.size > best.size)) {
        best = { path: fullPath, score, size: st.size }
      }
    }
  }

  if (!best) return null
  // Guard against random mismatches: require at least some meaningful overlap.
  return best.score >= 30 ? best.path : null
}

async function readProjectFromDisk(
  projectPath: string,
  options?: { resolveVideoSources?: boolean },
): Promise<{ project: DeserializedProject; rawItemsCount: number | null }> {
  const raw = await fs.readFile(projectPath, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  const rawItemsCount = isRecord(parsed) && Array.isArray((parsed as any).items) ? (parsed as any).items.length : null
  const project = deserializeProject(parsed, {
    resolveAssetPath: (relativePath) => resolveProjectAssetPath(projectPath, relativePath),
  })

  // Keep video src bound to source files; avoid proxy path stickiness from older builds.
  for (const item of project.items) {
    if (item.type !== 'video') continue
    const sourcePath = item.sourceFilePath ?? mediaUrlToLocalPath(item.srcUrl)
    if (!sourcePath) continue
    const proxyPath = item.proxyFilePath
    item.srcUrl = localPathToMediaUrl(proxyPath || sourcePath)
  }

  if (options?.resolveVideoSources !== false) {
    const knownVideoDirs = new Set<string>()
    for (const item of project.items) {
      if (item.type !== 'video') continue
      if (!item.sourceFilePath || isLegacyTempProxyPath(item.sourceFilePath)) continue
      knownVideoDirs.add(dirname(item.sourceFilePath))
    }

    const tryResolveByFilename = async (fileName: string): Promise<string | null> => {
      for (const dir of knownVideoDirs) {
        const candidate = join(dir, fileName)
        try {
          const st = await fs.stat(candidate)
          if (st.isFile()) return candidate
        } catch {
          // continue
        }
      }
      return null
    }

    for (const item of project.items) {
      if (item.type !== 'video') continue
      const primarySourcePath = item.sourceFilePath ?? mediaUrlToLocalPath(item.srcUrl)
      if (!primarySourcePath) continue
      try {
        const resolved = await resolveVideoSourceFromPath(primarySourcePath, {
          projectPath,
          existingProxyPath:
            item.proxyFilePath &&
            item.proxyForSourcePath &&
            normalizePathKey(item.proxyForSourcePath) === normalizePathKey(primarySourcePath)
              ? item.proxyFilePath
              : null,
        })
        item.srcUrl = resolved.srcUrl
        item.sourceFilePath = resolved.sourceFilePath
        item.proxyFilePath = resolved.proxyFilePath
        item.proxyForSourcePath = resolved.proxyForSourcePath
        if (!isLegacyTempProxyPath(resolved.sourceFilePath)) {
          knownVideoDirs.add(dirname(resolved.sourceFilePath))
        }
      } catch {
        await appendVideoDebugLog(`resolve-video-source failed for "${primarySourcePath}"`)
        if (item.fileName) {
          let repaired = await tryResolveByFilename(item.fileName)
          if (!repaired) {
            repaired = await findBestVideoFilenameMatch(knownVideoDirs, item.fileName)
          }
          if (repaired) {
            try {
              const resolved = await resolveVideoSourceFromPath(repaired, { projectPath })
              item.srcUrl = resolved.srcUrl
              item.sourceFilePath = resolved.sourceFilePath
              item.proxyFilePath = resolved.proxyFilePath
              item.proxyForSourcePath = resolved.proxyForSourcePath
              knownVideoDirs.add(dirname(resolved.sourceFilePath))
              await appendVideoDebugLog(
                `repaired missing video by fuzzy filename match "${item.fileName}" -> "${resolved.sourceFilePath}"`,
              )
              continue
            } catch {
              // keep fallback below
            }
          }
        }
        // Keep original source URL if proxy generation/repair failed.
      }
    }
  }
  return { project, rawItemsCount }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

async function writeProjectToDisk(projectPath: string, project: ProjectFile) {
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8')
}

async function persistProjectVideoSnapshot(projectPath: string, items: CanvasItem[]): Promise<void> {
  const targetDir = await ensureVideoProxyCacheDir(projectPath)
  const proxiesToStage = new Map<string, string>()
  for (const item of items) {
    if (item.type !== 'video') continue
    const sourcePath = item.sourceFilePath?.trim()
    const srcPath = mediaUrlToLocalPath(item.srcUrl)
    const proxyPath =
      item.proxyFilePath?.trim() ||
      (srcPath && sourcePath && normalizePathKey(srcPath) !== normalizePathKey(sourcePath) ? srcPath : '')
    if (!proxyPath) continue
    proxiesToStage.set(normalizePathKey(proxyPath), proxyPath)
  }
  await Promise.all(
    Array.from(proxiesToStage.values()).map(async (proxyPath) => {
      const targetProxyPath = join(targetDir, basename(proxyPath))
      await stageProjectScopedProxyIfAvailable(targetProxyPath, 0, [proxyPath])
    }),
  )
}

async function cloneProjectVideoSnapshotIfNeeded(
  sourceProjectPath: string | null | undefined,
  targetProjectPath: string,
): Promise<void> {
  if (!sourceProjectPath || !sourceProjectPath.trim()) return
  const sourceProject = normalize(sourceProjectPath.trim())
  const targetProject = normalize(targetProjectPath)
  if (normalizePathKey(sourceProject) === normalizePathKey(targetProject)) return
  const sourceDir = projectVideoSnapshotDir(sourceProject)
  const targetDir = projectVideoSnapshotDir(targetProject)
  if (normalizePathKey(sourceDir) === normalizePathKey(targetDir)) return
  try {
    await fs.access(sourceDir)
  } catch {
    return
  }
  await fs.mkdir(targetDir, { recursive: true })
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  })
}

let activeWindow: BrowserWindow | null = null

/** Mirrors BrowserWindow always-on-top; used for menu checkbox + IPC (avoids relying on platform-specific getters). */
let alwaysOnTopEnabled = false

function revealWindow(win: BrowserWindow): void {
  if (win.isMinimized()) {
    win.restore()
  }
  if (!win.isVisible()) {
    win.show()
  } else {
    win.show()
  }
  win.focus()
}

function applyAlwaysOnTop(win: BrowserWindow, enabled: boolean): void {
  alwaysOnTopEnabled = enabled
  // 'floating' is a good default on Windows/Linux; macOS accepts the same level names in Electron.
  if (enabled) {
    win.setAlwaysOnTop(true, 'floating')
  } else {
    win.setAlwaysOnTop(false)
  }
  win.webContents.send('window:always-on-top-changed', { value: enabled })
  void refreshApplicationMenu()
}

/** When true, skip unsaved prompt on BrowserWindow.close() */
const allowWindowClose = new WeakMap<BrowserWindow, boolean>()

function setupWindowCloseGuard(win: BrowserWindow): void {
  win.on('close', async (e) => {
    if (allowWindowClose.get(win)) return
    e.preventDefault()
    if (launchEstimatingContext?.linkedProjectPath) {
      try {
        const autosaveCompleted = await win.webContents.executeJavaScript(
          `window.__previewvLinkedAutosave ? window.__previewvLinkedAutosave() : true`,
        )
        if (autosaveCompleted !== false) {
          allowWindowClose.set(win, true)
          win.close()
        }
      } catch {
        // Keep the window open if linked autosave could not complete.
      }
      return
    }
    let state: { dirty?: boolean; path?: string | null } = {}
    try {
      state = await win.webContents.executeJavaScript(
        `window.__previewvProjectState ?? { dirty: false, path: null }`,
      )
    } catch {
      state = {}
    }
    const dirty = Boolean(state.dirty)
    if (!dirty) {
      allowWindowClose.set(win, true)
      win.close()
      return
    }
    const fileLabel = state.path ? basename(state.path) : 'Untitled'
    // Ask renderer to show themed close confirmation modal.
    win.webContents.send('app:request-unsaved-close', { fileLabel })
  })
}

function sendOpenProjectToRenderer(projectPath: string) {
  pendingOpenPath = null
  if (!activeWindow) {
    pendingOpenPath = projectPath
    return
  }
  // Preload will buffer the path, so it won't be lost even if renderer isn't ready yet.
  activeWindow.webContents.send(PROJECT_OPEN_CHANNEL, { path: projectPath })
}

async function refreshApplicationMenu() {
  if (!activeWindow) return
  const recentPaths = await readRecentProjects(app.getPath('userData'))

  const sendEdit = (command: string) => {
    activeWindow?.webContents.send('app:edit-command', { command })
  }

  const openRecentSubmenu =
    recentPaths.length === 0
      ? [
          {
            label: '(empty)',
            enabled: false,
          },
        ]
      : recentPaths.map((p) => ({
          label: basename(p),
          click: () => {
            activeWindow?.webContents.send('project:menu-action', {
              action: 'open-recent',
              path: p,
            })
          },
        }))

  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => activeWindow?.webContents.send('project:menu-action', { action: 'open' }),
        },
        {
          label: 'Add folder…',
          click: () =>
            activeWindow?.webContents.send('project:menu-action', { action: 'add-folder' }),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () =>
            activeWindow?.webContents.send('project:menu-action', { action: 'save' }),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () =>
            activeWindow?.webContents.send('project:menu-action', { action: 'save-as' }),
        },
        { type: 'separator' },
        {
          label: 'Close project',
          accelerator: 'CmdOrCtrl+W',
          click: () =>
            activeWindow?.webContents.send('project:menu-action', { action: 'close-project' }),
        },
        { type: 'separator' },
        {
          label: 'Open Recent',
          submenu: openRecentSubmenu,
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendEdit('undo'),
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => sendEdit('redo'),
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          click: () => sendEdit('cut'),
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => sendEdit('copy'),
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => sendEdit('paste'),
        },
        { type: 'separator' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: () => sendEdit('select-all'),
        },
        { type: 'separator' },
        {
          label: 'Delete',
          accelerator: 'Delete',
          click: () => sendEdit('delete'),
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => activeWindow?.webContents.send('app:open-settings'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Always on top',
          type: 'checkbox',
          checked: alwaysOnTopEnabled,
          click: (menuItem: any) => {
            if (!activeWindow) return
            applyAlwaysOnTop(activeWindow, menuItem.checked)
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle always on top',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            if (!activeWindow) return
            applyAlwaysOnTop(activeWindow, !alwaysOnTopEnabled)
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Инструкция',
          accelerator: 'F1',
          click: () => activeWindow?.webContents.send('app:show-help'),
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  alwaysOnTopEnabled = false
  const showImmediately = !app.isPackaged

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: showImmediately,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  if (!showImmediately) {
    mainWindow.on('ready-to-show', () => {
      revealWindow(mainWindow)
    })
  } else {
    const devShowFallback = setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        revealWindow(mainWindow)
      }
    }, 1200)
    mainWindow.once('ready-to-show', () => {
      clearTimeout(devShowFallback)
      revealWindow(mainWindow)
    })
  }

  activeWindow = mainWindow
  setupWindowCloseGuard(mainWindow)
  refreshApplicationMenu().catch(() => {})

  // Ctrl+Shift+A (Cmd+Shift+A on macOS): toggle always-on-top; handled in main so it works over canvas/video.
  // Ignores auto-repeat. Physical KeyA for layout-stable binding.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.isAutoRepeat) return
    if (!input.shift) return
    if (!(input.control || input.meta)) return
    if (input.alt) return
    if (input.code !== 'KeyA') return
    event.preventDefault()
    applyAlwaysOnTop(mainWindow, !alwaysOnTopEnabled)
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingOpenPath) {
      sendOpenProjectToRenderer(pendingOpenPath)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

  // Do NOT require NODE_ENV === 'development'. Under `electron-vite dev`, the main bundle
  // often runs with NODE_ENV=production, so the old check always fell through to
  // loadFile(out/renderer/...) — the user saw a stale build no matter what changed in src/.
  if (!app.isPackaged && rendererDevUrl) {
    // eslint-disable-next-line no-console
    console.log('[PreviewV] Loading renderer from Vite dev server:', rendererDevUrl)
    mainWindow.loadURL(rendererDevUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Handle media:///<path> requests by forwarding them to the real file system.
  // URL example: media:///C:/Users/user/video.mp4
  protocol.handle('media', (request) => serveMediaProtocolRequest(request))

  void syncInstalledVersionMarker()

  ipcMain.handle('window:get-always-on-top', () => alwaysOnTopEnabled)
  ipcMain.handle('estimating:get-launch-context', async () => launchEstimatingContext)

  ipcMain.handle('app:get-runtime-info', async () => {
    const versionMarkerPath = await syncInstalledVersionMarker()
    return {
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      installDirectory: app.isPackaged ? dirname(process.execPath) : null,
      versionMarkerPath,
    }
  })

  ipcMain.handle('window:set-always-on-top', (_e, enabled: unknown) => {
    if (!activeWindow) return
    applyAlwaysOnTop(activeWindow, Boolean(enabled))
  })

  ipcMain.handle('reveal-file-in-folder', async (_e, payload: { path?: unknown }) => {
    const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
    if (!rawPath) return false
    const normalizedPath = normalize(rawPath)
    try {
      const st = await fs.stat(normalizedPath)
      if (!st.isFile()) return false
      shell.showItemInFolder(normalizedPath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('open-proxies-folder', async (_e, payload: { projectPath?: unknown }) => {
    const projectPath =
      typeof payload?.projectPath === 'string' && payload.projectPath.trim().length > 0
        ? normalize(payload.projectPath.trim())
        : null
    const dir = projectPath ? projectVideoSnapshotDir(projectPath) : getDesktopProresProxyDir()
    try {
      await fs.mkdir(dir, { recursive: true })
      const err = await shell.openPath(dir)
      return !err
    } catch {
      return false
    }
  })

  ipcMain.handle('pick-folder-dialog', async () => {
    if (!activeWindow) return null
    const result = await dialog.showOpenDialog(activeWindow, {
      title: 'Select folder with media',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]!
  })

  ipcMain.handle('enumerate-folder-media', async (_e, folderPath: unknown) => {
    if (typeof folderPath !== 'string' || !folderPath.trim()) return []
    const dir = normalize(folderPath.trim())
    try {
      const st = await fs.stat(dir)
      if (!st.isDirectory()) return []
    } catch {
      return []
    }
    const files = await walkDirCollectMediaFiles(dir)
    files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    return files
  })

  ipcMain.handle('resolve-image-source', async (_e, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Invalid path')
    }
    return resolveImageSourceFromPath(filePath)
  })

  ipcMain.handle('resolve-video-source', async (_e, payload: unknown) => {
    const filePath =
      typeof payload === 'string'
        ? payload
        : isRecord(payload) && typeof payload.path === 'string'
          ? payload.path
          : ''
    const projectPath =
      isRecord(payload) && typeof payload.projectPath === 'string' ? payload.projectPath : null
    const existingProxyPath =
      isRecord(payload) && typeof payload.existingProxyPath === 'string'
        ? payload.existingProxyPath
        : null
    const generateProxy = isRecord(payload) && payload.generateProxy === true
    if (!filePath.trim()) {
      throw new Error('Invalid path')
    }
    try {
      return await resolveVideoSourceFromPath(filePath, { projectPath, existingProxyPath, generateProxy })
    } catch (error) {
      await appendVideoDebugLog(
        `resolve-video-source failed for "${String(filePath)}": ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }
  })

  ipcMain.handle('resolve-video-still-preview', async (_e, payload: unknown) => {
    const filePath =
      typeof payload === 'string'
        ? payload
        : isRecord(payload) && typeof payload.path === 'string'
          ? payload.path
          : ''
    if (!filePath.trim()) {
      throw new Error('Invalid path')
    }

    const preview = await ensureVideoStillPreview(filePath)
    return {
      srcUrl: localPathToMediaUrl(preview.previewPath),
      width: preview.width,
      height: preview.height,
      previewPath: preview.previewPath,
      sourceFilePath: preview.sourceFilePath,
    }
  })

  ipcMain.handle('inspect-video-sources', async (_e, payload: { paths?: unknown; projectPath?: unknown }) => {
    const incoming =
      Array.isArray(payload?.paths)
        ? payload.paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        : []
    const uniquePaths = Array.from(new Set(incoming.map((p) => normalize(p.trim()))))
    const projectPath =
      typeof payload?.projectPath === 'string' && payload.projectPath.trim().length > 0
        ? normalize(payload.projectPath.trim())
        : null
    const out: Array<{ path: string; isProres: boolean; isMjpeg: boolean; hasProxy: boolean }> = []
    for (const path of uniquePaths) {
      out.push(await inspectVideoSourcePath(path, { projectPath }))
    }
    return out
  })

  ipcMain.handle(
    'confirm-generate-proxies',
    async (event, payload: { count?: unknown; unsavedProject?: unknown }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return false
      const count = typeof payload?.count === 'number' ? payload.count : 0
      const unsavedProject = payload?.unsavedProject === true
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Generate proxies', 'Import without proxies'],
        defaultId: 0,
        cancelId: 1,
        title: 'PreviewV',
        message:
          count > 1
            ? `${count} imported videos need lightweight proxies (ProRes or MJPEG in MOV) or they may play as black frames.`
            : 'This video needs a lightweight proxy (ProRes or MJPEG in MOV) or it may play as a black frame.',
        detail: unsavedProject
          ? 'Generate lightweight proxies now? The project is not saved yet, so proxies will be stored on the Desktop in Prores_proxy_temp.'
          : 'Generate lightweight proxies now? They are saved next to the project in a dedicated .video-proxy-cache folder.',
      })
      return response === 0
    },
  )

  ipcMain.handle(
    'generate-video-proxies',
    async (
      event,
      payload: { paths?: unknown; projectPath?: unknown },
    ): Promise<Array<{ path: string; resolved: Awaited<ReturnType<typeof resolveVideoSourceFromPath>> }>> => {
      const incoming =
        Array.isArray(payload?.paths)
          ? payload.paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          : []
      const uniquePaths = Array.from(new Set(incoming.map((p) => normalize(p.trim()))))
      const total = uniquePaths.length
      const projectPath =
        typeof payload?.projectPath === 'string' && payload.projectPath.trim().length > 0
          ? normalize(payload.projectPath.trim())
          : null
      const sendProgress = (stage: 'start' | 'progress' | 'done', completed: number, line: string) => {
        event.sender.send('video-proxy-progress', { stage, completed, total, line })
      }

      sendProgress('start', 0, total > 0 ? 'Preparing proxy generation...' : 'No video paths provided.')
      const out: Array<{ path: string; resolved: Awaited<ReturnType<typeof resolveVideoSourceFromPath>> }> = []
      let completed = 0
      for (const path of uniquePaths) {
        const file = basename(path)
        sendProgress('progress', completed, `Processing ${file}...`)
        const resolved = await resolveVideoSourceFromPath(path, {
          projectPath,
          generateProxy: true,
        })
        out.push({ path, resolved })
        completed += 1
        sendProgress('progress', completed, `Processed ${file}`)
      }
      sendProgress('done', completed, total > 0 ? 'Proxy generation finished.' : 'Nothing to process.')
      return out
    },
  )

  ipcMain.handle('scan-dailies', async (_e, payload: any) => {
    return await scanDailiesFolder(payload)
  })

  ipcMain.handle('dailies:get-years', async () => getDailiesYears())
  ipcMain.handle('dailies:get-projects', async (_e, { year }) => getDailiesProjects(year))
  ipcMain.handle('dailies:get-scenes', async (_e, { year, project }) => getDailiesScenes(year, project))

  ipcMain.handle('scan-prm', async (_e, payload: any) => {
    return await scanPrmFolder(payload)
  })

  ipcMain.handle('prm:get-years', async () => getPrmYears())
  ipcMain.handle('prm:get-projects', async (_e, { year }) => getPrmProjects(year))
  ipcMain.handle('prm:get-scenes', async (_e, { year, project }) => getPrmScenes(year, project))

  ipcMain.handle(
    'duplicate-media-import-dialog',
    async (event, payload: { count?: number }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return 'cancel'
      const n = typeof payload?.count === 'number' ? payload.count : 0
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Добавить ещё раз', 'Пропустить дубликаты', 'Отмена'],
        defaultId: 1,
        cancelId: 2,
        title: 'PreviewV',
        message:
          n > 0
            ? `Часть файлов из папки (${n}) уже есть на холсте.`
            : 'Часть файлов из папки уже есть на холсте.',
        detail:
          'Добавить копии ещё раз, не добавлять уже существующие файлы или отменить импорт?',
      })
      return (['add', 'skip', 'cancel'] as const)[response] ?? 'cancel'
    },
  )

  // ── Project IPC ──────────────────────────────────────────────────────────
  ipcMain.handle('get-recent-projects', async () => {
    return readRecentProjects(app.getPath('userData'))
  })

  ipcMain.handle('show-unsaved-dialog', async (event, payload: { fileLabel?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return 'cancel'
    const label = typeof payload?.fileLabel === 'string' ? payload.fileLabel : 'Untitled'
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Save', 'Don’t save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'PreviewV',
      message: 'Save changes to the project?',
      detail: label,
    })
    return (['save', 'discard', 'cancel'] as const)[response]
  })

  ipcMain.handle('window:confirm-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      allowWindowClose.set(win, true)
      win.close()
    }
  })

  ipcMain.handle('open-project-dialog', async () => {
    if (!activeWindow) return null
    const result = await dialog.showOpenDialog(activeWindow, {
      title: 'Open project',
      properties: ['openFile'],
      filters: [{ name: 'PreviewV project', extensions: ['previewv'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const projectPath = result.filePaths[0]
    const { project, rawItemsCount } = await readProjectFromDisk(projectPath, {
      resolveVideoSources: false,
    })
    if (rawItemsCount !== null && rawItemsCount > 0 && project.items.length === 0) {
      throw new Error('Project file is valid JSON but contains no items after validation')
    }
    const nextRecents = await touchRecentProject(app.getPath('userData'), projectPath)
    await writeRecentProjects(app.getPath('userData'), nextRecents)
    refreshApplicationMenu().catch(() => {})
    return { path: projectPath, project }
  })

  ipcMain.handle('open-project-by-path', async (_e, payload: { path: string }) => {
    const projectPath = payload.path
    await fs.access(projectPath)
    const { project, rawItemsCount } = await readProjectFromDisk(projectPath, {
      resolveVideoSources: false,
    })
    if (rawItemsCount !== null && rawItemsCount > 0 && project.items.length === 0) {
      throw new Error('Project file is valid JSON but contains no items after validation')
    }
    const nextRecents = await touchRecentProject(app.getPath('userData'), projectPath)
    await writeRecentProjects(app.getPath('userData'), nextRecents)
    refreshApplicationMenu().catch(() => {})
    return { path: projectPath, project }
  })

  function linkedImageNeedsPreviewAsset(item: ImageItem): boolean {
    if (!item.sourceFilePath) return false
    if (item.projectAssetPath) return true
    if (isDataUrl(item.srcUrl)) return true
    const srcPath = mediaUrlToLocalPath(item.srcUrl)
    if (!srcPath) return false
    return normalizePathKey(srcPath) !== normalizePathKey(item.sourceFilePath)
  }

  async function materializeImageBuffer(item: ImageItem): Promise<Buffer> {
    if (isDataUrl(item.srcUrl)) {
      return dataUrlToBuffer(item.srcUrl)
    }

    const localSrcPath = mediaUrlToLocalPath(item.srcUrl)
    const filePath = item.projectAssetPath ?? localSrcPath
    if (!filePath) {
      throw new Error(`Can't persist image "${item.fileName ?? item.id}": unsupported source URL`)
    }
    return fs.readFile(filePath)
  }

  async function writeProjectAssets(
    finalProjectPath: string,
    items: CanvasItem[],
  ): Promise<{
    assetPathByImageId: Map<string, string>
    previewAssetPathByImageId: Map<string, string>
  }> {
    const assetPathByImageId = new Map<string, string>()
    const previewAssetPathByImageId = new Map<string, string>()
    const assetWrites: Array<{ relativePath: string; buffer: Buffer }> = []

    for (const item of items) {
      if (item.type !== 'image') continue

      if (item.storage === 'linked' && item.sourceFilePath) {
        if (!linkedImageNeedsPreviewAsset(item)) continue
        const relativePath = buildProjectAssetRelativePath(item, 'preview')
        previewAssetPathByImageId.set(item.id, relativePath)
        assetWrites.push({
          relativePath,
          buffer: await materializeImageBuffer(item),
        })
        continue
      }

      const relativePath = buildProjectAssetRelativePath(item, 'asset')
      assetPathByImageId.set(item.id, relativePath)
      assetWrites.push({
        relativePath,
        buffer: await materializeImageBuffer(item),
      })
    }

    const assetsRoot = projectAssetDir(finalProjectPath)
    await fs.rm(assetsRoot, { recursive: true, force: true })

    for (const asset of assetWrites) {
      const outPath = resolveProjectAssetPath(finalProjectPath, asset.relativePath)
      await fs.mkdir(dirname(outPath), { recursive: true })
      await fs.writeFile(outPath, asset.buffer)
    }

    return { assetPathByImageId, previewAssetPathByImageId }
  }

  async function saveToPath(
    projectPath: string,
    projectData: any,
    sourceProjectPath?: string | null,
  ): Promise<{ path: string; project: DeserializedProject }> {
    const now = new Date().toISOString()
    if (!projectData || !Array.isArray(projectData.items)) {
      throw new Error('Cannot save: projectData.items is not an array')
    }

    const items = projectData.items as CanvasItem[]

    const finalPath =
      extname(projectPath).toLowerCase() === PROJECT_EXT
        ? projectPath
        : `${projectPath}${PROJECT_EXT}`

    const { assetPathByImageId, previewAssetPathByImageId } = await writeProjectAssets(
      finalPath,
      items,
    )

    const project = serializeProject({
      items,
      viewport: projectData.viewport,
      meta: {
        createdAt: projectData.meta.createdAt,
        updatedAt: projectData.meta.updatedAt ?? now,
      },
      assetPathForImage: (item) => {
        const relativePath = assetPathByImageId.get(item.id)
        if (!relativePath) {
          throw new Error(`Missing project asset path for image "${item.fileName ?? item.id}"`)
        }
        return relativePath
      },
      previewAssetPathForImage: (item) => previewAssetPathByImageId.get(item.id),
    })
    if (project.items.length !== items.length) {
      throw new Error('Cannot save: serialized items count mismatch')
    }

    await cloneProjectVideoSnapshotIfNeeded(sourceProjectPath, finalPath)
    await writeProjectToDisk(finalPath, project)
    // Snapshot generation is an optimization only; do not block Save/Exit UX.
    void persistProjectVideoSnapshot(finalPath, items).catch(async (error) => {
      await appendVideoDebugLog(
        `persist project snapshot failed for "${finalPath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
    const { project: reopened } = await readProjectFromDisk(finalPath, {
      resolveVideoSources: false,
    })
    if (reopened.items.length !== project.items.length) {
      throw new Error('Project save verification failed (items mismatch after reload)')
    }
    const nextRecents = await touchRecentProject(app.getPath('userData'), finalPath)
    await writeRecentProjects(app.getPath('userData'), nextRecents)
    await refreshApplicationMenu()
    return { path: finalPath, project: reopened }
  }

  ipcMain.handle('save-project', async (_e, payload: { projectData: any; path: string | null }) => {
    const projectPath = payload.path
    if (!activeWindow) return null
    if (projectPath) {
      return saveToPath(projectPath, payload.projectData)
    }
    const result = await dialog.showSaveDialog(activeWindow, {
      title: 'Save project as',
      // Папка по умолчанию без имени файла (иначе Windows мог показывать «PreviewV.previewv»).
      defaultPath: app.getPath('documents'),
      filters: [{ name: 'PreviewV project', extensions: ['previewv'] }],
    })
    if (result.canceled || !result.filePath) return null
    return saveToPath(result.filePath, payload.projectData)
  })

  ipcMain.handle('save-project-as', async (_e, payload: { projectData: any; currentPath?: string | null }) => {
    if (!activeWindow) return null
    const fallbackDir = app.getPath('documents')
    const startDir = payload.currentPath ? dirname(normalize(payload.currentPath)) : fallbackDir
    const result = await dialog.showSaveDialog(activeWindow, {
      title: 'Save project as',
      // Open directly in current project's folder when available.
      defaultPath: startDir,
      filters: [{ name: 'PreviewV project', extensions: ['previewv'] }],
    })
    if (result.canceled || !result.filePath) return null
    return saveToPath(result.filePath, payload.projectData, payload.currentPath)
  })

  createWindow()

  // second-instance open flow
  app.on('second-instance', (_event, commandLine) => {
    const args = commandLine.map((a) => String(a))
    const projectPath = findPreviewVPathFromArgv(args)
    if (projectPath) {
      sendOpenProjectToRenderer(projectPath)
    }
    if (activeWindow) revealWindow(activeWindow)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
