export interface ShowcaseSection {
  label: string
  lines: string[]
}

export interface DrawSpecimenOptions {
  name: string
  sections: ShowcaseSection[]
  fontFamily: string
  targetHeight: number
  background: string
  color: string
  maxWidth: number
}

export interface DrawSpecimenResult {
  width: number
  height: number
  lines: number
}

// 自包含绘制函数：渲染展示页布局（字体名称 + 分区背景 + 标签 + 内容）
// UI 直接 import 使用；CLI 通过 toString() 注入 Playwright 页面执行，两处逻辑完全一致。
export function drawSpecimen(canvas: HTMLCanvasElement, opts: DrawSpecimenOptions): DrawSpecimenResult {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')

  // 尺寸参数（匹配 HTML showcase CSS）
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

  // 第一遍：计算每个分区的高度和换行后的行
  const sectionData: { label: string; lines: string[]; height: number }[] = []
  for (const section of opts.sections) {
    const wrappedLines: string[] = []
    ctx.font = contentSize + 'px "' + opts.fontFamily + '", sans-serif'
    for (const line of section.lines) {
      if (line.length === 0) {
        wrappedLines.push('')
        continue
      }
      let current = ''
      for (const ch of line) {
        const test = current + ch
        if (ctx.measureText(test).width > maxContentWidth && current.length > 0) {
          wrappedLines.push(current)
          current = ch
        } else {
          current = test
        }
      }
      if (current.length > 0) wrappedLines.push(current)
    }
    const contentHeight = wrappedLines.length * contentLineHeight
    const height = (section.label ? labelLineHeight + Math.round(labelSize * 0.6) : 0) + contentHeight + sectionPadY * 2
    sectionData.push({ label: section.label, lines: wrappedLines, height })
  }

  // 计算字体名称区域高度
  const nameHeight = opts.name ? nameLineHeight + Math.round(nameSize * 0.4) : 0

  // 计算总高度
  let totalHeight = nameHeight + outerPadY * 2
  for (let i = 0; i < sectionData.length; i++) {
    totalHeight += sectionData[i].height
    if (i < sectionData.length - 1) totalHeight += sectionGap
  }

  // 计算最宽行（匹配 HTML showcase 的 fit-content 行为）
  let widestContent = 0
  if (opts.name) {
    ctx.font = 'bold ' + nameSize + 'px "' + opts.fontFamily + '", sans-serif'
    const w = ctx.measureText(opts.name).width
    if (w > widestContent) widestContent = w
  }
  for (const sec of sectionData) {
    for (const line of sec.lines) {
      ctx.font = contentSize + 'px "' + opts.fontFamily + '", sans-serif'
      const w = ctx.measureText(line).width
      if (w > widestContent) widestContent = w
    }
    // 标签宽度
    if (sec.label) {
      ctx.font = labelSize + 'px sans-serif'
      const w = ctx.measureText(sec.label).width
      if (w > widestContent) widestContent = w
    }
  }

  // 画布宽度跟随内容（匹配 HTML showcase 的 fit-content 行为）
  const width = Math.max(1, Math.min(opts.maxWidth, Math.round(widestContent + outerPadX * 2 + sectionPadX * 2)))
  const height = Math.max(1, totalHeight)
  canvas.width = width
  canvas.height = height

  // 绘制背景
  if (opts.background !== 'transparent') {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, height)
  }

  // 绘制字体名称
  let y = outerPadY
  if (opts.name) {
    ctx.font = 'bold ' + nameSize + 'px "' + opts.fontFamily + '", sans-serif'
    ctx.fillStyle = opts.color
    ctx.textBaseline = 'top'
    const nameWidth = ctx.measureText(opts.name).width
    ctx.fillText(opts.name, (width - nameWidth) / 2, y)
    y += nameHeight
  }

  // 分区背景色
  const sectionBg = '#f4f5f7'

  // 绘制各分区
  for (const sec of sectionData) {
    // 绘制分区背景（圆角矩形）
    ctx.fillStyle = sectionBg
    var sx = outerPadX
    var sy = y
    var sw = width - outerPadX * 2
    var sh = sec.height
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

    // 绘制标签
    var textY = y + sectionPadY
    if (sec.label) {
      ctx.font = labelSize + 'px sans-serif'
      ctx.fillStyle = '#888888'
      ctx.textBaseline = 'top'
      ctx.fillText(sec.label, outerPadX + sectionPadX, textY)
      textY += labelLineHeight + Math.round(labelSize * 0.6)
    }

    // 绘制内容行（左对齐，匹配 HTML showcase）
    ctx.font = contentSize + 'px "' + opts.fontFamily + '", sans-serif'
    ctx.fillStyle = opts.color
    ctx.textBaseline = 'top'
    for (const line of sec.lines) {
      ctx.fillText(line, outerPadX + sectionPadX, textY)
      textY += contentLineHeight
    }

    y += sec.height + sectionGap
  }

  return { width, height, lines: sectionData.reduce(function(sum, s) { return sum + s.lines.length }, 0) }
}

export function mimeType(format: 'png' | 'webp' | 'jpg'): string {
  if (format === 'webp') return 'image/webp'
  if (format === 'jpg') return 'image/jpeg'
  return 'image/png'
}

export interface DrawCoverOptions {
  name: string
  fontFamily: string
  width: number
  background: string
  color: string
  bgImage?: string
  bgOpacity?: number
  showRibbon?: boolean
}

export interface DrawCoverResult {
  width: number
  height: number
}

// 封面绘制：600×340，白底居中字体名称 + 右上角黄色「免费商用」丝带。
// 支持自定义背景图片 + 黑色透明蒙版。
// 注意：函数体内不得出现嵌套函数/闭包——tsx 会为其注入 __name 包装，
// toString() 注入页面后该 helper 不存在，会导致运行时报错。
export function drawCover(canvas: HTMLCanvasElement, opts: DrawCoverOptions): DrawCoverResult {
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
      // 黑色蒙版
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

  let nameSize = Math.round(height * 0.28)
  ctx.font = nameSize + 'px "' + opts.fontFamily + '", sans-serif'
  while (nameSize > 14 && ctx.measureText(opts.name).width > maxTextWidth) {
    nameSize -= 1
    ctx.font = nameSize + 'px "' + opts.fontFamily + '", sans-serif'
  }

  ctx.fillStyle = opts.color
  ctx.textBaseline = 'middle'
  ctx.font = nameSize + 'px "' + opts.fontFamily + '", sans-serif'
  const nameWidth = ctx.measureText(opts.name).width
  ctx.fillText(opts.name, (width - nameWidth) / 2, height / 2)

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

export interface DrawCharGridOptions {
  width: number
  fontFamily: string
  background: string
  color: string
  groups: { label: string; chars: string[] }[]
}

export interface DrawCharGridResult {
  width: number
  height: number
}

// 单字预览网格：固定宽度，分组展示字符，每个字符在方框内，左上角显示默认字体小字
// 注意：函数体内不得出现嵌套函数/闭包。
export function drawCharGrid(canvas: HTMLCanvasElement, opts: DrawCharGridOptions): DrawCharGridResult {
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

  // 第一遍：计算总高度
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

  // 第二遍：绘制
  var y = padX
  for (var gi2 = 0; gi2 < opts.groups.length; gi2++) {
    var grp = opts.groups[gi2]!
    if (grp.chars.length === 0) continue

    // 分组标签
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

      // 左上角小字（默认字体）
      ctx.font = labelSize + 'px sans-serif'
      ctx.fillStyle = '#999999'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(ch, cx + Math.round(cellW * 0.06), cy + Math.round(cellH * 0.06))

      // 中心大字（加载的字体）
      ctx.font = charSize + 'px "' + opts.fontFamily + '", sans-serif'
      ctx.fillStyle = opts.color
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText(ch, cx + cellW / 2, cy + cellH / 2)
    }

    var usedRows = Math.ceil(grp.chars.length / cols)
    y += usedRows * cellH + groupGap
  }

  return { width: width, height: totalHeight }
}

export interface WeightFace {
  name: string
  fontFamily: string
}

export interface DrawMultiWeightOptions {
  width: number
  background: string
  color: string
  text: string
  faces: WeightFace[]
  fontSize: number
}

export interface DrawMultiWeightResult {
  width: number
  height: number
}

// 多字重预览：固定宽度，每行展示一个字重的文本 + 标签。所有行显示相同文本。
// 注意：函数体内不得出现嵌套函数/闭包。
export function drawMultiWeight(canvas: HTMLCanvasElement, opts: DrawMultiWeightOptions): DrawMultiWeightResult {
  var width = Math.max(300, Math.round(opts.width))
  var ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')

  var padX = Math.round(width * 0.05)
  var padY = Math.round(width * 0.04)
  var labelSize = Math.max(12, Math.round(opts.fontSize * 0.22))
  var lineHeight = Math.round(opts.fontSize * 1.5)
  var rowHeight = lineHeight + labelSize + Math.round(padY * 0.6)

  var totalHeight = padY * 2 + opts.faces.length * rowHeight
  canvas.width = width
  canvas.height = totalHeight

  if (opts.background !== 'transparent') {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, totalHeight)
  }

  var y = padY
  for (var i = 0; i < opts.faces.length; i++) {
    var face = opts.faces[i]!

    // 字重标签
    ctx.font = labelSize + 'px sans-serif'
    ctx.fillStyle = '#999999'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(face.name, padX, y)

    // 文本（使用该字重的字体）
    ctx.font = opts.fontSize + 'px "' + face.fontFamily + '", sans-serif'
    ctx.fillStyle = opts.color
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(opts.text, padX, y + labelSize + Math.round(padY * 0.3))

    y += rowHeight
  }

  return { width: width, height: totalHeight }
}