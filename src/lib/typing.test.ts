import { describe, expect, it } from 'vitest'
import {
  CHAPTER_LENGTH,
  calcAccuracy,
  calcChapterCount,
  calcWpm,
  compareInput,
  isCharMatch,
  isWordComplete,
  sliceChapter,
} from './typing'

describe('calcChapterCount', () => {
  it('向上取整', () => {
    expect(calcChapterCount(0)).toBe(0)
    expect(calcChapterCount(1)).toBe(1)
    expect(calcChapterCount(CHAPTER_LENGTH)).toBe(1)
    expect(calcChapterCount(CHAPTER_LENGTH + 1)).toBe(2)
  })

  it('对齐上游 CET4 词库的章数(2607 词)', () => {
    expect(calcChapterCount(2607)).toBe(131)
  })
})

describe('calcAccuracy — 对齐上游 store/index.ts:200', () => {
  it('正确率 = round(correct / (correct + wrong) * 100)', () => {
    expect(calcAccuracy(8, 2)).toBe(80)
    expect(calcAccuracy(10, 0)).toBe(100)
    expect(calcAccuracy(0, 5)).toBe(0)
    expect(calcAccuracy(1, 2)).toBe(33)
  })

  it('无输入时用 1 兜底分母,不产生 NaN', () => {
    expect(calcAccuracy(0, 0)).toBe(0)
    expect(Number.isNaN(calcAccuracy(0, 0))).toBe(false)
  })

  it('四舍五入', () => {
    expect(calcAccuracy(2, 3)).toBe(40)
    expect(calcAccuracy(1, 6)).toBe(14) // 14.28... -> 14
    expect(calcAccuracy(5, 6)).toBe(45) // 45.45... -> 45
  })
})

describe('calcWpm — 对齐上游 store/index.ts:201(按单词计,非按字符)', () => {
  it('wpm = round(wordCount / 秒数 * 60)', () => {
    expect(calcWpm(20, 60)).toBe(20)
    expect(calcWpm(10, 30)).toBe(20)
    expect(calcWpm(5, 60)).toBe(5)
  })

  it('除以 0 时返回 0 而不是 Infinity', () => {
    expect(calcWpm(10, 0)).toBe(0)
    expect(calcWpm(0, 0)).toBe(0)
  })
})

describe('isCharMatch', () => {
  it('忽略大小写时 a 与 A 匹配', () => {
    expect(isCharMatch('a', 'A', true)).toBe(true)
    expect(isCharMatch('a', 'A', false)).toBe(false)
  })

  it('大小写敏感时严格比较', () => {
    expect(isCharMatch('a', 'a', false)).toBe(true)
    expect(isCharMatch('a', 'b', false)).toBe(false)
  })
})

describe('compareInput', () => {
  it('逐位标记正确与错误', () => {
    expect(compareInput('hel', 'hello', true)).toEqual(['correct', 'correct', 'correct', 'normal', 'normal'])
    expect(compareInput('hxl', 'hello', true)).toEqual(['correct', 'wrong', 'correct', 'normal', 'normal'])
  })

  it('空输入全部为 normal', () => {
    expect(compareInput('', 'abc', true)).toEqual(['normal', 'normal', 'normal'])
  })

  it('输入超过目标长度时不越界', () => {
    const states = compareInput('abcdef', 'abc', true)
    expect(states).toHaveLength(3)
  })
})

describe('isWordComplete', () => {
  it('完全正确且长度一致才通过', () => {
    expect(isWordComplete('hello', 'hello', true)).toBe(true)
    expect(isWordComplete('Hello', 'hello', true)).toBe(true)
    expect(isWordComplete('Hello', 'hello', false)).toBe(false)
    expect(isWordComplete('hell', 'hello', true)).toBe(false)
    expect(isWordComplete('hellx', 'hello', true)).toBe(false)
  })
})

describe('sliceChapter', () => {
  const words = Array.from({ length: 45 }, (_, i) => i)

  it('按 CHAPTER_LENGTH 切分', () => {
    expect(sliceChapter(words, 0)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(sliceChapter(words, 1)).toEqual(Array.from({ length: 20 }, (_, i) => i + 20))
  })

  it('最后一章不足整章时返回剩余部分', () => {
    expect(sliceChapter(words, 2)).toEqual([40, 41, 42, 43, 44])
  })

  it('越界返回空数组', () => {
    expect(sliceChapter(words, 3)).toEqual([])
    expect(sliceChapter(words, 999)).toEqual([])
  })
})
