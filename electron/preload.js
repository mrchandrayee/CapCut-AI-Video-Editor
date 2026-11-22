'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Show a file in Finder (macOS) / File Explorer (Windows)
   * @param {string} filePath - absolute path to the file
   */
  showItemInFinder: (filePath) => ipcRenderer.invoke('show-item-in-finder', filePath),

  /**
   * Open a native file picker dialog
   * @param {object} opts - { filters: [{name, extensions}] }
   * @returns {Promise<{canceled: boolean, filePaths: string[]}>}
   */
  openFile: (opts) => ipcRenderer.invoke('open-file-dialog', opts),

  /**
   * Trigger new project creation (sent by menu)
   * @param {function} callback
   */
  onNewProject: (callback) => ipcRenderer.on('menu:new-project', callback),

  /**
   * Trigger export (sent by menu)
   * @param {function} callback
   */
  onExport: (callback) => ipcRenderer.on('menu:export', callback),
})
