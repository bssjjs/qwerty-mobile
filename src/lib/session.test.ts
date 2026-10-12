import { describe, expect, it } from 'vitest'
import {
  createSession,
  currentWord,
  isCurrentWordDone,
  sessionReducer as reduce,
  sessionStats,
  type SessionState,
} from './session'
import type { Word } from './typing'

const WORDS: Word[] = [
  { name: 'cat', trans: ['猫'], usphone: 'kæt' },
  { name: 'dog', trans: ['狗'], usphone: 'dɔɡ' },
  { name: 'bird', trans: ['鸟'], usphone: 'bɜːd' },
]

const start = (words: Word[] = WORDS, ignoreCase = true): SessionState => createSession(words, ignoreCase)

/** 连续输入若干个字符 */
function type(state: SessionState, text: string): SessionState {
  let s = state
  for (const ch of text) {
    s = reduce(s, { type: 'input', value: s.input + ch })
  }
  return s
}

describe('createSession', () => {
  it('初始状态', () => {
    const s = start()
    expect(s.index).toBe(0)
    expect(s.input).toBe('')
    expect(currentWord(s)?.name).toBe('cat')
    expect(s.letterStates).toEqual(['normal', 'normal', 'normal'])
    expect(s.isFinished).toBe(false)
  })

  it('空词表直接视为结束', () => {
    expect(start([]).isFinished).toBe(true)
  })
})

describe('正确输入', () => {
  it('逐字符累计 correctCount 并标记 correct', () => {
    const s = type(start(), 'cat')
    expect(s.correctCount).toBe(3)
    expect(s.wrongCount).toBe(0)
    expect(s.letterStates).toEqual(['correct', 'correct', 'correct'])
    expect(isCurrentWordDone(s)).toBe(true)
  })

  it('大小写不敏感时 "Cat" 也算对', () => {
    const s = type(start(), 'Cat')
    expect(s.correctCount).toBe(3)
    expect(isCurrentWordDone(s)).toBe(true)
  })

  it('大小写敏感时 "Cat" 判错', () => {
    const s = type(start(WORDS, false), 'C')
    expect(s.wrongCount).toBe(1)
    expect(s.hasWrong).toBe(true)
  })
})

describe('错误输入 —— 防错记核心机制', () => {
  it('打错一个字符即进入 hasWrong 锁定态,并记入 wrongCount', () => {
    const s = type(start(), 'cx')
    expect(s.wrongCount).toBe(1)
    expect(s.correctCount).toBe(1)
    expect(s.hasWrong).toBe(true)
    expect(s.letterStates).toEqual(['correct', 'wrong', 'normal'])
  })

  it('错误字符会保留在 input 里以便回显红色(对齐上游 300ms 窗口)', () => {
    const s = type(start(), 'cx')
    expect(s.input).toBe('cx')
  })

  it('锁定态下后续输入被忽略(对齐上游 updateInput 的 hasWrong 早退)', () => {
    const locked = type(start(), 'cx')
    const after = reduce(locked, { type: 'input', value: 'cxa' })
    expect(after.correctCount).toBe(locked.correctCount)
    expect(after.wrongCount).toBe(locked.wrongCount)
    expect(after.input).toBe(locked.input)
  })

  it('clearAfterWrong 清空整词并复位所有字母状态 —— 必须从头重打', () => {
    const locked = type(start(), 'cx')
    const cleared = reduce(locked, { type: 'clearAfterWrong' })
    expect(cleared.input).toBe('')
    expect(cleared.letterStates).toEqual(['normal', 'normal', 'normal'])
    expect(cleared.hasWrong).toBe(false)
  })

  it('clearAfterWrong 在未锁定时不产生副作用', () => {
    const s = type(start(), 'ca')
    const after = reduce(s, { type: 'clearAfterWrong' })
    expect(after).toBe(s)
  })

  it('记录打错的单词下标,供结果页回顾', () => {
    let s = type(start(), 'cx')
    s = reduce(s, { type: 'clearAfterWrong' })
    expect(s.mistakeIndexes).toEqual([0])
    // 同一个词多次打错只记一次
    s = type(s, 'cy')
    s = reduce(s, { type: 'clearAfterWrong' })
    expect(s.mistakeIndexes).toEqual([0])
  })

  it('一次灌入多个字符时,遇到第一个错误即截断,不误判后续字符', () => {
    const s = reduce(start(), { type: 'input', value: 'cxyz' })
    expect(s.input).toBe('cx')
    expect(s.wrongCount).toBe(1)
    expect(s.correctCount).toBe(1)
  })
})

describe('退格', () => {
  it('退格不计罚分,仅回退状态', () => {
    const typed = type(start(), 'ca')
    const back = reduce(typed, { type: 'input', value: 'c' })
    expect(back.correctCount).toBe(2) // correctCount 是累计次数,不因退格回退
    expect(back.wrongCount).toBe(0)
    expect(back.letterStates).toEqual(['correct', 'normal', 'normal'])
  })

  it('全部删空', () => {
    const typed = type(start(), 'cat')
    const empty = reduce(typed, { type: 'input', value: '' })
    expect(empty.input).toBe('')
    expect(empty.letterStates).toEqual(['normal', 'normal', 'normal'])
  })
})

describe('推进到下一个单词', () => {
  it('next 使 index+1 且 wordCount+1(WPM 分子)', () => {
    const s = reduce(type(start(), 'cat'), { type: 'next' })
    expect(s.index).toBe(1)
    expect(s.wordCount).toBe(1)
    expect(currentWord(s)?.name).toBe('dog')
    expect(s.input).toBe('')
    expect(s.letterStates).toEqual(['normal', 'normal', 'normal'])
  })

  it('最后一个词 next 后进入结束态', () => {
    let s = start()
    s = reduce(s, { type: 'next' })
    s = reduce(s, { type: 'next' })
    s = reduce(s, { type: 'next' })
    expect(s.isFinished).toBe(true)
    expect(s.wordCount).toBe(3)
    expect(s.letterStates).toEqual([])
  })

  it('跳过不计入 wordCount,避免刷高 WPM', () => {
    const s = reduce(start(), { type: 'skip' })
    expect(s.index).toBe(1)
    expect(s.wordCount).toBe(0)
  })
})

describe('计时与统计', () => {
  it('tick 累加 elapsedSeconds', () => {
    const s = reduce(reduce(start(), { type: 'tick' }), { type: 'tick' })
    expect(s.elapsedSeconds).toBe(2)
  })

  it('结束后 tick 不再累加', () => {
    let s = start()
    s = reduce(s, { type: 'next' })
    s = reduce(s, { type: 'next' })
    s = reduce(s, { type: 'next' })
    const after = reduce(s, { type: 'tick' })
    expect(after.elapsedSeconds).toBe(s.elapsedSeconds)
  })

  it('sessionStats 与上游公式一致', () => {
    // 打完 2 个词,耗时 6 秒 -> wpm = round(2/6*60) = 20
    let s = type(start(), 'cat')
    s = reduce(s, { type: 'next' })
    s = type(s, 'dog')
    s = reduce(s, { type: 'next' })
    for (let i = 0; i < 6; i++) s = reduce(s, { type: 'tick' })

    const stats = sessionStats(s)
    expect(stats.wpm).toBe(20)
    expect(stats.accuracy).toBe(100)
    expect(stats.wordCount).toBe(2)
    expect(stats.total).toBe(3)
  })
})

describe('restart', () => {
  it('回到本章开头且统计清零,保留单词表', () => {
    let s = type(start(), 'cat')
    s = reduce(s, { type: 'next' })
    const restarted = reduce(s, { type: 'restart' })
    expect(restarted.index).toBe(0)
    expect(restarted.wordCount).toBe(0)
    expect(restarted.correctCount).toBe(0)
    expect(restarted.words).toHaveLength(3)
  })
})
