/**
 * 键盘音效。使用 public/sounds/ 下的三个 wav(取自上游,GPL-3.0):
 *   click.wav   按键正确
 *   correct.wav 整个单词打完
 *   beep.wav    按错
 *
 * 移动端两个坑都处理了:
 *  1) 浏览器要求音频首播发生在**用户手势**内,否则之后一直静默 -> warmUpAudio() 解锁
 *  2) 每次 new Audio() 会有明显延迟 -> 预加载并复用同一批 Audio 实例
 */
import { useEffect, useState } from 'react'

export type SoundName = 'click' | 'correct' | 'beep'

const SOUND_FILES: Record<SoundName, string> = {
  click: 'click.wav',
  correct: 'correct.wav',
  beep: 'beep.wav',
}

/** 用 BASE_URL 拼路径 —— GitHub Pages 部署在 /<repo>/ 子路径下时必须这样拼 */
function soundUrl(name: SoundName): string {
  return `${import.meta.env.BASE_URL}sounds/${SOUND_FILES[name]}`
}

const cache = new Map<SoundName, HTMLAudioElement>()
let unlocked = false

function getAudio(name: SoundName): HTMLAudioElement | undefined {
  if (typeof window === 'undefined') return undefined
  let audio = cache.get(name)
  if (!audio) {
    audio = new Audio(soundUrl(name))
    audio.preload = 'auto'
    cache.set(name, audio)
  }
  return audio
}

/** 预加载全部音效,避免第一次播放时卡顿 */
export function preloadSounds(): void {
  ;(Object.keys(SOUND_FILES) as SoundName[]).forEach(getAudio)
}

/**
 * 在首次用户手势中调用,解锁移动端音频播放。
 * 做法是静音播放一遍再立刻暂停,让浏览器认为该媒体元素已被用户激活。
 */
export function warmUpAudio(): void {
  if (unlocked || typeof window === 'undefined') return
  unlocked = true
  ;(Object.keys(SOUND_FILES) as SoundName[]).forEach((name) => {
    const audio = getAudio(name)
    if (!audio) return
    const prevVolume = audio.volume
    audio.volume = 0
    audio
      .play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.volume = prevVolume
      })
      .catch(() => {
        // 解锁失败不致命,后续播放会自动失败并静默
        audio.volume = prevVolume
      })
  })
}

/**
 * 播放音效。
 * @param enabled 对应上游的 keySoundsConfig / hintSoundsConfig 开关
 */
export function playSound(name: SoundName, enabled = true): void {
  if (!enabled) return
  const audio = getAudio(name)
  if (!audio) return
  try {
    // 重播同一声时先归零,否则连续按键会听不到声音
    audio.currentTime = 0
    void audio.play().catch(() => {})
  } catch {
    // 播放失败(未解锁 / 解码错误)不应影响练习
  }
}

/** 设置项里按需静音 */
export function setSoundsMuted(muted: boolean): void {
  cache.forEach((audio) => {
    audio.muted = muted
  })
}

/**
 * 让设置页可以切换音效开关。
 * 注意:warmUpAudio 必须在用户手势里跑过一次,否则移动端全程静默。
 */
export function useSoundPreference(initial = true) {
  const [enabled, setEnabled] = useState(initial)
  useEffect(() => {
    setSoundsMuted(!enabled)
  }, [enabled])
  return [enabled, setEnabled] as const
}
