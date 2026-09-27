import type { AppConfig } from './types'

export const DEFAULT_CONFIG: AppConfig = {
  sizes: [192],
  format: 'webp',
  quality: 90,
  threshold: 0.6,
  background: '#ffffff',
  color: '#000000',
  maxFileSizeMB: 30,
  maxImageWidth: 1000,
  coverWidth: 600,
  recursive: true,
  showMissing: false,
  poem: '',
}

export function mergeConfig(base: AppConfig, overrides: Partial<AppConfig>): AppConfig {
  return { ...base, ...overrides }
}
