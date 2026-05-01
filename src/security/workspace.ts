import { isAbsolute, relative, resolve } from "node:path";

export function resolveWorkspacePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("inputPath must be a non-empty string");
  }

  const root = process.cwd();
  const resolved = resolve(root, inputPath === "/" ? "." : inputPath);
  const relativePath = relative(root, resolved);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("path must stay inside the current working directory");
  }

  // Optional: guard against symlink escapes
  // const real = realpathSync(resolved);
  // if (relative(root, real).startsWith("..")) { ... }

  return resolved;
}

export function displayWorkspacePath(path: string, root = process.cwd()) {
  const relativePath = relative(root, path);
  return relativePath.length === 0 ? "." : relativePath.replaceAll("\\", "/");
}
