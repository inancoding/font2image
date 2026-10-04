// Unicode 块定义：用于字体覆盖率可视化
export interface UnicodeBlock {
  name: string
  nameZh: string
  start: number
  end: number
  category: 'latin' | 'cjk' | 'japanese' | 'korean' | 'other'
}

// 常用 Unicode 块（聚焦字体预览相关）
export const UNICODE_BLOCKS: UnicodeBlock[] = [
  // 拉丁字母
  { name: 'Basic Latin', nameZh: '基本拉丁字母', start: 0x0000, end: 0x007f, category: 'latin' },
  { name: 'Latin-1 Supplement', nameZh: '拉丁字母补充', start: 0x0080, end: 0x00ff, category: 'latin' },
  { name: 'Latin Extended-A', nameZh: '拉丁字母扩展A', start: 0x0100, end: 0x017f, category: 'latin' },
  { name: 'Latin Extended-B', nameZh: '拉丁字母扩展B', start: 0x0180, end: 0x024f, category: 'latin' },

  // 希腊字母 & 西里尔字母
  { name: 'Greek and Coptic', nameZh: '希腊字母', start: 0x0370, end: 0x03ff, category: 'other' },
  { name: 'Cyrillic', nameZh: '西里尔字母', start: 0x0400, end: 0x04ff, category: 'other' },

  // CJK 符号 & 标点
  { name: 'CJK Symbols and Punctuation', nameZh: 'CJK符号标点', start: 0x3000, end: 0x303f, category: 'cjk' },

  // 日文
  { name: 'Hiragana', nameZh: '平假名', start: 0x3040, end: 0x309f, category: 'japanese' },
  { name: 'Katakana', nameZh: '片假名', start: 0x30a0, end: 0x30ff, category: 'japanese' },
  { name: 'Katakana Phonetic Extensions', nameZh: '片假名扩展', start: 0x31f0, end: 0x31ff, category: 'japanese' },

  // 注音符号
  { name: 'Bopomofo', nameZh: '注音符号', start: 0x3100, end: 0x312f, category: 'cjk' },

  // 韩文
  { name: 'Hangul Compatibility Jamo', nameZh: '韩文兼容字母', start: 0x3130, end: 0x318f, category: 'korean' },
  { name: 'Hangul Syllables', nameZh: '韩文谚文', start: 0xac00, end: 0xd7af, category: 'korean' },

  // CJK 汉字
  { name: 'CJK Unified Ideographs Extension A', nameZh: 'CJK扩展A', start: 0x3400, end: 0x4dbf, category: 'cjk' },
  { name: 'CJK Unified Ideographs', nameZh: 'CJK统一汉字', start: 0x4e00, end: 0x9fff, category: 'cjk' },
  { name: 'CJK Compatibility Ideographs', nameZh: 'CJK兼容汉字', start: 0xf900, end: 0xfaff, category: 'cjk' },

  // 全角半角
  { name: 'Halfwidth and Fullwidth Forms', nameZh: '全角半角', start: 0xff00, end: 0xffef, category: 'cjk' },

  // 标点 & 符号
  { name: 'General Punctuation', nameZh: '通用标点', start: 0x2000, end: 0x206f, category: 'other' },
  { name: 'Currency Symbols', nameZh: '货币符号', start: 0x20a0, end: 0x20cf, category: 'other' },
  { name: 'Arrows', nameZh: '箭头', start: 0x2190, end: 0x21ff, category: 'other' },
  { name: 'Mathematical Operators', nameZh: '数学运算符', start: 0x2200, end: 0x22ff, category: 'other' },
  { name: 'Box Drawing', nameZh: '制表符', start: 0x2500, end: 0x257f, category: 'other' },
  { name: 'Geometric Shapes', nameZh: '几何图形', start: 0x25a0, end: 0x25ff, category: 'other' },
  { name: 'Miscellaneous Symbols', nameZh: '杂项符号', start: 0x2600, end: 0x26ff, category: 'other' },
  { name: 'Dingbats', nameZh: '装饰符号', start: 0x2700, end: 0x27bf, category: 'other' },
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
