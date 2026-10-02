import { parse } from 'opentype.js'
import type { ShowcaseSection } from './draw'

export interface OpentypeRenderOptions {
  fontBuffer: ArrayBuffer
  name: string
  sections: ShowcaseSection[]
  targetHeight: number
  background: string
  color: string
  maxWidth: number
}

export function renderWithOpentype(
  canvas: HTMLCanvasElement,
  opts: OpentypeRenderOptions,
): { width: number; height: number } {
  const font = parse(opts.fontBuffer)

  const nameSize = Math.max(16, Math.round(opts.targetHeight * 0.45))
  const labelSize = Math.max(8, Math.round(opts.targetHeight * 0.12))
  const contentSize = Math.max(10, Math.round(opts.targetHeight * 0.28))
  const nameLineHeight = Math.round(nameSize * 1.3)
  const labelLineHeight = Math.round(labelSize * 1.4)
  const contentLineHeight = Math.round(contentSize * 1.7)
  const sectionPadX = Math.round(opts.targetHeight * 0.15)
  const sectionPadY = Math.round(opts.targetHeight * 0.13)
  const sectionGap = Math.round(opts.targetHeight * 0.1)
  const outerPadX = Math.round(opts.targetHeight * 0.15)
  const outerPadY = Math.round(opts.targetHeight * 0.1)
  const borderRadius = Math.round(opts.targetHeight * 0.1)
  const maxContentWidth = Math.max(100, opts.maxWidth - outerPadX * 2 - sectionPadX * 2)

  const ascenderRatio = font.ascender / font.unitsPerEm

  function measureText(text: string, fontSize: number): number {
    const s = fontSize / font.unitsPerEm
    let width = 0
    for (let i = 0; i < text.length; i++) {
      const glyph = font.charToGlyph(text[i]!)
      width += glyph.advanceWidth! * s
      if (i < text.length - 1) {
        const nextGlyph = font.charToGlyph(text[i + 1]!)
        const kern = font.getKerningValue(glyph, nextGlyph)
        if (kern) width += kern * s
      }
    }
    return width
  }

  function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    if (text.length === 0) return ['']
    const lines: string[] = []
    let current = ''
    for (const ch of text) {
      const test = current + ch
      if (measureText(test, fontSize) > maxWidth && current.length > 0) {
        lines.push(current)
        current = ch
      } else {
        current = test
      }
    }
    if (current.length > 0) lines.push(current)
    return lines
  }

  const sectionData: { label: string; lines: string[]; height: number }[] = []
  for (const section of opts.sections) {
    const wrappedLines: string[] = []
    for (const line of section.lines) {
      wrappedLines.push(...wrapText(line, maxContentWidth, contentSize))
    }
    const contentHeight = wrappedLines.length * contentLineHeight
    const height = (section.label ? labelLineHeight + Math.round(labelSize * 0.6) : 0) + contentHeight + sectionPadY * 2
    sectionData.push({ label: section.label, lines: wrappedLines, height })
  }

  const nameHeight = opts.name ? nameLineHeight + Math.round(nameSize * 0.4) : 0

  let totalHeight = nameHeight + outerPadY * 2
  for (let i = 0; i < sectionData.length; i++) {
    totalHeight += sectionData[i].height
    if (i < sectionData.length - 1) totalHeight += sectionGap
  }

  let widestContent = 0
  if (opts.name) {
    const w = measureText(opts.name, nameSize)
    if (w > widestContent) widestContent = w
  }
  for (const sec of sectionData) {
    for (const line of sec.lines) {
      const w = measureText(line, contentSize)
      if (w > widestContent) widestContent = w
    }
    if (sec.label) {
      const w = measureText(sec.label, labelSize)
      if (w > widestContent) widestContent = w
    }
  }

  // 画布宽度跟随内容（匹配 HTML showcase 的 fit-content 行为）
  const width = Math.max(1, Math.min(opts.maxWidth, Math.round(widestContent + outerPadX * 2 + sectionPadX * 2)))
  const height = Math.max(1, totalHeight)
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')

  if (opts.background !== 'transparent') {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, height)
  }

  // 使用 glyph path 渲染文本（y 为文本顶部位置，匹配 textBaseline='top'）
  function renderGlyphText(text: string, x: number, topY: number, fontSize: number, fillColor: string) {
    const baselineY = topY + fontSize * ascenderRatio
    const s = fontSize / font.unitsPerEm
    let currentX = x
    for (let i = 0; i < text.length; i++) {
      const glyph = font.charToGlyph(text[i]!)
      const path = glyph.getPath(currentX, baselineY, fontSize)
      ctx!.fillStyle = fillColor
      path.draw(ctx!)
      currentX += glyph.advanceWidth! * s
      if (i < text.length - 1) {
        const nextGlyph = font.charToGlyph(text[i + 1]!)
        const kern = font.getKerningValue(glyph, nextGlyph)
        if (kern) currentX += kern * s
      }
    }
  }

  // 绘制字体名称
  let y = outerPadY
  if (opts.name) {
    const nameWidth = measureText(opts.name, nameSize)
    renderGlyphText(opts.name, (width - nameWidth) / 2, y, nameSize, opts.color)
    y += nameHeight
  }

  const sectionBg = '#f4f5f7'

  for (const sec of sectionData) {
    ctx.fillStyle = sectionBg
    const sx = outerPadX
    const sy = y
    const sw = width - outerPadX * 2
    const sh = sec.height
    ctx.beginPath()
    ctx.moveTo(sx + borderRadius, sy)
    ctx.lineTo(sx + sw - borderRadius, sy)
    ctx.quadraticCurveTo(sx + sw, sy, sx + sw, sy + borderRadius)
    ctx.lineTo(sx + sw, sy + sh - borderRadius)
    ctx.quadraticCurveTo(sx + sw, sy + sh, sx + sw - borderRadius, sy + sh)
    ctx.lineTo(sx + borderRadius, sy + sh)
    ctx.quadraticCurveTo(sx, sy + sh, sx, sy + sh - borderRadius)
    ctx.lineTo(sx, sy + borderRadius)
    ctx.quadraticCurveTo(sx, sy, sx + borderRadius, sy)
    ctx.closePath()
    ctx.fill()

    let textY = y + sectionPadY
    if (sec.label) {
      // 标签使用系统 sans-serif 字体（匹配 draw.ts）
      ctx.font = labelSize + 'px sans-serif'
      ctx.fillStyle = '#888888'
      ctx.textBaseline = 'top'
      ctx.fillText(sec.label, outerPadX + sectionPadX, textY)
      textY += labelLineHeight + Math.round(labelSize * 0.6)
    }

    for (const line of sec.lines) {
      renderGlyphText(line, outerPadX + sectionPadX, textY, contentSize, opts.color)
      textY += contentLineHeight
    }

    y += sec.height + sectionGap
  }

  return { width, height }
}

// opentype.js 封面渲染（匹配 drawCover 的 600×340 布局 + 丝带 + 背景图蒙版）
export interface OpentypeCoverOptions {
  fontBuffer: ArrayBuffer
  name: string
  width: number
  background: string
  color: string
  bgImage?: string
  bgOpacity?: number
  showRibbon?: boolean
}

export function renderCoverWithOpentype(
  canvas: HTMLCanvasElement,
  opts: OpentypeCoverOptions,
): { width: number; height: number } {
  const font = parse(opts.fontBuffer)
  const width = Math.max(300, Math.round(opts.width))
  const height = Math.round(width * 340 / 600)
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')

  // 绘制背景图片或纯色
  if (opts.bgImage) {
    var bgImg = new Image()
    bgImg.src = opts.bgImage
    if (bgImg.complete && bgImg.naturalWidth > 0) {
      var scale = Math.max(width / bgImg.naturalWidth, height / bgImg.naturalHeight)
      var imgW = bgImg.naturalWidth * scale
      var imgH = bgImg.naturalHeight * scale
      var imgX = (width - imgW) / 2
      var imgY = (height - imgH) / 2
      ctx.drawImage(bgImg, imgX, imgY, imgW, imgH)
      var opacity = opts.bgOpacity !== undefined ? opts.bgOpacity : 0.35
      ctx.fillStyle = 'rgba(0,0,0,' + opacity + ')'
      ctx.fillRect(0, 0, width, height)
    } else if (opts.background !== 'transparent') {
      ctx.fillStyle = opts.background
      ctx.fillRect(0, 0, width, height)
    }
  } else if (opts.background !== 'transparent') {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, height)
  }

  const padX = Math.round(width * 0.08)
  const maxTextWidth = width - padX * 2

  const ascenderRatio = font.ascender / font.unitsPerEm

  function measureName(fontSize: number): number {
    const s = fontSize / font.unitsPerEm
    let w = 0
    for (let i = 0; i < opts.name.length; i++) {
      const glyph = font.charToGlyph(opts.name[i]!)
      w += glyph.advanceWidth! * s
      if (i < opts.name.length - 1) {
        const next = font.charToGlyph(opts.name[i + 1]!)
        const kern = font.getKerningValue(glyph, next)
        if (kern) w += kern * s
      }
    }
    return w
  }

  let nameSize = Math.round(height * 0.28)
  while (nameSize > 14 && measureName(nameSize) > maxTextWidth) {
    nameSize -= 1
  }

  // 使用 glyph path 渲染居中字体名称
  const nameWidth = measureName(nameSize)
  const startX = (width - nameWidth) / 2
  const baselineY = height / 2 + nameSize * ascenderRatio * 0.05
  const s = nameSize / font.unitsPerEm
  let currentX = startX
  for (let i = 0; i < opts.name.length; i++) {
    const glyph = font.charToGlyph(opts.name[i]!)
    const path = glyph.getPath(currentX, baselineY, nameSize)
    ctx.fillStyle = opts.color
    path.draw(ctx)
    currentX += glyph.advanceWidth! * s
    if (i < opts.name.length - 1) {
      const next = font.charToGlyph(opts.name[i + 1]!)
      const kern = font.getKerningValue(glyph, next)
      if (kern) currentX += kern * s
    }
  }

  // 右上角黄色「免费商用」丝带（可通过 showRibbon 控制）
  if (opts.showRibbon !== false) {
    var ribbonH = Math.round(height * 0.18)
    var ribbonW = Math.round(ribbonH * 6)
    ctx.save()
    ctx.translate(width - ribbonH * 1.2, ribbonH * 1.2)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#f5c518'
    ctx.fillRect(-ribbonW / 2, -ribbonH / 2, ribbonW, ribbonH)
    var ribbonFontSize = Math.round(ribbonH * 0.6)
    ctx.font = 'bold ' + ribbonFontSize + 'px sans-serif'
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('免费商用', 0, 0)
    ctx.restore()
  }

  return { width, height }
}

// opentype.js 单字网格渲染（匹配 drawCharGrid 布局）
export interface OpentypeCharGridOptions {
  fontBuffer: ArrayBuffer
  width: number
  background: string
  color: string
  groups: { label: string; chars: string[] }[]
}

export function renderCharGridWithOpentype(
  canvas: HTMLCanvasElement,
  opts: OpentypeCharGridOptions,
): { width: number; height: number } {
  const font = parse(opts.fontBuffer)
  const ascenderRatio = font.ascender / font.unitsPerEm

  var width = Math.max(300, Math.round(opts.width))
  var ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')

  var padX = Math.round(width * 0.04)
  var contentWidth = width - padX * 2
  var cols = Math.floor(contentWidth / 90)
  if (cols < 4) cols = 4
  var cellW = Math.floor(contentWidth / cols)
  var cellH = cellW
  var labelSize = Math.max(10, Math.round(cellW * 0.12))
  var charSize = Math.max(16, Math.round(cellW * 0.55))
  var groupLabelH = Math.round(labelSize * 2.5)
  var groupGap = Math.round(cellH * 0.4)
  var boxBorder = 1

  // 计算总高度
  var totalHeight = padX
  for (var gi = 0; gi < opts.groups.length; gi++) {
    var group = opts.groups[gi]!
    if (group.chars.length === 0) continue
    totalHeight += groupLabelH
    var rows = Math.ceil(group.chars.length / cols)
    totalHeight += rows * cellH
    totalHeight += groupGap
  }
  totalHeight += padX

  canvas.width = width
  canvas.height = totalHeight

  if (opts.background !== 'transparent') {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, totalHeight)
  }

  function drawGlyph(char: string, centerX: number, centerY: number, fontSize: number, fillColor: string) {
    var glyph = font.charToGlyph(char)
    var s = fontSize / font.unitsPerEm
    var glyphWidth = glyph.advanceWidth! * s
    var startX = centerX - glyphWidth / 2
    var baselineY = centerY + fontSize * ascenderRatio * 0.15
    var path = glyph.getPath(startX, baselineY, fontSize)
    ctx!.fillStyle = fillColor
    path.draw(ctx!)
  }

  // 绘制
  var y = padX
  for (var gi2 = 0; gi2 < opts.groups.length; gi2++) {
    var grp = opts.groups[gi2]!
    if (grp.chars.length === 0) continue

    // 分组标签（使用系统字体）
    ctx.font = 'bold ' + labelSize + 'px sans-serif'
    ctx.fillStyle = '#666666'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(grp.label, padX, y + groupLabelH / 2)
    y += groupLabelH

    // 字符网格
    for (var ci = 0; ci < grp.chars.length; ci++) {
      var col = ci % cols
      var row = Math.floor(ci / cols)
      var cx = padX + col * cellW
      var cy = y + row * cellH
      var ch = grp.chars[ci]!

      // 绘制方框
      ctx.strokeStyle = '#e0e0e0'
      ctx.lineWidth = boxBorder
      ctx.strokeRect(cx + boxBorder, cy + boxBorder, cellW - boxBorder * 2, cellH - boxBorder * 2)

      // 左上角小字（系统字体）
      ctx.font = labelSize + 'px sans-serif'
      ctx.fillStyle = '#999999'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(ch, cx + Math.round(cellW * 0.06), cy + Math.round(cellH * 0.06))

      // 中心大字（glyph path）
      drawGlyph(ch, cx + cellW / 2, cy + cellH / 2, charSize, opts.color)
    }

    var usedRows = Math.ceil(grp.chars.length / cols)
    y += usedRows * cellH + groupGap
  }

  return { width: width, height: totalHeight }
}

// opentype.js 多字重预览渲染（匹配 drawMultiWeight 布局）
export interface OpentypeMultiWeightOptions {
  fontBuffers: { name: string; buffer: ArrayBuffer }[]
  width: number
  background: string
  color: string
  text: string
  fontSize: number
}

export function renderMultiWeightWithOpentype(
  canvas: HTMLCanvasElement,
  opts: OpentypeMultiWeightOptions,
): { width: number; height: number } {
  var width = Math.max(300, Math.round(opts.width))
  var ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')

  var padX = Math.round(width * 0.05)
  var padY = Math.round(width * 0.04)
  var labelSize = Math.max(12, Math.round(opts.fontSize * 0.22))
  var lineHeight = Math.round(opts.fontSize * 1.5)
  var rowHeight = lineHeight + labelSize + Math.round(padY * 0.6)

  var totalHeight = padY * 2 + opts.fontBuffers.length * rowHeight
  canvas.width = width
  canvas.height = totalHeight

  if (opts.background !== 'transparent') {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, totalHeight)
  }

  var y = padY
  for (var i = 0; i < opts.fontBuffers.length; i++) {
    var item = opts.fontBuffers[i]!
    var font = parse(item.buffer)
    var ascenderRatio = font.ascender / font.unitsPerEm
    var textStr = opts.text

    // 字重标签
    ctx.font = labelSize + 'px sans-serif'
    ctx.fillStyle = '#999999'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(item.name, padX, y)

    // 文本（glyph path）
    var textY = y + labelSize + Math.round(padY * 0.3)
    var baselineY = textY + opts.fontSize * ascenderRatio * 0.55
    var s = opts.fontSize / font.unitsPerEm
    var currentX = padX
    for (var ci = 0; ci < textStr.length; ci++) {
      var glyph = font.charToGlyph(textStr[ci]!)
      var path = glyph.getPath(currentX, baselineY, opts.fontSize)
      ctx.fillStyle = opts.color
      path.draw(ctx)
      currentX += glyph.advanceWidth! * s
      if (ci < textStr.length - 1) {
        var next = font.charToGlyph(textStr[ci + 1]!)
        var kern = font.getKerningValue(glyph, next)
        if (kern) currentX += kern * s
      }
    }

    y += rowHeight
  }

  return { width: width, height: totalHeight }
}
