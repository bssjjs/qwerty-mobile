/**
 * 极简 hash 路由(约 60 行,不引入 react-router)。
 *
 * 为什么用 hash 而不是 History API:
 * 本应用部署在 GitHub Pages 的静态托管上。用 History API 时,用户刷新
 * `/qwerty-mobile/practice/cet4/0` 会命中服务器的 404(静态托管不认识前端路由),
 * 必须额外上传一个 404.html 做重定向。hash 路由(`#/practice/cet4/0`)的路径部分
 * 永远只有 `/qwerty-mobile/`,不会 404,部署零配置。
 *
 * 对已「添加到主屏幕」的 PWA 来说,hash 与 history 在体验上没有差别。
 */
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'practice'; dictId: string; chapter: number; mode: 'typing' | 'dictation' }

export const HOME: Route = { name: 'home' }

export function parseHash(hash: string): Route {
  // 去掉前导 '#',再拆掉 query
  const raw = hash.replace(/^#/, '').split('?')[0]
  const segments = raw.split('/').filter(Boolean)

  if (segments.length === 0) return HOME

  const [segment, dictId, chapterRaw] = segments

  // URL 段与 Route.mode 必须严格一致(buildPath 写的就是 mode 的值)。
  // 另兼容早期链接里的 "practice" 别名。
  const mode: 'typing' | 'dictation' | null =
    segment === 'typing' || segment === 'practice' ? 'typing' : segment === 'dictation' ? 'dictation' : null

  if (mode && dictId) {
    const chapter = Number.parseInt(chapterRaw ?? '0', 10)
    return {
      name: 'practice',
      dictId: decodeURIComponent(dictId),
      chapter: Number.isFinite(chapter) && chapter >= 0 ? chapter : 0,
      mode,
    }
  }

  // 未知路径一律回首页,避免出现空白页
  return HOME
}

export function buildPath(route: Route): string {
  if (route.name === 'home') return '#/'
  return `#/${route.mode}/${encodeURIComponent(route.dictId)}/${route.chapter}`
}

export function navigate(route: Route, replace = false): void {
  const path = buildPath(route)
  if (replace) {
    window.history.replaceState(null, '', path)
    // replaceState 不触发 hashchange,手动通知订阅者
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = path.slice(1) // 直接赋值 hash 会触发 hashchange
  }
}

/** 订阅当前路由 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? HOME : parseHash(window.location.hash),
  )

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
