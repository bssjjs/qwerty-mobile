#!/usr/bin/env node
/**
 * 移动端横向溢出检测。
 *
 * 在手机宽度下找出所有"比视口还宽"的元素。横向溢出会让整页可以左右拖动,
 * 而且在截图里表现为右侧内容被切掉 —— 很难靠肉眼看代码定位。
 *
 * 用法: node scripts/layout-check.mjs <url> [视口宽度]
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const URL_ = process.argv[2]
const WIDTH = Number(process.argv[3] || 390)
if (!URL_) {
  console.error('用法: node scripts/layout-check.mjs <url> [宽度]')
  process.exit(1)
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))

const PORT = 9335
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    `--window-size=${WIDTH},844`,
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + process.env.TEMP + '/chrome-layout',
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
    setTimeout(() => pending.has(n) && (pending.delete(n), rej(new Error('CDP 超时'))), 30000)
  })
}
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'err')
  return r.result?.value
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

  // ⚠️ 必须用设备模拟强制视口宽度,不能依赖 --window-size:
  // Windows 上 Chrome 窗口有最小宽度(实测被抬到 512px),--window-size=390 会被忽略,
  // 于是"手机宽度下的溢出检测"实际是在 512px 下跑的,结论无效。
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })

  await send('Page.navigate', { url: URL_ })
  await sleep(6000)

  const report = await evaluate(`(() => {
    const vw = window.innerWidth;
    const out = { vw, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, offenders: [] };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // 元素右边界超出视口,或自身就比视口宽
      if (r.right > vw + 0.5 || r.width > vw + 0.5) {
        out.offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 70),
          text: (el.textContent || '').trim().slice(0, 24),
          w: Math.round(r.width),
          right: Math.round(r.right),
        });
      }
    }
    return out;
  })()`)

  console.log(`视口宽度: ${report.vw}px`)
  console.log(`文档 scrollWidth: ${report.scrollW}px`)
  console.log(`body scrollWidth:  ${report.bodyScrollW}px`)
  const overflow = report.scrollW > report.vw + 1
  console.log(overflow ? `\n❌ 存在横向溢出,超出 ${report.scrollW - report.vw}px` : '\n✅ 无横向溢出')

  if (report.offenders.length) {
    console.log(`\n超出视口的元素 (${report.offenders.length} 个):`)
    // 只显示最外层的几个,内层通常是连带的
    report.offenders.slice(0, 14).forEach((o) => {
      console.log(`  <${o.tag}> w=${o.w} right=${o.right}  ${o.text}`)
      console.log(`      class="${o.cls}"`)
    })
  }
  process.exitCode = overflow ? 1 : 0
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
