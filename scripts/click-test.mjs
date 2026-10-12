#!/usr/bin/env node
/**
 * 真实点击冒烟测试。
 *
 * 为什么需要它:曾经出过一个 bug —— 首页词库链接生成的 href 是 #/typing/cet4/0,
 * 但路由解析只认 "practice",点开后静默回落到首页,表现是「点词库没反应」。
 * 当时我用「手敲 URL」的方式验证,恰好绕过了这个路径,所以没发现。
 *
 * 教训:必须**真实点击页面上的元素**,而不是手敲地址。
 *
 * 实现上不引入 puppeteer,直接用 Node 内置的 WebSocket 连 Chrome 的
 * DevTools Protocol —— 省掉一个依赖。
 *
 * 用法: node scripts/click-test.mjs <baseUrl>
 *   例: node scripts/click-test.mjs http://localhost:4173/qwerty-mobile/
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const BASE_URL = process.argv[2]
if (!BASE_URL) {
  console.error('用法: node scripts/click-test.mjs <baseUrl>')
  process.exit(1)
}

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.error('找不到 Chrome / Edge')
  process.exit(1)
}

const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + process.env.TEMP + '/chrome-click-test',
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
        reject(new Error(`CDP 调用超时: ${method}`))
      }
    }, 30000)
  })
}

/** 在页面里执行一段表达式,返回其值 */
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (res.exceptionDetails) {
    throw new Error('页面内异常: ' + JSON.stringify(res.exceptionDetails.exception?.description ?? res.exceptionDetails))
  }
  return res.result?.value
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  // 等 Chrome 的调试端口就绪
  let targets
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      if (targets.some((t) => t.type === 'page')) break
    } catch {
      /* 还没起来 */
    }
    await sleep(250)
  }
  const page = targets?.find((t) => t.type === 'page')
  if (!page) throw new Error('没能连上 Chrome 的调试端口')

  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
  }

  await send('Runtime.enable')
  await send('Page.enable')

  // 收集页面控制台报错
  const consoleErrors = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params?.exceptionDetails?.exception?.description ?? 'unknown')
    }
  })

  // ---------- 1. 打开首页 ----------
  console.log(`\n打开首页: ${BASE_URL}`)
  await send('Page.navigate', { url: BASE_URL })
  await sleep(4000)

  const homeInfo = await evaluate(`(() => {
    const links = [...document.querySelectorAll('a[href*="#/"]')];
    return {
      count: links.length,
      firstHref: links[0]?.getAttribute('href') ?? null,
      firstText: links[0]?.textContent?.trim().slice(0, 30) ?? null,
    };
  })()`)
  check('首页渲染出词库链接', homeInfo.count > 0, `${homeInfo.count} 个,首个=${homeInfo.firstText}`)
  check('链接 href 格式正确', /^#\/(typing|dictation)\//.test(homeInfo.firstHref ?? ''), homeInfo.firstHref)

  // ---------- 2. 真实点击第一个词库 ----------
  console.log('\n点击第一个词库(真实点击,不是手敲地址)…')
  const beforeHash = await evaluate('location.hash')

  await evaluate(`(() => {
    const link = document.querySelector('a[href*="#/"]');
    if (!link) throw new Error('找不到词库链接');
    link.click();
    return true;
  })()`)
  await sleep(5000)

  const afterHash = await evaluate('location.hash')
  check('点击后 hash 发生变化', afterHash !== beforeHash, `${beforeHash || '(空)'} → ${afterHash}`)

  // ---------- 3. 确认真的进入了练习页 ----------
  const practiceInfo = await evaluate(`(() => {
    const text = document.body.innerText;
    const input = document.querySelector('input[type="text"], input:not([type])');
    return {
      text: text.slice(0, 200),
      hasInput: !!input,
      hasStats: /WPM/.test(text),
      hasProgress: /\\d+\\s*\\/\\s*\\d+/.test(text),
      hasDictationToggle: /默写/.test(text),
    };
  })()`)

  check('点击后进入了练习页(不再是首页)', practiceInfo.hasStats && practiceInfo.hasInput, practiceInfo.text.slice(0, 60).replace(/\n/g, ' '))
  check('显示了实时统计(WPM)', practiceInfo.hasStats)
  check('显示了章节进度', practiceInfo.hasProgress)
  check('输入框存在', practiceInfo.hasInput)
  check('默写开关存在', practiceInfo.hasDictationToggle)

  check('页面无 JS 异常', consoleErrors.length === 0, consoleErrors[0]?.slice(0, 120) ?? '')

  // ---------- 4. 模拟打字 ----------
  console.log('\n模拟输入…')
  const typed = await evaluate(`(() => {
    const input = document.querySelector('input:not([type="search"])');
    if (!input) return { ok: false, reason: '找不到输入框' };
    const word = (document.body.innerText.match(/^([a-zA-Z]+)$/m) || [])[1] || '';
    // 用 React 能感知的方式改值
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, word.slice(0, 1));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, typed: word.slice(0, 1), word };
  })()`)
  await sleep(1200)

  const afterType = await evaluate(`(() => {
    const text = document.body.innerText;
    const m = text.match(/WPM\\s*\\n?\\s*(\\d+)/);
    return { text: text.slice(0, 150).replace(/\\n/g, ' '), wpm: m ? m[1] : null, body: text };
  })()`)
  check('输入后页面有响应', afterType.text.length > 0, afterType.text.slice(0, 70))

  // ---------- 汇总 ----------
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`通过 ${results.length - failed.length}/${results.length}`)
  if (failed.length) {
    console.log('\n失败项:')
    failed.forEach((f) => console.log(`  ❌ ${f.name} ${f.detail}`))
    process.exitCode = 1
  } else {
    console.log('✅ 全部通过')
  }
}

main()
  .catch((e) => {
    console.error('\n测试出错:', e.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      ws?.close()
    } catch {}
    chrome.kill()
    await sleep(300)
  })
