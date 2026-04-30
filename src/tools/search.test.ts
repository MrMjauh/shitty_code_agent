import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SearchTool } from "./search.js";

describe("SearchTool", () => {
    const originalCwd = process.cwd();
    let workspace: string;

    beforeEach(async () => {
        workspace = await mkdtemp(join(tmpdir(), "erik-agent-search-"));
        await mkdir(join(workspace, "src", "agent"), { recursive: true });
        await mkdir(join(workspace, "docs"), { recursive: true });
        await writeFile(join(workspace, "package.json"), "{}\n", "utf-8");
        await writeFile(join(workspace, "src", "agent", "agent.ts"), "export function sendMessage() {}\n", "utf-8");
        await writeFile(join(workspace, "src", "index.ts"), "export const value = 'hello';\n", "utf-8");
        await writeFile(join(workspace, "docs", "readme.md"), "SendMessage docs\n", "utf-8");
        process.chdir(workspace);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await rm(workspace, { recursive: true, force: true });
    });

    test("lists files and directories at the workspace root", async () => {
        const result = await new SearchTool().execute({ action: "list", path: "/" });

        expect(result).toEqual({
            action: "list",
            path: ".",
            entries: [
                { path: "docs", name: "docs", type: "directory" },
                { path: "src", name: "src", type: "directory" },
                { path: "package.json", name: "package.json", type: "file" },
            ],
        });
    });

    test("searches files and directories by prefix", async () => {
        const result = await new SearchTool().execute({
            action: "search",
            prefix: "src/agent",
            path: "/",
            depth: 3,
        });

        expect(result).toEqual({
            action: "search",
            path: ".",
            prefix: "src/agent",
            entries: [
                { path: "src/agent", name: "agent", type: "directory" },
                { path: "src/agent/agent.ts", name: "agent.ts", type: "file" },
            ],
        });
    });

    test("greps text files case-sensitively", async () => {
        const result = await new SearchTool().execute({
            action: "grep",
            query: "sendMessage",
            path: "/",
            depth: 3,
        });

        expect(result).toEqual({
            action: "grep",
            path: ".",
            query: "sendMessage",
            matches: [
                { path: "src/agent/agent.ts", lineNumber: 1, line: "export function sendMessage() {}" },
            ],
        });
    });

    test("greps only specific files when files are provided", async () => {
        const result = await new SearchTool().execute({
            action: "grep",
            query: "sendMessage",
            files: ["src/agent/agent.ts"],
        });

        expect(result).toEqual({
            action: "grep",
            path: ".",
            query: "sendMessage",
            matches: [
                { path: "src/agent/agent.ts", lineNumber: 1, line: "export function sendMessage() {}" },
            ],
        });
    });

    test("returns an error output for invalid input", async () => {
        const result = await new SearchTool().execute({
            action: "grep",
            query: 42,
        });

        expect(result).toHaveProperty("error");
    });

    test("returns an error output for paths outside the workspace", async () => {
        const result = await new SearchTool().execute({
            action: "list",
            path: "..",
        });

        expect(result).toHaveProperty("error");
    });
});
