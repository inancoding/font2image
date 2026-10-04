// Unicode 块定义：用于字体覆盖率可视化
export interface UnicodeBlock {
  name: string
  start: number
  end: number
}

// 核心 Unicode 块（中文、日文、韩文、英文、数字、符号）
export const UNICODE_BLOCKS: UnicodeBlock[] = [
  // 英文 & 数字
  { name: '基本拉丁字母', start: 0x0020, end: 0x007f },
  { name: '拉丁扩展', start: 0x0080, end: 0x024f },

  // 中文
  { name: 'CJK符号标点', start: 0x3000, end: 0x303f },
  { name: 'CJK扩展A', start: 0x3400, end: 0x4dbf },
  { name: 'CJK统一汉字', start: 0x4e00, end: 0x9fff },

  // 日文
  { name: '日文平假名', start: 0x3040, end: 0x309f },
  { name: '日文片假名', start: 0x30a0, end: 0x30ff },

  // 韩文
  { name: '韩文谚文', start: 0xac00, end: 0xd7af },

  // 全角半角
  { name: '全角半角', start: 0xff00, end: 0xffef },

  // 通用符号
  { name: '通用标点', start: 0x2000, end: 0x206f },
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
