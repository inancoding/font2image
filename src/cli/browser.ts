import { chromium, type Browser, type Page } from 'playwright-core'
import { drawCharGrid, drawCover, drawMultiWeight, drawSpecimen, mimeType, type ShowcaseSection } from '../render/draw'
import type { OutputFormat } from '../core/types'

const PAGE_HTML =
  '<!doctype html><html><head><meta charset="utf-8"></head>' +
  '<body style="margin:0"><canvas id="c"></canvas></body></html>'

export interface RenderArgs {
  fontBytes: Uint8Array
  name: string
  sections: ShowcaseSection[]
  targetHeight: number
  background: string
  color: string
  maxWidth: number
  format: OutputFormat
  quality: number
}

export interface CoverArgs {
  fontBytes: Uint8Array
  name: string
  width: number
  background: string
  color: string
  format: OutputFormat
  quality: number
}

export interface RenderResult {
  width: number
  height: number
  base64: string
}

export interface CharGridArgs {
  fontBytes: Uint8Array
  width: number
  background: string
  color: string
  format: OutputFormat
  quality: number
  groups: { label: string; chars: string[] }[]
}

export interface MultiWeightFace {
  fontBytes: Uint8Array
  name: string
  family: string
}

export interface MultiWeightArgs {
  faces: MultiWeightFace[]
  width: number
  background: string
  color: string
  format: OutputFormat
  quality: number
  text: string
  fontSize: number
}

// 复用本机 Edge/Chrome 的无头渲染会话（FR-7.3：与 UI 共用 drawSpecimen / drawCover）
export class RenderSession {
  private browser: Browser | null = null
  private page: Page | null = null
  private familySeq = 0

  async start(): Promise<string> {
    const failures: string[] = []
    for (const channel of ['msedge', 'chrome'] as const) {
      try {
        this.browser = await chromium.launch({ channel })
        break
      } catch (err) {
        failures.push(`${channel}: ${(err as Error).message.split('\n')[0]}`)
      }
    }
    if (!this.browser) {
      throw new Error(
        '未找到可用的本机浏览器（已尝试 Edge 与 Chrome）：\n  ' + failures.join('\n  '),
      )
    }
    this.page = await this.browser.newPage()
    await this.page.setContent(PAGE_HTML)
    await this.page.addScriptTag({
      content:
        `window.__drawSpecimen = ${drawSpecimen.toString()};` +
        `window.__drawCover = ${drawCover.toString()};` +
        `window.__drawCharGrid = ${drawCharGrid.toString()};` +
        `window.__drawMultiWeight = ${drawMultiWeight.toString()};`,
    })
    const channelName = (this.browser as unknown as { _name?: string })._name ?? 'browser'
    return channelName
  }

  async render(args: RenderArgs): Promise<RenderResult> {
    if (!this.page) throw new Error('RenderSession 尚未启动')
    const family = `f2i-${++this.familySeq}`
    const fontB64 = Buffer.from(args.fontBytes).toString('base64')
    const mime = mimeType(args.format)

    return this.page.evaluate(
      async (a: {
        fontB64: string
        family: string
        name: string
        sections: { label: string; lines: string[] }[]
        targetHeight: number
        background: string
        color: string
        maxWidth: number
        format: OutputFormat
        quality: number
        mime: string
      }) => {
        const bin = atob(a.fontB64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

        const face = new FontFace(a.family, bytes)
        await face.load()
        document.fonts.add(face)

        try {
          const canvas = document.getElementById('c') as HTMLCanvasElement
          const draw = (
            window as unknown as {
              __drawSpecimen: (
                canvas: HTMLCanvasElement,
                opts: {
                  name: string
                  sections: { label: string; lines: string[] }[]
                  fontFamily: string
                  targetHeight: number
                  background: string
                  color: string
                  maxWidth: number
                },
              ) => { width: number; height: number }
            }
          ).__drawSpecimen
          const dims = draw(canvas, {
            name: a.name,
            sections: a.sections,
            fontFamily: a.family,
            targetHeight: a.targetHeight,
            background: a.background,
            color: a.color,
            maxWidth: a.maxWidth,
          })
          const quality = a.format === 'png' ? undefined : a.quality / 100
          const url = canvas.toDataURL(a.mime, quality)
          const base64 = url.slice(url.indexOf(',') + 1)
          return { width: dims.width, height: dims.height, base64 }
        } finally {
          document.fonts.delete(face)
        }
      },
      {
        fontB64,
        family,
        name: args.name,
        sections: args.sections,
        targetHeight: args.targetHeight,
        background: args.background,
        color: args.color,
        maxWidth: args.maxWidth,
        format: args.format,
        quality: args.quality,
        mime,
      },
    )
  }

  async renderCover(args: CoverArgs): Promise<RenderResult> {
    if (!this.page) throw new Error('RenderSession 尚未启动')
    const family = `f2i-${++this.familySeq}`
    const fontB64 = Buffer.from(args.fontBytes).toString('base64')
    const mime = mimeType(args.format)

    return this.page.evaluate(
      async (a: {
        fontB64: string
        family: string
        name: string
        width: number
        background: string
        color: string
        format: OutputFormat
        quality: number
        mime: string
      }) => {
        const bin = atob(a.fontB64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

        const face = new FontFace(a.family, bytes)
        await face.load()
        document.fonts.add(face)

        try {
          const canvas = document.getElementById('c') as HTMLCanvasElement
          const draw = (
            window as unknown as {
              __drawCover: (
                canvas: HTMLCanvasElement,
                opts: { name: string; fontFamily: string; width: number; background: string; color: string },
              ) => { width: number; height: number }
            }
          ).__drawCover
          const dims = draw(canvas, {
            name: a.name,
            fontFamily: a.family,
            width: a.width,
            background: a.background,
            color: a.color,
          })
          const quality = a.format === 'png' ? undefined : a.quality / 100
          const url = canvas.toDataURL(a.mime, quality)
          const base64 = url.slice(url.indexOf(',') + 1)
          return { width: dims.width, height: dims.height, base64 }
        } finally {
          document.fonts.delete(face)
        }
      },
      {
        fontB64,
        family,
        name: args.name,
        width: args.width,
        background: args.background,
        color: args.color,
        format: args.format,
        quality: args.quality,
        mime,
      },
    )
  }

  async renderCharGrid(args: CharGridArgs): Promise<RenderResult> {
    if (!this.page) throw new Error('RenderSession 尚未启动')
    const family = `f2i-${++this.familySeq}`
    const fontB64 = Buffer.from(args.fontBytes).toString('base64')
    const mime = mimeType(args.format)

    return this.page.evaluate(
      async (a: {
        fontB64: string
        family: string
        width: number
        background: string
        color: string
        format: OutputFormat
        quality: number
        mime: string
        groups: { label: string; chars: string[] }[]
      }) => {
        const bin = atob(a.fontB64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

        const face = new FontFace(a.family, bytes)
        await face.load()
        document.fonts.add(face)

        try {
          const canvas = document.getElementById('c') as HTMLCanvasElement
          const draw = (
            window as unknown as {
              __drawCharGrid: (
                canvas: HTMLCanvasElement,
                opts: {
                  width: number
                  fontFamily: string
                  background: string
                  color: string
                  groups: { label: string; chars: string[] }[]
                },
              ) => { width: number; height: number }
            }
          ).__drawCharGrid
          const dims = draw(canvas, {
            width: a.width,
            fontFamily: a.family,
            background: a.background,
            color: a.color,
            groups: a.groups,
          })
          const quality = a.format === 'png' ? undefined : a.quality / 100
          const url = canvas.toDataURL(a.mime, quality)
          const base64 = url.slice(url.indexOf(',') + 1)
          return { width: dims.width, height: dims.height, base64 }
        } finally {
          document.fonts.delete(face)
        }
      },
      {
        fontB64,
        family,
        width: args.width,
        background: args.background,
        color: args.color,
        format: args.format,
        quality: args.quality,
        mime,
        groups: args.groups,
      },
    )
  }

  async renderMultiWeight(args: MultiWeightArgs): Promise<RenderResult> {
    if (!this.page) throw new Error('RenderSession 尚未启动')
    const mime = mimeType(args.format)
    const startSeq = this.familySeq

    // 加载所有字重字体
    const fontB64s: string[] = []
    const families: string[] = []
    for (const face of args.faces) {
      this.familySeq++
      fontB64s.push(Buffer.from(face.fontBytes).toString('base64'))
      families.push(face.family)
    }

    return this.page.evaluate(
      async (a: {
        fontB64s: string[]
        families: string[]
        weightNames: string[]
        width: number
        background: string
        color: string
        format: OutputFormat
        quality: number
        mime: string
        text: string
        fontSize: number
      }) => {
        const loadedFamilies: string[] = []
        for (let i = 0; i < a.fontB64s.length; i++) {
          const bin = atob(a.fontB64s[i]!)
          const bytes = new Uint8Array(bin.length)
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j)
          const face = new FontFace(a.families[i]!, bytes)
          await face.load()
          document.fonts.add(face)
          loadedFamilies.push(a.families[i]!)
        }

        try {
          const canvas = document.getElementById('c') as HTMLCanvasElement
          const draw = (
            window as unknown as {
              __drawMultiWeight: (
                canvas: HTMLCanvasElement,
                opts: {
                  width: number
                  background: string
                  color: string
                  text: string
                  faces: { name: string; fontFamily: string }[]
                  fontSize: number
                },
              ) => { width: number; height: number }
            }
          ).__drawMultiWeight
          const faces = a.weightNames.map(function(name, i) {
            return { name: name, fontFamily: a.families[i]! }
          })
          const dims = draw(canvas, {
            width: a.width,
            background: a.background,
            color: a.color,
            text: a.text,
            faces: faces,
            fontSize: a.fontSize,
          })
          const quality = a.format === 'png' ? undefined : a.quality / 100
          const url = canvas.toDataURL(a.mime, quality)
          const base64 = url.slice(url.indexOf(',') + 1)
          return { width: dims.width, height: dims.height, base64 }
        } finally {
          for (const fam of loadedFamilies) {
            const fonts = document.fonts
            const iter = fonts.values()
            let entry = iter.next()
            while (!entry.done) {
              if (entry.value.family === fam) {
                fonts.delete(entry.value)
                break
              }
              entry = iter.next()
            }
          }
        }
      },
      {
        fontB64s,
        families,
        weightNames: args.faces.map((f) => f.name),
        width: args.width,
        background: args.background,
        color: args.color,
        format: args.format,
        quality: args.quality,
        mime,
        text: args.text,
        fontSize: args.fontSize,
      },
    )
  }

  async close(): Promise<void> {
    await this.browser?.close()
    this.browser = null
    this.page = null
  }
}
