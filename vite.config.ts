import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// 用 import.meta.url 而不是 __dirname：本项目是 ESM，
// Vite 的原生配置加载器不支持 __dirname。
const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn 生成的组件用 "@/..." 引用，必须和 tsconfig 的 paths 对上
    alias: { "@": path.resolve(rootDir, "./src") },
  },
})
