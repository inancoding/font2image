interface ElectronAPI {
  platform: string
  isElectron: boolean
  versions: { node: string; chrome: string; electron: string }
  selectDirectory: () => Promise<string | null>
  getOutputDir: () => Promise<string | null>
  setOutputDir: (dir: string) => Promise<void>
  saveImage: (filename: string, data: Uint8Array) => Promise<string>
  openPath: (dirPath: string) => Promise<void>
}

interface Window {
  electronAPI?: ElectronAPI
}
