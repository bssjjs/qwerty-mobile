import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * GitHub Pages 的项目站点部署在 https://<用户>.github.io/<仓库名>/ 子路径下。
 * 这里必须用**绝对** base(不能像上游那样用 './'),否则 Service Worker 的
 * scope 会落在错误的位置,导致离线功能失效。
 *
 * 本地 dev 用 '/' 免得每次手动敲子路径;构建时默认 '/qwerty-mobile/',
 * 可用环境变量 BASE_PATH 覆盖(换仓库名时不用改代码)。
 */
const BUILD_BASE = process.env.BASE_PATH ?? '/qwerty-mobile/'

export default defineConfig(({ command, isPreview }) => ({
  // 注意 isPreview:预览服务器必须用与构建**相同**的 base,否则 dist 里引用的
  // /qwerty-mobile/assets/* 会 404,被 SPA fallback 吞掉返回 index.html。
  // (preview 的 command 是 'serve',只看 command 会误判成开发模式。)
  base: command === 'build' || isPreview ? BUILD_BASE : '/',

  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // 词库最大 4.5 MB,超过 Workbox 默认 2 MB 的预缓存上限;
      // 但词库走运行时缓存而非预缓存,这里放宽上限是为了图标等其它资源
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Qwerty Learner 手机版',
        short_name: 'Qwerty',
        description: '为键盘工作者设计的单词记忆与英语肌肉记忆锻炼软件 —— 移动端移植版',
        lang: 'zh-CN',
        start_url: BUILD_BASE,
        scope: BUILD_BASE,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#6366f1',
        background_color: '#0f172a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 应用外壳随构建预缓存(体积小),词库不入预缓存清单
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // 词库与音效体积大,改为运行时缓存:用过一次就离线可用
        globIgnores: ['**/dicts/**,**/sounds/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // 词库:一旦下载就永久缓存(CacheFirst),不因离线而失效
            urlPattern: /\/dicts\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'qwerty-dicts',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 音效:同上,体积很小
            urlPattern: /\/sounds\/.*\.(wav|mp3)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'qwerty-sounds',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // 本地开发时也启用 SW,便于验证离线行为(npm run dev 后可在 DevTools 里看到)
        enabled: false,
      },
    }),
  ],

  build: {
    // 词库不参与打包,这里是源码本体的体积告警线
    chunkSizeWarningLimit: 800,
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
