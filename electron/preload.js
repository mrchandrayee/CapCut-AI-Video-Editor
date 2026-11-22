'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Show a file in Finder (macOS) / File Explorer (Windows)
   */
  showItemInFinder: (filePath) => ipcRenderer.invoke('show-item-in-finder', filePath),

  /**
   * Open a native file picker dialog
   * @param {object} opts - { filters: [{name, extensions}] }
   */
  openFile: (opts) => ipcRenderer.invoke('open-file-dialog', opts),

  /**
   * Trigger new project creation (sent by menu)
   */
  onNewProject: (callback) => ipcRenderer.on('menu:new-project', callback),

  /**
   * Trigger export (sent by menu)
   */
  onExport: (callback) => ipcRenderer.on('menu:export', callback),
})

contextBridge.exposeInMainWorld('electron', {
  /**
   * Restart an individual service by name.
   * @param {'videostudio'|'vexyl-tts'|'backend'} serviceName
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  restartService: (serviceName) => ipcRenderer.invoke('restart-service', serviceName),
})
