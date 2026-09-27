import type { OutputFormat } from './types'

// 保留字体文件原名（含大小写），仅去除扩展名
export function fontBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  return base || 'font'
}

// FR-6.3：<基名>-<高度>.<扩展名>
export function outputFileNameFromBase(base: string, size: number, format: OutputFormat): string {
  return `${base}-${size}.${format}`
}

export function outputFileName(fontFileName: string, size: number, format: OutputFormat): string {
  return outputFileNameFromBase(fontBaseName(fontFileName), size, format)
}

// 预览图文件名：<基名>-preview.<扩展名>
export function previewFileNameFromBase(base: string, format: OutputFormat): string {
  return `${base}-preview.${format}`
}

export function previewFileName(fontFileName: string, format: OutputFormat): string {
  return previewFileNameFromBase(fontBaseName(fontFileName), format)
}

// 批量模式下同名字体文件的防覆盖序号
export function dedupe(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
