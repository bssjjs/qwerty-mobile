import { Home } from './pages/Home'
import { Practice } from './pages/Practice'
import { useRoute } from './lib/router'

export function App() {
  const route = useRoute()

  if (route.name === 'practice') {
    // key 让切换词库/章节/模式时整块组件重建,避免残留上一轮的输入与计时
    return (
      <Practice
        key={`${route.mode}:${route.dictId}:${route.chapter}`}
        dictId={route.dictId}
        chapter={route.chapter}
        mode={route.mode}
      />
    )
  }

  return <Home />
}
