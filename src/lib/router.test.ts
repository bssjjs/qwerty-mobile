import { describe, expect, it } from 'vitest'
import { buildPath, parseHash, type Route } from './router'

/**
 * 这组测试专门防一个曾经真实发生过的 bug:
 * buildPath 写入的是 Route.mode 的值("typing"/"dictation"),
 * 而 parseHash 当时只认 "practice",导致生成的链接点开后解析失败、
 * 静默回落到首页 —— 表现就是「点词库没反应」。
 *
 * 根因是两者各改各的、没有一致性约束。往返测试就是那个约束。
 */

const PRACTICE_TYPING: Route = { name: 'practice', dictId: 'cet4', chapter: 0, mode: 'typing' }
const PRACTICE_DICTATION: Route = { name: 'practice', dictId: 'cet6', chapter: 7, mode: 'dictation' }

describe('buildPath 与 parseHash 必须能往返', () => {
  it('打字练习:buildPath 产出的路径必须能被 parseHash 解回来', () => {
    const path = buildPath(PRACTICE_TYPING)
    const parsed = parseHash(path)

    expect(parsed).toEqual(PRACTICE_TYPING)
    // 而不是静默回落到首页
    expect(parsed.name).toBe('practice')
  })

  it('默写模式:同样必须往返一致', () => {
    expect(parseHash(buildPath(PRACTICE_DICTATION))).toEqual(PRACTICE_DICTATION)
  })

  it('首页往返', () => {
    expect(parseHash(buildPath({ name: 'home' }))).toEqual({ name: 'home' })
  })

  it('遍历所有模式,任何一种都不能退回首页', () => {
    for (const mode of ['typing', 'dictation'] as const) {
      const route: Route = { name: 'practice', dictId: 'cet4', chapter: 3, mode }
      const parsed = parseHash(buildPath(route))
      expect(parsed).toEqual(route)
    }
  })
})

describe('buildPath 产出的格式', () => {
  it('形如 #/<mode>/<词库id>/<章节>', () => {
    expect(buildPath(PRACTICE_TYPING)).toBe('#/typing/cet4/0')
    expect(buildPath(PRACTICE_DICTATION)).toBe('#/dictation/cet6/7')
  })

  it('词库 id 会被 URL 编码', () => {
    const path = buildPath({ name: 'practice', dictId: 'cet 4/x', chapter: 0, mode: 'typing' })
    expect(path).toBe('#/typing/cet%204%2Fx/0')
    // 且能正确解回来
    expect(parseHash(path)).toEqual({ name: 'practice', dictId: 'cet 4/x', chapter: 0, mode: 'typing' })
  })
})

describe('parseHash 的边界处理', () => {
  it('空 hash 回首页', () => {
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#')).toEqual({ name: 'home' })
    expect(parseHash('#/')).toEqual({ name: 'home' })
  })

  it('未知路径回首页,不抛异常', () => {
    expect(parseHash('#/nonsense')).toEqual({ name: 'home' })
    expect(parseHash('#/practice')).toEqual({ name: 'home' }) // 缺词库 id
  })

  it('章节号非法时归零', () => {
    expect(parseHash('#/typing/cet4/abc')).toMatchObject({ chapter: 0 })
    expect(parseHash('#/typing/cet4/-5')).toMatchObject({ chapter: 0 })
    expect(parseHash('#/typing/cet4')).toMatchObject({ chapter: 0 })
  })

  it('兼容早期链接里的 practice 别名', () => {
    expect(parseHash('#/practice/cet4/0')).toEqual(PRACTICE_TYPING)
  })

  it('忽略 query 串', () => {
    expect(parseHash('#/typing/cet4/2?foo=bar')).toMatchObject({ dictId: 'cet4', chapter: 2 })
  })
})
