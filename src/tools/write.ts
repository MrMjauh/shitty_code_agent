import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool } from "./tools.js";
import { parseToolInput, toolErrorOutput, type ToolErrorOutput, z } from "./validation.js";
import { resolveWorkspacePath } from "../security/workspace.js";

interface WriteFileOutput {
  bytesWritten: number;
}

const writeFileInputSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export class WriteFileTool implements Tool {
  name() {
    return "write_file";
  }

  description() {
    return "Write content to a new file at the given path, creating parent directories as needed. "
      + "Prefer edit_file for changing existing files.";
  }

  inputSchema() {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Path to write, relative to the current working directory.",
        },
        content: {
          type: "string",
          description: "Complete file contents to write.",
        },
      },
      required: ["path", "content"],
    };
  }

  example() {
    return [
      {
        description: "Write a new source file",
        input: { path: "src/hello.ts", content: 'console.log("hello");\n' },
        output: { bytesWritten: 22 },
      },
    ];
  }

  async execute(input: unknown): Promise<WriteFileOutput | ToolErrorOutput> {
    try {
      const { path, content } = parseToolInput(writeFileInputSchema, input);
      const targetPath = resolveWorkspacePath(path);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, "utf-8");
      return { bytesWritten: Buffer.byteLength(content, "utf-8") };
    } catch (error) {
      return toolErrorOutput(error);
    }
  }
}
