'use strict'

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

// ── Port / path constants ────────────────────────────────────────────────────

const PORT_BACKEND = 8765
const FRONTEND_PORT = 5173
const STARTUP_TIMEOUT_MS = 8_000
const IS_DEV = process.env.NODE_ENV === 'development' || !app.isPackaged

function appRoot() {
  return app.isPackaged
    ? path.dirname(app.getAppPath())
    : path.join(__dirname, '..')
}

// ── Service definitions ──────────────────────────────────────────────────────

function resolvePython(svcDir) {
  const fs = require("fs");
  const isWin = process.platform === "win32";
  const venvPy = path.join(svcDir, "venv", isWin ? "Scripts/python.exe" : "bin/python");
  if (fs.existsSync(venvPy)) return venvPy;
  
  const userPy = path.join(require("os").homedir(), ".ai-video-studio", "venv", isWin ? "Scripts/python.exe" : "bin/python");
  if (fs.existsSync(userPy)) return userPy;

  const candidates = isWin
    ? ["python.exe", "python"]
    : [
        "/opt/homebrew/bin/python3.12",
        "/opt/homebrew/bin/python3.11",
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "python3",
        "python"
      ];

  for (const c of candidates) {
    if (c.startsWith("/") && fs.existsSync(c)) return c;
  }
  
  return process.env.PYTHON_PATH || (isWin ? "python" : "python3");
}

function serviceConfigs() {
  const root = appRoot()
  return [
    {
      name: 'backend',
      label: 'Studio Backend',
      port: PORT_BACKEND,
      cwd: path.join(root, 'backend'),
      cmd: resolvePython(path.join(root, 'backend')),
      args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(PORT_BACKEND)],
      healthUrl: `http://127.0.0.1:${PORT_BACKEND}/api/health`,
    },
  ]
}

// ── Process registry ─────────────────────────────────────────────────────────

const processes = {} // name → ChildProcess

function startService(svc) {
  return new Promise((resolve, reject) => {
    if (processes[svc.name]) {
      processes[svc.name].kill('SIGTERM')
      processes[svc.name] = null
    }

    const proc = spawn(svc.cmd, svc.args, {
      cwd: svc.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    processes[svc.name] = proc

    proc.stdout.on('data', (d) => console.log(`[${svc.name}]`, d.toString().trim()))
    proc.stderr.on('data', (d) => console.error(`[${svc.name}]`, d.toString().trim()))
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`${svc.label}: python binary not found at ${svc.cmd}. Run start.sh first.`))
      } else {
        reject(err)
      }
    })
    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`[${svc.name}] Exited with code ${code}`)
        clearInterval(poll)
        reject(new Error(`${svc.label} exited with code ${code}`))
      }
    })

    // Poll health
    const started = Date.now()
    const poll = setInterval(() => {
      if (Date.now() - started > STARTUP_TIMEOUT_MS) {
        clearInterval(poll)
        reject(new Error(`${svc.label} did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s`))
        return
      }
      http.get(svc.healthUrl, (res) => {
        if (res.statusCode < 500) {
          clearInterval(poll)
          resolve()
        }
      }).on('error', () => { /* still starting */ })
    }, 1500)
  })
}

function stopAll() {
  for (const name of Object.keys(processes)) {
    const proc = processes[name]
    if (!proc) continue
    try { proc.kill('SIGTERM') } catch {}
    setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 3000)
    processes[name] = null
  }
}

// ── Loading screen ───────────────────────────────────────────────────────────

let loadingWindow = null

function showLoadingScreen(configs) {
  loadingWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    backgroundColor: '#111116',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  loadingWindow.loadFile(path.join(__dirname, 'loading.html'))
}

function updateLoadingRow(name, ok) {
  if (!loadingWindow || loadingWindow.isDestroyed()) return
  const icon = ok ? '✅' : '⚠️'
  loadingWindow.webContents.executeJavaScript(
    `var r = document.getElementById('row-${name}'); if(r) { var ic = r.querySelector('.icon'); if(ic) ic.innerHTML = '${icon}'; }`
  ).catch(() => {})
}

// ── Main window ──────────────────────────────────────────────────────────────

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  const distIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html')
  const packagedIndex = path.join(app.getAppPath(), 'frontend', 'dist', 'index.html')
  const localIndex = require('fs').existsSync(packagedIndex) ? packagedIndex : distIndex

  if (IS_DEV) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`).catch(() => {
      mainWindow.loadFile(localIndex)
    })
    mainWindow.webContents.openDevTools()
  } else {
    // In production, try backend first; if it's not ready, fallback to local bundle
    mainWindow.loadURL(`http://localhost:${PORT_BACKEND}`).catch(() => {
      console.log('[electron] Backend not available, loading local index.html')
      mainWindow.loadFile(localIndex)
    })
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[electron] Failed to load ${validatedURL} (${errorCode}: ${errorDescription})`)
    if (validatedURL && validatedURL.startsWith('http://localhost')) {
      mainWindow.loadFile(localIndex).catch((e) => console.error('[electron] loadFile failed:', e))
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  buildMenu()
}

// ── Menu ─────────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-project') },
        { label: 'Export Video', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('menu:export') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About DRISHQAN',
          click: () => dialog.showMessageBox(mainWindow, {
            title: 'DRISHQAN',
            message: 'DRISHQAN v0.1.0',
            detail: 'DRISHQAN — Visual Creation (Drishya + Creation).\nNo cloud calls, no API keys required.\n\nVideo Engine: 47872 | Voice Engine: 7700 | Backend: 8765',
            type: 'info',
          }),
        },
        {
          label: 'Open Data Directory',
          click: () => {
            const fs = require('fs')
            const os = require('os')
            const d1 = path.join(os.homedir(), '.drishqan')
            const d2 = path.join(os.homedir(), '.hindi-video-studio')
            const target = fs.existsSync(d1) ? d1 : (fs.existsSync(d2) ? d2 : d1)
            if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true })
            shell.openPath(target)
          },
        },
      ],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
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

ipcMain.handle('restart-service', async (_, name) => {
  const configs = serviceConfigs()
  const svc = configs.find((c) => c.name === name)
  if (!svc) return { ok: false, error: `Unknown service: ${name}` }
  try {
    await startService(svc)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── App events ───────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const configs = serviceConfigs()
  showLoadingScreen(configs)

  // Start all services with fast-fail
  await Promise.allSettled(
    configs.map(async (svc) => {
      try {
        await startService(svc)
        updateLoadingRow(svc.name, true)
      } catch (err) {
        console.warn(`[electron] ${svc.label} failed:`, err.message)
        updateLoadingRow(svc.name, false)
      }
    })
  )

  // Brief pause so user sees checkmarks/status
  await new Promise((r) => setTimeout(r, 600))

  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.close()
    loadingWindow = null
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
  stopAll()
})

app.on('will-quit', () => {
  stopAll()
})
