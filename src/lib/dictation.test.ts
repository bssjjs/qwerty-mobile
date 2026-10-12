import { describe, expect, it } from 'vitest'
import { generateRandomVisibility, isLetterVisible, isVowel } from './dictation'

describe('isVowel — 对齐上游 Word/index.tsx:32 的 vowelLetters', () => {
  it('识别元音(大小写均可)', () => {
    for (const c of ['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U']) {
      expect(isVowel(c)).toBe(true)
    }
  })

  it('辅音返回 false', () => {
    for (const c of ['b', 'z', 'y', 'w', 'h']) {
      expect(isVowel(c)).toBe(false)
    }
  })

  it('非字母按辅音处理(与上游 includes 判断一致)', () => {
    expect(isVowel('1')).toBe(false)
    expect(isVowel('-')).toBe(false)
    expect(isVowel(' ')).toBe(false)
  })
})

describe('generateRandomVisibility — 对齐上游 Math.random() > 0.4', () => {
  it('长度与单词一致且全为布尔值', () => {
    const result = generateRandomVisibility('hello')
    expect(result).toHaveLength(5)
    expect(result.every((v) => typeof v === 'boolean')).toBe(true)
  })

  it('空单词返回空数组', () => {
    expect(generateRandomVisibility('')).toEqual([])
  })

  it('可见比例大致在 40%~80% 之间(隐藏约 40%)', () => {
    // 用长词降低随机波动,验证阈值方向没写反
    const result = generateRandomVisibility('a'.repeat(2000))
    const visibleRatio = result.filter(Boolean).length / result.length
    expect(visibleRatio).toBeGreaterThan(0.4)
    expect(visibleRatio).toBeLessThan(0.8)
  })
})

describe('isLetterVisible — 四种挖空模式', () => {
  const noRandom = [false, false, false, false, false]

  it('默写关闭时一律显示', () => {
    expect(isLetterVisible('hideAll', false, 'h', 0, 'normal', noRandom)).toBe(true)
  })

  it('已打对的字母强制显示(即使 hideAll)', () => {
    expect(isLetterVisible('hideAll', true, 'h', 0, 'correct', noRandom)).toBe(true)
  })

  it('revealAll 揭示全部答案', () => {
    expect(isLetterVisible('hideAll', true, 'h', 0, 'normal', noRandom, true)).toBe(true)
  })

  it('hideAll:未打对的一律隐藏', () => {
    expect(isLetterVisible('hideAll', true, 'h', 0, 'normal', noRandom)).toBe(false)
    expect(isLetterVisible('hideAll', true, 'e', 1, 'wrong', noRandom)).toBe(false)
  })

  it('hideVowel:元音隐藏、辅音可见', () => {
    // 'hello' -> h(辅,可见) e(元,隐藏) l(辅,可见) l(辅,可见) o(元,隐藏)
    expect(isLetterVisible('hideVowel', true, 'h', 0, 'normal', noRandom)).toBe(true)
    expect(isLetterVisible('hideVowel', true, 'e', 1, 'normal', noRandom)).toBe(false)
    expect(isLetterVisible('hideVowel', true, 'o', 4, 'normal', noRandom)).toBe(false)
  })

  it('hideConsonant:辅音隐藏、元音可见(与 hideVowel 互补)', () => {
    expect(isLetterVisible('hideConsonant', true, 'h', 0, 'normal', noRandom)).toBe(false)
    expect(isLetterVisible('hideConsonant', true, 'e', 1, 'normal', noRandom)).toBe(true)
    expect(isLetterVisible('hideConsonant', true, 'o', 4, 'normal', noRandom)).toBe(true)
  })

  it('randomHide:遵循生成的可见性数组', () => {
    const random = [true, false, true, false, true]
    expect(isLetterVisible('randomHide', true, 'h', 0, 'normal', random)).toBe(true)
    expect(isLetterVisible('randomHide', true, 'e', 1, 'normal', random)).toBe(false)
  })

  it('randomHide 数组缺失该下标时兜底为可见,避免整词消失无从下手', () => {
    expect(isLetterVisible('randomHide', true, 'h', 99, 'normal', [])).toBe(true)
  })
})
