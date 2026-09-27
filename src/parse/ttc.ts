// TTC（TrueType Collection）拆包：提取集合中的字体并重建为独立 SFNT。
// 集合内各字体共享表数据，按目标字体自身的表目录逐表拷贝即可。
// 浏览器 FontFace 与 opentype.js 均不认识 ttcf 容器，故需在解析前完成拆包。
import { buildSfnt, type SfntTableInput } from './sfnt'

function readTag(view: DataView, pos: number): string {
  return String.fromCharCode(view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3))
}

export function isTtc(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x74 && bytes[1] === 0x74 && bytes[2] === 0x63 && bytes[3] === 0x66
}

export interface TtcFace {
  index: number
  data: Uint8Array
}

// 提取 TTC 中所有字体面
export function ttcAllFacesToSfnt(bytes: Uint8Array): TtcFace[] {
  if (bytes.length < 16) throw new Error('TTC 文件过小，头部不完整')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (readTag(view, 0) !== 'ttcf') throw new Error('不是有效的 ttc 文件')
  const majorVersion = view.getUint16(4)
  if (majorVersion !== 1 && majorVersion !== 2) {
    throw new Error(`不支持的 TTC 版本 ${majorVersion}.${view.getUint16(6)}`)
  }
  const numFonts = view.getUint32(8)
  if (numFonts < 1) throw new Error('TTC 集合内没有任何字体')

  const faces: TtcFace[] = []
  for (let fi = 0; fi < numFonts; fi++) {
    const faceOffset = view.getUint32(12 + fi * 4)
    if (faceOffset + 12 > bytes.length) continue

    const flavor = view.getUint32(faceOffset)
    const numTables = view.getUint16(faceOffset + 4)
    if (faceOffset + 12 + numTables * 16 > bytes.length) continue

    const tables: SfntTableInput[] = []
    let valid = true
    for (let i = 0; i < numTables; i++) {
      const entryPos = faceOffset + 12 + i * 16
      const tag = readTag(view, entryPos)
      const offset = view.getUint32(entryPos + 8)
      const length = view.getUint32(entryPos + 12)
      if (offset + length > bytes.length) {
        valid = false
        break
      }
      tables.push({ tag, data: bytes.slice(offset, offset + length) })
    }
    if (valid) {
      faces.push({ index: fi, data: buildSfnt(flavor, tables) })
    }
  }

  if (faces.length === 0) throw new Error('TTC 中未能成功提取任何字体')
  return faces
}

// 向后兼容：仅提取第一个字体
export function ttcFirstFaceToSfnt(bytes: Uint8Array): Uint8Array {
  return ttcAllFacesToSfnt(bytes)[0]!.data
}
