declare module 'opentype.js' {
  export interface FontNames {
    [key: string]: unknown
  }

  export interface MaxpTable {
    numGlyphs?: number
  }

  export interface FontTables {
    maxp?: MaxpTable
    [tag: string]: unknown
  }

  export interface Path {
    fill?: string
    stroke?: string
    commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]
    draw(ctx: CanvasRenderingContext2D): void
  }

  export interface Glyph {
    advanceWidth?: number
    leftSideBearing?: number
    getKerningValue(other: Glyph): number
    getPath(x: number, y: number, fontSize: number): Path
    index: number
    name: string | null
    unicode: number | undefined
  }

  export interface Font {
    names: FontNames
    tables: FontTables
    unitsPerEm: number
    ascender: number
    descender: number
    charToGlyphIndex(ch: string): number
    charToGlyph(ch: string): Glyph
    getKerningValue(leftGlyph: Glyph, rightGlyph: Glyph): number
  }

  export function parse(buffer: ArrayBuffer): Font
}
