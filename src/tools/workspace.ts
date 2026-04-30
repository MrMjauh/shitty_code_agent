import { isAbsolute, relative, resolve } from "node:path";

export function resolveWorkspacePath(inputPath = "/") {
  const root = process.cwd();
  const normalizedPath = inputPath === "/" ? "." : inputPath;
  const resolved = resolve(root, normalizedPath);
  const relativePath = relative(root, resolved);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("path must stay inside the current working directory");
  }

  return resolved;
}

export function displayWorkspacePath(path: string, root = process.cwd()) {
  const relativePath = relative(root, path);
  return relativePath.length === 0 ? "." : relativePath;
}
