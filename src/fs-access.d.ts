// TypeScript 的 lib.dom.d.ts 已覆盖 FileSystemDirectoryHandle、createWritable、
// 目录的异步迭代等，但缺下面这几个成员。这里只补缺口——重复声明同名成员会编译报错。
//
// Safari、Firefox、iPhone 都不实现 showDirectoryPicker，所以调用前必须做
// 运行时存在性检查；声明成必选是因为这里描述的是"支持该 API 的浏览器里的形状"，
// 而不是"所有浏览器都有"。

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  /** 查询当前权限，不弹窗。 */
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  /** 申请权限。必须在用户手势里调用，否则浏览器会拒绝。 */
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface Window {
  /** 让用户选一个目录并授权。需要安全上下文 + 用户手势。 */
  showDirectoryPicker(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string | FileSystemHandle
  }): Promise<FileSystemDirectoryHandle>
}
