import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join } from 'path'

const isDev = process.env.NODE_ENV === 'development'

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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Handle media:///<path> requests by forwarding them to the real file system.
  // URL example: media:///C:/Users/user/video.mp4
  protocol.handle('media', (request) => {
    // request.url = "media:///C:/Users/user/video.mp4"
    // Strip scheme to get "/C:/Users/user/video.mp4", then build file:// URL
    const filePath = request.url.slice('media://'.length)
    return net.fetch(`file://${filePath}`)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
