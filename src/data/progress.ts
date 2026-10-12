/**
 * 本地学习进度。
 *
 * 存储量很小(每个词库一条记录),用 localStorage 就够了,无需引入 Dexie/IndexedDB。
 * 上游用 Dexie 是因为它要存每一次按键的明细记录用于分析图表 —— 那是我们本版
 * 未纳入范围的功能(第一版只做打字练习与默写模式)。
 */

const STORAGE_KEY = 'qwerty-mobile:progress:v1'

export type Progress = {
  /** 上次练到的章节下标(从 0 开始) */
  chapter: number
  /** 累计完成练习的单词数 */
  wordsPracticed: number
  /** 历史最好 WPM */
  bestWpm: number
  /** 最近一次练习的正确率(0-100) */
  lastAccuracy: number
  /** 最近练习时间戳(ms) */
  updatedAt: number
}

const EMPTY: Progress = {
  chapter: 0,
  wordsPracticed: 0,
  bestWpm: 0,
  lastAccuracy: 0,
  updatedAt: 0,
}

type Store = Record<string, Progress>

function readStore(): Store {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // 存储损坏时当作空,不要让整个应用崩掉
    return {}
  }
}

function writeStore(store: Store): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // 隐私模式 / 配额满 —— 静默失败,不影响本次练习
  }
}

export function getProgress(dictId: string): Progress {
  return readStore()[dictId] ?? EMPTY
}

/**
 * 记录一次完成的练习。
 * @param wordsPracticed 本次练习的单词数(累加)
 * @param wpm 本次 WPM(取历史最好)
 * @param accuracy 本次正确率
 */
export function saveProgress(
  dictId: string,
  patch: { chapter: number; wordsPracticed: number; wpm: number; accuracy: number },
): void {
  const store = readStore()
  const prev = store[dictId] ?? EMPTY

  store[dictId] = {
    chapter: patch.chapter,
    wordsPracticed: prev.wordsPracticed + patch.wordsPracticed,
    bestWpm: Math.max(prev.bestWpm, patch.wpm),
    lastAccuracy: patch.accuracy,
    updatedAt: Date.now(),
  }

  writeStore(store)
}

/** 清空某个词库的进度(设置页用) */
export function resetProgress(dictId: string): void {
  const store = readStore()
  delete store[dictId]
  writeStore(store)
}

export function clearAllProgress(): void {
  writeStore({})
}

/** 全站累计练习单词数 —— 首页展示用 */
export function totalWordsPracticed(): number {
  return Object.values(readStore()).reduce((sum, p) => sum + p.wordsPracticed, 0)
}
