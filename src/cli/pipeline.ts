import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CHAR_GRID_GROUPS } from '../core/char-grid'
import { detectLanguage, computeCoverage } from '../core/detect'
import { filterMissing } from '../core/filter'
import { dedupe, fontBaseName, previewFileNameFromBase } from '../core/naming'
import { getPoem, splitPoemLines, type Poem } from '../core/poems'
import type { AppConfig, ManifestFont, ScriptId } from '../core/types'
import { extractCharsetInfo, extractMeta, extractWeight, isTtc, makeHasGlyph, normalizeFontBytesAll, parseFont, parseFontFromNormalized } from '../parse/font'
import type { RenderSession } from './browser'
import { decodeFontBytes } from './decode'
import { sha256Hex } from './incremental'

export interface PipelineContext {
  config: AppConfig
  cfgHash: string
  poems: Poem[]
  cliText?: string
  cliScripts?: ScriptId[]
  force: boolean
  outDir: string
  session: RenderSession
  usedIds: Set<string>
}

export interface FontOutcome {
  file: string
  status: 'ok' | 'skipped' | 'error'
  reason?: string
  warnings: string[]
  imageCount: number
  entry?: ManifestFont
}

export async function processFont(
  filePath: string,
  existing: ManifestFont | undefined,
  ctx: PipelineContext,
): Promise<FontOutcome> {
  const { config } = ctx
  const file = path.resolve(filePath)
  const base = path.basename(file)
  const warnings: string[] = []

  const sizeMB = statSync(file).size / (1024 * 1024)
  if (sizeMB > config.maxFileSizeMB) {
    return {
      file,
      status: 'error',
      reason: `文件过大（${sizeMB.toFixed(1)}MB > ${config.maxFileSizeMB}MB 上限）`,
      warnings,
      imageCount: 0,
    }
  }


  const bytes = new Uint8Array(readFileSync(file))
  const fileHash = sha256Hex(bytes)

  // 增量判定（FR-6.8）：字体哈希 + 配置哈希均未变化且产物齐全时跳过
  if (
    !ctx.force &&
    existing &&
    existing.fileHash === fileHash &&
    existing.configHash === ctx.cfgHash &&
    existing.images.length > 0 &&
    existing.images.every((img) => existsSync(path.join(ctx.outDir, img.path)))
  ) {
    return { file, status: 'skipped', reason: '增量跳过（字体与配置均未变化）', warnings, imageCount: 0 }
  }

  let decoded: Uint8Array
  try {
    decoded = decodeFontBytes(bytes)
  } catch (err) {
    return { file, status: 'error', reason: `字体解码失败：${(err as Error).message}`, warnings, imageCount: 0 }
  }

  let font
  try {
    font = parseFont(decoded)
  } catch (err) {
    return { file, status: 'error', reason: `字体解析失败：${(err as Error).message}`, warnings, imageCount: 0 }
  }

  const meta = extractMeta(font, base)
  const hasGlyph = makeHasGlyph(font)
  const coverage = computeCoverage(hasGlyph)
  const detection = detectLanguage(coverage, config.threshold)
  const charset = extractCharsetInfo(font, hasGlyph)

  if (detection.lang === 'unknown') {
    warnings.push('字符覆盖不足，无法可靠判定语种，按「英文（字母+数字）」处理')
  }

  const scripts = ctx.cliScripts ?? detection.scripts
  const outBase = dedupe(fontBaseName(base), ctx.usedIds)
  ctx.usedIds.add(outBase)

  const displayName = meta.family.zh || meta.family.en || outBase
  const poem = getPoem(ctx.poems, config.poem)

  // 构建展示页分区
  const sections: { label: string; lines: string[] }[] = []
  let totalRemoved = 0

  if (ctx.cliText) {
    const filtered = filterMissing(ctx.cliText, hasGlyph, config.showMissing)
    totalRemoved += filtered.removedCount
    if (filtered.text.trim()) {
      sections.push({ label: '自定义样张', lines: filtered.text.split('\n') })
    }
  } else if (poem) {
    if (scripts.includes('hans')) {
      const filtered = filterMissing(poem.hans, hasGlyph, config.showMissing)
      totalRemoved += filtered.removedCount
      if (filtered.text.trim()) {
        sections.push({ label: '简体中文预览', lines: splitPoemLines(filtered.text) })
      }
    }
    if (scripts.includes('hant')) {
      const filtered = filterMissing(poem.hant, hasGlyph, config.showMissing)
      totalRemoved += filtered.removedCount
      if (filtered.text.trim()) {
        sections.push({ label: '繁体中文预览', lines: splitPoemLines(filtered.text) })
      }
    }
  }

  if (scripts.includes('letter')) {
    const enText = 'The Five Boxing Wizards Jump Quickly'
    const filtered = filterMissing(enText, hasGlyph, config.showMissing)
    totalRemoved += filtered.removedCount
    if (filtered.text.trim()) {
      sections.push({ label: '英文预览', lines: [filtered.text] })
    }
  }

  if (scripts.includes('digit')) {
    const digitText = '0123456789'
    const filtered = filterMissing(digitText, hasGlyph, config.showMissing)
    totalRemoved += filtered.removedCount
    if (filtered.text.trim()) {
      sections.push({ label: '数字预览', lines: [filtered.text] })
    }
  }

  if (totalRemoved > 0) {
    warnings.push(`样张共过滤 ${totalRemoved} 个缺字`)
  }

  if (sections.length === 0) {
    return { file, status: 'error', reason: '样张过滤后为空，无法生成图片', warnings, imageCount: 0 }
  }

  const images: ManifestFont['images'] = []
  mkdirSync(ctx.outDir, { recursive: true })

  const size = config.sizes[0]!
  const result = await ctx.session.render({
    fontBytes: decoded,
    name: displayName,
    sections,
    targetHeight: size,
    background: config.background,
    color: config.color,
    maxWidth: config.maxImageWidth,
    format: config.format,
    quality: config.quality,
  })
  const fileName = previewFileNameFromBase(outBase, config.format)
  writeFileSync(path.join(ctx.outDir, fileName), Buffer.from(result.base64, 'base64'))
  images.push({
    path: fileName,
    size,
    format: config.format,
    specimen: sections.map((s) => s.lines.join(' ')).join(' | '),
    width: result.width,
    height: result.height,
    generatedAt: new Date().toISOString(),
  })

  // 网页封面图（FR-6.9）：3:1，字体名称
  const cover = await ctx.session.renderCover({
    fontBytes: decoded,
    name: displayName,
    width: config.coverWidth,
    background: config.background,
    color: config.color,
    format: config.format,
    quality: config.quality,
  })
  const coverName = `${outBase}-cover.${config.format}`
  writeFileSync(path.join(ctx.outDir, coverName), Buffer.from(cover.base64, 'base64'))
  images.push({
    path: coverName,
    size: cover.height,
    format: config.format,
    specimen: displayName,
    width: cover.width,
    height: cover.height,
    generatedAt: new Date().toISOString(),
  })

  // 单字预览网格（仅当字体支持汉字时生成）
  if (scripts.includes('hans') || scripts.includes('hant')) {
    const gridGroups = CHAR_GRID_GROUPS
      .map((g) => ({
        label: g.label,
        script: g.script,
        chars: g.chars.filter((c) => hasGlyph(c)),
      }))
      .filter((g) => g.chars.length > 0)

    if (gridGroups.length > 0) {
      const grid = await ctx.session.renderCharGrid({
        fontBytes: decoded,
        width: config.maxImageWidth,
        background: config.background,
        color: config.color,
        format: config.format,
        quality: config.quality,
        groups: gridGroups,
      })
      const gridName = `${outBase}-grid.${config.format}`
      writeFileSync(path.join(ctx.outDir, gridName), Buffer.from(grid.base64, 'base64'))
      images.push({
        path: gridName,
        size: grid.height,
        format: config.format,
        specimen: '单字预览',
        width: grid.width,
        height: grid.height,
        generatedAt: new Date().toISOString(),
      })
    }
  }

  // 多字重预览（仅当 TTC 包含多个不同字重时生成）
  if (isTtc(decoded)) {
    const allFaces = normalizeFontBytesAll(decoded)
    if (allFaces.length > 1) {
      const weightFaces: { fontBytes: Uint8Array; name: string; family: string; weightClass: number }[] = []
      for (const face of allFaces) {
        try {
          const f = parseFontFromNormalized(face.data)
          const w = extractWeight(f, base)
          weightFaces.push({
            fontBytes: face.data,
            name: w.name,
            family: `f2i-mw-${face.index}`,
            weightClass: w.weightClass,
          })
        } catch {
          // 跳过无法解析的面
        }
      }
      // 按字重排序，去重
      weightFaces.sort((a, b) => a.weightClass - b.weightClass)
      const seen = new Set<number>()
      const unique = weightFaces.filter((f) => {
        if (seen.has(f.weightClass)) return false
        seen.add(f.weightClass)
        return true
      })

      if (unique.length >= 2) {
        const sampleText = (scripts.includes('hans') || scripts.includes('hant'))
          ? '汉字字重预览 AaBb'
          : 'Weight Preview AaBb 1234'
        const fontSize = Math.round(config.maxImageWidth * 0.06)

        const mw = await ctx.session.renderMultiWeight({
          faces: unique.map((f) => ({ fontBytes: f.fontBytes, name: f.name, family: f.family })),
          width: config.maxImageWidth,
          background: config.background,
          color: config.color,
          format: config.format,
          quality: config.quality,
          text: sampleText,
          fontSize,
        })
        const mwName = `${outBase}-weights.${config.format}`
        writeFileSync(path.join(ctx.outDir, mwName), Buffer.from(mw.base64, 'base64'))
        images.push({
          path: mwName,
          size: mw.height,
          format: config.format,
          specimen: '多字重预览',
          width: mw.width,
          height: mw.height,
          generatedAt: new Date().toISOString(),
        })
      }
    }
  }

  const entry: ManifestFont = {
    file,
    fileHash,
    configHash: ctx.cfgHash,
    family: meta.family,
    style: meta.style,
    license: meta.license,
    detected: detection.lang,
    scripts,
    coverage,
    charset,
    images,
  }
  return { file, status: 'ok', warnings, imageCount: images.length, entry }
}
