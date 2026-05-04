import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Session } from "./session.js";

/** Serialize the session and write to a JSON file, creating parent directories as needed. */
export async function writeSessionFile(
  session: Session,
  filePath: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, session.serialize(), "utf-8");
}

/** Read a JSON file and deserialize it into the session. */
export async function readSessionFile(
  session: Session,
  filePath: string,
): Promise<void> {
  const json = await readFile(filePath, "utf-8");
  session.deserialize(json);
}

/** List all saved session files in a directory (excluding .current.json). */
export async function listSessionFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          entry.name !== ".current.json",
      )
      .map((entry) => entry.name.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/** Delete a named session file, returning whether it existed. */
export async function deleteSessionFile(
  dirPath: string,
  name: string,
): Promise<boolean> {
  try {
    await unlink(join(dirPath, `${name}.json`));
    return true;
  } catch {
    return false;
  }
}

/** Delete a file, silently ignoring if it doesn't exist. */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // File may not exist
  }
}
