// A PNG encoder small enough to live in the mod: indexed color, one fixed-Huffman deflate block.
// Pixel art compresses well with the two matches it uses: a run of the byte before (distance 1),
// and a scaled row equal to the one above it, sent as PNG's "Up" filter, which turns it to zeros.

import { TRANSPARENT } from './canvas.ts'
import type { Pixels } from './canvas.ts'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export const crc32 = (bytes: Uint8Array, start = 0, end = bytes.length): number => {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export const adler32 = (bytes: Uint8Array): number => {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + (bytes[i] ?? 0)) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

class Bits {
  private bytes: Uint8Array
  private length = 0
  private acc = 0
  private count = 0

  constructor(capacity: number) {
    this.bytes = new Uint8Array(capacity)
  }

  /** Writes `n` bits of `value`, least significant first, as deflate packs its fields. */
  put(value: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.acc |= ((value >>> i) & 1) << this.count
      if (++this.count === 8) this.flushByte()
    }
  }

  /** Writes a Huffman code, most significant bit first. */
  code(value: number, n: number): void {
    for (let i = n - 1; i >= 0; i--) this.put((value >>> i) & 1, 1)
  }

  private flushByte(): void {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2)
      grown.set(this.bytes)
      this.bytes = grown
    }
    this.bytes[this.length++] = this.acc
    this.acc = 0
    this.count = 0
  }

  finish(): Uint8Array {
    if (this.count > 0) this.flushByte()
    return this.bytes.subarray(0, this.length)
  }
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]

const symbol = (bits: Bits, sym: number): void => {
  if (sym < 144) bits.code(0x30 + sym, 8)
  else if (sym < 256) bits.code(0x190 + sym - 144, 9)
  else if (sym < 280) bits.code(sym - 256, 7)
  else bits.code(0xc0 + sym - 280, 8)
}

const match = (bits: Bits, length: number): void => {
  let i = LENGTH_BASE.length - 1
  while ((LENGTH_BASE[i] ?? 0) > length) i--
  symbol(bits, 257 + i)
  bits.put(length - (LENGTH_BASE[i] ?? 0), LENGTH_EXTRA[i] ?? 0)
  bits.code(0, 5) // distance code 0: distance 1
}

/** zlib-wrapped deflate of `data` in one fixed-Huffman block. */
export const deflate = (data: Uint8Array): Uint8Array => {
  const bits = new Bits(Math.ceil(data.length / 4) + 64)
  bits.put(0x78, 8)
  bits.put(0x01, 8)
  bits.put(1, 1) // the last block
  bits.put(1, 2) // fixed Huffman codes
  let i = 0
  while (i < data.length) {
    const byte = data[i] ?? 0
    if (i > 0 && byte === data[i - 1]) {
      let run = 1
      while (run < 258 && i + run < data.length && data[i + run] === byte) run++
      if (run >= 3) {
        match(bits, run)
        i += run
        continue
      }
    }
    symbol(bits, byte)
    i++
  }
  symbol(bits, 256)
  const body = bits.finish()
  const out = new Uint8Array(body.length + 4)
  out.set(body)
  new DataView(out.buffer).setUint32(body.length, adler32(data))
  return out
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * The pixels as a PNG, each scaled to a `scale`×`scale` block; transparent pixels take
 * `background`, or with null stay transparent. Throws past 256 colors, which a card never reaches.
 */
export const encodePng = (p: Pixels, scale: number, background: number | null): Uint8Array => {
  // Transparent is the palette's first entry when it is kept, so one alpha byte marks it.
  const palette: number[] = background === null ? [0] : []
  const index = new Map<number, number>(background === null ? [[TRANSPARENT, 0]] : [])
  const indexOf = (color: number): number => {
    const c = color === TRANSPARENT && background !== null ? background : color
    let i = index.get(c)
    if (i === undefined) {
      if (palette.length === 256) throw new Error('more than 256 colors')
      i = palette.length
      palette.push(c)
      index.set(c, i)
    }
    return i
  }

  const w = p.w * scale
  const h = p.h * scale
  const stride = w + 1
  const raw = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) {
    const row = y * stride
    if (y % scale !== 0) {
      raw[row] = 2 // Up: the same as the row above, all zeros
      continue
    }
    const sy = y / scale
    for (let x = 0; x < p.w; x++) {
      const i = indexOf(p.px[sy * p.w + x] ?? TRANSPARENT)
      raw.fill(i, row + 1 + x * scale, row + 1 + (x + 1) * scale)
    }
  }

  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, w)
  hv.setUint32(4, h)
  header[8] = 8 // bit depth
  header[9] = 3 // indexed color
  const plte = new Uint8Array(palette.length * 3)
  palette.forEach((c, i) => {
    plte[i * 3] = (c >> 16) & 255
    plte[i * 3 + 1] = (c >> 8) & 255
    plte[i * 3 + 2] = c & 255
  })
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', plte),
    ...(background === null ? [chunk('tRNS', new Uint8Array([0]))] : []),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}
