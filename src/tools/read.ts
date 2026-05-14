import { readFile, readdir, stat } from "node:fs/promises";
import { extname } from "node:path";
import type { Tool } from "./tools.js";
import { parseToolInput, toolErrorOutput, type ToolErrorOutput, z } from "./validation.js";
import { resolveWorkspacePath } from "../security/workspace.js";
import type { JsonSchema } from "../shared/types.js";
import { markAsRead } from "./fileTracker.js";

/** Max bytes we attempt to read before falling back to streaming / range handling. */
const MAX_PREVIEW_BYTES = 1_024 * 512; // 512 KiB

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"]);
const PDF_EXTENSION = ".pdf";

interface ReadFileOutput {
  content: string;
  /** The range of lines returned (1-indexed). Only present for text files. */
  lineRange?: { start: number; end: number };
  /** Total lines in the file. Only present for text files. */
  totalLines?: number;
}

interface ReadDirectoryOutput {
  entries: { path: string; name: string; type: "file" | "directory" }[];
}

const readFileInputSchema = z.object({
  filePath: z.string(),
  offset: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).optional().default(2000),
});

export class ReadFileTool implements Tool {
  name() {
    return "read_file";
  }

  description() {
    return "Read the contents of a file at the given path. "
      + "Use this to inspect existing files before editing them. "
      + "Pass an array of paths to read multiple files at once (PERFERRED). "
      + "Use offset (1-indexed, default 1) and limit (default 2000) to read specific line ranges. "
      + "Directories are listed automatically.";
  }

  inputSchema(): JsonSchema {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        filePath: {
          type: "string",
          description: "Path to read, relative to the current working directory.",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (1-indexed, default 1).",
        },
        limit: {
          type: "number",
          description: "Maximum lines to return (default 2000).",
        },
      },
      required: ["filePath"],
    };
  }

  example() {
    return [
      {
        description: "Read a source file",
        input: { filePath: "src/index.ts" },
        output: { content: 'console.log("hello");\n', lineRange: { start: 1, end: 1 }, totalLines: 1 },
      },
      {
        description: "Read a specific line range",
        input: { filePath: "src/index.ts", offset: 10, limit: 25 },
        output: { content: "line 10...\n", lineRange: { start: 10, end: 34 }, totalLines: 100 },
      },
      {
        description: "List a directory",
        input: { filePath: "src" },
        output: {
          entries: [
            { path: "src/index.ts", name: "index.ts", type: "file" },
            { path: "src/hello.ts", name: "hello.ts", type: "file" },
          ],
        },
      },
    ];
  }

  async execute(input: unknown): Promise<ReadFileOutput | ReadDirectoryOutput | ToolErrorOutput> {
    try {
      const { filePath, offset, limit } = parseToolInput(readFileInputSchema, input);
      const resolvedPath = resolveWorkspacePath(filePath);
      const stats = await stat(resolvedPath);

      markAsRead(resolvedPath);

      // --- Directory listing ---
      if (stats.isDirectory()) {
        const entries = await readdir(resolvedPath, { withFileTypes: true });
        return {
          entries: entries.map((entry) => ({
            path: `${filePath}/${entry.name}`,
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
          })),
        };
      }

      // --- Binary / image / PDF handling ---
      const ext = extname(resolvedPath).toLowerCase();

      if (IMAGE_EXTENSIONS.has(ext)) {
        return { content: `[Image: ${filePath}]` };
      }

      if (ext === PDF_EXTENSION) {
        return { content: `[PDF: ${filePath}]` };
      }

      // --- Text file with line-range support ---
      const fullContent = await readFile(resolvedPath, "utf-8");
      const lines = fullContent.split("\n");
      // Remove trailing empty line from split
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
      const totalLines = lines.length;

      const startIdx = offset - 1;
      const selectedLines = lines.slice(startIdx, startIdx + limit);
      const endLine = Math.min(startIdx + limit, totalLines);

      // Build line-numbered content
      const maxLineNumWidth = String(endLine).length;
      const numberedLines = selectedLines.map((line, i) => {
        const lineNum = String(startIdx + i + 1).padStart(maxLineNumWidth);
        return `${lineNum} | ${line}`;
      });

      return {
        content: numberedLines.join("\n") + (numberedLines.length > 0 ? "\n" : ""),
        lineRange: { start: offset, end: endLine },
        totalLines,
      };
    } catch (error) {
      return toolErrorOutput(error);
    }
  }
}
