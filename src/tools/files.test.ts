import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ReadFileTool } from "./read.js";
import { WriteFileTool } from "./write.js";

describe("file tools", () => {
  const originalCwd = process.cwd();
  let tempRoot: string;
  let workspace: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "erik-agent-files-"));
    workspace = join(tempRoot, "workspace");
    await mkdir(workspace);
    await writeFile(join(workspace, "hello.txt"), "hello\n", "utf-8");
    process.chdir(workspace);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("reads files inside the workspace with line-numbered output", async () => {
    await expect(new ReadFileTool().execute({ filePath: "hello.txt" })).resolves.toEqual({
      content: "1 | hello\n",
      lineRange: { start: 1, end: 1 },
      totalLines: 1,
    });
  });

  test("returns an error output for invalid read input", async () => {
    const result = await new ReadFileTool().execute({ filePath: 42 });

    expect(result).toHaveProperty("error");
  });

  test("returns an error output for paths outside the workspace", async () => {
    const result = await new WriteFileTool().execute({
      mode: "write",
      filePath: "../outside.txt",
      content: "nope\n",
    });

    expect(result).toHaveProperty("error");
    await expect(readFile(join(tempRoot, "outside.txt"), "utf-8")).rejects.toThrow();
  });

  test("requires reading an existing file before overwriting it", async () => {
    // Attempting to write without reading first should error
    const result = await new WriteFileTool().execute({
      mode: "write",
      filePath: "hello.txt",
      content: "overwritten\n",
    });

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("read_file first");
    // File content should be unchanged
    await expect(readFile(join(workspace, "hello.txt"), "utf-8")).resolves.toBe("hello\n");
  });

  test("allows overwriting after reading the file", async () => {
    // Read first to satisfy the guard
    await new ReadFileTool().execute({ filePath: "hello.txt" });

    const result = await new WriteFileTool().execute({
      mode: "write",
      filePath: "hello.txt",
      content: "overwritten\n",
    });

    expect(result).toHaveProperty("bytesWritten");
    await expect(readFile(join(workspace, "hello.txt"), "utf-8")).resolves.toBe("overwritten\n");
  });

  test("allows writing a new file without reading first", async () => {
    const result = await new WriteFileTool().execute({
      mode: "write",
      filePath: "new.txt",
      content: "brand new\n",
    });

    expect(result).toHaveProperty("bytesWritten");
    await expect(readFile(join(workspace, "new.txt"), "utf-8")).resolves.toBe("brand new\n");
  });

  test("reads a directory listing", async () => {
    await mkdir(join(workspace, "subdir"));
    const result = await new ReadFileTool().execute({ filePath: "." });

    expect(result).toEqual({
      entries: expect.arrayContaining([
        { path: "./hello.txt", name: "hello.txt", type: "file" },
        { path: "./subdir", name: "subdir", type: "directory" },
      ]),
    });
  });

  test("reads a specific line range", async () => {
    const multiLine = "a\nb\nc\nd\ne\n";
    await writeFile(join(workspace, "multi.txt"), multiLine, "utf-8");

    const result = await new ReadFileTool().execute({ filePath: "multi.txt", offset: 2, limit: 3 });

    expect(result).toEqual({
      content: "2 | b\n3 | c\n4 | d\n",
      lineRange: { start: 2, end: 4 },
      totalLines: 5,
    });
  });

  test("edits files inside the workspace", async () => {
    const result = await new WriteFileTool().execute({
      mode: "edit",
      filePath: "hello.txt",
      content: "placeholder",
      old_text: "hello",
      new_text: "hi",
    });

    expect(result).toHaveProperty("bytesWritten");
    await expect(readFile(join(workspace, "hello.txt"), "utf-8")).resolves.toBe("hi\n");
  });
});
