#!/usr/bin/env node
/**
 * 从上游 qwerty-learner 的 src/resources/dictionary.ts 提取词库目录元数据,
 * 输出为 src/data/catalog.json,并校验每条记录在磁盘上确实有对应的 JSON 文件。
 *
 * 用法: node scripts/extract-catalog.mjs <upstream-repo-root> [输出路径]
 *
 * 说明:这里用正则做结构性提取,而不是 import/eval 上游文件 —— 上游代码是外部
 * 下载的内容,只读不执行。提取结果会与 public/dicts 下的真实文件交叉校验。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const upstreamRoot = process.argv[2]
const outPath = process.argv[3] ?? 'src/data/catalog.json'

if (!upstreamRoot) {
  console.error('用法: node scripts/extract-catalog.mjs <upstream-repo-root> [输出路径]')
  process.exit(1)
}

const dictDir = join(upstreamRoot, 'public', 'dicts')
const catalogSrc = join(upstreamRoot, 'src', 'resources', 'dictionary.ts')

if (!existsSync(catalogSrc)) {
  console.error(`找不到上游词库目录文件: ${catalogSrc}`)
  process.exit(1)
}
if (!existsSync(dictDir)) {
  console.error(`找不到上游词库目录: ${dictDir}`)
  process.exit(1)
}

const source = readFileSync(catalogSrc, 'utf8')

// 去掉 // 行注释与 /* */ 块注释,避免注释里的示例对象被误提取
const stripped = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

/** 取字符串字面量字段,支持单引号与双引号 */
function strField(block, key) {
  const m = block.match(new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`))
  return m ? m[2].replace(/\\(['"`\\])/g, '$1') : undefined
}

/** 取数字字段 */
function numField(block, key) {
  const m = block.match(new RegExp(`\\b${key}\\s*:\\s*(\\d+)`))
  return m ? Number(m[1]) : undefined
}

/** 取字符串数组字段,如 tags: ['大学英语', '四级'] */
function arrField(block, key) {
  const m = block.match(new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`))
  if (!m) return undefined
  const items = []
  const re = /(['"`])((?:\\.|(?!\1).)*)\1/g
  let mm
  while ((mm = re.exec(m[1])) !== null) items.push(mm[2])
  return items
}

// 每个词库条目都是一个「不含嵌套对象/数组以外花括号」的扁平字面量。
// 用非贪婪匹配抓取包含 url: '/dicts/...' 的对象块。
const entries = []
const blockRe = /\{[^{}]*?url\s*:\s*['"`]\/dicts\/[^'"`]+['"`][^{}]*?\}/g

let match
while ((match = blockRe.exec(stripped)) !== null) {
  const block = match[0]
  const id = strField(block, 'id')
  const url = strField(block, 'url')
  const name = strField(block, 'name')
  const category = strField(block, 'category')

  if (!id || !url) continue

  entries.push({
    id,
    name: name ?? id,
    description: strField(block, 'description') ?? '',
    category: category ?? '未分类',
    tags: arrField(block, 'tags') ?? [],
    url,
    length: numField(block, 'length') ?? 0,
    language: strField(block, 'language') ?? 'en',
    languageCategory: strField(block, 'languageCategory') ?? 'en',
  })
}

// ---- 交叉校验:元数据必须与实际存在的词库文件一一对应 ----
const filesOnDisk = new Set(readdirSync(dictDir).filter((f) => f.endsWith('.json')))
const problems = []

// 去重与 id 冲突消解。上游目录存在两类问题,必须区别对待:
//  1) 同一文件被登记进多个分类(如 Oxford5000) -> 内容相同,按 url 去重
//  2) 不同文件却用了同一个 id(上游数据 bug,如 frequently_used_words03
//     分别指向 frequently_used_word02/03.json) -> 是两个不同词库,不能去重,
//     改为回退到文件名作为 id
const byUrl = new Map()
const droppedAsDuplicate = []

for (const e of entries) {
  if (byUrl.has(e.url)) {
    droppedAsDuplicate.push(e)
    continue
  }
  byUrl.set(e.url, e)
}

let unique = [...byUrl.values()]
const usedIds = new Map()

for (const e of unique) {
  if (!usedIds.has(e.id)) {
    usedIds.set(e.id, e)
    continue
  }
  // id 冲突:回退到文件名主干,保证唯一且可读
  const stem = e.url.replace(/^\/dicts\//, '').replace(/\.json$/, '')
  let candidate = stem
  let n = 2
  while (usedIds.has(candidate)) candidate = `${stem}-${n++}`
  problems.push(`id 冲突: "${e.id}" 被多个不同词库占用,已把「${e.name}」的 id 改为 "${candidate}"`)
  e.id = candidate
  usedIds.set(candidate, e)
}

entries.length = 0
entries.push(...unique)

for (const e of entries) {
  const fname = e.url.replace(/^\/dicts\//, '')
  if (!filesOnDisk.has(fname)) problems.push(`id=${e.id} 指向的文件不存在: ${fname}`)
}

if (droppedAsDuplicate.length) {
  console.log(`\n按 url 去重:合并了 ${droppedAsDuplicate.length} 条跨分类重复登记`)
  droppedAsDuplicate.forEach((e) => console.log(`   - ${e.name} (${e.url}) @ 分类「${e.category}」`))
}

// 反向检查:磁盘上有词库文件但目录里没登记
const registeredFiles = new Set(entries.map((e) => e.url.replace(/^\/dicts\//, '')))
const orphans = [...filesOnDisk].filter((f) => !registeredFiles.has(f))

const output = {
  generatedFrom: 'RealKai42/qwerty-learner src/resources/dictionary.ts',
  count: entries.length,
  dictionaries: entries,
}

mkdirSync(dirname(resolve(outPath)), { recursive: true })
writeFileSync(resolve(outPath), JSON.stringify(output, null, 2) + '\n', 'utf8')

console.log(`提取词库目录: ${entries.length} 条 -> ${outPath}`)
console.log(`磁盘文件数: ${filesOnDisk.size}`)
const byCategory = {}
for (const e of entries) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1
console.log('分类分布:', byCategory)

if (problems.length) {
  console.warn(`\n⚠️  校验发现 ${problems.length} 个问题:`)
  problems.slice(0, 20).forEach((p) => console.warn('   -', p))
} else {
  console.log('✅ 校验通过:所有词库条目均指向真实存在的文件,无重复 id')
}

if (orphans.length) {
  console.warn(`\n⚠️  ${orphans.length} 个词库文件未被目录登记(不影响使用,未收录):`)
  orphans.slice(0, 10).forEach((f) => console.warn('   -', f))
}
