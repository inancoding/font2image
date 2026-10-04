// Unicode 块定义：用于字体覆盖率可视化
export interface UnicodeBlock {
  name: string
  start: number
  end: number
  category: 'latin' | 'cjk' | 'other'
}

// 常用 Unicode 块（聚焦字体预览相关）
export const UNICODE_BLOCKS: UnicodeBlock[] = [
  // Latin
  { name: 'Basic Latin', start: 0x0000, end: 0x007f, category: 'latin' },
  { name: 'Latin-1 Supplement', start: 0x0080, end: 0x00ff, category: 'latin' },
  { name: 'Latin Extended-A', start: 0x0100, end: 0x017f, category: 'latin' },
  { name: 'Latin Extended-B', start: 0x0180, end: 0x024f, category: 'latin' },
  { name: 'IPA Extensions', start: 0x0250, end: 0x02af, category: 'latin' },
  { name: 'Latin Extended Additional', start: 0x1e00, end: 0x1eff, category: 'latin' },

  // Greek & Cyrillic
  { name: 'Greek and Coptic', start: 0x0370, end: 0x03ff, category: 'other' },
  { name: 'Cyrillic', start: 0x0400, end: 0x04ff, category: 'other' },
  { name: 'Cyrillic Extended-A', start: 0x2de0, end: 0x2dff, category: 'other' },
  { name: 'Cyrillic Extended-B', start: 0xa640, end: 0xa69f, category: 'other' },

  // Middle Eastern
  { name: 'Hebrew', start: 0x0590, end: 0x05ff, category: 'other' },
  { name: 'Arabic', start: 0x0600, end: 0x06ff, category: 'other' },
  { name: 'Syriac', start: 0x0700, end: 0x074f, category: 'other' },

  // South Asian
  { name: 'Devanagari', start: 0x0900, end: 0x097f, category: 'other' },
  { name: 'Bengali', start: 0x0980, end: 0x09ff, category: 'other' },
  { name: 'Gurmukhi', start: 0x0a00, end: 0x0a7f, category: 'other' },
  { name: 'Gujarati', start: 0x0a80, end: 0x0aff, category: 'other' },
  { name: 'Tamil', start: 0x0b80, end: 0x0bff, category: 'other' },
  { name: 'Telugu', start: 0x0c00, end: 0x0c7f, category: 'other' },
  { name: 'Kannada', start: 0x0c80, end: 0x0cff, category: 'other' },
  { name: 'Malayalam', start: 0x0d00, end: 0x0d7f, category: 'other' },
  { name: 'Sinhala', start: 0x0d80, end: 0x0dff, category: 'other' },
  { name: 'Thai', start: 0x0e00, end: 0x0e7f, category: 'other' },
  { name: 'Lao', start: 0x0e80, end: 0x0eff, category: 'other' },
  { name: 'Tibetan', start: 0x0f00, end: 0x0fff, category: 'other' },
  { name: 'Myanmar', start: 0x1000, end: 0x109f, category: 'other' },

  // Georgian & Armenian
  { name: 'Georgian', start: 0x10a0, end: 0x10ff, category: 'other' },
  { name: 'Armenian', start: 0x0530, end: 0x058f, category: 'other' },

  // CJK
  { name: 'CJK Symbols and Punctuation', start: 0x3000, end: 0x303f, category: 'cjk' },
  { name: 'Hiragana', start: 0x3040, end: 0x309f, category: 'cjk' },
  { name: 'Katakana', start: 0x30a0, end: 0x30ff, category: 'cjk' },
  { name: 'Bopomofo', start: 0x3100, end: 0x312f, category: 'cjk' },
  { name: 'Hangul Compatibility Jamo', start: 0x3130, end: 0x318f, category: 'cjk' },
  { name: 'CJK Unified Ideographs Extension A', start: 0x3400, end: 0x4dbf, category: 'cjk' },
  { name: 'CJK Unified Ideographs', start: 0x4e00, end: 0x9fff, category: 'cjk' },
  { name: 'Hangul Syllables', start: 0xac00, end: 0xd7af, category: 'cjk' },
  { name: 'CJK Compatibility Ideographs', start: 0xf900, end: 0xfaff, category: 'cjk' },
  { name: 'Halfwidth and Fullwidth Forms', start: 0xff00, end: 0xffef, category: 'cjk' },

  // Symbols & Punctuation
  { name: 'General Punctuation', start: 0x2000, end: 0x206f, category: 'other' },
  { name: 'Currency Symbols', start: 0x20a0, end: 0x20cf, category: 'other' },
  { name: 'Letterlike Symbols', start: 0x2100, end: 0x214f, category: 'other' },
  { name: 'Number Forms', start: 0x2150, end: 0x218f, category: 'other' },
  { name: 'Arrows', start: 0x2190, end: 0x21ff, category: 'other' },
  { name: 'Mathematical Operators', start: 0x2200, end: 0x22ff, category: 'other' },
  { name: 'Box Drawing', start: 0x2500, end: 0x257f, category: 'other' },
  { name: 'Block Elements', start: 0x2580, end: 0x259f, category: 'other' },
  { name: 'Geometric Shapes', start: 0x25a0, end: 0x25ff, category: 'other' },
  { name: 'Miscellaneous Symbols', start: 0x2600, end: 0x26ff, category: 'other' },
  { name: 'Dingbats', start: 0x2700, end: 0x27bf, category: 'other' },
]

export interface BlockCoverage {
  block: UnicodeBlock
  coverage: number // 0-1
  sampledChars: number
}

// 采样计算 Unicode 块覆盖率
export function computeUnicodeBlockCoverage(
  hasGlyph: (char: string) => boolean,
  sampleSize = 50
): BlockCoverage[] {
  return UNICODE_BLOCKS.map((block) => {
    const total = block.end - block.start + 1
    const step = Math.max(1, Math.floor(total / sampleSize))
    let covered = 0
    let sampled = 0

    for (let cp = block.start; cp <= block.end; cp += step) {
      const char = String.fromCodePoint(cp)
      if (hasGlyph(char)) covered++
      sampled++
    }

    return {
      block,
      coverage: sampled > 0 ? covered / sampled : 0,
      sampledChars: sampled,
    }
  })
}
