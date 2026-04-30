import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Tool } from "./tools.js";
import { parseToolInput, toolErrorOutput, type ToolErrorOutput, z } from "./validation.js";
import { displayWorkspacePath, resolveWorkspacePath } from "../security/workspace.js";

type EntryType = "file" | "directory";

type SearchOutput =
    | {
        action: "list";
        path: string;
        entries: SearchEntry[];
    }
    | {
        action: "search";
        path: string;
        prefix: string;
        entries: SearchEntry[];
    }
    | {
        action: "grep";
        path: string;
        query: string;
        matches: GrepMatch[];
    };

type SearchEntry = {
    path: string;
    name: string;
    type: EntryType;
};

type GrepMatch = {
    path: string;
    lineNumber: number;
    line: string;
};

const excludeSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("directory_exclude"),
        exclude: z.string(),
    }),
    z.object({
        type: z.literal("file_exclude"),
        exclude: z.string(),
    }),
]);

const commonSearchInputSchema = {
    path: z.string().optional(),
    limit: z.number().finite().optional(),
    excludes: z.array(excludeSchema).optional(),
};

const searchInputSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("list"),
        ...commonSearchInputSchema,
    }),
    z.object({
        action: z.literal("search"),
        prefix: z.string(),
        depth: z.number().finite().optional(),
        ...commonSearchInputSchema,
    }),
    z.object({
        action: z.literal("grep"),
        query: z.string(),
        files: z.array(z.string()).optional(),
        depth: z.number().finite().optional(),
        ...commonSearchInputSchema,
    }),
]);

type InputExclude = z.infer<typeof excludeSchema>;
type SearchInput = z.infer<typeof searchInputSchema>;

const DEFAULT_LIMIT = 50;
const DEFAULT_DEPTH = 8;
const MAX_VISITED = 10000;
const MAX_TEXT_FILE_BYTES = 1024 * 1024;

const DEFAULT_DIRECTORY_EXCLUDES = new Set([".git", "node_modules"]);
const TEXT_EXTENSIONS = new Set([
    ".c",
    ".cc",
    ".css",
    ".csv",
    ".go",
    ".h",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".py",
    ".rs",
    ".sh",
    ".sql",
    ".tsx",
    ".ts",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
]);

export class SearchTool implements Tool {
    name() {
        return "search";
    }

    description() {
        return "Explore files in the working directory. "
            + "Use action=list to list files and directories in a directory, with path=/ for the workspace root. "
            + "Use action=search with prefix to recursively find files or directories by path/name prefix. "
            + "Use action=grep with query to search inside text-based files.";
    }

    inputSchema() {
        return {
            type: "object",
            additionalProperties: false,
            properties: {
                action: {
                    type: "string",
                    enum: ["list", "search", "grep"],
                    description: "Operation to perform.",
                },
                path: {
                    type: "string",
                    description: "Directory to list or search. Use / for the workspace root.",
                },
                prefix: {
                    type: "string",
                    description: "For action=search, path or filename prefix to match.",
                },
                query: {
                    type: "string",
                    description: "For action=grep, text to search for inside text files.",
                },
                files: {
                    type: "array",
                    description: "For action=grep, optional workspace-relative files to search instead of recursively walking path.",
                    items: {
                        type: "string",
                    },
                },
                limit: {
                    type: "number",
                    description: "Maximum number of entries or matches to return.",
                },
                depth: {
                    type: "number",
                    description: "Maximum recursive depth for action=search or action=grep.",
                },
                excludes: {
                    type: "array",
                    description: "Exact directory or file names to exclude.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            type: {
                                type: "string",
                                enum: ["directory_exclude", "file_exclude"],
                            },
                            exclude: {
                                type: "string",
                            },
                        },
                        required: ["type", "exclude"],
                    },
                },
            },
            required: ["action"],
        };
    }

    example() {
        return [
            {
                description: "List files and directories in the workspace root",
                input: { action: "list", path: "/", limit: 50 },
                output: {
                    action: "list",
                    path: ".",
                    entries: [
                        { path: "package.json", name: "package.json", type: "file" },
                        { path: "src", name: "src", type: "directory" },
                    ],
                },
            },
            {
                description: "Find files or directories with a prefix",
                input: { action: "search", prefix: "src/agent", depth: 4, limit: 10 },
                output: {
                    action: "search",
                    path: ".",
                    prefix: "src/agent",
                    entries: [
                        { path: "src/agent", name: "agent", type: "directory" },
                        { path: "src/agent/agent.ts", name: "agent.ts", type: "file" },
                    ],
                },
            },
            {
                description: "Search inside text files under a directory",
                input: { action: "grep", query: "sendMessage", path: "src", limit: 10 },
                output: {
                    action: "grep",
                    path: "src",
                    query: "sendMessage",
                    matches: [
                        { path: "src/agent/agent.ts", lineNumber: 55, line: "public async sendMessage(msg: string): Promise<string> {" },
                    ],
                },
            },
            {
                description: "Search inside specific files",
                input: { action: "grep", query: "sendMessage", files: ["src/agent/agent.ts"] },
                output: {
                    action: "grep",
                    path: ".",
                    query: "sendMessage",
                    matches: [
                        { path: "src/agent/agent.ts", lineNumber: 55, line: "public async sendMessage(msg: string): Promise<string> {" },
                    ],
                },
            },
        ];
    }

    async execute(input: unknown): Promise<SearchOutput | ToolErrorOutput> {
        try {
            const parsed = parseToolInput(searchInputSchema, input);
            switch (parsed.action) {
                case "list":
                    return await listDirectory(parsed);
                case "search":
                    return await searchByPrefix(parsed);
                case "grep":
                    return await grepFiles(parsed);
            }
        } catch (error) {
            return toolErrorOutput(error);
        }
    }
}

async function listDirectory(input: Extract<SearchInput, { action: "list" }>): Promise<SearchOutput> {
    const root = process.cwd();
    const dir = resolveWorkspacePath(input.path);
    const entries = await readdir(dir, { withFileTypes: true });
    const excludes = input.excludes ?? [];
    const limit = normalizePositiveInteger(input.limit, DEFAULT_LIMIT);

    return {
        action: "list",
        path: displayWorkspacePath(dir, root),
        entries: entries
            .filter((entry) => isSupportedEntry(entry))
            .filter((entry) => !isExcluded(entry.name, entry.isDirectory(), excludes, false))
            .map((entry) => toSearchEntry(root, dir, entry.name, entry.isDirectory() ? "directory" : "file"))
            .sort(compareEntries)
            .slice(0, limit),
    };
}

async function searchByPrefix(input: Extract<SearchInput, { action: "search" }>): Promise<SearchOutput> {
    if (!input.prefix) throw new Error("prefix is required for action=search");

    const root = process.cwd();
    const start = resolveWorkspacePath(input.path);
    const limit = normalizePositiveInteger(input.limit, DEFAULT_LIMIT);
    const depth = normalizePositiveInteger(input.depth, DEFAULT_DEPTH);
    const entries: SearchEntry[] = [];

    for await (const entry of walk(root, start, depth, input.excludes ?? [])) {
        if (matchesPrefix(entry, input.prefix)) {
            entries.push(entry);
            if (entries.length >= limit) break;
        }
    }

    return {
        action: "search",
        path: displayWorkspacePath(start, root),
        prefix: input.prefix,
        entries,
    };
}

async function grepFiles(input: Extract<SearchInput, { action: "grep" }>): Promise<SearchOutput> {
    if (!input.query) throw new Error("query is required for action=grep");

    const root = process.cwd();
    const start = resolveWorkspacePath(input.path);
    const limit = normalizePositiveInteger(input.limit, DEFAULT_LIMIT);
    const depth = normalizePositiveInteger(input.depth, DEFAULT_DEPTH);
    const needle = input.query;
    const matches: GrepMatch[] = [];

    for await (const path of grepCandidateFiles(root, start, depth, input)) {
        const fileMatches = await grepOneFile(root, path, needle);
        for (const match of fileMatches) {
            matches.push(match);
            if (matches.length >= limit) {
                return {
                    action: "grep",
                    path: displayWorkspacePath(start, root),
                    query: input.query,
                    matches,
                };
            }
        }
    }

    return {
        action: "grep",
        path: displayWorkspacePath(start, root),
        query: input.query,
        matches,
    };
}

async function* grepCandidateFiles(
    root: string,
    start: string,
    depth: number,
    input: Extract<SearchInput, { action: "grep" }>,
): AsyncGenerator<string> {
    if (input.files && input.files.length > 0) {
        for (const file of input.files) {
            const absolutePath = resolveWorkspacePath(file);
            const fileStat = await stat(absolutePath);
            if (!fileStat.isFile()) continue;

            const relativePath = displayWorkspacePath(absolutePath, root);
            if (isLikelyTextFile(relativePath)) {
                yield relativePath;
            }
        }
        return;
    }

    for await (const entry of walk(root, start, depth, input.excludes ?? [])) {
        if (entry.type === "file" && isLikelyTextFile(entry.path)) {
            yield entry.path;
        }
    }
}

async function* walk(
    root: string,
    start: string,
    maxDepth: number,
    excludes: InputExclude[],
): AsyncGenerator<SearchEntry> {
    const queue: { dir: string; depth: number }[] = [{ dir: start, depth: 0 }];
    let visited = 0;

    while (queue.length > 0 && visited < MAX_VISITED) {
        const current = queue.shift()!;
        if (current.depth > maxDepth) continue;

        const entries = await readdir(current.dir, { withFileTypes: true });
        for (const entry of entries) {
            if (visited >= MAX_VISITED) break;
            if (!isSupportedEntry(entry)) continue;
            if (isExcluded(entry.name, entry.isDirectory(), excludes, true)) continue;

            visited++;
            const type = entry.isDirectory() ? "directory" : "file";
            const searchEntry = toSearchEntry(root, current.dir, entry.name, type);
            yield searchEntry;

            if (entry.isDirectory()) {
                queue.push({ dir: join(current.dir, entry.name), depth: current.depth + 1 });
            }
        }
    }
}

async function grepOneFile(
    root: string,
    relativePath: string,
    needle: string,
): Promise<GrepMatch[]> {
    const absolutePath = join(root, relativePath);
    const fileStat = await stat(absolutePath);
    if (fileStat.size > MAX_TEXT_FILE_BYTES) return [];

    const content = await readFile(absolutePath, "utf-8");
    if (content.includes("\0")) return [];

    const matches: GrepMatch[] = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (line.includes(needle)) {
            matches.push({
                path: relativePath,
                lineNumber: i + 1,
                line,
            });
        }
    }

    return matches;
}

function toSearchEntry(root: string, dir: string, name: string, type: EntryType): SearchEntry {
    const absolutePath = join(dir, name);
    return {
        path: displayWorkspacePath(absolutePath, root),
        name,
        type,
    };
}

function isSupportedEntry(entry: { isDirectory(): boolean; isFile(): boolean }) {
    return entry.isDirectory() || entry.isFile();
}

function isExcluded(name: string, isDirectory: boolean, excludes: InputExclude[], useDefaultDirectoryExcludes: boolean) {
    if (!isDirectory && (name.startsWith(".env.") || name.endsWith(".env"))) return true;
    if (useDefaultDirectoryExcludes && isDirectory && DEFAULT_DIRECTORY_EXCLUDES.has(name)) return true;

    return excludes.some((exclude) =>
        exclude.exclude === name
        && ((exclude.type === "directory_exclude" && isDirectory)
            || (exclude.type === "file_exclude" && !isDirectory)),
    );
}

function matchesPrefix(entry: SearchEntry, prefix: string) {
    const normalizedPrefix = prefix.replace(/^\.\//, "");
    if (entry.path.startsWith(normalizedPrefix)) return true;
    return basename(entry.path).startsWith(normalizedPrefix);
}

function isLikelyTextFile(path: string) {
    return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
    return Math.floor(value);
}

function compareEntries(a: SearchEntry, b: SearchEntry) {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path);
}
