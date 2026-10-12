/**
 * 默写模式的挖空逻辑。
 *
 * 对齐上游 `WordDictationType` 的四种模式与 `getLetterVisible()`:
 *   src/pages/Typing/components/WordPanel/components/Word/index.tsx:137-166
 *   - vowelLetters:  src/.../Word/index.tsx:32   ['A','E','I','O','U']
 *   - randomHide:    src/.../Word/index.tsx:70   Math.random() > 0.4  (即隐藏约 40%)
 *
 * 重要行为:某个字母一旦被用户**打对**(letterState === 'correct'),无论挖空规则如何,
 * 都会显示出来 —— 这是上游的即时反馈设计,默写时字母会随着输入逐步揭示。
 */
import type { LetterState } from './typing'

export type WordDictationType = 'hideAll' | 'hideVowel' | 'hideConsonant' | 'randomHide'

/** 对齐上游 Word/index.tsx:32 */
export const VOWEL_LETTERS = ['A', 'E', 'I', 'O', 'U'] as const

/** 随机挖空的可见概率阈值:random() > 0.4 即可见,故约 60% 可见 / 40% 隐藏 */
const RANDOM_VISIBLE_THRESHOLD = 0.4

export const DICTATION_LABELS: Record<WordDictationType, string> = {
  hideAll: '全隐藏',
  hideVowel: '隐藏元音',
  hideConsonant: '隐藏辅音',
  randomHide: '随机挖空',
}

/** 判断某字符是否元音。非字母(数字、符号、空格)按辅音处理,对齐上游的 includes 判断。 */
export function isVowel(char: string): boolean {
  return (VOWEL_LETTERS as readonly string[]).includes(char.toUpperCase())
}

/**
 * 为「随机挖空」生成每个位置的可见性。
 * 每次进入新单词时重新生成一次,并保持稳定(不能每次渲染都重算,否则字母会闪)。
 */
export function generateRandomVisibility(word: string): boolean[] {
  return word.split('').map(() => Math.random() > RANDOM_VISIBLE_THRESHOLD)
}

/**
 * 某个位置的字母当前是否应当显示。
 *
 * @param type          挖空模式
 * @param enabled       默写模式是否开启;关闭时一律显示
 * @param letter        该位置的目标字符
 * @param index         字符下标
 * @param letterState   该位置的输入状态(打对的字母强制显示)
 * @param randomVisible generateRandomVisibility 的结果
 * @param revealAll     是否临时揭示全部答案(手机上没有 hover,用它做「长按提示」)
 */
export function isLetterVisible(
  type: WordDictationType,
  enabled: boolean,
  letter: string,
  index: number,
  letterState: LetterState,
  randomVisible: boolean[],
  revealAll = false,
): boolean {
  // 已打对 / 主动揭示答案 —— 一律显示
  if (letterState === 'correct' || revealAll) return true

  if (!enabled) return true

  switch (type) {
    case 'hideAll':
      return false
    case 'hideVowel':
      return !isVowel(letter)
    case 'hideConsonant':
      return isVowel(letter)
    case 'randomHide':
      // 兜底成 true:randomVisible 缺失时按可见处理,避免整词消失让人无从下手
      return randomVisible[index] ?? true
  }
}

/**
 * 该挖空模式下是否存在任何可见字符 —— 用于给出提示文案。
 * 例如 hideAll 全隐藏时,应提示用户「凭释义与音标拼写」。
 */
export function hasAnyVisibleLetter(type: WordDictationType, word: string): boolean {
  if (type === 'hideAll') return false
  if (type === 'hideVowel') return word.split('').some((c) => !isVowel(c))
  if (type === 'hideConsonant') return word.split('').some((c) => isVowel(c))
  return true
}
