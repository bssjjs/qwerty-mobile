/**
 * 词库按需加载。
 *
 * 全量词库 71.8 MB,绝不能进主 bundle —— 这里只在实际选中某个词库时才 fetch,
 * 并由 Service Worker 以 CacheFirst 策略缓存响应,实现「下过一次就离线可用」。
 * 另加一层内存缓存,避免同一次会话里切换词库时重复解析大 JSON。
 */
import type { Word } from '../lib/typing'
import catalogJson from './catalog.json'

export type DictionaryMeta = {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  url: string
  length: number
  language: string
  languageCategory: string
}

export const CATALOG: DictionaryMeta[] = (catalogJson as { dictionaries: DictionaryMeta[] }).dictionaries

/** 按分类分组,保持 catalog 中的原始顺序(上游用数组而非对象正是为了跨浏览器顺序稳定) */
export function groupByCategory(dicts: DictionaryMeta[] = CATALOG): Map<string, DictionaryMeta[]> {
  const map = new Map<string, DictionaryMeta[]>()
  for (const d of dicts) {
    const list = map.get(d.category)
    if (list) list.push(d)
    else map.set(d.category, [d])
  }
  return map
}

export function findDictionary(id: string): DictionaryMeta | undefined {
  return CATALOG.find((d) => d.id === id)
}

const memoryCache = new Map<string, Word[]>()

/** 用 BASE_URL 拼路径,兼容 GitHub Pages 子路径部署 */
function resolveDictUrl(url: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}${url.replace(/^\//, '')}`
}

/**
 * 读取某个词库的全部单词。
 * @throws 网络失败或 JSON 解析失败时抛出,由调用方展示错误态
 */
export async function loadDictionary(meta: DictionaryMeta): Promise<Word[]> {
  const cached = memoryCache.get(meta.id)
  if (cached) return cached

  const res = await fetch(resolveDictUrl(meta.url))
  if (!res.ok) {
    throw new Error(`词库加载失败 (${res.status}): ${meta.name}`)
  }

  const raw = (await res.json()) as Word[]
  if (!Array.isArray(raw)) {
    throw new Error(`词库格式异常: ${meta.name}`)
  }

  // 过滤掉没有 name 的脏数据,避免渲染时崩溃
  const words = raw.filter((w) => w && typeof w.name === 'string' && w.name.length > 0)
  memoryCache.set(meta.id, words)
  return words
}

/** 词库是否已在本次会话中加载过(用于 UI 提示) */
export function isDictionaryCached(id: string): boolean {
  return memoryCache.has(id)
}

/**
 * 预加载 —— 在用户停留于词库列表时后台把选中词库拉下来,减少点击后的等待。
 * 失败静默:真正进入练习时还会再走一次 loadDictionary 并展示错误。
 */
export function prefetchDictionary(meta: DictionaryMeta): void {
  if (memoryCache.has(meta.id)) return
  void loadDictionary(meta).catch(() => {})
}
