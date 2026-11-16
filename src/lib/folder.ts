/** Data-folder storage (File System Access API). Implemented in Stage C; this stub keeps earlier stages working. */
export const folderSupported = (): boolean => false;
export async function initFolderSync(): Promise<void> {}
export interface FolderStatus {
  supported: boolean;
  connected: boolean;
  needsPermission: boolean;
  name: string | null;
  lastSyncAt: number | null;
  error: string | null;
}
const STATUS: FolderStatus = { supported: false, connected: false, needsPermission: false, name: null, lastSyncAt: null, error: null };
/** Must return the same object until something changes (useSyncExternalStore). */
export function folderStatus(): FolderStatus {
  return STATUS;
}
export function onFolderStatus(_fn: () => void): () => void {
  return () => {};
}
export async function chooseFolder(): Promise<boolean> {
  return false;
}
export async function reconnectFolder(): Promise<boolean> {
  return false;
}
export async function disconnectFolder(): Promise<void> {}
export async function syncNow(): Promise<void> {}
