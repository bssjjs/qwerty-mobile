import { useMemo, useState } from 'react'
import { CATALOG, type DictionaryMeta, groupByCategory } from '../data/dictLoader'
import { getProgress, totalWordsPracticed } from '../data/progress'
import { buildPath } from '../lib/router'
import { CHAPTER_LENGTH, calcChapterCount } from '../lib/typing'

/** 上游默认词库是 cet4,这里保持一致 */
const DEFAULT_DICT_ID = 'cet4'

function DictionaryRow({ dict }: { dict: DictionaryMeta }) {
  const progress = getProgress(dict.id)
  const chapterCount = calcChapterCount(dict.length)
  const hasProgress = progress.wordsPracticed > 0
  const isDefault = dict.id === DEFAULT_DICT_ID

  return (
    <li>
      <a
        href={buildPath({ name: 'practice', dictId: dict.id, chapter: progress.chapter, mode: 'typing' })}
        className="active:bg-ink-100 dark:active:bg-ink-800 flex min-h-16 items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-900 dark:text-ink-50 truncate font-medium">{dict.name}</span>
            {isDefault ? (
              <span className="bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100 shrink-0 rounded px-1.5 py-0.5 text-[10px]">
                默认
              </span>
            ) : null}
          </div>
          <div className="text-ink-500 dark:text-ink-300 mt-0.5 truncate text-xs">{dict.description}</div>
          <div className="text-ink-300 dark:text-ink-500 mt-0.5 text-[11px] tabular-nums">
            {dict.length} 词 · {chapterCount} 章
            {hasProgress ? ` · 上次第 ${progress.chapter + 1} 章` : ''}
          </div>
        </div>

        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-ink-300 dark:text-ink-700 shrink-0"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </a>
    </li>
  )
}

export function Home() {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => groupByCategory(), [])
  const practiced = useMemo(() => totalWordsPracticed(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return grouped

    const result = new Map<string, DictionaryMeta[]>()
    for (const [category, dicts] of grouped) {
      const hits = dicts.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          d.category.toLowerCase().includes(q),
      )
      if (hits.length) result.set(category, hits)
    }
    return result
  }, [grouped, query])

  const toggle = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const totalMatches = [...filtered.values()].reduce((sum, list) => sum + list.length, 0)

  return (
    <div className="min-h-dvh">
      <header className="pt-safe from-brand-600 to-brand-500 bg-gradient-to-b px-4 pb-5 text-white">
        <h1 className="text-xl font-semibold">Qwerty Learner</h1>
        <p className="mt-1 text-sm text-white/85">在手机上做打字练习与单词默写</p>
        {practiced > 0 ? (
          <p className="mt-2 text-xs text-white/70 tabular-nums">累计练习 {practiced} 个单词</p>
        ) : null}

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索词库,如 CET4、考研、JavaScript"
          className="text-ink-900 mt-4 min-h-11 w-full rounded-xl border-0 bg-white/95 px-4 text-sm outline-none placeholder:text-slate-400"
          aria-label="搜索词库"
        />
      </header>

      <main className="pb-safe px-2 py-3">
        {totalMatches === 0 ? (
          <p className="text-ink-500 dark:text-ink-300 py-16 text-center text-sm">
            没有匹配「{query}」的词库
          </p>
        ) : (
          [...filtered].map(([category, dicts]) => {
            const isCollapsed = collapsed.has(category) && !query
            return (
              <section key={category} className="mb-3">
                <button
                  type="button"
                  onClick={() => toggle(category)}
                  className="active:bg-ink-100 dark:active:bg-ink-800 flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left"
                  aria-expanded={!isCollapsed}
                >
                  <span className="text-ink-700 dark:text-ink-100 text-sm font-semibold">
                    {category}
                    <span className="text-ink-300 dark:text-ink-500 ml-2 font-normal tabular-nums">
                      {dicts.length}
                    </span>
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`text-ink-300 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isCollapsed ? null : (
                  <ul className="mt-0.5">
                    {dicts.map((dict) => (
                      <DictionaryRow key={dict.id} dict={dict} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })
        )}

        <footer className="text-ink-300 dark:text-ink-500 px-3 pt-4 pb-2 text-center text-[11px] leading-relaxed">
          词库数据来自{' '}
          <a
            href="https://github.com/RealKai42/qwerty-learner"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            RealKai42/qwerty-learner
          </a>
          (GPL-3.0)
          <br />
          本项目为移动端移植版,同样以 GPL-3.0 发布
          <br />
          共 {CATALOG.length} 个词库,每章 {CHAPTER_LENGTH} 词
        </footer>
      </main>
    </div>
  )
}
