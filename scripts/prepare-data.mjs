#!/usr/bin/env node
/**
 * 把上游的数据资源同步进本项目:
 *   - src/data/catalog.json 中登记的词库 -> public/dicts/
 *   - public/sounds/        音效        -> public/sounds/
 *   - LICENSE               GPL-3.0 全文 -> ./LICENSE
 *
 * 只复制目录里登记过的词库,避免把上游未登记的测试文件也带进发布产物。
 *
 * 用法: node scripts/prepare-data.mjs <upstream-repo-root>
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

const upstreamRoot = process.argv[2]
if (!upstreamRoot) {
  console.error('用法: node scripts/prepare-data.mjs <upstream-repo-root>')
  process.exit(1)
}

const catalogPath = resolve('src/data/catalog.json')
if (!existsSync(catalogPath)) {
  console.error(`缺少 ${catalogPath},请先运行 scripts/extract-catalog.mjs`)
  process.exit(1)
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

function copyDir(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true })
  let bytes = 0
  let files = 0
  for (const entry of readdirSync(srcDir)) {
    const s = join(srcDir, entry)
    const d = join(destDir, entry)
    if (statSync(s).isDirectory()) {
      const sub = copyDir(s, d)
      bytes += sub.bytes
      files += sub.files
    } else {
      copyFileSync(s, d)
      bytes += statSync(d).size
      files += 1
    }
  }
  return { bytes, files }
}

// ---- 1. 词库:只复制目录里登记过的 ----
const srcDicts = join(upstreamRoot, 'public', 'dicts')
const destDicts = resolve('public/dicts')
if (existsSync(destDicts)) rmSync(destDicts, { recursive: true, force: true })
mkdirSync(destDicts, { recursive: true })

let dictBytes = 0
let copied = 0
const missing = []
for (const d of catalog.dictionaries) {
  const fname = d.url.replace(/^\/dicts\//, '')
  const src = join(srcDicts, fname)
  if (!existsSync(src)) {
    missing.push(fname)
    continue
  }
  const dest = join(destDicts, fname)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  dictBytes += statSync(dest).size
  copied += 1
}

console.log(`词库: 复制 ${copied} 个 (${(dictBytes / 1024 / 1024).toFixed(1)} MB) -> public/dicts/`)
if (missing.length) {
  console.warn(`  ⚠️  缺失 ${missing.length} 个: ${missing.slice(0, 5).join(', ')}`)
}

// ---- 2. 音效 ----
const srcSounds = join(upstreamRoot, 'public', 'sounds')
const destSounds = resolve('public/sounds')
if (existsSync(srcSounds)) {
  if (existsSync(destSounds)) rmSync(destSounds, { recursive: true, force: true })
  const { bytes, files } = copyDir(srcSounds, destSounds)
  console.log(`音效: 复制 ${files} 个 (${(bytes / 1024).toFixed(0)} KB) -> public/sounds/`)
} else {
  console.warn('  ⚠️  上游没有 public/sounds 目录,跳过')
}

// ---- 3. LICENSE ----
const srcLicense = join(upstreamRoot, 'LICENSE')
if (existsSync(srcLicense)) {
  copyFileSync(srcLicense, resolve('LICENSE'))
  console.log('许可证: 复制上游 LICENSE (GPL-3.0) -> ./LICENSE')
} else {
  console.warn('  ⚠️  上游没有 LICENSE 文件')
}
