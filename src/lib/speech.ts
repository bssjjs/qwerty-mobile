/**
 * 单词发音 —— 用浏览器内置的 Web Speech API(speechSynthesis)。
 * 不依赖任何外部 CDN,离线可用,与上游「拉外部音频」的方案不同。
 *
 * 已知平台差异(都做了兜底):
 *  - iOS Safari 要求首次发声发生在**用户手势**里,否则静默失败 -> 调用方需保证由点击触发
 *  - 各平台的音色列表是**异步**加载的,初始 getVoices() 常返回空数组
 *  - Chrome 长时间连续发声会卡住,需要在每次发声前 cancel()
 */

export type Accent = 'us' | 'uk'

const LANG_BY_ACCENT: Record<Accent, string> = {
  us: 'en-US',
  uk: 'en-GB',
}

/** 运行环境是否支持语音合成 */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** 预热音色列表 —— 在首次用户手势时调用,可显著降低第一声的延迟 */
export function warmUpSpeech(): void {
  if (!isSpeechSupported()) return
  // 读取一次即可触发浏览器加载音色表
  window.speechSynthesis.getVoices()
}

function pickVoice(accent: Accent): SpeechSynthesisVoice | undefined {
  if (!isSpeechSupported()) return undefined
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return undefined

  const lang = LANG_BY_ACCENT[accent]
  const exact = voices.find((v) => v.lang.replace('_', '-') === lang)
  if (exact) return exact

  // 退而求其次:同语族的任意英文音色
  const prefix = lang.slice(0, 2)
  return voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix))
}

/**
 * 朗读一个单词。
 * @param text 要朗读的文本
 * @param accent 美音 / 英音,决定音色
 */
export function speak(text: string, accent: Accent = 'us'): void {
  if (!isSpeechSupported() || !text) return

  const synth = window.speechSynthesis
  // Chrome 在连续调用时会卡在 paused 状态,先取消再发声最稳
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = LANG_BY_ACCENT[accent]
  utterance.rate = 0.9 // 略慢于常速,便于跟读
  utterance.pitch = 1
  utterance.volume = 1

  const voice = pickVoice(accent)
  if (voice) utterance.voice = voice

  synth.speak(utterance)
}

/** 停止当前发声(例如离开页面时) */
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return
  window.speechSynthesis.cancel()
}
