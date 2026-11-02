/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目地址，形如 https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /**
   * Supabase 的 publishable key（`sb_publishable_…`）。
   * 它是公开的（会打进前端产物），安全性由 RLS 保证。
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** 旧名字：anon JWT key，Supabase 2026 年底弃用。填了也认，但 publishable key 优先。 */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
