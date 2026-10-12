#!/usr/bin/env node
/**
 * 生成 PWA 图标(192 / 512 / maskable 512)。
 *
 * 不引入 sharp / canvas 之类的图形依赖 —— 直接用一个最小 PNG 编码器
 * (zlib + CRC32)逐像素绘制。图案是靛蓝底 + 白色键盘方格,
 * 用圆角矩形的有符号距离场做抗锯齿。
 *
 * 用法: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ----------------------------------------------------------- PNG 编码

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** 把 RGBA 像素缓冲编码成 PNG */
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // 每行前面加一个 filter 字节(0 = None)
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ----------------------------------------------------------- 绘制

/** 圆角矩形的有符号距离:负值在内部 */
function sdRoundRect(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r)
  const qy = Math.abs(py - cy) - (halfH - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

/** 距离 -> 覆盖率,做 1px 抗锯齿 */
function coverage(dist) {
  return Math.min(Math.max(0.5 - dist, 0), 1)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * 绘制图标。
 * @param size 边长
 * @param maskable 是否可遮罩变体(maskable 图标会被系统裁成圆形,
 *                 所以背景铺满整个画布、图案收进中央安全区)
 */
function drawIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4)

  // 背景渐变:上 #818CF8 -> 下 #4F46E5
  const top = [129, 140, 248]
  const bottom = [79, 70, 229]

  // 图案安全区:maskable 要求内容落在中央 80% 直径的圆内
  const safeScale = maskable ? 0.62 : 0.78

  // 键盘网格:4 列 × 3 行
  const cols = 4
  const rows = 3
  const gridW = size * safeScale
  const gridH = gridW * 0.6
  const cellW = gridW / (cols * 2 - 1)
  const cellH = gridH / (rows * 2 - 1)
  const gap = cellW // 单元格间隔等于一个 cellW
  const radius = Math.min(cellW, cellH) * 0.28

  const originX = (size - gridW) / 2
  const originY = (size - gridH) / 2

  // 圆角背景的圆角半径(非 maskable 时才有可见圆角)
  const bgRadius = maskable ? size : size * 0.22

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5

      // ---- 背景 ----
      const bgCov = maskable
        ? 1
        : coverage(sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, bgRadius))

      const t = py / size
      let r = lerp(top[0], bottom[0], t)
      let g = lerp(top[1], bottom[1], t)
      let b = lerp(top[2], bottom[2], t)
      let a = bgCov

      // ---- 键盘方格(白色)----
      // 用「取整格坐标」逐格判断,邻近格子用 max 合并覆盖率避免接缝
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // 中间一行少画一格,做出「空格键」缺口,更像键盘
          if (row === rows - 1 && col === 1) continue

          const isSpacebar = row === rows - 1 && col === 2
          const w = isSpacebar ? cellW * 3 : cellW
          const cx = originX + col * (cellW + gap) + w / 2
          const cy = originY + row * (cellH + gap) + cellH / 2

          const d = sdRoundRect(px, py, cx, cy, w / 2, cellH / 2, radius)
          const cov = coverage(d)
          if (cov <= 0) continue

          // 白色叠在背景上,取最大覆盖率避免相邻格子重叠处变暗
          const white = 0.94 * cov
          if (white > 0) {
            r = lerp(r, 255, white)
            g = lerp(g, 255, white)
            b = lerp(b, 255, white)
            a = Math.max(a, bgCov)
          }
        }
      }

      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = Math.round(a * 255)
    }
  }

  return encodePng(size, size, rgba)
}

// ----------------------------------------------------------- 输出

const outDir = resolve('public/icons')
mkdirSync(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
]

for (const t of targets) {
  const png = drawIcon(t.size, t.maskable)
  writeFileSync(resolve(outDir, t.file), png)
  console.log(`生成 ${t.file} (${t.size}×${t.size}${t.maskable ? ', maskable' : ''}) — ${(png.length / 1024).toFixed(1)} KB`)
}
