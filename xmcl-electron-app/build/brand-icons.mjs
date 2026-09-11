/**
 * Regenerates every shipped application icon from the real MineLatino logo
 * (`icons/source-logo.png`, 800x800 RGBA, downloaded from
 * https://minelatino.com/wp-content/uploads/2025/09/Logo-ML-1.png).
 *
 * Run with plain Node from this package: `node build/brand-icons.mjs`.
 *
 * The logo is composited onto the brand tiles sampled from the shop and the
 * network site — charcoal `#262726` for the dark theme, off-white `#FCFCFC`
 * for the light one — with rounded corners, and emitted as:
 *
 * - `dark.ico` / `light.ico`   Windows taskbar & window icon (PNG-in-ICO)
 * - `dark.icns` / `light.icns` macOS + Linux packaging icon
 * - `dark@256x256.png` / `light@256x256.png`  about page & window overlays
 * - `dark@tray.png` / `light@tray.png`        32 px system tray icon
 *
 * Those eight files are exactly the ones `main/utils/icons.ts` and
 * `build/electron-builder.config.ts` reference; the leftover appx tiles in
 * this directory are inert (see MINELATINO.md).
 *
 * Deliberately dependency-free: a minimal PNG decoder/encoder on top of
 * `node:zlib`, so regenerating the brand never needs native image libraries.
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons')

/** Brand tiles sampled from minelatino.shop / minelatino.com/network. */
const THEMES = {
  dark: { tile: [0x26, 0x27, 0x26] },
  light: { tile: [0xFC, 0xFC, 0xFC] },
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ICNS_ENTRIES = [
  ['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic13', 256],
  ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024],
]
const RENDER_SIZES = [...new Set([...ICO_SIZES, 512, 1024])]

/* ----------------------------- PNG decoding ----------------------------- */

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error(`unsupported bit depth ${data[8]}`)
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (colorType !== 6 || interlace !== 0) {
    throw new Error(`expected non-interlaced RGBA8 PNG, got colorType=${colorType} interlace=${interlace}`)
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[x - 4] : 0
      const b = prev[x]
      const c = x >= 4 ? prev[x - 4] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      out[x] = v & 0xFF
    }
    prev = out
  }
  return { width, height, pixels }
}

/* ----------------------------- PNG encoding ----------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(width, height, pixels) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------- logo compositing --------------------------- */

function trimAlpha({ width, height, pixels }) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] >= 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('source logo is fully transparent')
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Bilinear sample of the trimmed logo in premultiplied space (no halos). */
function sampleLogo(src, box, u, v) {
  const fx = u * (box.w - 1)
  const fy = v * (box.h - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, box.w - 1)
  const y1 = Math.min(y0 + 1, box.h - 1)
  const tx = fx - x0
  const ty = fy - y0
  const at = (x, y) => {
    const i = ((box.y + y) * src.width + (box.x + x)) * 4
    const a = src.pixels[i + 3] / 255
    return [src.pixels[i] * a, src.pixels[i + 1] * a, src.pixels[i + 2] * a, a]
  }
  const p00 = at(x0, y0)
  const p01 = at(x1, y0)
  const p10 = at(x0, y1)
  const p11 = at(x1, y1)
  const mix = (a, b, t) => a + (b - a) * t
  const out = [0, 1, 2, 3].map((k) => mix(mix(p00[k], p01[k], tx), mix(p10[k], p11[k], tx), ty))
  return out
}

/** Rounded-rect coverage in [0,1] via its signed distance field. */
function tileCoverage(size, radius, x, y) {
  const half = size / 2
  const px = Math.abs(x + 0.5 - half) - (half - radius)
  const py = Math.abs(y + 0.5 - half) - (half - radius)
  const qx = Math.max(px, 0)
  const qy = Math.max(py, 0)
  const sdf = Math.hypot(qx, qy) + Math.min(Math.max(px, py), 0) - radius
  return Math.min(Math.max(0.5 - sdf, 0), 1)
}

function renderTile(src, box, size, tile) {
  const radius = Math.round(size * 0.225)
  const inner = size * 0.82
  const pad = (size - inner) / 2
  // Keep the logo's aspect: fit the trimmed box inside the inner square.
  const scale = Math.min(inner / box.w, inner / box.h)
  const drawW = box.w * scale
  const drawH = box.h * scale
  const offX = pad + (inner - drawW) / 2
  const offY = pad + (inner - drawH) / 2
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cov = tileCoverage(size, radius, x, y)
      const i = (y * size + x) * 4
      if (cov === 0) continue
      let r = tile[0]
      let g = tile[1]
      let b = tile[2]
      if (x >= offX && x < offX + drawW && y >= offY && y < offY + drawH) {
        const [pr, pg, pb, a] = sampleLogo(src, box, (x - offX) / drawW, (y - offY) / drawH)
        r = pr + r * (1 - a)
        g = pg + g * (1 - a)
        b = pb + b * (1 - a)
      }
      pixels[i] = Math.round(r)
      pixels[i + 1] = Math.round(g)
      pixels[i + 2] = Math.round(b)
      pixels[i + 3] = Math.round(cov * 255)
    }
  }
  return encodePng(size, size, pixels)
}

/* --------------------------- ICO / ICNS packing -------------------------- */

function packIco(pngsBySize) {
  const entries = ICO_SIZES.map((size) => ({ size, png: pngsBySize[size] }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const dirs = []
  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16)
    dir[0] = size >= 256 ? 0 : size
    dir[1] = size >= 256 ? 0 : size
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(png.length, 8)
    dir.writeUInt32LE(offset, 12)
    offset += png.length
    dirs.push(dir)
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)])
}

function packIcns(pngsBySize) {
  const bodies = ICNS_ENTRIES.map(([type, size]) => {
    const png = pngsBySize[size]
    const entry = Buffer.alloc(8 + png.length)
    entry.write(type, 0, 'latin1')
    entry.writeUInt32BE(entry.length, 4)
    png.copy(entry, 8)
    return entry
  })
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'latin1')
  header.writeUInt32BE(8 + bodies.reduce((n, b) => n + b.length, 0), 4)
  return Buffer.concat([header, ...bodies])
}

/* --------------------------------- main --------------------------------- */

const src = decodePng(readFileSync(join(iconsDir, 'source-logo.png')))
const box = trimAlpha(src)
console.log(`source logo ${src.width}x${src.height}, trimmed to ${box.w}x${box.h} at +${box.x}+${box.y}`)

for (const [theme, { tile }] of Object.entries(THEMES)) {
  const pngsBySize = {}
  for (const size of RENDER_SIZES) {
    pngsBySize[size] = renderTile(src, box, size, tile)
  }
  const write = (name, buffer) => {
    writeFileSync(join(iconsDir, name), buffer)
    console.log(`  ${name}  ${buffer.length} bytes`)
  }
  write(`${theme}.ico`, packIco(pngsBySize))
  write(`${theme}.icns`, packIcns(pngsBySize))
  write(`${theme}@256x256.png`, pngsBySize[256])
  write(`${theme}@tray.png`, pngsBySize[32])
}
console.log('icon set regenerated from the MineLatino logo')
