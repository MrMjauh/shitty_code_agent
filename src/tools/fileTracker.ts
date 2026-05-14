import { stat } from "node:fs/promises";

/**
 * Tracks files that have been read in the current session.
 * Used by the write tool to enforce "must read before overwriting."
 */
const readFiles = new Set<string>();

export function markAsRead(filePath: string): void {
  readFiles.add(filePath);
}

export function wasRead(filePath: string): boolean {
  return readFiles.has(filePath);
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
