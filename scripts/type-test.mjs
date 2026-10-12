#!/usr/bin/env node
/**
 * 逐字母打字诊断。
 *
 * 起因:真机反馈「打一个字母就直接消失,打不出完整的」。
 * 这个脚本在页面里逐字符输入,每一步都读回输入框的真实 value 与 React 状态,
 * 精确定位是"输入没被接收"还是"接收后被清掉"。
 *
 * 覆盖两条路径:
 *   A. 纯 input 事件        —— 桌面键盘 / 英文输入法
 *   B. 带 composition 事件  —— 手机输入法(会触发组合态)
 *   C. composition 中途发生重渲染(计时器每秒一次)—— 怀疑点
 *
 * 用法: node scripts/type-test.mjs <baseUrl> [目标单词]
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const BASE_URL = process.argv[2]
const TARGET = process.argv[3] || 'cancel'
if (!BASE_URL) {
  console.error('用法: node scripts/type-test.mjs <baseUrl> [目标单词]')
  process.exit(1)
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('找不到 Chrome')
  process.exit(1)
}

const PORT = 9334
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + process.env.TEMP + '/chrome-type-test',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
let msgId = 0
const pending = new Map()

function send(method, params = {}) {
  const id = ++msgId
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('CDP 超时: ' + method))
      }
    }, 30000)
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.exceptionDetails) {
    throw new Error('页面异常: ' + (res.exceptionDetails.exception?.description ?? ''))
  }
  return res.result?.value
}

/**
 * 在页面里注入打字辅助函数。
 *
 * 组合态的各个阶段拆成独立函数,由 Node 侧分次调用、中间留真实延迟 ——
 * 真实输入法就是这样跨多个时序发出事件的。早期版本把 compositionstart /
 * input / compositionend 挤在同一个 JS 时序里一次性发出,React 的批处理与
 * 组合态处理会让结果失真,测出来的现象和真机不一致。
 */
const HELPERS = `
window.__type = {
  input: () => document.querySelector('input[aria-label="输入单词"]'),
  value: () => document.querySelector('input[aria-label="输入单词"]')?.value ?? null,
  disabled: () => document.querySelector('input[aria-label="输入单词"]')?.disabled ?? null,
  setValue(el, v) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
  },
  // A. 纯 input 事件(英文输入法 / 桌面键盘)
  plain(ch) {
    const el = this.input();
    this.setValue(el, el.value + ch);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
  },
  // B/C. 组合态拆成三步
  compStart() {
    this.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  },
  compAppend(ch) {
    const el = this.input();
    this.setValue(el, el.value + ch);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertCompositionText', isComposing: true }));
  },
  compEnd() {
    const el = this.input();
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: el.value }));
  },
  // compositionend 之后补发的 input:值不变,只是再通知一次
  compTrailingInput() {
    const el = this.input();
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: el.value, inputType: 'insertText' }));
  },
  initLog() { window.__qwertyLog = []; },
  log() { return window.__qwertyLog || []; },
};
`

const results = []

/** 路径 A:纯 input 事件 */
async function walkPlain(step) {
  for (const ch of TARGET) {
    await evaluate(`window.__type.plain(${JSON.stringify(ch)})`)
    await sleep(200)
    results.push({ step, ch, value: await evaluate('window.__type.value()') })
  }
}

/**
 * 路径 B/C:组合态,分步 + 真实延迟。
 * @param trailingInput compositionend 之后是否补发一个普通 input
 *        (部分安卓输入法发,部分不发 —— 两条都要能工作)
 */
async function walkComposing(step, trailingInput, verbose = false) {
  let n = 0
  for (const ch of TARGET) {
    const log = verbose && n < 3 ? (s, v) => console.log(`      ${s.padEnd(26)} → DOM="${v}"`) : () => {}
    n++

    await evaluate('window.__type.initLog()')
    await evaluate('window.__type.compStart()')
    await sleep(120)
    log('compStart 之后', await evaluate('window.__type.value()'))

    await evaluate(`window.__type.compAppend(${JSON.stringify(ch)})`)
    await sleep(180)
    log(`compAppend("${ch}") 之后`, await evaluate('window.__type.value()'))

    await evaluate('window.__type.compEnd()')
    await sleep(120)
    log('compEnd 之后', await evaluate('window.__type.value()'))

    if (trailingInput) {
      await sleep(60)
      await evaluate('window.__type.compTrailingInput()')
    }
    await sleep(200)
    log('（本字符结束）', await evaluate('window.__type.value()'))

    if (verbose && n <= 3) {
      const entries = await evaluate('JSON.stringify(window.__type.log())')
      console.log(`      应用内部记录: ${entries}`)
    }

    results.push({ step, ch, value: await evaluate('window.__type.value()') })
  }
}

/**
 * 回到干净的练习状态。
 *
 * ⚠️ 必须先导航到 about:blank 再回目标地址。直接 navigate 到**同一个 hash**
 * 的地址时浏览器认为地址没变,不会重新加载页面 —— 上一个路径的进度(已经
 * 推进到第几个单词)会被继承下来,导致后续路径打在一个完全不同的单词上,
 * 测出来的现象全是假象。这个坑真实踩过一次。
 */
async function resetWord() {
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(600)
  await send('Page.navigate', { url: `${BASE_URL}#/practice/cet4/0` })
  await sleep(4500)
  await evaluate(HELPERS)
  // 断言确实回到了第 1 个单词
  const probe = await evaluate(`document.body.innerText.replace(/\\n/g, ' ').slice(0, 80)`)
  if (!/1\s*\/\s*20/.test(probe)) {
    throw new Error(`重置失败,当前不在第 1 章第 1 词: ${probe}`)
  }
}

async function main() {
  let targets
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      if (targets.some((t) => t.type === 'page')) break
    } catch {}
    await sleep(250)
  }
  const page = targets?.find((t) => t.type === 'page')
  if (!page) throw new Error('连不上 Chrome 调试端口')

  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    }
  }
  await send('Runtime.enable')
  await send('Page.enable')

  console.log(`目标单词: "${TARGET}"  |  地址: ${BASE_URL}\n`)

  // ---- 路径 A:纯 input 事件 ----
  await resetWord()
  const before = await evaluate(`document.body.innerText.slice(0,120).replace(/\\n/g,' ')`)
  console.log('练习页内容:', before)
  console.log('\n【路径 A】纯 input 事件(桌面键盘 / 英文输入法)')
  await walkPlain('A')
  const aFinal = results.filter((r) => r.step === 'A').map((r) => r.value).join(' >> ')
  console.log('  逐字符输入框内容:', aFinal)
  const aOk = results.filter((r) => r.step === 'A').at(-1)?.value === TARGET
  console.log(`  ${aOk ? '✅ 能打完整 ' + TARGET : '❌ 打不完整'}`)

  // ---- 路径 B:带 composition 事件 ----
  await resetWord()
  console.log('\n【路径 B】手机输入法(compositionstart → input → compositionend → input)')
  await walkComposing('B', true, true)
  const bVals = results.filter((r) => r.step === 'B').map((r) => r.value)
  console.log('  逐字符输入框内容:', bVals.join(' >> '))
  const bOk = bVals.at(-1) === TARGET
  console.log(`  ${bOk ? '✅ 能打完整' : '❌ 打不完整'}`)

  // ---- 路径 C:只发组合事件,不发补发的 input ----
  await resetWord()
  console.log('\n【路径 C】部分安卓输入法(compositionend 后不再补发 input)')
  await walkComposing('C', false)
  const cVals = results.filter((r) => r.step === 'C').map((r) => r.value)
  console.log('  逐字符输入框内容:', cVals.join(' >> '))
  const cOk = cVals.at(-1) === TARGET
  console.log(`  ${cOk ? '✅ 能打完整' : '❌ 打不完整'}`)

  // ---- 汇总 ----
  console.log('\n' + '─'.repeat(56))
  console.log('结论:')
  console.log(`  A 纯 input 事件      : ${aOk ? '✅ 正常' : '❌ 异常'}`)
  console.log(`  B 带 composition     : ${bOk ? '✅ 正常' : '❌ 异常'}`)
  console.log(`  C 无补发 input       : ${cOk ? '✅ 正常' : '❌ 异常'}`)
  if (!aOk || !bOk || !cOk) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\n出错:', e.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      ws?.close()
    } catch {}
    chrome.kill()
    await sleep(300)
  })
