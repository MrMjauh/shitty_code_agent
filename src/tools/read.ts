import { readFile } from "node:fs/promises";
import type { Tool } from "./tools.js";
import { parseToolInput, toolErrorOutput, type ToolErrorOutput, z } from "./validation.js";
import { resolveWorkspacePath } from "./workspace.js";

interface ReadFileOutput {
  content: string;
}

const readFileInputSchema = z.object({
  path: z.string(),
});

export class ReadFileTool implements Tool {
  name() {
    return "read_file";
  }

  description() {
    return "Read the contents of a file at the given path. "
      + "Use this to inspect existing files before editing them.";
  }

  inputSchema() {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Path to read, relative to the current working directory.",
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
    ];
  }

  async execute(input: unknown): Promise<ReadFileOutput | ToolErrorOutput> {
    try {
      const { path } = parseToolInput(readFileInputSchema, input);
      const content = await readFile(resolveWorkspacePath(path), "utf-8");
      return { content };
    } catch (error) {
      return toolErrorOutput(error);
    }
  }
}
