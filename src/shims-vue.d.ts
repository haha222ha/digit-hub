declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.js' {
  const content: string
  export default content
}

// 扩展 Electron App 类型
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}