/**
 * 一次练习(一章)的状态机 —— 纯 reducer,不依赖 React,便于单元测试。
 *
 * 语义对齐上游 src/pages/Typing/store/index.ts 的 typingReducer:
 *   - 输入正确 -> correctCount+1,该字符标记 correct
 *   - 输入错误 -> wrongCount+1,标记 wrong,进入 hasWrong 锁定态,
 *                 组件在 WRONG_RESET_DELAY_MS 后派发 clearAfterWrong 清空整词
 *   - 单词完成 -> 派发 next,index+1 且 wordCount+1(wordCount 供 WPM 使用)
 *   - 每秒派发一次 tick 推进计时
 *
 * 上游在 hasWrong 期间会忽略后续输入(updateInput 里的 `if (wordState.hasWrong) return`),
 * 这里保持同样行为,避免用户在清空的空档里抢输入导致状态错乱。
 */
import type { LetterState, Word } from './typing'
import { calcAccuracy, calcWpm, compareInput, isCharMatch } from './typing'

export type SessionState = {
  words: Word[]
  /** 当前单词在 words 中的下标 */
  index: number
  /** 当前单词的输入内容 */
  input: string
  /** 当前单词每个位置的状态,长度与目标词一致 */
  letterStates: LetterState[]
  /** 出现错误后进入锁定态,等待组件清空输入 */
  hasWrong: boolean
  /** 正确输入的字符次数(正确率分子),对齐上游 correctCount */
  correctCount: number
  /** 错误输入的字符次数(正确率分母的一部分),对齐上游 wrongCount */
  wrongCount: number
  /** 已完成的单词数(WPM 分子),对齐上游 wordCount */
  wordCount: number
  elapsedSeconds: number
  /** 本章是否结束 */
  isFinished: boolean
  /** 本次练习中至少打错过一次的单词下标,用于结果页与错词回顾 */
  mistakeIndexes: number[]
  /** 判定是否忽略大小写,对齐上游 isIgnoreCase(默认 true) */
  ignoreCase: boolean
}

export type SessionAction =
  | { type: 'input'; value: string }
  | { type: 'clearAfterWrong' }
  | { type: 'tick' }
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'revealAnswer' }
  | { type: 'restart' }

export function createSession(words: Word[], ignoreCase = true): SessionState {
  return {
    words,
    index: 0,
    input: '',
    letterStates: new Array(words[0]?.name.length ?? 0).fill('normal'),
    hasWrong: false,
    correctCount: 0,
    wrongCount: 0,
    wordCount: 0,
    elapsedSeconds: 0,
    isFinished: words.length === 0,
    mistakeIndexes: [],
    ignoreCase,
  }
}

/** 当前单词;越界时返回 undefined */
export function currentWord(state: SessionState): Word | undefined {
  return state.words[state.index]
}

/** 实时统计 —— 供 StatsBar 展示,公式与上游一致 */
export function sessionStats(state: SessionState) {
  return {
    wpm: calcWpm(state.wordCount, state.elapsedSeconds),
    accuracy: calcAccuracy(state.correctCount, state.wrongCount),
    wordCount: state.wordCount,
    total: state.words.length,
  }
}

function freshLetterStates(word: Word | undefined): LetterState[] {
  return new Array(word?.name.length ?? 0).fill('normal')
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'input': {
      // 锁定态下忽略输入,对齐上游 updateInput 的 hasWrong 早退
      if (state.hasWrong || state.isFinished) return state

      const word = currentWord(state)
      if (!word) return state

      const target = word.name
      const value = action.value

      // 退格 / 清空 —— 不计罚分,仅回退状态
      if (value.length <= state.input.length) {
        return {
          ...state,
          input: value,
          letterStates: compareInput(value, target, state.ignoreCase),
        }
      }

      // 有新增字符:逐个校验新增部分,遇到第一个错误即停止
      const letterStates = [...state.letterStates]
      let correctCount = state.correctCount
      let wrongCount = state.wrongCount
      let hasWrong = false
      let accepted = state.input.length

      for (let i = state.input.length; i < value.length; i++) {
        const targetChar = target[i]
        if (targetChar === undefined) break // 超出目标词长度,忽略多余输入

        if (isCharMatch(value[i], targetChar, state.ignoreCase)) {
          letterStates[i] = 'correct'
          correctCount += 1
          accepted = i + 1
        } else {
          // 打错的字符**保留**在输入框里显示(红色),对齐上游行为:
          // 上游会让错误字符留在 inputWord 中 300ms,再由 clearAfterWrong 清空整词
          letterStates[i] = 'wrong'
          wrongCount += 1
          hasWrong = true
          accepted = i + 1
          break
        }
      }

      // 错误位置之后的字符一律忽略(用户可能一气呵成打了多个字)
      const nextInput = value.slice(0, accepted)

      const mistakeIndexes =
        hasWrong && !state.mistakeIndexes.includes(state.index) ? [...state.mistakeIndexes, state.index] : state.mistakeIndexes

      return {
        ...state,
        input: nextInput,
        letterStates,
        correctCount,
        wrongCount,
        hasWrong,
        mistakeIndexes,
      }
    }

    case 'clearAfterWrong': {
      if (!state.hasWrong) return state
      const word = currentWord(state)
      return {
        ...state,
        input: '',
        letterStates: freshLetterStates(word),
        hasWrong: false,
      }
    }

    case 'tick': {
      if (state.isFinished) return state
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 }
    }

    case 'next': {
      const nextIndex = state.index + 1
      const finished = nextIndex >= state.words.length

      if (finished) {
        return {
          ...state,
          index: nextIndex,
          wordCount: state.wordCount + 1,
          isFinished: true,
          input: '',
          letterStates: [],
          hasWrong: false,
        }
      }

      return {
        ...state,
        index: nextIndex,
        wordCount: state.wordCount + 1,
        input: '',
        letterStates: freshLetterStates(state.words[nextIndex]),
        hasWrong: false,
      }
    }

    case 'skip': {
      // 跳过不计入 wordCount,避免刷 WPM;但仍标记为跳过的词
      const nextIndex = state.index + 1
      const finished = nextIndex >= state.words.length
      return {
        ...state,
        index: nextIndex,
        isFinished: finished,
        input: '',
        letterStates: finished ? [] : freshLetterStates(state.words[nextIndex]),
        hasWrong: false,
      }
    }

    case 'revealAnswer':
      // 手机端没有 hover,用长按揭示答案 —— 不算通过,只是看一眼
      return { ...state, hasWrong: false }

    case 'restart':
      return createSession(state.words, state.ignoreCase)

    default:
      return state
  }
}

/** 当前单词是否已完整且正确地输入 */
export function isCurrentWordDone(state: SessionState): boolean {
  const word = currentWord(state)
  if (!word) return false
  return state.input.length === word.name.length && state.letterStates.every((s) => s === 'correct')
}
