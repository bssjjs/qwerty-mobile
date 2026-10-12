import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    /** 诊断用埋点,仅在 scripts/type-test.mjs 里初始化;生产环境为 undefined 时不产生开销 */
    __qwertyLog?: Array<Record<string, unknown>>
  }
}

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * 背诵单词用的输入框 —— 全部难点都在这几个 HTML 属性上。
 *
 * 手机输入法默认会「帮忙」:自动改正拼写、自动首字母大写、弹出联想候选。
 * 对背单词来说这些都是致命的 —— 你打错 recieve,输入法会悄悄改成 receive,
 * 拼写练习就完全失去意义了。
 *
 * 各属性的作用:
 *   autocorrect="off"      iOS Safari:关闭自动改正
 *   autocapitalize="off"   关闭句首/单词首字母自动大写
 *   autocomplete="off"     关闭浏览器历史补全
 *   spellcheck="false"     关闭拼写检查红波浪线
 *   inputmode="text"       标准取值,请求一个普通文本键盘
 *   lang="en"              提示输入法这是英文语境
 *   enterkeyhint="next"    回车键显示「下一项」而非「换行」
 *
 * ⚠️ 关于 inputmode="latin":
 * 这是个**非标准**取值(HTML 规范的 inputmode 只有 none/text/tel/url/email/
 * numeric/decimal/search)。部分安卓输入法(如 Gboard)认识它并会切到英文键盘,
 * 所以下面仍然用 setAttribute 尽力设一下 —— 但它不可靠,也不能保证。
 *
 * 必须说清楚的事实:网页**无法强制**把用户的输入法从中文切到英文。
 * 输入法选择是系统级设置,只能由用户在键盘上手动切换。我们能做的是关掉一切
 * 自动更正,并保证输入法怎么工作都不会被我们打断(见下面「非受控」的说明)。
 */
export const INPUT_ATTRS = {
  autoCorrect: 'off',
  autoCapitalize: 'off',
  autoComplete: 'off',
  spellCheck: false,
  inputMode: 'text',
  lang: 'en',
  enterKeyHint: 'next',
} as const

/**
 * ⚠️ 设计说明:为什么这个输入框是**非受控**的(defaultValue 而非 value)
 *
 * 最初的写法是受控输入框(value + onChange 全量上交),并额外用 compositionstart /
 * compositionend 做「组合态期间不判定」的防护。真机反馈是「打一个字母就直接消失」。
 *
 * 根因:受控输入框要求 DOM 的值必须始终等于 React 状态。而输入法组合态期间,
 * 文本是由输入法自己缓冲的,React 状态里没有这份中间文本 —— 一旦发生重渲染
 * (本页每秒都有计时器 tick),React 就会按自己的状态把输入框**重置为空**,
 * 把用户刚打的字母连同输入法的缓冲一起抹掉。
 *
 * 改成非受控后,打字期间文本由浏览器持有,React 完全不插手:
 *   - 每个 input 事件读 DOM 的真实值上交(输入法的任何工作方式都不会被我们打断)
 *   - 只有当**会话**主动要求重置(打错清空 / 跳过 / 下一词)时,才用 effect 回写 DOM
 *   - DOM 与会话短暂不一致是安全的,因为 React 不会因此覆盖 DOM
 *
 * 回归测试:scripts/type-test.mjs 的路径 B / C 专门覆盖组合态的两条时序分支。
 */
export function PracticeInput({ value, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  /** 输入法组合态标记:组合期间绝不回写 DOM,否则会打断输入法的缓冲 */
  const composingRef = useRef(false)

  // 自动聚焦并保持焦点。点「发音」等按钮后焦点会跑掉,这里在失焦时拉回来,
  // 否则用户打完一个词就得再点一次输入框才能继续。
  useEffect(() => {
    const el = inputRef.current
    if (!el || disabled) return

    // 尽力而为:非标准的 inputmode="latin",部分安卓输入法据此切到英文键盘。
    // 用 setAttribute 绕过 React 的类型限制(该取值不在规范的取值集合里)。
    el.setAttribute('inputmode', 'latin')

    el.focus({ preventScroll: true })

    const onBlur = () => {
      // 用 setTimeout 让同一轮里其它按钮的点击先完成,避免抢焦点
      window.setTimeout(() => {
        if (document.activeElement !== el && !composingRef.current) {
          el.focus({ preventScroll: true })
        }
      }, 0)
    }

    el.addEventListener('blur', onBlur)
    return () => el.removeEventListener('blur', onBlur)
  }, [disabled])

  // 会话要求重置时(值变成空串、或变成另一个前缀)才回写 DOM。
  // 组合态期间一律跳过 —— 那是输入法正在工作,打断它就会丢字。
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    if (composingRef.current) return
    if (el.value !== value) {
      window.__qwertyLog?.push({ src: 'sync', from: el.value, to: value })
      el.value = value
    }
  }, [value])

  const readValue = (el: HTMLInputElement) => {
    window.__qwertyLog?.push({ src: 'readValue', v: el.value, composing: composingRef.current })
    onChange(el.value)
  }

  return (
    <input
      ref={inputRef}
      {...INPUT_ATTRS}
      // 非受控:初值空串,此后由浏览器持有文本。详见上方设计说明。
      defaultValue=""
      disabled={disabled}
      onInput={(e) => {
        // 组合期间不上交,等 compositionend 拿到最终结果再交。
        // 注意这里只是「不上交」,并不阻止 DOM 更新,所以不会丢字。
        if (composingRef.current) return
        readValue(e.currentTarget)
      }}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false
        // 组合结束,输入法已上屏,把最终文本交给判定
        readValue(e.currentTarget)
      }}
      className="typing-input caret-transparent w-full rounded-xl border-2 border-ink-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-widest outline-none transition-colors focus:border-brand-500 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50 dark:focus:border-brand-400"
      placeholder="在这里输入…"
      aria-label="输入单词"
    />
  )
}
