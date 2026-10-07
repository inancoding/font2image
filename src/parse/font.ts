import * as opentype from 'opentype.js'
import { CHARSET_PROBE_VERSION } from '../core/charset-probes'
import { computeCharsetCoverage } from '../core/charset'
import type { CharsetInfo, FontMeta } from '../core/types'
import { isTtc, ttcAllFacesToSfnt, ttcFirstFaceToSfnt } from './ttc'
export { isTtc } from './ttc'

// Node 解析到 UMD 构建（仅 default 导出），Vite 解析到 ESM 构建（仅具名导出），两者兼容
const ot = ((opentype as { default?: unknown }).default ?? opentype) as typeof opentype

export type OTFont = opentype.Font

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export function signatureOf(bytes: Uint8Array): string {
  if (bytes.length < 4) return ''
  return String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)
}

// 把浏览器无法直接加载的容器拆成单个 SFNT 字体（当前仅 TTC）。
// UI 渲染（FontFace）与 CLI 渲染都需要独立字体，故两侧共用。
export function normalizeFontBytes(bytes: Uint8Array): Uint8Array {
  if (isTtc(bytes)) return ttcFirstFaceToSfnt(bytes)
  return bytes
}

// 提取 TTC 中所有面（用于多字重检测）
export function normalizeFontBytesAll(bytes: Uint8Array): { index: number; data: Uint8Array }[] {
  if (isTtc(bytes)) return ttcAllFacesToSfnt(bytes)
  return [{ index: 0, data: bytes }]
}

// 注意：woff2 解包依赖 node:zlib，仅在 CLI 侧处理（见 cli/decode.ts），本模块保持浏览器可用
export function parseFont(rawBytes: Uint8Array): OTFont {
  const bytes = normalizeFontBytes(rawBytes)
  const sig = signatureOf(bytes)
  if (sig === 'wOF2') {
    throw new Error('该文件实际为 woff2 格式，本地 UI 无法解包。请先用 CLI 转换：pnpm gen <文件>.woff2')
  }
  const known = sig === 'OTTO' || sig === 'wOFF' || sig === 'true' || sig === 'typ1' || sig === '\x00\x01\x00\x00'
  if (!known) {
    const pretty = sig.replace(/[^\x20-\x7e]/g, '?') || '（空文件）'
    throw new Error(`无法识别的字体格式（签名 ${pretty}），支持 ttf / otf / woff / ttc`)
  }
  return ot.parse(toArrayBuffer(bytes))
}

// 解析已归一化的单面字节（跳过 TTC 拆包）
export function parseFontFromNormalized(bytes: Uint8Array): OTFont {
  const sig = signatureOf(bytes)
  return ot.parse(toArrayBuffer(bytes))
}

function pickName(entry: unknown): { en?: string; zh?: string } {
  if (!entry) return {}
  if (typeof entry === 'string') return { en: entry }
  if (typeof entry !== 'object') return {}
  const record = entry as Record<string, string>
  const zhKey = Object.keys(record).find((k) => k.startsWith('zh'))
  return {
    en: record.en ?? record['en-US'],
    zh: zhKey ? record[zhKey] : undefined,
  }
}

// opentype.js 的 name 表有两种结构：扁平（names.fontFamily）和按平台嵌套（names.windows.fontFamily）。
// 此函数兼容两种格式，优先取 windows 平台。
function resolveNameEntry(names: Record<string, unknown>, key: string): unknown {
  if (names[key]) return names[key]
  const windows = names.windows as Record<string, unknown> | undefined
  if (windows?.[key]) return windows[key]
  const mac = names.macintosh as Record<string, unknown> | undefined
  if (mac?.[key]) return mac[key]
  return undefined
}

export function extractMeta(font: OTFont, fileName: string): FontMeta {
  const names = font.names as Record<string, unknown>
  // preferredFamily (nameID 16) 是 OpenType 规范的权威字体族分组依据，
  // fontFamily (nameID 1) 通常包含字重后缀（如 "X W01"），不适合用于分组
  const prefFamily = resolveNameEntry(names, 'preferredFamily')
  const family = pickName(prefFamily ?? resolveNameEntry(names, 'fontFamily'))
  if (!family.en && !family.zh) {
    family.en = fileName.replace(/\.[^.]+$/, '')
  }
  const styleEntry = pickName(resolveNameEntry(names, 'fontSubfamily'))
  const versionEntry = pickName(resolveNameEntry(names, 'version'))
  const licenseEntry = pickName(resolveNameEntry(names, 'license') ?? resolveNameEntry(names, 'licenseDescription'))
  return {
    family,
    style: styleEntry.en ?? styleEntry.zh ?? 'Regular',
    version: versionEntry.en ?? versionEntry.zh,
    license: licenseEntry.en ?? licenseEntry.zh,
  }
}

export function makeHasGlyph(font: OTFont): (ch: string) => boolean {
  return (ch: string) => font.charToGlyphIndex(ch) > 0
}

export function extractGlyphCount(font: OTFont): number {
  return font.tables?.maxp?.numGlyphs ?? 0
}

export function extractCharsetInfo(font: OTFont, hasGlyph: (ch: string) => boolean): CharsetInfo {
  return {
    ...computeCharsetCoverage(hasGlyph),
    glyphCount: extractGlyphCount(font),
    probeVersion: CHARSET_PROBE_VERSION,
  }
}

// OS/2 usWeightClass 映射到字重名称
const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
  950: 'ExtraBlack',
}

export interface WeightInfo {
  weightClass: number
  rawOs2Class: number
  name: string
}

// 从 OS/2 表 + name 表提取字重：优先使用 OS/2 表的 usWeightClass（字体作者的权威设定）
// 不归一化，保留原始值以避免不同字重碰撞（如 os2=350 的 Normal 和 os2=300 的 Light）
// 从字符串中提取字重关键词（用于 subfamily 为空时从 fontFamily 或文件名回退）
const WEIGHT_KEYWORDS = [
  'ExtraBlack', 'ExtraBold', 'SemiBold', 'ExtraLight',
  'Black', 'Heavy', 'Bold', 'Medium', 'Normal', 'Light',
  'Thin', 'Regular',
]
function extractWeightKeyword(s: string): string | undefined {
  const normalized = s.replace(/[-_]+/g, ' ')
  for (const kw of WEIGHT_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalized)) return kw
  }
  return undefined
}

// 从字符串末尾提取数字字重设计符（如 "W01"、"W02"、"01"、"02"）
function extractNumericDesignator(s: string): string | undefined {
  const m = s.replace(/\.[^.]+$/, '').match(/[Ww]?(\d{2,})\s*$/)
  return m ? `W${m[1]}` : undefined
}

export function extractWeight(font: OTFont, fileName?: string): WeightInfo {
  const os2 = (font.tables as Record<string, unknown>).os2 as Record<string, unknown> | undefined
  const os2Class = (os2?.usWeightClass as number) ?? 400

  const names = font.names as Record<string, unknown>

  const prefSub = pickName(resolveNameEntry(names, 'preferredSubfamily'))
  const prefSubStr = prefSub.en ?? prefSub.zh ?? ''

  const subfamily = pickName(resolveNameEntry(names, 'fontSubfamily'))
  const styleStr = subfamily.en ?? subfamily.zh ?? ''

  let displayName = ''
  if (prefSubStr && !/^regular$/i.test(prefSubStr)) {
    displayName = prefSubStr
      .replace(/\b(italic|oblique)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  if (!displayName) {
    displayName = styleStr
      .replace(/\b(italic|oblique)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  if (!displayName) {
    const family = pickName(resolveNameEntry(names, 'preferredFamily') ?? resolveNameEntry(names, 'fontFamily'))
    const familyStr = family.en ?? family.zh ?? ''
    displayName = extractWeightKeyword(familyStr)
      ?? extractWeightKeyword(fileName ?? '')
      ?? extractNumericDesignator(familyStr)
      ?? extractNumericDesignator(fileName ?? '')
      ?? WEIGHT_NAMES[os2Class]
      ?? `Weight${os2Class}`
  }

  // 当 os2 权重为默认 400 但存在数字字重设计符时，推导合成权重值
  let weightClass = os2Class
  if (os2Class === 400) {
    const designator = prefSubStr || displayName
    const wMatch = designator.match(/[Ww]?(\d{2,})/)
    if (wMatch) {
      weightClass = parseInt(wMatch[1], 10) * 100
    }
  }

  return { weightClass, rawOs2Class: os2Class, name: displayName }
}
