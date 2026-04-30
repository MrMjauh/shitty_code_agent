import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { EditFileTool } from "./edit.js";
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

  test("reads files inside the workspace", async () => {
    await expect(new ReadFileTool().execute({ path: "hello.txt" })).resolves.toEqual({
      content: "hello\n",
    });
  });

  test("returns an error output for invalid read input", async () => {
    const result = await new ReadFileTool().execute({ path: 42 });

    expect(result).toHaveProperty("error");
  });

  test("returns an error output for paths outside the workspace", async () => {
    const result = await new WriteFileTool().execute({
      path: "../outside.txt",
      content: "nope\n",
    });

    expect(result).toHaveProperty("error");
    await expect(readFile(join(tempRoot, "outside.txt"), "utf-8")).rejects.toThrow();
  });

  test("edits files inside the workspace", async () => {
    const result = await new EditFileTool().execute({
      path: "hello.txt",
      old_text: "hello",
      new_text: "hi",
    });

    expect(result).toHaveProperty("bytesWritten");
    await expect(readFile(join(workspace, "hello.txt"), "utf-8")).resolves.toBe("hi\n");
  });
});
