import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool } from "./tools.js";
import { parseToolInput, toolErrorOutput, type ToolErrorOutput, z } from "./validation.js";
import { resolveWorkspacePath } from "../security/workspace.js";
import type { JsonSchema } from "../shared/types.js";
import { exists, wasRead } from "./fileTracker.js";

interface WriteFileOutput {
  bytesWritten: number;
}

const writeFileInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("write"),
    filePath: z.string(),
    content: z.string(),
  }),
  z.object({
    mode: z.literal("edit"),
    filePath: z.string(),
    content: z.string(),
    old_text: z.string(),
    new_text: z.string(),
  }),
]);

export class WriteFileTool implements Tool {
  name() {
    return "write_file";
  }

  description() {
    return "Write or edit a file, creating parent directories as needed. "
      + "Use mode 'write' to create new files or fully overwrite existing ones. "
      + "Use mode 'edit' to replace one exact old_text occurrence with new_text "
      + "(old_text must appear exactly once in the file). "
      + "Must have read the file first when overwriting with mode 'write'.";
  }

  inputSchema(): JsonSchema {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["write", "edit"],
          description: "Operation mode: 'write' to create/overwrite, 'edit' to surgically replace text.",
        },
        filePath: {
          type: "string",
          description: "Path to write, relative to the current working directory.",
        },
        content: {
          type: "string",
          description: "Complete file contents to write. Required for both modes; ignored in edit mode.",
        },
        old_text: {
          type: "string",
          description: "Exact text to replace. Required when mode is 'edit'. Must appear exactly once.",
        },
        new_text: {
          type: "string",
          description: "Replacement text. Required when mode is 'edit'.",
        },
      },
      required: ["mode", "filePath", "content"],
    };
  }

  example() {
    return [
      {
        description: "Write a new source file",
        input: { mode: "write", filePath: "src/hello.ts", content: 'console.log("hello");\n' },
        output: { bytesWritten: 22 },
      },
      {
        description: "Replace one function definition in an existing file",
        input: {
          mode: "edit",
          filePath: "src/utils.ts",
          content: "placeholder",
          old_text: "function oldName() { return 1; }",
          new_text: "function newName() { return 2; }",
        },
        output: { bytesWritten: 150 },
      },
    ];
  }

  async execute(input: unknown): Promise<WriteFileOutput | ToolErrorOutput> {
    try {
      const params = parseToolInput(writeFileInputSchema, input);
      const targetPath = resolveWorkspacePath(params.filePath);

      if (params.mode === "edit") {
        return await this.executeEdit(targetPath, params.old_text, params.new_text);
      }

      return await this.executeWrite(targetPath, params.filePath, params.content);
    } catch (error) {
      return toolErrorOutput(error);
    }
  }

  private async executeEdit(targetPath: string, old_text: string, new_text: string): Promise<WriteFileOutput> {
    if (old_text.length === 0) {
      throw new Error("old_text must not be empty");
    }

    const content = await readFile(targetPath, "utf-8");
    const firstIndex = content.indexOf(old_text);

    if (firstIndex === -1) {
      throw new Error("old_text was not found");
    }

    if (content.indexOf(old_text, firstIndex + old_text.length) !== -1) {
      throw new Error("old_text appears more than once");
    }

    const nextContent = content.slice(0, firstIndex) + new_text + content.slice(firstIndex + old_text.length);
    await writeFile(targetPath, nextContent, "utf-8");
    return { bytesWritten: Buffer.byteLength(nextContent, "utf-8") };
  }

  private async executeWrite(targetPath: string, filePath: string, content: string): Promise<WriteFileOutput> {
    if (await exists(targetPath)) {
      if (!wasRead(targetPath)) {
        throw new Error(
          `File "${filePath}" already exists and has not been read yet. `
          + `Use read_file first to inspect its contents before overwriting.`
        );
      }
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf-8");
    return { bytesWritten: Buffer.byteLength(content, "utf-8") };
  }
}
