import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { connectionManager } from './db/connectionManager'

// Electron's default application menu binds CmdOrCtrl+R to "Reload" (reload the whole
// renderer, wiping app state) and CmdOrCtrl+Shift+R to "Force Reload". Removing it frees
// Ctrl+R so the renderer's own keydown handler (table/query data reload) owns that shortcut.
Menu.setApplicationMenu(null)

// build/icon.png only exists on disk in dev (it's a build-time resource for electron-builder,
// not shipped inside the app by default) — extraResources in package.json copies it to
// resources/icon.png in the packaged app, reachable via process.resourcesPath at runtime.
// Without this the window/taskbar icon silently falls back to Electron's default once installed.
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1f24',
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Keep DevTools reachable via F12 now that the default menu (and its accelerator) is gone.
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (e) => {
  e.preventDefault()
  await connectionManager.disconnectAll()
  app.exit(0)
})
