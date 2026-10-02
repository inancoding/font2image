import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SCRIPT_LABELS, SCRIPT_ORDER } from '../core/charsets'
import { DEFAULT_CONFIG } from '../core/config'
import { computeCoverage, detectLanguage } from '../core/detect'
import { dedupe, fontBaseName } from '../core/naming'
import type {
  CharsetInfo,
  CoverageResult,
  DetectedLang,
  DetectionResult,
  FontMeta,
  OutputFormat,
  ScriptId,
} from '../core/types'
import { CHAR_GRID_GROUPS, HANS_POEMS, HANT_POEMS } from '../core/char-grid'
import { extractCharsetInfo, extractMeta, extractWeight, isTtc, makeHasGlyph, normalizeFontBytes, normalizeFontBytesAll, parseFont, parseFontFromNormalized, type OTFont } from '../parse/font'
import { drawCharGrid, drawCover, drawMultiWeight, mimeType } from '../render/draw'
import { parse } from 'opentype.js'
import { renderCharGridWithOpentype, renderCoverWithOpentype, renderMultiWeightWithOpentype } from '../render/opentype-fallback'

const LANG_LABELS: Record<DetectedLang, string> = {
  hans: '简体',
  hant: '繁体',
  both: '简繁双全',
  latin: '英文',
  unknown: '未知',
}

const SUPPORTED_EXTENSIONS = ['ttf', 'otf', 'woff', 'ttc']

const EN_PRESETS = [
  'The Five Boxing Wizards Jump Quickly',
  'Sphinx of Black Quartz, Judge My Vow',
  'How Vexingly Quick Daft Zebras Jump',
  'The Quick Brown Fox Jumps Over The Lazy Dog',
  'Pack My Box With Five Dozen Liquor Jugs',
]

// 展示文本：字号固定；容器宽度 fit-content 随文本自适应、超出卡片时收为卡片宽并换行
function ShowcaseLines({ lines, color }: { lines: string[]; color: string }) {
  return (
    <div className="showcase-text" style={{ fontFamily: "'f2i-preview', sans-serif", color }}>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  )
}

interface LoadedFont {
  fileName: string
  bytes: Uint8Array
  font: OTFont
  meta: FontMeta
  coverage: CoverageResult
  detection: DetectionResult
  charset: CharsetInfo
}

interface Preview {
  caption: string
  dataUrl: string
}

interface BatchEntry {
  fileName: string
  status: 'ok' | 'error'
  error?: string
  loaded?: LoadedFont
  faceFamily?: string | null
  useFallback?: boolean
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedFont | null>(null)
  const [batch, setBatch] = useState<BatchEntry[] | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [selected, setSelected] = useState<ScriptId[]>([])
  const [format, setFormat] = useState<OutputFormat>('webp')
  const [sizes, setSizes] = useState<number[]>(DEFAULT_CONFIG.sizes)
  const [transparentBg, setTransparentBg] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; text: string; type: 'error' | 'success' }[]>([])
  const toastIdRef = useRef(0)
  const [dragOver, setDragOver] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genDone, setGenDone] = useState(0)
  const [coverPreview, setCoverPreview] = useState<Preview | null>(null)
  const [gridPreview, setGridPreview] = useState<Preview | null>(null)
  const [multiWeightPreview, setMultiWeightPreview] = useState<Preview | null>(null)
  const [multiWeightFaces, setMultiWeightFaces] = useState<{ name: string; bytes: Uint8Array; weightClass: number; family: string }[]>([])
  const [gridBoldFace, setGridBoldFace] = useState<{ name: string; bytes: Uint8Array; weightClass: number; family: string } | null>(null)
  const [editFamilyName, setEditFamilyName] = useState('')
  const [useOpentypeFallback, setUseOpentypeFallback] = useState(false)
  const [poemIndex, setPoemIndex] = useState(0)
  const [dragWeightIndex, setDragWeightIndex] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [coverBgImage, setCoverBgImage] = useState<string | null>(null)
  const [coverBgOpacity, setCoverBgOpacity] = useState(0.35)
  const [coverWhiteText, setCoverWhiteText] = useState(false)
  const [showRibbon, setShowRibbon] = useState(true)
  const faceRef = useRef<FontFace | null>(null)
  const batchFacesRef = useRef<FontFace[]>([])
  const multiWeightFacesRef = useRef<FontFace[]>([])
  const gridFaceRef = useRef<FontFace | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const coverBgInputRef = useRef<HTMLInputElement>(null)

  function showToast(text: string, type: 'error' | 'success' = 'success') {
    if (!text) return
    const id = toastIdRef.current++
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }

  function clearSingleFace() {
    if (faceRef.current) {
      document.fonts.delete(faceRef.current)
      faceRef.current = null
    }
  }

  function clearBatchFaces() {
    for (const face of batchFacesRef.current) document.fonts.delete(face)
    batchFacesRef.current = []
  }

  function clearMultiWeightFaces() {
    for (const face of multiWeightFacesRef.current) document.fonts.delete(face)
    multiWeightFacesRef.current = []
    if (gridFaceRef.current) {
      document.fonts.delete(gridFaceRef.current)
      gridFaceRef.current = null
    }
  }

  function resetWeightOrder() {
    setMultiWeightFaces((prev) => [...prev].sort((a, b) => b.weightClass - a.weightClass))
  }

  function handleWeightDragStart(index: number) {
    setDragWeightIndex(index)
  }

  function handleWeightDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragWeightIndex === null || dragWeightIndex === index) return
    setMultiWeightFaces((prev) => {
      const next = [...prev]
      const [item] = next.splice(dragWeightIndex, 1)
      next.splice(index, 0, item!)
      return next
    })
    setDragWeightIndex(index)
  }

  function handleWeightDragEnd() {
    setDragWeightIndex(null)
  }

  const previewItems = [
    coverPreview?.dataUrl ? { caption: coverPreview.caption, dataUrl: coverPreview.dataUrl } : null,
    gridPreview?.dataUrl ? { caption: gridPreview.caption, dataUrl: gridPreview.dataUrl } : null,
    multiWeightPreview?.dataUrl ? { caption: multiWeightPreview.caption, dataUrl: multiWeightPreview.dataUrl } : null,
  ].filter((x): x is { caption: string; dataUrl: string } => x !== null)

  function openLightbox(index: number) {
    setLightboxIndex(index)
  }

  function closeLightbox() {
    setLightboxIndex(null)
  }

  function lightboxPrev() {
    setLightboxIndex((prev) => (prev !== null ? (prev - 1 + previewItems.length) % previewItems.length : null))
  }

  function lightboxNext() {
    setLightboxIndex((prev) => (prev !== null ? (prev + 1) % previewItems.length : null))
  }

  function getMwText(selectedScripts: ScriptId[], poemIdx: number): string {
    const supportsHans = selectedScripts.includes('hans')
    const supportsHant = selectedScripts.includes('hant')
    if (supportsHans) {
      const poem = HANS_POEMS[poemIdx] ?? HANS_POEMS[0]!
      return poem.lines.join('')
    }
    if (supportsHant) {
      const poem = HANT_POEMS[poemIdx] ?? HANT_POEMS[0]!
      return poem.lines.join('')
    }
    return 'The Quick Brown Fox Jumps Over The Lazy Dog'
  }

  function calculateMwWidth(text: string, fontSize: number, fontFamily?: string): number {
    const tmpCanvas = document.createElement('canvas')
    const tmpCtx = tmpCanvas.getContext('2d')
    if (!tmpCtx) return 1200
    const font = fontFamily ? `"${fontFamily}", sans-serif` : 'sans-serif'
    tmpCtx.font = `${fontSize}px ${font}`
    const textWidth = tmpCtx.measureText(text).width
    const padX = Math.max(60, Math.round(fontSize * 0.8))
    return Math.max(800, Math.round(textWidth + padX * 2))
  }

  async function handleFiles(files: File[]) {
    if (files.length === 1) {
      await handleFile(files[0]!)
      return
    }
    // 多文件：先检测是否属于同一字体家族（不同字重）
    const parsed: { file: File; bytes: Uint8Array; font: OTFont; meta: FontMeta; familyKey: string; weightClass: number; weightName: string }[] = []
    for (const file of files) {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase()
      if (ext === 'woff2' || !SUPPORTED_EXTENSIONS.includes(ext)) continue
      try {
        const rawBytes = new Uint8Array(await file.arrayBuffer())
        const bytes = normalizeFontBytes(rawBytes)
        const font = parseFont(bytes)
        const meta = extractMeta(font, file.name)
        const w = extractWeight(font, file.name)
        // 规范化家族名：移除常见的字重/风格后缀
        let rawFamily = meta.family.zh || meta.family.en || ''
        const weightSuffixes = /[-_\s]*(bold|black|heavy|light|medium|normal|regular|semibold|extrabold|extralight|thin|weight\d+|w?\d{2,})$/i
        const familyKey = rawFamily.replace(weightSuffixes, '').toLowerCase().trim()
        if (!familyKey) continue
        parsed.push({ file, bytes, font, meta, familyKey, weightClass: w.weightClass, weightName: w.name })
      } catch (err) {
        console.error(`[handleFiles] Failed to parse ${file.name}:`, err)
      }
    }

    // 按家族分组
    const familyMap = new Map<string, typeof parsed>()
    for (const p of parsed) {
      const arr = familyMap.get(p.familyKey) ?? []
      arr.push(p)
      familyMap.set(p.familyKey, arr)
    }

    // 找到最大的同家族组
    let bestGroup: typeof parsed = []
    for (const group of familyMap.values()) {
      if (group.length > bestGroup.length) bestGroup = group
    }

    console.log(`[handleFiles] Found ${familyMap.size} family groups, best group has ${bestGroup.length} files`)
    if (bestGroup.length > 0) {
      console.log(`[handleFiles] Best group:`, bestGroup.map(p => `${p.file.name} (${p.weightName})`).join(', '))
    }

    // 如果同家族字重数 >= 2，以多字重模式加载
    if (bestGroup.length >= 2) {
      clearBatchFaces()
      setBatch(null)
      // 选 Regular 或最接近 400 的作为主字体
      const main = bestGroup.find((p) => p.weightClass === 400)
        ?? bestGroup.reduce((b, p) => Math.abs(p.weightClass - 400) < Math.abs(b.weightClass - 400) ? p : b, bestGroup[0]!)

      // 用主字体初始化单字体模式
      const hasGlyph = makeHasGlyph(main.font)
      const coverage = computeCoverage(hasGlyph)
      const detection = detectLanguage(coverage, DEFAULT_CONFIG.threshold)
      const charset = extractCharsetInfo(main.font, hasGlyph)

      clearSingleFace()
      clearMultiWeightFaces()
      const face = new FontFace('f2i-preview', main.bytes.buffer.slice(main.bytes.byteOffset, main.bytes.byteOffset + main.bytes.byteLength) as ArrayBuffer)
      let useFallback = false
      try {
        await face.load()
        document.fonts.add(face)
        faceRef.current = face
      } catch {
        useFallback = true
      }
      setUseOpentypeFallback(useFallback)
      // 使用规范化的家族名（首字母大写，去除字重后缀）
      const displayFamilyName = main.familyKey.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      const normalizedMeta = { ...main.meta, family: { zh: main.meta.family.zh, en: displayFamilyName } }
      setLoaded({ fileName: main.file.name, bytes: main.bytes, font: main.font, meta: normalizedMeta, coverage, detection, charset })
      setSelected(detection.scripts)
      setEditFamilyName('')
      setCoverBgImage(null)
      setCoverBgOpacity(0.35)
      setCoverWhiteText(false)

      // 设置多字重
      const weightFaces: { name: string; bytes: Uint8Array; weightClass: number; family: string }[] = []
      const loadedFaces: FontFace[] = []
      for (const p of bestGroup) {
        const fileSuffix = p.file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '')
        const familyName = `f2i-mw-${p.weightClass}-${fileSuffix}-${Date.now()}`
        if (!useFallback) {
          try {
            const f = new FontFace(
              familyName,
              p.bytes.buffer.slice(p.bytes.byteOffset, p.bytes.byteOffset + p.bytes.byteLength) as ArrayBuffer,
            )
            await f.load()
            document.fonts.add(f)
            loadedFaces.push(f)
            weightFaces.push({ name: p.weightName, bytes: p.bytes, weightClass: p.weightClass, family: f.family })
          } catch { /* skip */ }
        } else {
          weightFaces.push({ name: p.weightName, bytes: p.bytes, weightClass: p.weightClass, family: familyName })
        }
      }
      weightFaces.sort((a, b) => b.weightClass - a.weightClass)
      multiWeightFacesRef.current = loadedFaces
      setMultiWeightFaces(weightFaces)
      setPoemIndex(0)
      const bold = weightFaces.find((f) => f.weightClass === 700)
        ?? weightFaces.reduce((best, f) => Math.abs(f.weightClass - 700) < Math.abs(best.weightClass - 700) ? f : best, weightFaces[0]!)
      setGridBoldFace(bold)
      return
    }

    // 否则进入批量模式：与单字体模式互斥
    clearSingleFace()
    clearBatchFaces()
    clearMultiWeightFaces()
    setLoaded(null)
    setBatch([])
    setBatchLoading(true)
    setCoverPreview(null)
    setGridPreview(null)
    setMultiWeightPreview(null)
    setMultiWeightFaces([])
    setGridBoldFace(null)
    try {
      for (let i = 0; i < files.length; i++) {
        const entry = await loadBatchEntry(files[i]!, i)
        if (entry.face) batchFacesRef.current.push(entry.face)
        setBatch((prev) => (prev ? [...prev, entry.item] : prev))
      }
    } finally {
      setBatchLoading(false)
    }
  }

  // 批量条目加载：失败不中断整体，逐条记录原因（对齐 CLI 报告的跳过语义）
  async function loadBatchEntry(
    file: File,
    index: number,
  ): Promise<{ item: BatchEntry; face: FontFace | null }> {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (ext === 'woff2') {
      return {
        item: {
          fileName: file.name,
          status: 'error',
          error: '本地 UI 不支持 woff2，请先用 CLI 转换：pnpm gen <文件>.woff2',
        },
        face: null,
      }
    }
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return { item: { fileName: file.name, status: 'error', error: `不支持的格式 .${ext}` }, face: null }
    }
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > DEFAULT_CONFIG.maxFileSizeMB) {
      return {
        item: {
          fileName: file.name,
          status: 'error',
          error: `文件过大（${sizeMB.toFixed(1)}MB > ${DEFAULT_CONFIG.maxFileSizeMB}MB 上限）`,
        },
        face: null,
      }
    }
    try {
      const bytes = normalizeFontBytes(new Uint8Array(await file.arrayBuffer()))
      const font = parseFont(bytes)
      const meta = extractMeta(font, file.name)
      const hasGlyph = makeHasGlyph(font)
      const coverage = computeCoverage(hasGlyph)
      const detection = detectLanguage(coverage, DEFAULT_CONFIG.threshold)
      const charset = extractCharsetInfo(font, hasGlyph)

      const faceFamily = `f2i-batch-${index}-${Date.now()}`
      const face = new FontFace(faceFamily, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      let useFallback = false
      try {
        await face.load()
        document.fonts.add(face)
      } catch (loadErr) {
        useFallback = true
      }
      return {
        item: {
          fileName: file.name,
          status: 'ok',
          faceFamily: useFallback ? null : faceFamily,
          useFallback,
          loaded: { fileName: file.name, bytes, font, meta, coverage, detection, charset },
        },
        face: useFallback ? null : face,
      }
    } catch (err) {
      return { item: { fileName: file.name, status: 'error', error: `字体解析失败：${(err as Error).message}` }, face: null }
    }
  }

  async function handleFile(file: File) {
    clearBatchFaces()
    clearMultiWeightFaces()
    setBatch(null)
    setCoverPreview(null)
    setGridPreview(null)
    setMultiWeightPreview(null)
    setMultiWeightFaces([])
    setGridBoldFace(null)
    setCoverBgImage(null)
    setCoverBgOpacity(0.35)
    setCoverWhiteText(false)
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (ext === 'woff2') {
      showToast('本地 UI 不支持 woff2（FR-1.1）。请先用 CLI 转换：pnpm gen <文件>.woff2', 'error')
      return
    }
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      showToast(`不支持的格式 .${ext}，支持 ttf / otf / woff / ttc`, 'error')
      return
    }
    try {
      const rawBytes = new Uint8Array(await file.arrayBuffer())
      const bytes = normalizeFontBytes(rawBytes)
      const font = parseFont(bytes)
      const meta = extractMeta(font, file.name)
      const hasGlyph = makeHasGlyph(font)
      const coverage = computeCoverage(hasGlyph)
      const detection = detectLanguage(coverage, DEFAULT_CONFIG.threshold)
      const charset = extractCharsetInfo(font, hasGlyph)

      clearSingleFace()
      const face = new FontFace('f2i-preview', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      try {
        await face.load()
        document.fonts.add(face)
        faceRef.current = face
        setUseOpentypeFallback(false)
      } catch (loadErr) {
        showToast(
          `浏览器字体引擎无法加载，已启用 opentype.js 降级渲染：${(loadErr as Error).message}`,
          'error',
        )
        setUseOpentypeFallback(true)
      }

      setLoaded({ fileName: file.name, bytes, font, meta, coverage, detection, charset })
      setSelected(detection.scripts)
      setEditFamilyName('')

      // 检测多字重（TTC 包含多个面）
      if (isTtc(rawBytes)) {
        const allFaces = normalizeFontBytesAll(rawBytes)
        if (allFaces.length > 1) {
          const parsedFaces: { face: OTFont; bytes: Uint8Array; weightClass: number; name: string; index: number }[] = []
          for (let fi = 0; fi < allFaces.length; fi++) {
            const f = allFaces[fi]!
            try {
              const pf = parseFontFromNormalized(f.data)
              const w = extractWeight(pf, file.name)
              parsedFaces.push({ face: pf, bytes: f.data, weightClass: w.weightClass, name: w.name, index: fi })
            } catch { /* skip unparseable faces */ }
          }
          if (parsedFaces.length > 1) {
            const loadedFaces: FontFace[] = []
            const weightFaces: { name: string; bytes: Uint8Array; weightClass: number; family: string }[] = []
            for (const pf of parsedFaces) {
              try {
                const familyName = `f2i-mw-${pf.weightClass}-face${pf.index}-${Date.now()}`
                const faceObj = new FontFace(
                  familyName,
                  pf.bytes.buffer.slice(pf.bytes.byteOffset, pf.bytes.byteOffset + pf.bytes.byteLength) as ArrayBuffer,
                )
                await faceObj.load()
                document.fonts.add(faceObj)
                loadedFaces.push(faceObj)
                weightFaces.push({ name: pf.name, bytes: pf.bytes, weightClass: pf.weightClass, family: faceObj.family })
              } catch { /* skip unloadable faces */ }
            }
            multiWeightFacesRef.current = loadedFaces
            if (weightFaces.length > 1) {
              weightFaces.sort((a, b) => b.weightClass - a.weightClass)
              setMultiWeightFaces(weightFaces)
              // 选择 Bold 或最接近的字重用于单字网格
              const bold = weightFaces.find((f) => f.weightClass === 700)
                ?? weightFaces.reduce((best, f) => Math.abs(f.weightClass - 700) < Math.abs(best.weightClass - 700) ? f : best, weightFaces[0]!)
              setGridBoldFace(bold)
            }
          }
        }
      }
    } catch (err) {
      showToast(`字体解析失败：${(err as Error).message}`, 'error')
    }
  }

  const autoFamilyName = loaded ? (loaded.meta.family.zh || loaded.meta.family.en || fontBaseName(loaded.fileName)) : ''
  const displayName = editFamilyName || autoFamilyName
  const coverColor = coverWhiteText ? '#ffffff' : '#000000'

  useEffect(() => {
    if (!loaded) {
      setCoverPreview(null)
      setGridPreview(null)
      setMultiWeightPreview(null)
      return
    }
    let cancelled = false
    const hasGlyph = makeHasGlyph(loaded.font)
    const bg = transparentBg ? 'transparent' : DEFAULT_CONFIG.background

    void (async () => {
      try { await document.fonts.ready } catch { /* ignore */ }
      if (cancelled) return

      // 预加载背景图片，确保 drawCover 同步绘制时图片已就绪
      if (coverBgImage) {
        try {
          await new Promise<void>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('背景图加载失败'))
            img.src = coverBgImage
          })
        } catch { /* 加载失败则跳过背景图 */ }
      }
      if (cancelled) return

      // 封面预览
      if (!useOpentypeFallback) {
        const coverCanvas = document.createElement('canvas')
        // 使用 gridBoldFace 的字体（如果已设置）
        let coverFamily = 'f2i-preview'
        if (gridBoldFace) {
          const boldMwFace = multiWeightFacesRef.current.find((f) => f.family === gridBoldFace.family)
          if (boldMwFace) coverFamily = boldMwFace.family
        }
        const coverDims = drawCover(coverCanvas, {
          name: displayName,
          fontFamily: coverFamily,
          width: DEFAULT_CONFIG.coverWidth,
          background: bg,
          color: coverColor,
          bgImage: coverBgImage ?? undefined,
          bgOpacity: coverBgOpacity,
          showRibbon,
        })
        setCoverPreview({
          caption: `封面图 · ${coverDims.width}×${coverDims.height}`,
          dataUrl: coverCanvas.toDataURL('image/png'),
        })
      } else {
        const coverCanvas = document.createElement('canvas')
        // 使用 gridBoldFace 的字体（如果已设置）
        const coverBuffer = gridBoldFace
          ? gridBoldFace.bytes.buffer.slice(gridBoldFace.bytes.byteOffset, gridBoldFace.bytes.byteOffset + gridBoldFace.bytes.byteLength) as ArrayBuffer
          : loaded.bytes.buffer.slice(loaded.bytes.byteOffset, loaded.bytes.byteOffset + loaded.bytes.byteLength) as ArrayBuffer
        const coverDims = renderCoverWithOpentype(coverCanvas, {
          fontBuffer: coverBuffer,
          name: displayName,
          width: DEFAULT_CONFIG.coverWidth,
          background: bg,
          color: coverColor,
          bgImage: coverBgImage ?? undefined,
          bgOpacity: coverBgOpacity,
          showRibbon,
        })
        setCoverPreview({
          caption: `封面图 · ${coverDims.width}×${coverDims.height}`,
          dataUrl: coverCanvas.toDataURL('image/png'),
        })
      }

      // 多字重预览
      if (multiWeightFaces.length > 1) {
        const mwText = getMwText(selected, poemIndex)
        const fontSize = 72
        const mwCanvas = document.createElement('canvas')
        let mwDims: { width: number; height: number }
        if (useOpentypeFallback) {
          // opentype 模式：用第一个字体的 buffer 测量
          const firstBuf = multiWeightFaces[0]!.bytes.buffer.slice(
            multiWeightFaces[0]!.bytes.byteOffset,
            multiWeightFaces[0]!.bytes.byteOffset + multiWeightFaces[0]!.bytes.byteLength,
          ) as ArrayBuffer
          const otFont = parse(firstBuf)
          const ascenderRatio = otFont.ascender / otFont.unitsPerEm
          const s = fontSize / otFont.unitsPerEm
          let textW = 0
          for (let i = 0; i < mwText.length; i++) {
            const g = otFont.charToGlyph(mwText[i]!)
            textW += g.advanceWidth! * s
            if (i < mwText.length - 1) {
              const ng = otFont.charToGlyph(mwText[i + 1]!)
              const k = otFont.getKerningValue(g, ng)
              if (k) textW += k * s
            }
          }
          const padX = Math.max(60, Math.round(fontSize * 0.8))
          const mwWidth = Math.max(800, Math.round(textW + padX * 2))
          mwDims = renderMultiWeightWithOpentype(mwCanvas, {
            fontBuffers: multiWeightFaces.map((f) => ({
              name: f.name,
              buffer: f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer,
            })),
            width: mwWidth,
            background: bg,
            color: '#000000',
            text: mwText,
            fontSize,
          })
        } else {
          // 通过 family 匹配 FontFace，避免拖动排序后索引错位
          const validFaces = multiWeightFaces.filter((f) =>
            multiWeightFacesRef.current.some((ff) => ff.family === f.family),
          )
          if (validFaces.length > 0) {
            const firstFamily = multiWeightFacesRef.current.find((ff) => ff.family === validFaces[0]!.family)?.family
            const mwWidth = calculateMwWidth(mwText, fontSize, firstFamily)
            mwDims = drawMultiWeight(mwCanvas, {
              width: mwWidth,
              background: bg,
              color: '#000000',
              text: mwText,
              faces: validFaces.map((f) => {
                const face = multiWeightFacesRef.current.find((ff) => ff.family === f.family)
                return {
                  name: f.name,
                  fontFamily: face!.family,
                }
              }),
              fontSize,
            })
          } else {
            setMultiWeightPreview(null)
            return
          }
        }
        if (!cancelled) {
          setMultiWeightPreview({
            caption: `多字重预览 · ${mwDims.width}×${mwDims.height} · ${multiWeightFaces.length} 个字重`,
            dataUrl: mwCanvas.toDataURL('image/png'),
          })
        }
      } else {
        setMultiWeightPreview(null)
      }

      // 单字网格预览
      {
        const supportsHans = selected.includes('hans')
        const supportsHant = selected.includes('hant')
        const gridGroups: { label: string; script: string; chars: string[] }[] = []

        // 简体和繁体分开显示
        if (supportsHans) {
          const poem = HANS_POEMS[poemIndex] ?? HANS_POEMS[0]!
          const chars = poem.lines.join('').split('')
          const filteredChars = chars.filter((c) => hasGlyph(c))
          if (filteredChars.length > 0) {
            gridGroups.push({ label: `简体中文 · ${poem.title}`, script: 'hans', chars: filteredChars })
          }
        }
        if (supportsHant) {
          const poem = HANT_POEMS[poemIndex] ?? HANT_POEMS[0]!
          const chars = poem.lines.join('').split('')
          const filteredChars = chars.filter((c) => hasGlyph(c))
          if (filteredChars.length > 0) {
            gridGroups.push({ label: `繁体中文 · ${poem.title}`, script: 'hant', chars: filteredChars })
          }
        }

        // 英文和数字
        for (const g of CHAR_GRID_GROUPS) {
          if (g.script === 'hans' || g.script === 'hant') continue
          const scriptId = g.script === 'upper' || g.script === 'lower' ? 'letter' : g.script
          if (!selected.includes(scriptId as ScriptId)) continue
          const filteredChars = g.chars.filter((c) => hasGlyph(c))
          if (filteredChars.length > 0) {
            gridGroups.push({ label: g.label, script: g.script, chars: filteredChars })
          }
        }

        if (gridGroups.length > 0) {
          const gridCanvas = document.createElement('canvas')
          let gridDims: { width: number; height: number }
          if (useOpentypeFallback) {
            const gridBuffer = gridBoldFace
              ? gridBoldFace.bytes.buffer.slice(gridBoldFace.bytes.byteOffset, gridBoldFace.bytes.byteOffset + gridBoldFace.bytes.byteLength) as ArrayBuffer
              : loaded.bytes.buffer.slice(loaded.bytes.byteOffset, loaded.bytes.byteOffset + loaded.bytes.byteLength) as ArrayBuffer
            gridDims = renderCharGridWithOpentype(gridCanvas, {
              fontBuffer: gridBuffer,
              width: DEFAULT_CONFIG.maxImageWidth,
              background: bg,
              color: '#000000',
              groups: gridGroups,
            })
          } else {
            let gridFamily = 'f2i-preview'
            if (gridBoldFace) {
              const boldMwFace = multiWeightFacesRef.current.find((f) => f.family === gridBoldFace.family)
              if (boldMwFace) gridFamily = boldMwFace.family
            }
            gridDims = drawCharGrid(gridCanvas, {
              width: DEFAULT_CONFIG.maxImageWidth,
              fontFamily: gridFamily,
              background: bg,
              color: '#000000',
              groups: gridGroups,
            })
          }
          if (!cancelled) {
            setGridPreview({
              caption: `单字预览 · ${gridDims.width}×${gridDims.height}${gridBoldFace ? ' · Bold' : ''}`,
              dataUrl: gridCanvas.toDataURL('image/png'),
            })
          }
        } else {
          setGridPreview(null)
        }
      }
    })()

    return () => { cancelled = true }
  }, [loaded, transparentBg, displayName, useOpentypeFallback, multiWeightFaces, gridBoldFace, poemIndex, selected, coverBgImage, coverBgOpacity, coverWhiteText, showRibbon])

  useEffect(() => {
    if (lightboxIndex === null) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox()
      else if (e.key === 'ArrowLeft') lightboxPrev()
      else if (e.key === 'ArrowRight') lightboxNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIndex, previewItems.length])

  function toggleScript(s: ScriptId) {
    setSelected((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
      return next.length === 0 ? prev : next
    })
  }

  function toggleSize(n: number) {
    setSizes((prev) => {
      const next = prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)
      return next.length === 0 ? prev : next
    })
  }

  async function canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType(format), format === 'png' ? undefined : DEFAULT_CONFIG.quality / 100),
    )
    if (!blob) throw new Error('画布导出图片失败')
    return new Uint8Array(await blob.arrayBuffer())
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): Promise<boolean> {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType(format), format === 'png' ? undefined : DEFAULT_CONFIG.quality / 100),
    )
    if (!blob) return false
    downloadBlob(blob, fileName)
    return true
  }

  async function generate() {
    if (!loaded) return
    setGenerating(true)
    try {
      await document.fonts.ready
      const hasGlyph = makeHasGlyph(loaded.font)
      const isTransparent = transparentBg && format !== 'jpg'
      const background = isTransparent ? 'transparent' : DEFAULT_CONFIG.background
      const zipEntries: { name: string; data: Uint8Array }[] = []
      const parts: string[] = []

      if (!useOpentypeFallback) {
        const coverCanvas = document.createElement('canvas')
        let coverFamily = 'f2i-preview'
        if (gridBoldFace) {
          const boldMwFace = multiWeightFacesRef.current.find((f) => f.family === gridBoldFace.family)
          if (boldMwFace) coverFamily = boldMwFace.family
        }
        drawCover(coverCanvas, {
          name: displayName,
          fontFamily: coverFamily,
          width: DEFAULT_CONFIG.coverWidth,
          background,
          color: coverColor,
          bgImage: coverBgImage ?? undefined,
          bgOpacity: coverBgOpacity,
          showRibbon,
        })
        zipEntries.push({ name: `${fontBaseName(loaded.fileName)}-cover.${format}`, data: await canvasToBytes(coverCanvas) })
        parts.push('封面')
      } else if (loaded) {
        const coverCanvas = document.createElement('canvas')
        const coverBuffer = gridBoldFace
          ? gridBoldFace.bytes.buffer.slice(gridBoldFace.bytes.byteOffset, gridBoldFace.bytes.byteOffset + gridBoldFace.bytes.byteLength) as ArrayBuffer
          : loaded.bytes.buffer.slice(loaded.bytes.byteOffset, loaded.bytes.byteOffset + loaded.bytes.byteLength) as ArrayBuffer
        renderCoverWithOpentype(coverCanvas, {
          fontBuffer: coverBuffer,
          name: displayName,
          width: DEFAULT_CONFIG.coverWidth,
          background,
          color: coverColor,
          bgImage: coverBgImage ?? undefined,
          bgOpacity: coverBgOpacity,
          showRibbon,
        })
        zipEntries.push({ name: `${fontBaseName(loaded.fileName)}-cover.${format}`, data: await canvasToBytes(coverCanvas) })
        parts.push('封面')
      }

      const base = fontBaseName(loaded.fileName)

      // 单字网格
      {
        const supportsHans = selected.includes('hans')
        const supportsHant = selected.includes('hant')
        const gridGroups: { label: string; script: string; chars: string[] }[] = []

        // 简体和繁体分开显示
        if (supportsHans) {
          const poem = HANS_POEMS[poemIndex] ?? HANS_POEMS[0]!
          const chars = poem.lines.join('').split('')
          const filteredChars = chars.filter((c) => hasGlyph(c))
          if (filteredChars.length > 0) {
            gridGroups.push({ label: `简体中文 · ${poem.title}`, script: 'hans', chars: filteredChars })
          }
        }
        if (supportsHant) {
          const poem = HANT_POEMS[poemIndex] ?? HANT_POEMS[0]!
          const chars = poem.lines.join('').split('')
          const filteredChars = chars.filter((c) => hasGlyph(c))
          if (filteredChars.length > 0) {
            gridGroups.push({ label: `繁体中文 · ${poem.title}`, script: 'hant', chars: filteredChars })
          }
        }

        // 英文和数字
        for (const g of CHAR_GRID_GROUPS) {
          if (g.script === 'hans' || g.script === 'hant') continue
          const scriptId = g.script === 'upper' || g.script === 'lower' ? 'letter' : g.script
          if (!selected.includes(scriptId as ScriptId)) continue
          const filteredChars = g.chars.filter((c) => hasGlyph(c))
          if (filteredChars.length > 0) {
            gridGroups.push({ label: g.label, script: g.script, chars: filteredChars })
          }
        }

        if (gridGroups.length > 0) {
          const gridCanvas = document.createElement('canvas')
          if (useOpentypeFallback) {
            const gridBuffer = gridBoldFace
              ? gridBoldFace.bytes.buffer.slice(gridBoldFace.bytes.byteOffset, gridBoldFace.bytes.byteOffset + gridBoldFace.bytes.byteLength) as ArrayBuffer
              : loaded.bytes.buffer.slice(loaded.bytes.byteOffset, loaded.bytes.byteOffset + loaded.bytes.byteLength) as ArrayBuffer
            renderCharGridWithOpentype(gridCanvas, {
              fontBuffer: gridBuffer,
              width: DEFAULT_CONFIG.maxImageWidth,
              background,
              color: '#000000',
              groups: gridGroups,
            })
          } else {
            let gridFamily = 'f2i-preview'
            if (gridBoldFace) {
              const boldMwFace = multiWeightFacesRef.current.find((f) => f.family === gridBoldFace.family)
              if (boldMwFace) gridFamily = boldMwFace.family
            }
            drawCharGrid(gridCanvas, {
              width: DEFAULT_CONFIG.maxImageWidth,
              fontFamily: gridFamily,
              background,
              color: '#000000',
              groups: gridGroups,
            })
          }
          zipEntries.push({ name: `${base}-grid.${format}`, data: await canvasToBytes(gridCanvas) })
          parts.push('单字')
        }
      }

      // 多字重
      if (multiWeightFaces.length > 1 && multiWeightFacesRef.current.length === multiWeightFaces.length) {
        const mwText = getMwText(selected, poemIndex)
        const fontSize = 72
        const firstFace = multiWeightFacesRef.current.find((ff) => ff.family === multiWeightFaces[0]!.family)
        const mwWidth = calculateMwWidth(mwText, fontSize, firstFace?.family)
        const mwCanvas = document.createElement('canvas')
        drawMultiWeight(mwCanvas, {
          width: mwWidth,
          background,
          color: '#000000',
          text: mwText,
          faces: multiWeightFaces.map((f) => {
            const face = multiWeightFacesRef.current.find((ff) => ff.family === f.family)
            return {
              name: f.name,
              fontFamily: face!.family,
            }
          }),
          fontSize,
        })
        zipEntries.push({ name: `${base}-multiweight.${format}`, data: await canvasToBytes(mwCanvas) })
        parts.push('多字重')
      }

      // 逐个下载
      for (let i = 0; i < zipEntries.length; i++) {
        const entry = zipEntries[i]!
        const blob = new Blob([entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength) as ArrayBuffer], { type: mimeType(format) })
        downloadBlob(blob, entry.name)
        if (i < zipEntries.length - 1) await sleep(150)
      }

      showToast(zipEntries.length > 0 ? `已生成 ${zipEntries.length} 张图片（${parts.join('、')}）` : '没有可生成的图片')
    } finally {
      setGenerating(false)
    }
  }

  // 批量生成：全局设置 + 每字体自动判定，命名规则与 CLI 一致，逐个下载
  async function generateBatch() {
    if (!batch) return
    const items = batch.filter((entry) => entry.status === 'ok' && entry.loaded && entry.faceFamily)
    if (items.length === 0) return
    setGenerating(true)
    setGenDone(0)
    try {
      await document.fonts.ready
      const zipEntries: { name: string; data: Uint8Array }[] = []
      const used = new Set<string>()
      let imageCount = 0
      const isTransparent = transparentBg && format !== 'jpg'
      const background = isTransparent ? 'transparent' : DEFAULT_CONFIG.background

      for (const entry of items) {
        const loadedFont = entry.loaded!
        const base = dedupe(fontBaseName(entry.fileName), used)
        used.add(base)

        const fontName = loadedFont.meta.family.zh || loadedFont.meta.family.en || base

        if (!entry.useFallback) {
          const coverCanvas = document.createElement('canvas')
          drawCover(coverCanvas, {
            name: fontName,
            fontFamily: entry.faceFamily!,
            width: DEFAULT_CONFIG.coverWidth,
            background,
            color: coverColor,
            bgImage: coverBgImage ?? undefined,
            bgOpacity: coverBgOpacity,
            showRibbon,
          })
          zipEntries.push({ name: `${base}-cover.${format}`, data: await canvasToBytes(coverCanvas) })
          imageCount++
        } else {
          const coverCanvas = document.createElement('canvas')
          renderCoverWithOpentype(coverCanvas, {
            fontBuffer: entry.loaded!.bytes.buffer.slice(entry.loaded!.bytes.byteOffset, entry.loaded!.bytes.byteOffset + entry.loaded!.bytes.byteLength) as ArrayBuffer,
            name: fontName,
            width: DEFAULT_CONFIG.coverWidth,
            background,
            color: coverColor,
            bgImage: coverBgImage ?? undefined,
            bgOpacity: coverBgOpacity,
            showRibbon,
          })
          zipEntries.push({ name: `${base}-cover.${format}`, data: await canvasToBytes(coverCanvas) })
          imageCount++
        }

        setGenDone((n) => n + 1)
      }

      // 逐个下载
      for (let i = 0; i < zipEntries.length; i++) {
        const entry = zipEntries[i]!
        const blob = new Blob([entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength) as ArrayBuffer], { type: mimeType(format) })
        downloadBlob(blob, entry.name)
        if (i < zipEntries.length - 1) await sleep(150)
      }
      showToast(`已生成 ${imageCount} 张图片`)
    } finally {
      setGenerating(false)
    }
  }

  const batchOkCount = batch ? batch.filter((entry) => entry.status === 'ok').length : 0

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt="" />
          <div>
            <h1>font2image</h1>
            <p className="subtitle">本地离线字体预览图生成器 · 选择字体 → 挑选诗词 → 生成图片（支持批量）</p>
          </div>
        </div>
      </header>

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>

      <div className="layout">
        <div className="panel-left">
          <div className="top-cards-row">
            <section className="card">
              <div
                className={`dropzone${dragOver ? ' dragover' : ''}${loaded || batch ? ' loaded' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const files = Array.from(e.dataTransfer.files)
                  if (files.length > 0) void handleFiles(files)
                }}
              >
                <div className="dropzone-icon">⬆</div>
                {loaded ? (
                  <div className="dropzone-text">
                    <strong>{loaded.fileName}</strong>
                    <span>单字体精调模式 · 拖入一个字体可替换，一次拖入多个进入批量模式</span>
                  </div>
                ) : batch ? (
                  <div className="dropzone-text">
                    <strong>批量模式 · {batch.length} 个字体{batchLoading ? '（解析中…）' : ''}</strong>
                    <span>重新拖入或选择文件将替换当前批次</span>
                  </div>
                ) : (
                  <div className="dropzone-text">
                    <strong>点击选择或拖入字体文件</strong>
                    <span>单个文件进入精调模式，多个文件进入批量模式 · 支持 .ttf / .otf / .woff / .ttc</span>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".ttf,.otf,.woff,.woff2,.ttc"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length > 0) void handleFiles(files)
                    e.target.value = ''
                  }}
                />
              </div>
            </section>

            {loaded && (
              <section className="card">
                <h2>字体信息与语种判定</h2>
                <dl className="meta-grid">
                  <dt>家族名</dt>
                  <dd className="family-name-edit">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setEditFamilyName(e.target.value)}
                      placeholder={autoFamilyName}
                      title="可修改字体名称，将同步到预览图与封面图"
                    />
                    {editFamilyName && (
                      <button className="ghost family-reset" onClick={() => setEditFamilyName('')} title="恢复原始名称">
                        还原
                      </button>
                    )}
                  </dd>
                  <dt>风格</dt>
                  <dd>{loaded.meta.style}</dd>
                  {multiWeightFaces.length > 1 && (
                    <>
                      <dt>粗体字重</dt>
                      <dd>
                        <select
                          value={gridBoldFace?.family ?? ''}
                          onChange={(e) => {
                            const family = e.target.value
                            const face = multiWeightFaces.find((f) => f.family === family) ?? null
                            setGridBoldFace(face)
                          }}
                          className="bold-weight-select"
                        >
                          {multiWeightFaces.map((f) => (
                            <option key={f.family} value={f.family}>
                              {f.name} ({f.weightClass})
                            </option>
                          ))}
                        </select>
                      </dd>
                    </>
                  )}
                  <dt>授权</dt>
                  <dd>{loaded.meta.license ?? '（字体未提供授权信息）'}</dd>
                  {(() => {
                    const c = loaded.charset
                    const labels: string[] = []
                    if (c.gbk > 0.5) labels.push('GBK')
                    else if (c.gb2312 > 0.5) labels.push('GB2312')
                    if (c.big5 > 0.5) labels.push('Big5')
                    if (labels.length === 0) return null
                    return (<><dt>字符集</dt><dd>{labels.join(' / ')}</dd></>)
                  })()}
                  <dt>字形总数</dt>
                  <dd>{loaded.charset.glyphCount > 0 ? loaded.charset.glyphCount.toLocaleString('zh-CN') : '—'}</dd>
                </dl>
                <div className="detect-row">
                  <span className="detect-label">判定结果</span>
                  <span className="badge-hover-wrap">
                    <span className="badge">{LANG_LABELS[loaded.detection.lang]}</span>
                    <div className="coverage-popup">
                      <div className="coverage-list">
                        {SCRIPT_ORDER.map((s) => (
                          <div className="coverage-row" key={s}>
                            <span className="label">{SCRIPT_LABELS[s]}</span>
                            <div className="coverage-bar">
                              <div style={{ width: `${Math.round(loaded.coverage[s] * 100)}%` }} />
                            </div>
                            <span className="pct">{Math.round(loaded.coverage[s] * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </span>
                  <button className="ghost" onClick={() => setSelected(loaded.detection.scripts)}>
                    恢复自动判定
                  </button>
                </div>
                <p className="hint">手动勾选要展示的字符类型（FR-3.4），至少保留一项：</p>
                <div className="checkbox-row">
                  {SCRIPT_ORDER.map((s) => (
                    <label className="chip" key={s}>
                      <input type="checkbox" checked={selected.includes(s)} onChange={() => toggleScript(s)} />
                      {SCRIPT_LABELS[s]}
                    </label>
                  ))}
                </div>
              </section>
            )}
          </div>

          {loaded && (
            <section className="card">
              <h2>预览内容编辑</h2>
              <p className="hint">自定义单字预览和多字重预览的内容</p>

              {/* 单字预览编辑 */}
              {(selected.includes('hans') || selected.includes('hant') || selected.includes('letter') || selected.includes('digit')) && (
                <div className="edit-section">
                  <h3>单字预览内容</h3>

                  {/* 中文诗歌选择（简繁共用，同时影响单字预览和多字重预览） */}
                  {(selected.includes('hans') || selected.includes('hant')) && (
                    <div className="edit-group">
                      <label className="edit-label">中文 · 五言诗</label>
                      <select
                        value={poemIndex}
                        onChange={(e) => setPoemIndex(Number(e.target.value))}
                        className="poem-select"
                      >
                        {HANS_POEMS.map((p, i) => (
                          <option key={i} value={i}>{p.title} · {p.author}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 英文和数字使用默认字符，无需编辑 */}
                  {(selected.includes('letter') || selected.includes('digit')) && (
                    <p className="hint" style={{ marginTop: '8px' }}>
                      英文大小写和数字使用默认字符集
                    </p>
                  )}
                </div>
              )}

              {/* 多字重预览编辑 */}
              {multiWeightFaces.length > 1 && (
                <div className="edit-section">
                  <h3>多字重预览</h3>
                  <p className="hint">调整字重显示顺序（从上到下）</p>

                  {/* 字重排序 */}
                  <div className="weight-order-list">
                    {multiWeightFaces.map((f, i) => (
                      <div
                        key={f.family}
                        className={`weight-order-item${dragWeightIndex === i ? ' dragging' : ''}`}
                        draggable
                        onDragStart={() => handleWeightDragStart(i)}
                        onDragOver={(e) => handleWeightDragOver(e, i)}
                        onDragEnd={handleWeightDragEnd}
                      >
                        <span className="weight-order-grip">⠿</span>
                        <span className="weight-order-name">{f.name} ({f.weightClass})</span>
                      </div>
                    ))}
                  </div>
                  <button className="ghost weight-reset-btn" onClick={resetWeightOrder}>
                    按字重数值排序
                  </button>
                </div>
              )}
            </section>
          )}

          {batch && (
            <section className="card">
              <h2>
                批量处理 · {batch.length} 个文件
                {batchLoading ? '（解析中…）' : `（可用 ${batchOkCount}）`}
              </h2>
              <div className="batch-list">
                {batch.map((entry, i) => (
                  <div key={`${entry.fileName}-${i}`} className={`batch-row${entry.status === 'error' ? ' failed' : ''}`}>
                    <div className="batch-main">
                      <span className="batch-name">{entry.fileName}</span>
                      {entry.status === 'ok' && entry.loaded ? (
                        <span className="batch-family">
                          {entry.loaded.meta.family.zh || entry.loaded.meta.family.en || fontBaseName(entry.fileName)}
                          {' · '}
                          {entry.loaded.meta.style}
                        </span>
                      ) : (
                        <span className="batch-error">{entry.error}</span>
                      )}
                    </div>
                    {entry.status === 'ok' && entry.loaded && (
                      <span className="badge">{LANG_LABELS[entry.loaded.detection.lang]}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="hint">
                批量模式：字符类型按每个字体的自动判定结果；格式、尺寸与背景沿用下方「输出选项」。
              </p>
              <button
                className="primary"
                onClick={() => void generateBatch()}
                disabled={generating || batchLoading || batchOkCount === 0}
              >
                {generating
                  ? `生成中 ${genDone}/${batchOkCount}…`
                  : `生成并下载（${batchOkCount} 个字体 × ${sizes.length} 个尺寸 + 封面）`}
              </button>
            </section>
          )}

          {(loaded || batch) && (
            <>
              <section className="card">
                <h2>输出选项</h2>
                <div className="options-row">
                  <label>
                    <span className="field-label">格式</span>
                    <select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}>
                      <option value="webp">webp（默认）</option>
                      <option value="png">png</option>
                      <option value="jpg">jpg（有损，不推荐）</option>
                    </select>
                  </label>
                  <div className="size-row">
                    <span className="field-label">尺寸</span>
                    {DEFAULT_CONFIG.sizes.map((n) => (
                      <label className="chip" key={n}>
                        <input type="checkbox" checked={sizes.includes(n)} onChange={() => toggleSize(n)} />
                        {n}px
                      </label>
                    ))}
                  </div>
                  <label className="chip">
                    <input type="checkbox" checked={transparentBg} onChange={(e) => setTransparentBg(e.target.checked)} />
                    透明背景（jpg 除外）
                  </label>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="panel-right">
          {loaded && (
            <section className="card preview-card">
              <h2>预览</h2>
              {coverPreview && coverPreview.dataUrl && (
                <div className="preview-item">
                  <div className="caption">{coverPreview.caption}</div>
                  <img
                    src={coverPreview.dataUrl}
                    alt={coverPreview.caption}
                    onClick={() => openLightbox(previewItems.findIndex((p) => p.caption === coverPreview.caption))}
                    style={{ cursor: 'pointer' }}
                  />
                  <div className="cover-bg-controls">
                    <div className="cover-bg-row">
                      <label className="cover-bg-label">封面背景图</label>
                      <input
                        ref={coverBgInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => setCoverBgImage(reader.result as string)
                          reader.readAsDataURL(file)
                        }}
                      />
                      <button className="ghost cover-bg-btn" onClick={() => coverBgInputRef.current?.click()}>
                        {coverBgImage ? '更换图片' : '上传图片'}
                      </button>
                      {coverBgImage && (
                        <button className="ghost cover-bg-btn" onClick={() => { setCoverBgImage(null); setCoverBgOpacity(0.35) }}>
                          移除
                        </button>
                      )}
                    </div>
                    {coverBgImage && (
                      <div className="cover-bg-row">
                        <label className="cover-bg-label">蒙版透明度</label>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={coverBgOpacity}
                          onChange={(e) => setCoverBgOpacity(Number(e.target.value))}
                          className="cover-bg-slider"
                        />
                        <span className="cover-bg-value">{Math.round(coverBgOpacity * 100)}%</span>
                      </div>
                    )}
                    {coverBgImage && (
                      <div className="cover-bg-row">
                        <label className="cover-bg-label">字体颜色</label>
                        <button
                          className={`ghost cover-bg-btn${coverWhiteText ? ' active' : ''}`}
                          onClick={() => setCoverWhiteText(!coverWhiteText)}
                        >
                          {coverWhiteText ? '白色' : '黑色'}
                        </button>
                      </div>
                    )}
                    <div className="cover-bg-row">
                      <label className="cover-bg-label">免费商用丝带</label>
                      <button
                        className={`ghost cover-bg-btn${showRibbon ? ' active' : ''}`}
                        onClick={() => setShowRibbon(!showRibbon)}
                      >
                        {showRibbon ? '显示' : '隐藏'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {gridPreview && gridPreview.dataUrl && (
                <div className="preview-item">
                  <div className="caption">{gridPreview.caption}</div>
                  <img
                    src={gridPreview.dataUrl}
                    alt={gridPreview.caption}
                    onClick={() => openLightbox(previewItems.findIndex((p) => p.caption === gridPreview.caption))}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
              )}
              {multiWeightPreview && multiWeightPreview.dataUrl && (
                <div className="preview-item">
                  <div className="caption">{multiWeightPreview.caption}</div>
                  <img
                    src={multiWeightPreview.dataUrl}
                    alt={multiWeightPreview.caption}
                    onClick={() => openLightbox(previewItems.findIndex((p) => p.caption === multiWeightPreview.caption))}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
              )}
              <button
                className="primary"
                onClick={() => void generate()}
                disabled={generating || !coverPreview?.dataUrl}
              >
                {generating
                  ? '生成中…'
                  : `生成并下载（封面${gridPreview?.dataUrl ? ' + 单字' : ''}${multiWeightPreview?.dataUrl ? ' + 多字重' : ''}）`}
              </button>
            </section>
          )}
        </div>
      </div>

      {lightboxIndex !== null && previewItems[lightboxIndex] && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={closeLightbox} title="关闭 (Esc)">✕</button>
            <img src={previewItems[lightboxIndex]!.dataUrl} alt={previewItems[lightboxIndex]!.caption} />
            <div className="lightbox-caption">
              {previewItems[lightboxIndex]!.caption}
              {previewItems.length > 1 && (
                <span className="lightbox-counter"> · {lightboxIndex + 1} / {previewItems.length}</span>
              )}
            </div>
          </div>
          {previewItems.length > 1 && (
            <>
              <button className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); lightboxPrev() }} title="上一张 (←)">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); lightboxNext() }} title="下一张 (→)">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </>
          )}
        </div>
      )}

      <footer className="footer">font2image · 离线渲染，不上传任何字体文件</footer>
    </div>
  )
}
