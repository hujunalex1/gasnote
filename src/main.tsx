import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('找不到 #root 挂载点')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 离线缓存注册失败不影响主功能 */
    })
  })
}
