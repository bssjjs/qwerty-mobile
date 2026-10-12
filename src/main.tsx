import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { preloadSounds } from './lib/sound'
import './styles.css'

// 提前把三个音效拉进浏览器缓存,首次按键时才不会有延迟
preloadSounds()

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
