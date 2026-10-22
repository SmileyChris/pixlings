// Kitty graphics protocol: the frame as a transparent RGBA PNG, sent in 4 KB base64 chunks and shown
// over a block of cells. Works in Kitty, Ghostty and WezTerm, not under tmux.
import { TRANSPARENT } from '../plugins/pixlings/hooks/lib/canvas.ts'
import type { Pixels } from '../plugins/pixlings/hooks/lib/canvas.ts'
import { crc32, deflate } from '../plugins/pixlings/hooks/lib/png.ts'
import { base64 } from '../plugins/pixlings/hooks/lib/raster.ts'

const CHUNK = 4096

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

/** A transparent RGBA PNG; `colorAt(x, y)` gives each pixel's color, or TRANSPARENT. */
const encodeRgba = (width: number, height: number, colorAt: (x: number, y: number) => number): Uint8Array => {
  const stride = width * 4 + 1
  const raw = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = colorAt(x, y)
      if (color === TRANSPARENT) continue // all four bytes stay zero: transparent black
      const at = y * stride + 1 + x * 4
      raw[at] = (color >> 16) & 255
      raw[at + 1] = (color >> 8) & 255
      raw[at + 2] = color & 255
      raw[at + 3] = 255
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * How `rgbaBox` fits the frame into a `width` × `height` box: the scale (a whole number wherever the
 * frame fits, so pixels stay square and even) and the frame's top-left corner in the box, in whole
 * pixels, as near the middle as that allows.
 */
export const fitBox = (p: Pixels, width: number, height: number): { scale: number; left: number; top: number } => {
  const fit = Math.min(width / p.w, height / p.h)
  const scale = fit >= 1 ? Math.floor(fit) : fit
  return { scale, left: Math.floor((width - p.w * scale) / 2), top: Math.floor((height - p.h * scale) / 2) }
}

/**
 * The frame fitted into a `width` × `height` pixel box (see `fitBox`); the rest is transparent. The
 * image is exactly the box, so the terminal has nothing to stretch.
 */
export const rgbaBox = (p: Pixels, width: number, height: number): Uint8Array => {
  const { scale, left, top } = fitBox(p, width, height)
  return encodeRgba(width, height, (x, y) => {
    const sx = Math.floor((x - left) / scale)
    const sy = Math.floor((y - top) / scale)
    if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) return TRANSPARENT
    return p.px[sy * p.w + sx] ?? TRANSPARENT
  })
}

/** Deletes image `id`: its placements and its data. */
export const kittyDelete = (id: number): string => `\x1b_Ga=d,d=I,i=${id},q=2;\x1b\\`

/** Hides image `id` (deletes its placements) but keeps its data, so `kittyPlace` can show it again. */
export const kittyHide = (id: number): string => `\x1b_Ga=d,d=i,i=${id},q=2;\x1b\\`

/** Deletes every image: all placements and all data. */
export const kittyDeleteAll = (): string => `\x1b_Ga=d,d=A,q=2;\x1b\\`

/** The ID the support query uses; a terminal that has the protocol answers `KITTY_QUERY_OK`. */
export const KITTY_QUERY_ID = 31
/**
 * Asks whether the terminal has the graphics protocol: a 1×1 query image (a=q shows nothing) followed
 * by Device Attributes (CSI c). A terminal with the protocol answers `KITTY_QUERY_OK` and then its
 * DA1 reply; one without answers DA1 only, so the DA1 reply is the "no". Not q=2: that would silence it.
 */
export const kittyQuery = (): string => `\x1b_Gi=${KITTY_QUERY_ID},s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\\x1b[c`
export const KITTY_QUERY_OK = `\x1b_Gi=${KITTY_QUERY_ID};OK\x1b\\`
/** A DA1 reply: CSI ? ... c. */
export const DA1_REPLY = /\x1b\[\?[0-9;]*c/

/**
 * Sends the PNG as image `id` without showing it (a=t). Show it with `kittyPlace`. Chunks are 4 KB of
 * base64, and only the first carries the keys.
 */
export const kittyTransmit = (png: Uint8Array, id: number): string => {
  const data = base64(png)
  let out = ''
  for (let start = 0; start < data.length; start += CHUNK) {
    const more = start + CHUNK < data.length ? 1 : 0
    const keys = start === 0 ? `a=t,f=100,i=${id},q=2,m=${more}` : `q=2,m=${more}`
    out += `\x1b_G${keys};${data.slice(start, start + CHUNK)}\x1b\\`
  }
  return out
}

/**
 * Shows transmitted image `id` over `columns` × `rows` cells, starting at the cursor, pushed right
 * and down by `x` and `y` pixels (each less than a cell) when given. The image is sized to exactly
 * those cells (see `rgbaBox`), so nothing is stretched. C=1 keeps the cursor where it was, so text
 * written after the image lines up as usual.
 */
export const kittyPlace = (id: number, columns: number, rows: number, x = 0, y = 0): string =>
  `\x1b_Ga=p,i=${id},c=${columns},r=${rows}${x > 0 ? `,X=${x}` : ''}${y > 0 ? `,Y=${y}` : ''},C=1,q=2;\x1b\\`
