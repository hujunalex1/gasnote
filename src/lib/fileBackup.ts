// 自动备份的浏览器适配层：目录选择、权限、写盘、清理。
// 这里只做胶水，不含判断逻辑——文件名与"该删哪些"的规则全在 backup.ts，
// 那份规则由单测覆盖，本文件靠浏览器里的集成验证覆盖。
//
// 与 storage.ts 的分工一致：薄适配层不写单测，纯逻辑层写。
import { BACKUP_KEEP, backupFileName, pickPrunable } from './backup.ts'
import type { StorageLike } from './store.ts'

const DB_NAME = 'gasnote'
const DB_VERSION = 1
const STORE = 'handles'
const DIR_KEY = 'backupDir'

/** 目录句柄在 IndexedDB 里的键。localStorage 只能存字符串，存不了句柄。 */

export function isBackupSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/**
 * 让用户选一个备份目录。用户取消时返回 null（AbortError 不是错误，是正常选择）。
 */
export async function pickBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ id: 'gasnote-backup', mode: 'readwrite' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

// ---- 句柄持久化（IndexedDB）----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const request = run(t.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        t.oncomplete = () => db.close()
      }),
  )
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await tx('readwrite', (s) => s.put(handle, DIR_KEY))
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const value = await tx<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(DIR_KEY))
    return value ?? null
  } catch {
    // 读不出来就当没配过，不要因此让整个应用起不来
    return null
  }
}

export async function clearDirectoryHandle(): Promise<void> {
  await tx('readwrite', (s) => s.delete(DIR_KEY))
}

// ---- 权限 ----

/**
 * 有没有写入权限。request 为 true 时会弹窗申请，因此**必须在用户手势里调用**；
 * 页面加载时只能用 request=false 查询，否则会被浏览器拒绝。
 */
export async function hasWritePermission(
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<boolean> {
  const descriptor = { mode: 'readwrite' as const }
  if ((await handle.queryPermission(descriptor)) === 'granted') return true
  if (!request) return false
  return (await handle.requestPermission(descriptor)) === 'granted'
}

// ---- 写盘 ----

/**
 * 写一个文件。
 *
 * 失败时调 abort() 而不是 close()：close() 会把已经写进去的半截内容提交到磁盘，
 * 那意味着一个被截断的备份文件。宁可保留上一次的完整备份。
 */
export async function writeBackupFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(text)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* 已经关闭或已废弃，忽略 */
    }
    throw error
  }
}

/** 列出目录里的文件名（忽略子目录）。 */
export async function listFileNames(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = []
  for await (const [name, handle] of dir) {
    if (handle.kind === 'file') names.push(name)
  }
  return names
}

/**
 * 删掉超出保留份数的旧备份。返回实际删掉的文件名。
 *
 * 单个文件删失败不抛错：备份多留几份无害，不该为它让整次备份失败。
 * 哪些该删由 backup.ts 的 pickPrunable 决定（只认严格格式的备份文件）。
 */
export async function pruneBackups(
  dir: FileSystemDirectoryHandle,
  keep: number = BACKUP_KEEP,
): Promise<string[]> {
  const doomed = pickPrunable(await listFileNames(dir), keep)
  const removed: string[] = []
  for (const name of doomed) {
    try {
      await dir.removeEntry(name)
      removed.push(name)
    } catch {
      /* 忽略：删不掉就留着 */
    }
  }
  return removed
}

export type BackupOutcome =
  | { ok: true; fileName: string; removed: string[] }
  | { ok: false; reason: 'no-permission' | 'error'; error?: unknown }

/**
 * 跑一次备份：写入今天那份快照，然后清理超期份数。
 * 顺序是先写后清，保证任何一刻磁盘上都至少有一份完整备份。
 */
export async function runBackup(
  dir: FileSystemDirectoryHandle,
  today: string,
  text: string,
): Promise<BackupOutcome> {
  try {
    const fileName = backupFileName(today)
    await writeBackupFile(dir, fileName, text)
    const removed = await pruneBackups(dir)
    return { ok: true, fileName, removed }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return { ok: false, reason: 'no-permission', error }
    }
    return { ok: false, reason: 'error', error }
  }
}

/** 把浏览器抛出的东西转成能显示给用户的一句话。 */
export function describeBackupError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') {
      return '备份目录找不到了（可能被移动、重命名或删除）。请重新选择目录。'
    }
    if (error.name === 'NotAllowedError') {
      return '浏览器拒绝了写入备份目录的权限。请重新授权。'
    }
    if (error.name === 'QuotaExceededError') {
      return '云盘或磁盘空间不足，备份写入失败。'
    }
    return `备份失败：${error.name}${error.message ? ` · ${error.message}` : ''}`
  }
  return `备份失败：${error instanceof Error ? error.message : String(error)}`
}

// ---- 元信息（localStorage，存的是字符串，所以句柄不在里面）----

const META_KEY = 'gasnote.backup.v1'

export type BackupMeta = {
  /** 已授权目录的名字，只用于显示 */
  dirName: string | null
  /** 最近一次真正拿到数据副本的时刻（自动备份写入，或手动导出） */
  lastCopiedAt: number | null
}

const EMPTY_META: BackupMeta = { dirName: null, lastCopiedAt: null }

/** 读元信息。坏数据一律退回"没配过"，不让它拖垮启动。 */
export function readBackupMeta(storage: StorageLike): BackupMeta {
  try {
    const raw = storage.getItem(META_KEY)
    if (!raw) return EMPTY_META
    const parsed = JSON.parse(raw) as Partial<BackupMeta>
    return {
      dirName:
        typeof parsed.dirName === 'string' && parsed.dirName !== '' ? parsed.dirName : null,
      lastCopiedAt:
        typeof parsed.lastCopiedAt === 'number' && Number.isFinite(parsed.lastCopiedAt)
          ? parsed.lastCopiedAt
          : null,
    }
  } catch {
    return EMPTY_META
  }
}

export function writeBackupMeta(storage: StorageLike, meta: BackupMeta): void {
  try {
    storage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    /* 存不住不影响本次会话里的备份功能 */
  }
}

