import { probeStorage, type StorageLike } from './store.ts'

/**
 * 存储不可用时的降级目标（无痕模式、隐私设置会走到这里）。
 * 功能照常，只是刷新即丢 —— UI 会用横幅明确告知，不让用户以为已经存住了。
 */
function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

export type ResolvedStorage = { storage: StorageLike; unavailable: boolean }

export function resolveStorage(): ResolvedStorage {
  let candidate: StorageLike | null = null
  try {
    candidate = globalThis.localStorage ?? null
  } catch {
    candidate = null
  }
  if (probeStorage(candidate)) {
    return { storage: candidate as StorageLike, unavailable: false }
  }
  return { storage: createMemoryStorage(), unavailable: true }
}
