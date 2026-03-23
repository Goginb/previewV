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

const PROJECT_EXT = '.previewv'

const PROJECT_OPEN_CHANNEL = 'app-open-project-by-path'

function findPreviewVPathFromArgv(argv: string[]): string | null {
  const found = argv.find((a) => typeof a === 'string' && a.toLowerCase().endsWith(PROJECT_EXT))
  if (!found) return null
  try {
    return decodeURIComponent(found)
  } catch {
    return found
  }
}

function mimeFromMediaExt(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.ogv': 'video/ogg',
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

if (!app.requestSingleInstanceLock) {
  // In case electron-behaves oddly, keep app running. (Electron always has this API.)
} else {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  }
}

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
const PREVIEW_IMAGE_EXT = new Set(['.tif', '.tiff', '.dpx', '.exr'])
const DIRECT_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])
const rasterPreviewCache = new Map<
  string,
  { mtimeMs: number; size: number; previewPath: string; width: number; height: number }
>()

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

function previewCacheFilePath(filePath: string): string {
  const hash = createHash('sha1').update(normalizePathKey(filePath)).digest('hex').slice(0, 16)
  return join(PREVIEW_CACHE_DIR, `${hash}.png`)
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

async function renderViaFfmpegPreview(filePath: string, outputPath: string): Promise<{ width: number; height: number }> {
  const ff = ffmpegStatic
  if (!ff) {
    throw new Error('ffmpeg-static not found (run npm install ffmpeg-static)')
  }

  await new Promise<void>((resolve, reject) => {
    const p = spawn(ff, ['-y', '-i', filePath, '-frames:v', '1', outputPath], {
      windowsHide: true,
    })
    let err = ''
    p.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `ffmpeg exited with code ${code}`))
    })
  })

  return loadNativeImageSize(outputPath)
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

async function readProjectFromDisk(projectPath: string): Promise<{ project: DeserializedProject; rawItemsCount: number | null }> {
  const raw = await fs.readFile(projectPath, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  const rawItemsCount = isRecord(parsed) && Array.isArray((parsed as any).items) ? (parsed as any).items.length : null
  const project = deserializeProject(parsed, {
    resolveAssetPath: (relativePath) => resolveProjectAssetPath(projectPath, relativePath),
  })
  return { project, rawItemsCount }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

async function writeProjectToDisk(projectPath: string, project: ProjectFile) {
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8')
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
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Save', 'Don’t save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'PreviewV',
      message: 'Save changes to the project?',
      detail: fileLabel,
    })
    if (response === 2) return
    if (response === 1) {
      allowWindowClose.set(win, true)
      win.close()
      return
    }
    win.webContents.send('project:menu-action', { action: 'save-and-close' })
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
          enabled: false,
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
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Always on top',
          type: 'checkbox',
          checked: alwaysOnTopEnabled,
          click: (menuItem) => {
            if (!activeWindow) return
            applyAlwaysOnTop(activeWindow, menuItem.checked)
          },
        },
        { type: 'separator' },
        {
          label: 'Pin window (Alt+Shift+A)',
          click: () => {
            if (!activeWindow) return
            applyAlwaysOnTop(activeWindow, true)
          },
        },
        {
          label: 'Unpin window (Alt+Shift+B)',
          click: () => {
            if (!activeWindow) return
            applyAlwaysOnTop(activeWindow, false)
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

  // Alt+Shift+A / Alt+Shift+B: handled in main so they work over the canvas/video and aren’t eaten by Chromium shortcuts.
  // Uses physical KeyA/KeyB (stable on common layouts). Ignores auto-repeat.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.isAutoRepeat) return
    if (!input.alt || !input.shift) return
    if (input.control || input.meta) return

    if (input.code === 'KeyA') {
      event.preventDefault()
      applyAlwaysOnTop(mainWindow, true)
      return
    }
    if (input.code === 'KeyB') {
      event.preventDefault()
      applyAlwaysOnTop(mainWindow, false)
    }
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

  ipcMain.handle('window:get-always-on-top', () => alwaysOnTopEnabled)

  ipcMain.handle('window:set-always-on-top', (_e, enabled: unknown) => {
    if (!activeWindow) return
    applyAlwaysOnTop(activeWindow, Boolean(enabled))
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
    const { project, rawItemsCount } = await readProjectFromDisk(projectPath)
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
    const { project, rawItemsCount } = await readProjectFromDisk(projectPath)
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
    if (project.items.length === 0) {
      throw new Error('Cannot save: project contains no items')
    }

    await writeProjectToDisk(finalPath, project)
    const raw = await fs.readFile(finalPath, 'utf8')
    const parsed = JSON.parse(raw)
    const reopened = deserializeProject(parsed, {
      resolveAssetPath: (relativePath) => resolveProjectAssetPath(finalPath, relativePath),
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

  ipcMain.handle('save-project-as', async (_e, payload: { projectData: any }) => {
    if (!activeWindow) return null
    const result = await dialog.showSaveDialog(activeWindow, {
      title: 'Save project as',
      defaultPath: app.getPath('documents'),
      filters: [{ name: 'PreviewV project', extensions: ['previewv'] }],
    })
    if (result.canceled || !result.filePath) return null
    return saveToPath(result.filePath, payload.projectData)
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
