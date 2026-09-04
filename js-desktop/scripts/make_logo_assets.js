const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const root = path.resolve(__dirname, '..')
const assetsDir = path.join(root, 'assets')
const srcAssetsDir = path.join(root, 'src', 'assets')
fs.mkdirSync(assetsDir, { recursive: true })
fs.mkdirSync(srcAssetsDir, { recursive: true })

function crc32(buffer) {
  const table = crc32.table || (crc32.table = (() => {
    const values = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      values[n] = c >>> 0
    }
    return values
  })())
  let crc = 0xffffffff
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  name.copy(out, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length)
  return out
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function lerp(a, b, t) { return a + (b - a) * t }
function mix(a, b, t) { return a.map((v, i) => Math.round(lerp(v, b[i], t))) }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }

const size = 256
const pixels = Buffer.alloc(size * size * 4)

function blendPixel(x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return
  const i = (Math.floor(y) * size + Math.floor(x)) * 4
  const a = clamp(alpha, 0, 1) * (color[3] == null ? 1 : color[3] / 255)
  const inv = 1 - a
  pixels[i] = Math.round(color[0] * a + pixels[i] * inv)
  pixels[i + 1] = Math.round(color[1] * a + pixels[i + 1] * inv)
  pixels[i + 2] = Math.round(color[2] * a + pixels[i + 2] * inv)
  pixels[i + 3] = Math.round(255 * a + pixels[i + 3] * inv)
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r)
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0
}

function coverageRoundedRect(x, y, w, h, r, px, py) {
  let hits = 0
  const samples = 4
  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      if (insideRoundedRect(px + (sx + 0.5) / samples, py + (sy + 0.5) / samples, x, y, w, h, r)) hits += 1
    }
  }
  return hits / (samples * samples)
}

function drawRoundedRect(x, y, w, h, r, color, alpha = 1) {
  for (let py = Math.floor(y - 2); py < Math.ceil(y + h + 2); py += 1) {
    for (let px = Math.floor(x - 2); px < Math.ceil(x + w + 2); px += 1) {
      const c = coverageRoundedRect(x, y, w, h, r, px, py)
      if (c) blendPixel(px, py, color, c * alpha)
    }
  }
}

function drawCircle(cx, cy, radius, color, alpha = 1) {
  for (let y = Math.floor(cy - radius - 2); y <= Math.ceil(cy + radius + 2); y += 1) {
    for (let x = Math.floor(cx - radius - 2); x <= Math.ceil(cx + radius + 2); x += 1) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const a = clamp(radius + 0.8 - dist, 0, 1) * alpha
      if (a) blendPixel(x, y, color, a)
    }
  }
}

function drawLine(x1, y1, x2, y2, width, color, alpha = 1) {
  const minX = Math.floor(Math.min(x1, x2) - width)
  const maxX = Math.ceil(Math.max(x1, x2) + width)
  const minY = Math.floor(Math.min(y1, y2) - width)
  const maxY = Math.ceil(Math.max(y1, y2) + width)
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = clamp(((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len2, 0, 1)
      const px = x1 + t * dx
      const py = y1 + t * dy
      const dist = Math.hypot(x + 0.5 - px, y + 0.5 - py)
      const a = clamp(width / 2 + 0.75 - dist, 0, 1) * alpha
      if (a) blendPixel(x, y, color, a)
    }
  }
}

const bgA = [6, 9, 24]
const bgB = [17, 31, 58]
const bgC = [23, 74, 86]
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const mask = coverageRoundedRect(8, 8, 240, 240, 52, x, y)
    if (!mask) continue
    const diagonal = (x * 0.62 + y * 0.38) / size
    let color = mix(bgA, bgB, diagonal)
    const glow = Math.max(0, 1 - Math.hypot(x - 176, y - 178) / 175)
    color = mix(color, bgC, glow * 0.42)
    blendPixel(x, y, color, mask)
  }
}

drawCircle(82, 48, 55, [37, 132, 156], 0.14)
drawCircle(176, 186, 72, [227, 190, 116], 0.08)
drawLine(56, 206, 205, 54, 2.2, [255, 255, 255], 0.08)

drawCircle(181, 65, 25, [238, 203, 129], 0.92)
drawCircle(193, 57, 26, [12, 19, 39], 0.98)
drawCircle(180, 65, 33, [238, 203, 129], 0.16)

const stars = [[66, 70, 2.4], [210, 106, 2.0], [54, 150, 1.5], [201, 172, 1.6], [118, 40, 1.4]]
for (const [x, y, r] of stars) {
  drawCircle(x, y, r, [255, 232, 181], 0.88)
  drawLine(x - r * 2.5, y, x + r * 2.5, y, 1.1, [255, 232, 181], 0.44)
  drawLine(x, y - r * 2.5, x, y + r * 2.5, 1.1, [255, 232, 181], 0.44)
}

drawCircle(128, 147, 62, [41, 179, 184], 0.15)
drawCircle(128, 147, 49, [14, 24, 49], 0.78)
drawCircle(128, 147, 44, [23, 67, 83], 0.35)
const bars = [
  [91, 142, 13, 52, [66, 214, 210]],
  [112, 132, 13, 74, [238, 203, 129]],
  [133, 113, 14, 112, [80, 222, 217]],
  [155, 132, 13, 74, [238, 203, 129]],
  [176, 142, 13, 52, [66, 214, 210]],
]
for (const [x, y, w, h, color] of bars) {
  drawRoundedRect(x, y, w, h, w / 2, [0, 0, 0], 0.18)
  drawRoundedRect(x, y, w, h, w / 2, color, 0.96)
}
drawLine(73, 201, 183, 201, 6, [238, 203, 129], 0.92)
drawLine(92, 219, 164, 219, 5, [66, 214, 210], 0.62)

drawRoundedRect(9.5, 9.5, 237, 237, 51, [255, 255, 255], 0.07)

const png = encodePng(size, size, pixels)
fs.writeFileSync(path.join(assetsDir, 'icon.png'), png)

const icoHeader = Buffer.alloc(22)
icoHeader.writeUInt16LE(0, 0)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(1, 4)
icoHeader[6] = 0
icoHeader[7] = 0
icoHeader[8] = 0
icoHeader[9] = 0
icoHeader.writeUInt16LE(1, 10)
icoHeader.writeUInt16LE(32, 12)
icoHeader.writeUInt32LE(png.length, 14)
icoHeader.writeUInt32LE(22, 18)
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), Buffer.concat([icoHeader, png]))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Clipchamp Voice Studio logo">
  <defs>
    <linearGradient id="night" x1="28" y1="20" x2="232" y2="236" gradientUnits="userSpaceOnUse">
      <stop stop-color="#070A1A"/>
      <stop offset=".56" stop-color="#122346"/>
      <stop offset="1" stop-color="#184B56"/>
    </linearGradient>
    <linearGradient id="teal" x1="92" y1="113" x2="184" y2="225" gradientUnits="userSpaceOnUse">
      <stop stop-color="#5EF3EA"/>
      <stop offset="1" stop-color="#24949F"/>
    </linearGradient>
    <linearGradient id="gold" x1="92" y1="58" x2="190" y2="217" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFE3A6"/>
      <stop offset="1" stop-color="#C99035"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="52" fill="url(#night)"/>
  <path d="M56 206 205 54" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
  <circle cx="82" cy="48" r="55" fill="#25849C" opacity=".14"/>
  <path d="M181 40a25 25 0 1 0 22 37 28 28 0 0 1-22-37Z" fill="url(#gold)" filter="url(#glow)"/>
  <g fill="#FFE8B5" opacity=".9">
    <circle cx="66" cy="70" r="2.4"/><circle cx="210" cy="106" r="2"/><circle cx="54" cy="150" r="1.5"/><circle cx="201" cy="172" r="1.6"/><circle cx="118" cy="40" r="1.4"/>
  </g>
  <circle cx="128" cy="147" r="53" fill="#0E1931" opacity=".74"/>
  <circle cx="128" cy="147" r="49" fill="#2AD3D0" opacity=".13"/>
  <g filter="url(#glow)">
    <rect x="91" y="142" width="13" height="52" rx="6.5" fill="url(#teal)"/>
    <rect x="112" y="132" width="13" height="74" rx="6.5" fill="url(#gold)"/>
    <rect x="133" y="113" width="14" height="112" rx="7" fill="url(#teal)"/>
    <rect x="155" y="132" width="13" height="74" rx="6.5" fill="url(#gold)"/>
    <rect x="176" y="142" width="13" height="52" rx="6.5" fill="url(#teal)"/>
    <path d="M73 201h110" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>
    <path d="M92 219h72" stroke="url(#teal)" stroke-width="5" stroke-linecap="round" opacity=".62"/>
  </g>
  <rect x="9.5" y="9.5" width="237" height="237" rx="51" fill="none" stroke="#fff" stroke-opacity=".09"/>
</svg>
`
fs.writeFileSync(path.join(srcAssetsDir, 'logo.svg'), svg)
fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svg)
console.log('LOGO_ASSETS_CREATED')
