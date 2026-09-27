export interface CharGridGroup {
  label: string
  script: 'hans' | 'hant' | 'upper' | 'lower' | 'digit'
  chars: string[]
}

export interface PoemOption {
  title: string
  author: string
  lines: string[]
}

// 内置五言诗选项
export const HANS_POEMS: PoemOption[] = [
  {
    title: '静夜思',
    author: '李白',
    lines: ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'],
  },
  {
    title: '春晓',
    author: '孟浩然',
    lines: ['春眠不觉晓', '处处闻啼鸟', '夜来风雨声', '花落知多少'],
  },
  {
    title: '登鹳雀楼',
    author: '王之涣',
    lines: ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'],
  },
  {
    title: '相思',
    author: '王维',
    lines: ['红豆生南国', '春来发几枝', '愿君多采撷', '此物最相思'],
  },
  {
    title: '鹿柴',
    author: '王维',
    lines: ['空山不见人', '但闻人语响', '返景入深林', '复照青苔上'],
  },
]

export const HANT_POEMS: PoemOption[] = [
  {
    title: '靜夜思',
    author: '李白',
    lines: ['床前明月光', '疑是地上霜', '舉頭望明月', '低頭思故鄉'],
  },
  {
    title: '春曉',
    author: '孟浩然',
    lines: ['春眠不覺曉', '處處聞啼鳥', '夜來風雨聲', '花落知多少'],
  },
  {
    title: '登鸛雀樓',
    author: '王之渙',
    lines: ['白日依山盡', '黃河入海流', '欲窮千里目', '更上一層樓'],
  },
  {
    title: '相思',
    author: '王維',
    lines: ['紅豆生南國', '春來發幾枝', '願君多採擷', '此物最相思'],
  },
  {
    title: '鹿柴',
    author: '王維',
    lines: ['空山不見人', '但聞人語響', '返景入深林', '復照青苔上'],
  },
]

// 单字预览字表：简体中文、繁体中文使用五言诗；英文和数字使用默认字符
export const CHAR_GRID_GROUPS: CharGridGroup[] = [
  {
    label: '简体中文',
    script: 'hans',
    chars: '床前明月光疑是地上霜举头望明月低头思故乡'.split(''),
  },
  {
    label: '繁体中文',
    script: 'hant',
    chars: '床前明月光疑是地上霜舉頭望明月低頭思故鄉'.split(''),
  },
  {
    label: '英文大写',
    script: 'upper',
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  },
  {
    label: '英文小写',
    script: 'lower',
    chars: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  },
  {
    label: '数字',
    script: 'digit',
    chars: '0123456789'.split(''),
  },
]
