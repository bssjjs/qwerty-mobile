type Props = {
  wpm: number
  accuracy: number
  /** 当前是本章第几个词(从 1 开始显示) */
  position: number
  total: number
  elapsedSeconds: number
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 实时统计条。字段与公式对齐上游: WPM 按单词计,正确率按输入次数计。 */
export function StatsBar({ wpm, accuracy, position, total, elapsedSeconds }: Props) {
  const progress = total === 0 ? 0 : (position / total) * 100

  return (
    <div className="w-full">
      <div className="text-ink-500 dark:text-ink-300 flex items-center justify-between px-1 text-xs tabular-nums">
        <span>
          <span className="text-ink-800 dark:text-ink-50 font-semibold">{position}</span> / {total}
        </span>
        <span>
          WPM <span className="text-ink-800 dark:text-ink-50 font-semibold">{wpm}</span>
        </span>
        <span>
          正确率 <span className="text-ink-800 dark:text-ink-50 font-semibold">{accuracy}%</span>
        </span>
        <span className="tabular-nums">{formatTime(elapsedSeconds)}</span>
      </div>

      <div className="bg-ink-100 dark:bg-ink-800 mt-2 h-1 w-full overflow-hidden rounded-full">
        <div
          className="bg-brand-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
