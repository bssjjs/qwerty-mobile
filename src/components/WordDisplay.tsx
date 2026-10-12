import { memo } from 'react'
import { isLetterVisible, type WordDictationType } from '../lib/dictation'
import type { LetterState, Word } from '../lib/typing'

type Props = {
  word: Word
  letterStates: LetterState[]
  /** 默写模式是否开启 */
  dictationEnabled: boolean
  dictationType: WordDictationType
  randomVisible: boolean[]
  /** 长按揭示答案 */
  revealAll: boolean
  /** 显示哪个音标的发音 */
  accent: 'us' | 'uk'
  onSpeak: () => void
  /** 是否显示中文释义(默写模式下可隐藏以增加难度) */
  showTranslation?: boolean
}

/** 挖空时占位符 */
const HIDDEN_MARK = '•'

export const WordDisplay = memo(function WordDisplay({
  word,
  letterStates,
  dictationEnabled,
  dictationType,
  randomVisible,
  revealAll,
  accent,
  onSpeak,
  showTranslation = true,
}: Props) {
  const phonetic = accent === 'uk' ? (word.ukphone ?? word.usphone) : (word.usphone ?? word.ukphone)
  const letters = word.name.split('')

  return (
    <div className="no-select flex flex-col items-center gap-3 px-4">
      {/* 音标 —— 程序员等词库没有音标字段,此时整行不渲染,避免出现空白行 */}
      {phonetic ? (
        <div className="text-ink-500 dark:text-ink-300 font-mono text-base sm:text-lg">/{phonetic}/</div>
      ) : null}

      {/* 目标单词 */}
      <div
        className="flex flex-wrap items-baseline justify-center gap-x-[0.06em] font-mono text-4xl font-semibold tracking-wide sm:text-5xl"
        aria-label={revealAll || !dictationEnabled ? word.name : '待默写的单词'}
      >
        {letters.map((letter, i) => {
          const state = letterStates[i] ?? 'normal'
          const visible = isLetterVisible(
            dictationType,
            dictationEnabled,
            letter,
            i,
            state,
            randomVisible,
            revealAll,
          )

          // 未显示时用占位符,但保持等宽以便布局稳定
          const display = visible ? letter : HIDDEN_MARK

          const colorClass =
            state === 'correct'
              ? 'text-emerald-500'
              : state === 'wrong'
                ? 'text-rose-500'
                : dictationEnabled && !visible
                  ? 'text-ink-300 dark:text-ink-700'
                  : 'text-ink-800 dark:text-ink-50'

          return (
            <span key={`${letter}-${i}`} className={`transition-colors duration-100 ${colorClass}`}>
              {display}
            </span>
          )
        })}
      </div>

      {/* 发音按钮 —— 由用户点击触发,顺带满足 iOS 要求「首次发声必须在用户手势内」 */}
      <button
        type="button"
        onClick={onSpeak}
        className="border-ink-300 dark:border-ink-700 text-ink-500 dark:text-ink-300 active:bg-ink-100 dark:active:bg-ink-800 flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors"
        aria-label="播放发音"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        </svg>
        发音
      </button>

      {/* 中文释义 */}
      {showTranslation && word.trans.length > 0 ? (
        <div className="text-ink-700 dark:text-ink-100 max-w-md text-center text-base leading-relaxed">
          {word.trans.join('; ')}
        </div>
      ) : null}
    </div>
  )
})
