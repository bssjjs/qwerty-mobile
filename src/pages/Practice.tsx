import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { PracticeInput } from '../components/PracticeInput'
import { StatsBar } from '../components/StatsBar'
import { WordDisplay } from '../components/WordDisplay'
import { findDictionary, loadDictionary } from '../data/dictLoader'
import { saveProgress } from '../data/progress'
import {
  DICTATION_LABELS,
  generateRandomVisibility,
  type WordDictationType,
} from '../lib/dictation'
import { navigate } from '../lib/router'
import { playSound, warmUpAudio } from '../lib/sound'
import {
  createSession,
  currentWord,
  isCurrentWordDone,
  sessionReducer,
  sessionStats,
} from '../lib/session'
import { WRONG_RESET_DELAY_MS, calcChapterCount, sliceChapter, type Word } from '../lib/typing'
import { speak, stopSpeaking, warmUpSpeech } from '../lib/speech'

/** 打完一个词后停留多久再切到下一个(让用户看到绿色反馈) */
const ADVANCE_DELAY_MS = 420

type Props = {
  dictId: string
  chapter: number
  mode: 'typing' | 'dictation'
}

// ---------------------------------------------------------------- 结果页

function ResultScreen({
  wpm,
  accuracy,
  wordCount,
  elapsedSeconds,
  mistakeWords,
  onNextChapter,
  onRetry,
  hasNextChapter,
}: {
  wpm: number
  accuracy: number
  wordCount: number
  elapsedSeconds: number
  mistakeWords: Word[]
  onNextChapter: () => void
  onRetry: () => void
  hasNextChapter: boolean
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <div className="text-5xl">🎉</div>
        <h2 className="text-ink-900 dark:text-ink-50 mt-3 text-xl font-semibold">本章完成</h2>
      </div>

      <div className="grid w-full max-w-sm grid-cols-3 gap-3">
        {[
          { label: 'WPM', value: wpm },
          { label: '正确率', value: `${accuracy}%` },
          { label: '用时', value: `${elapsedSeconds}s` },
        ].map((item) => (
          <div
            key={item.label}
            className="border-ink-100 dark:border-ink-800 dark:bg-ink-900 rounded-xl border bg-white p-3 text-center"
          >
            <div className="text-ink-900 dark:text-ink-50 text-xl font-semibold tabular-nums">
              {item.value}
            </div>
            <div className="text-ink-500 dark:text-ink-300 mt-0.5 text-xs">{item.label}</div>
          </div>
        ))}
      </div>

      {mistakeWords.length > 0 ? (
        <div className="w-full max-w-sm">
          <h3 className="text-ink-700 dark:text-ink-100 mb-2 text-sm font-medium">
            本章打错的词 ({mistakeWords.length})
          </h3>
          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {mistakeWords.map((w) => (
              <li
                key={w.name}
                className="border-ink-100 dark:border-ink-800 dark:bg-ink-900 flex items-baseline justify-between rounded-lg border bg-white px-3 py-2"
              >
                <span className="font-mono text-sm">{w.name}</span>
                <span className="text-ink-500 dark:text-ink-300 max-w-[60%] truncate text-xs">
                  {w.trans.join('; ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-ink-500 dark:text-ink-300 text-sm">全对,一个都没错 👏</p>
      )}

      <div className="w-full max-w-sm space-y-2">
        {hasNextChapter ? (
          <button
            type="button"
            onClick={onNextChapter}
            className="bg-brand-500 active:bg-brand-600 min-h-12 w-full rounded-xl font-medium text-white transition-colors"
          >
            下一章
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="border-ink-300 dark:border-ink-700 text-ink-700 dark:text-ink-100 active:bg-ink-100 dark:active:bg-ink-800 min-h-12 w-full rounded-xl border font-medium transition-colors"
        >
          重练本章
        </button>
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="text-ink-500 dark:text-ink-300 min-h-12 w-full text-sm"
        >
          返回词库列表
        </button>
      </div>

      <p className="text-ink-300 dark:text-ink-500 text-xs tabular-nums">本章共 {wordCount} 词</p>
    </div>
  )
}

// ---------------------------------------------------------------- 练习主体

function PracticeSession({
  words,
  dictId,
  chapter,
  chapterCount,
  mode,
}: {
  words: Word[]
  dictId: string
  chapter: number
  /** 该词库的总章数,用于判断是否还有下一章 */
  chapterCount: number
  mode: 'typing' | 'dictation'
}) {
  const [state, dispatch] = useReducer(sessionReducer, words, createSession)
  const [started, setStarted] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [dictationEnabled, setDictationEnabled] = useState(mode === 'dictation')
  const [dictationType, setDictationType] = useState<WordDictationType>('hideAll')
  const [accent, setAccent] = useState<'us' | 'uk'>('us')

  const word = currentWord(state)
  const stats = sessionStats(state)

  // 随机挖空的可见性:每个单词生成一次并保持稳定,否则每次渲染字母都会闪
  const randomVisible = useMemo(
    () => (word ? generateRandomVisibility(word.name) : []),
    [word?.name],
  )

  const wordDone = isCurrentWordDone(state)

  // ---- 计时:首次输入后才开始,避免用户还在看题目就被计时 ----
  useEffect(() => {
    if (!started || state.isFinished) return
    const timer = window.setInterval(() => dispatch({ type: 'tick' }), 1000)
    return () => window.clearInterval(timer)
  }, [started, state.isFinished])

  // ---- 打错后清空整词(对齐上游 300ms 后重置)----
  useEffect(() => {
    if (!state.hasWrong) return
    const timer = window.setTimeout(() => dispatch({ type: 'clearAfterWrong' }), WRONG_RESET_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [state.hasWrong])

  // ---- 单词打对后自动进入下一个 ----
  useEffect(() => {
    if (!wordDone) return
    const timer = window.setTimeout(() => dispatch({ type: 'next' }), ADVANCE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [wordDone])

  // ---- 每个新单词:重置揭示态并自动朗读(仅在开启时)----
  const prevIndexRef = useRef(state.index)
  useEffect(() => {
    if (prevIndexRef.current === state.index) return
    prevIndexRef.current = state.index
    setRevealed(false)
  }, [state.index])

  // ---- 结束:保存进度 ----
  useEffect(() => {
    if (!state.isFinished) return
    saveProgress(dictId, {
      chapter,
      wordsPracticed: state.wordCount,
      wpm: stats.wpm,
      accuracy: stats.accuracy,
    })
  }, [state.isFinished])

  // ---- 离开页面时停止发声 ----
  useEffect(() => () => stopSpeaking(), [])

  const handleChange = useCallback(
    (value: string) => {
      if (!started) {
        setStarted(true)
        // 首次输入是用户手势,顺便解锁移动端音频
        warmUpAudio()
        warmUpSpeech()
      }
      dispatch({ type: 'input', value })
    },
    [started],
  )

  const handleSpeak = useCallback(() => {
    if (!word) return
    warmUpAudio()
    warmUpSpeech()
    speak(word.name, accent)
  }, [word, accent])

  // 音效:打对 / 打错各响一声
  const lastCorrectRef = useRef(0)
  useEffect(() => {
    if (state.correctCount > lastCorrectRef.current) {
      lastCorrectRef.current = state.correctCount
      // 打完整词时用 success 音,否则用按键音
      playSound(wordDone ? 'correct' : 'click')
    }
  }, [state.correctCount, wordDone])

  useEffect(() => {
    if (state.wrongCount > 0) playSound('beep')
  }, [state.wrongCount])

  const mistakeWords = state.mistakeIndexes
    .map((i) => state.words[i])
    .filter((w): w is Word => Boolean(w))

  if (state.isFinished) {
    return (
      <ResultScreen
        wpm={stats.wpm}
        accuracy={stats.accuracy}
        wordCount={state.wordCount}
        elapsedSeconds={state.elapsedSeconds}
        mistakeWords={mistakeWords}
        hasNextChapter={chapter + 1 < chapterCount}
        onNextChapter={() => navigate({ name: 'practice', dictId, chapter: chapter + 1, mode })}
        onRetry={() => dispatch({ type: 'restart' })}
      />
    )
  }

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col">
      {/* 顶部:统计 + 返回 */}
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="text-ink-500 dark:text-ink-300 flex min-h-11 min-w-11 items-center justify-center"
          aria-label="返回词库列表"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1">
          <StatsBar
            wpm={stats.wpm}
            accuracy={stats.accuracy}
            position={state.index + 1}
            total={state.words.length}
            elapsedSeconds={state.elapsedSeconds}
          />
        </div>
      </header>

      {/* 中部:题目 */}
      <main className="flex flex-1 flex-col items-center justify-center gap-5">
        {word ? (
          <WordDisplay
            word={word}
            letterStates={state.letterStates}
            dictationEnabled={dictationEnabled}
            dictationType={dictationType}
            randomVisible={randomVisible}
            revealAll={revealed}
            accent={accent}
            onSpeak={handleSpeak}
            showTranslation
          />
        ) : null}

        {/* 默写模式的挖空方式切换 */}
        {dictationEnabled ? (
          <div className="flex flex-wrap justify-center gap-1.5 px-4">
            {(Object.keys(DICTATION_LABELS) as WordDictationType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDictationType(t)}
                className={`min-h-9 rounded-full px-3 text-xs transition-colors ${
                  dictationType === t
                    ? 'bg-brand-500 text-white'
                    : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                {DICTATION_LABELS[t]}
              </button>
            ))}
          </div>
        ) : null}
      </main>

      {/*
        底部:输入区。系统键盘会占据屏幕下半部分,这里整体上移。
        ⚠️ 按钮行必须允许换行(flex-wrap):4 个按钮在 390px 宽的手机上放不下,
        曾经因为不换行把整个页面撑出横向滚动条,连带把输入框也拉出屏幕外。
      */}
      <footer className="w-full min-w-0 px-3 pb-3">
        <PracticeInput value={state.input} onChange={handleChange} disabled={state.hasWrong} />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDictationEnabled((v) => !v)
              }}
              className={`min-h-10 shrink-0 rounded-lg px-3 text-xs transition-colors ${
                dictationEnabled
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100'
                  : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
              }`}
            >
              默写{dictationEnabled ? '开' : '关'}
            </button>

            <button
              type="button"
              onClick={() => {
                setAccent((a) => (a === 'us' ? 'uk' : 'us'))
              }}
              className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300 min-h-10 shrink-0 rounded-lg px-3 text-xs"
            >
              {accent === 'us' ? '美音' : '英音'}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onPointerDown={() => setRevealed(true)}
              onPointerUp={() => setRevealed(false)}
              onPointerLeave={() => setRevealed(false)}
              onPointerCancel={() => setRevealed(false)}
              className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300 min-h-10 shrink-0 rounded-lg px-3 text-xs"
            >
              看答案
            </button>

            <button
              type="button"
              onClick={() => dispatch({ type: 'skip' })}
              className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300 min-h-10 shrink-0 rounded-lg px-3 text-xs"
            >
              跳过
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------- 外层:加载词库

export function Practice({ dictId, chapter, mode }: Props) {
  const meta = useMemo(() => findDictionary(dictId), [dictId])
  const [words, setWords] = useState<Word[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!meta) {
      setError(`找不到词库: ${dictId}`)
      return
    }
    let cancelled = false
    setWords(null)
    setError(null)

    loadDictionary(meta)
      .then((all) => {
        if (cancelled) return
        const chapterWords = sliceChapter(all, chapter)
        if (chapterWords.length === 0) {
          setError('该章节没有单词')
          return
        }
        setWords(chapterWords)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '词库加载失败')
      })

    return () => {
      cancelled = true
    }
  }, [meta, chapter])

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-rose-500 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="bg-brand-500 min-h-11 rounded-xl px-5 text-white"
        >
          返回词库列表
        </button>
      </div>
    )
  }

  if (!words) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <div className="border-brand-500 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-ink-500 dark:text-ink-300 text-sm">
          正在加载 {meta?.name ?? dictId} 第 {chapter + 1} 章…
        </p>
        <p className="text-ink-300 dark:text-ink-500 text-xs">首次加载需要下载词库,之后可离线使用</p>
      </div>
    )
  }

  return (
    <PracticeSession
      words={words}
      dictId={dictId}
      chapter={chapter}
      chapterCount={calcChapterCount(meta?.length ?? words.length)}
      mode={mode}
    />
  )
}
