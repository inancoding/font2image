import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getOutputDir: () => ipcRenderer.invoke('get-output-dir'),
  setOutputDir: (dir) => ipcRenderer.invoke('set-output-dir', dir),
  saveImage: (filename, data) => ipcRenderer.invoke('save-image', filename, data),
  openPath: (dirPath) => ipcRenderer.invoke('open-path', dirPath),
})
