'use strict'

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

const BACKEND_PORT = 8765
const FRONTEND_PORT = 5173
const BACKEND_DIR = path.join(__dirname, '..', 'backend')
const HEALTH_URL = `http://localhost:${BACKEND_PORT}/api/health`
const STARTUP_TIMEOUT_MS = 30_000
const IS_DEV = process.env.NODE_ENV === 'development' || !app.isPackaged

let backendProcess = null
let mainWindow = null

// ── Backend lifecycle ────────────────────────────────────────────────────────

function startBackend() {
  return new Promise((resolve, reject) => {
    const python = process.platform === 'win32' ? 'python' : 'python3'
    backendProcess = spawn(python, ['main.py'], {
      cwd: BACKEND_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    backendProcess.stdout.on('data', (data) => {
      console.log('[backend]', data.toString().trim())
    })
    backendProcess.stderr.on('data', (data) => {
      console.error('[backend]', data.toString().trim())
    })
    backendProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Python not found. Install Python 3.11+ and try again.`))
      } else {
        reject(err)
      }
    })
    backendProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`[backend] Exited with code ${code}`)
      }
    })

    // Poll health endpoint
    const start = Date.now()
    const poll = setInterval(() => {
      if (Date.now() - start > STARTUP_TIMEOUT_MS) {
        clearInterval(poll)
        reject(new Error(`Backend did not start within ${STARTUP_TIMEOUT_MS / 1000}s`))
        return
      }
      http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          clearInterval(poll)
          resolve()
        }
      }).on('error', () => { /* still starting */ })
    }, 1000)
  })
}

function stopBackend() {
  if (!backendProcess) return
  backendProcess.kill('SIGTERM')
  setTimeout(() => {
    if (backendProcess) backendProcess.kill('SIGKILL')
  }, 3000)
  backendProcess = null
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const url = IS_DEV
    ? `http://localhost:${FRONTEND_PORT}`
    : `http://localhost:${BACKEND_PORT}`

  mainWindow.loadURL(url)

  if (IS_DEV) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  buildMenu()
}

// ── Menu ─────────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-project'),
        },
        {
          label: 'Export Video',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Hindi Video Studio',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: 'Hindi Video Studio',
              message: 'Hindi Video Studio v1.0.0',
              detail: 'Local Hindi/Hinglish AI Video Production Studio\n\nAll AI processing runs locally. No cloud calls, no API keys required.',
              type: 'info',
            })
          },
        },
        {
          label: 'Open Data Directory',
          click: () => {
            const dataDir = require('path').join(require('os').homedir(), '.hindi-video-studio')
            shell.openPath(dataDir)
          },
        },
      ],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('show-item-in-finder', async (_, filePath) => {
  shell.showItemInFolder(filePath)
  return { ok: true }
})

ipcMain.handle('open-file-dialog', async (_, opts = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }],
  })
  return result
})

// ── App events ───────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    console.log('[electron] Starting backend...')
    await startBackend()
    console.log('[electron] Backend ready')
  } catch (err) {
    const isPortInUse = err.message?.includes('EADDRINUSE') ||
      err.message?.includes('already running')
    if (isPortInUse || err.message?.includes('did not start')) {
      // Try connecting anyway — maybe it's already running
      console.warn('[electron] Backend startup issue:', err.message)
      const choice = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Continue', 'Quit'],
        title: 'Backend Status',
        message: `Port ${BACKEND_PORT} issue`,
        detail: `${err.message}\n\nIs the backend already running? Click Continue to connect anyway.`,
      })
      if (choice.response === 1) {
        app.quit()
        return
      }
    } else {
      await dialog.showErrorBox('Startup Failed', err.message)
      app.quit()
      return
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopBackend()
})

app.on('will-quit', () => {
  stopBackend()
})
