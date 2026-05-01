import { readFile } from "node:fs/promises";
import type { Tool } from "./tools.js";
import { parseToolInput, toolErrorOutput, type ToolErrorOutput, z } from "./validation.js";
import { resolveWorkspacePath } from "../security/workspace.js";
import type { JsonSchema } from "../shared/types.js";

interface ReadFileOutput {
  content: string;
}

interface ReadFilesOutput {
  contents: { path: string; content: string }[];
}

const readFileInputSchema = z.object({
  path: z.union([z.string(), z.array(z.string())]),
});

export class ReadFileTool implements Tool {
  name() {
    return "read_file";
  }

  description() {
    return "Read the contents of a file at the given path. "
      + "Use this to inspect existing files before editing them. "
      + "Pass an array of paths to read multiple files at once (PERFERRED).";
  }

  inputSchema(): JsonSchema {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          oneOf: [
            { type: "string", description: "Path to read, relative to the current working directory." },
            { type: "array", items: { type: "string" }, description: "Paths to read, relative to the current working directory." },
          ],
          description: "Path (or array of paths) to read, relative to the current working directory.",
        },
      },
      required: ["path"],
    };
  }

  example() {
    return [
      {
        description: "Read a source file",
        input: { path: "src/index.ts" },
        output: { content: 'console.log("hello");\n' },
      },
      {
        description: "Read multiple source files",
        input: { path: ["src/index.ts", "src/hello.ts"] },
        output: {
          contents: [
            { path: "src/index.ts", content: 'console.log("hello");\n' },
            { path: "src/hello.ts", content: 'console.log("world");\n' },
          ],
        },
      },
    ];
  }

  async execute(input: unknown): Promise<ReadFileOutput | ReadFilesOutput | ToolErrorOutput> {
    try {
      const { path } = parseToolInput(readFileInputSchema, input);

      if (typeof path === "string") {
        const content = await readFile(resolveWorkspacePath(path), "utf-8");
        return { content };
      }

      const contents = await Promise.all(
        path.map(async (p) => ({
          path: p,
          content: await readFile(resolveWorkspacePath(p), "utf-8"),
        }))
      );
      return { contents };
    } catch (error) {
      return toolErrorOutput(error);
    }
  }
}
