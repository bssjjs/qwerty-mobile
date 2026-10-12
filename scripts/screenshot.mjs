#!/usr/bin/env node
/**
 * 拍摄 README 用的手机截图。
 *
 * ⚠️ 必须用 CDP 的 Emulation.setDeviceMetricsOverride 设定视口,
 * **不能**用 Chrome 的 --window-size:Windows 上窗口有最小宽度(实测被抬到 512px),
 * 该参数会被忽略 —— 页面按 512px 布局,而截图只截左边 390px,
 * 于是画面里的内容看起来像"被切掉了",其实布局没问题。这个坑真实踩过一次。
 *
 * 用法: node scripts/screenshot.mjs <baseUrl> <输出目录>
 */
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BASE = process.argv[2]
const OUT = resolve(process.argv[3] || 'docs/screenshots')
if (!BASE) {
  console.error('用法: node scripts/screenshot.mjs <baseUrl> <输出目录>')
  process.exit(1)
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('找不到 Chrome')
  process.exit(1)
}

const PORT = 9336
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + process.env.TEMP + '/chrome-shot',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
let id = 0
const pending = new Map()
const send = (method, params = {}) => {
  const n = ++id
  ws.send(JSON.stringify({ id: n, method, params }))
  return new Promise((res, rej) => {
    pending.set(n, { res, rej })
    setTimeout(() => pending.has(n) && (pending.delete(n), rej(new Error('CDP 超时: ' + method))), 40000)
  })
}
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? '页面异常')
  return r.result?.value
}

/** 打开一个地址并等待渲染完成 */
async function goto(url, waitMs = 6000) {
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', { url })
  await sleep(waitMs)
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = join(OUT, name)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`  ✅ ${name}  (${(Buffer.from(data, 'base64').length / 1024).toFixed(0)} KB)`)
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
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? rej(new Error(m.error.message)) : res(m.result)
    }
  }
  await send('Runtime.enable')
  await send('Page.enable')

  // iPhone 14 尺寸:390×844,2 倍像素密度
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })

  mkdirSync(OUT, { recursive: true })

  console.log('拍摄截图:')

  // 1. 首页词库列表
  await goto(BASE)
  await shot('01-home.png')

  // 2. 打字练习:先打对几个字母,让画面有真实反馈
  await goto(`${BASE}#/typing/cet4/0`)
  await evaluate(`(() => {
    const el = document.querySelector('input[aria-label="输入单词"]');
    if (!el) return;
    for (const ch of 'can') {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, el.value + ch);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
    }
  })()`)
  await sleep(900)
  await shot('02-typing.png')

  // 3. 默写模式:点「默写」开关,切到「隐藏元音」
  await goto(`${BASE}#/typing/cet4/0`)
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('默写'));
    btn?.click();
  })()`)
  await sleep(700)
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '隐藏元音');
    btn?.click();
  })()`)
  await sleep(700)
  await shot('03-dictation.png')

  // 4. 深色模式下的首页
  await goto(BASE)
  await evaluate(`(() => {
    localStorage.setItem('qwerty-mobile:theme', 'dark');
    document.documentElement.classList.add('dark');
  })()`)
  await sleep(900)
  await shot('04-home-dark.png')
  await evaluate(`localStorage.removeItem('qwerty-mobile:theme')`)

  console.log(`\n输出目录: ${OUT}`)
}

main()
  .catch((e) => {
    console.error('出错:', e.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      ws?.close()
    } catch {}
    chrome.kill()
    await sleep(300)
  })
