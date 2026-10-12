/**
 * 诊断埋点的全局类型声明。
 *
 * 单独放一个文件而不是写在组件里 —— 之前写在 PracticeInput.tsx 内部,
 * 结果替换该文件时声明一起消失,构建静默失败,导致测试测到的是旧产物。
 *
 * 这些埋点只在 scripts/type-test.mjs 里初始化。生产环境 window.__qwertyLog
 * 为 undefined,可选链短路,不产生任何开销。
 */
export {}

declare global {
  interface Window {
    __qwertyLog?: Array<Record<string, unknown>>
  }
}
