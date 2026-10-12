/**
 * 打字练习的纯逻辑层。
 *
 * 这里的公式与判定规则**逐条对齐上游** RealKai42/qwerty-learner(GPL-3.0):
 *   - 章节长度:  src/constants/index.ts  CHAPTER_LENGTH = 20
 *   - WPM:      src/pages/Typing/store/index.ts:201  round(wordCount / time * 60)
 *   - 正确率:    src/pages/Typing/store/index.ts:200  round(correct / (correct + wrong) * 100)
 *   - 逐字符判定: src/pages/Typing/components/WordPanel/components/Word/index.tsx:180-185
 *
 * 与上游的**唯一有意差异**:上游在打错时把整词输入清空(300ms 后),这里保留同样的
 * 语义,但把它建模成显式的状态转换,便于测试与在手机输入法下控制时机。
 */

/** 每章的单词数,对齐上游 CHAPTER_LENGTH */
export const CHAPTER_LENGTH = 20

/** 打错后清空输入的延迟(毫秒),对齐上游 Word/index.tsx:239 的 300ms */
export const WRONG_RESET_DELAY_MS = 300

export type LetterState = 'normal' | 'correct' | 'wrong'

/** 一个待练习的单词。字段对齐上游 `Word` 类型,音标可选(程序员词库没有音标)。 */
export type Word = {
  name: string
  trans: string[]
  usphone?: string
  ukphone?: string
  notation?: string
}

/** 章节数 = 向上取整(词数 / 每章词数),对齐上游 utils/index.ts:94 */
export function calcChapterCount(wordCount: number): number {
  return Math.ceil(wordCount / CHAPTER_LENGTH)
}

/**
 * 正确率,对齐上游 store/index.ts:200。
 * 分母是「正确次数 + 错误次数」,两者都按**输入事件**计数而非单词数。
 * 上游在分母为 0 时用 1 兜底,避免除零,这里保持同样处理。
 */
export function calcAccuracy(correctCount: number, wrongCount: number): number {
  const sum = correctCount + wrongCount === 0 ? 1 : correctCount + wrongCount
  return Math.round((correctCount / sum) * 100)
}

/**
 * 每分钟单词数,对齐上游 store/index.ts:201。
 * 注意:上游的 wpm 是**按单词**计的(wordCount),不是按字符。
 * elapsedSeconds 为 0 时返回 0,避免除零得到 Infinity。
 */
export function calcWpm(wordCount: number, elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0
  return Math.round((wordCount / elapsedSeconds) * 60)
}

/**
 * 单个字符是否匹配,对齐上游 Word/index.tsx:184。
 * ignoreCase 默认 true(上游 isIgnoreCaseAtom 默认 true)。
 */
export function isCharMatch(inputChar: string, targetChar: string, ignoreCase: boolean): boolean {
  if (ignoreCase) return inputChar.toLowerCase() === targetChar.toLowerCase()
  return inputChar === targetChar
}

/**
 * 逐字符比对整段输入与目标词,返回每个位置的状态。
 * 用于把「已输入部分」渲染成正确/错误的着色。
 */
export function compareInput(input: string, target: string, ignoreCase: boolean): LetterState[] {
  const states: LetterState[] = new Array(target.length).fill('normal')
  for (let i = 0; i < Math.min(input.length, target.length); i++) {
    states[i] = isCharMatch(input[i], target[i], ignoreCase) ? 'correct' : 'wrong'
  }
  return states
}

/** 输入是否已完整且全部正确 —— 即该单词通关 */
export function isWordComplete(input: string, target: string, ignoreCase: boolean): boolean {
  if (input.length !== target.length) return false
  for (let i = 0; i < target.length; i++) {
    if (!isCharMatch(input[i], target[i], ignoreCase)) return false
  }
  return true
}

/** 把词表切成章节;chapterIndex 从 0 开始,越界返回空数组 */
export function sliceChapter<T>(words: T[], chapterIndex: number): T[] {
  const start = chapterIndex * CHAPTER_LENGTH
  return words.slice(start, start + CHAPTER_LENGTH)
}
