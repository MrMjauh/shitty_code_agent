import { readFile, writeFile } from "node:fs/promises";
import type { Tool } from "./tools.js";
import { parseToolInput, toolErrorOutput, type ToolErrorOutput, z } from "./validation.js";
import { resolveWorkspacePath } from "../security/workspace.js";
import type { JsonSchema } from "../shared/types.js";

interface EditFileOutput {
  bytesWritten: number;
}

const editFileInputSchema = z.object({
  path: z.string(),
  old_text: z.string(),
  new_text: z.string(),
});

export class EditFileTool implements Tool {
  name() {
    return "edit_file";
  }

  description() {
    return "Edit an existing file by replacing one exact old_text occurrence with new_text. "
      + "Use this instead of write_file when changing existing files. "
      + "The edit fails if old_text is empty, missing, or appears more than once.";
  }

  inputSchema(): JsonSchema {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Path to edit, relative to the current working directory.",
        },
        old_text: {
          type: "string",
          description: "Exact text to replace. Must appear once.",
        },
        new_text: {
          type: "string",
          description: "Replacement text.",
        },
      },
      required: ["path", "old_text", "new_text"],
    };
  }

  example() {
    return [
      {
        description: "Rename one function in an existing source file",
        input: {
          path: "src/hello.ts",
          old_text: "function hello() {\n  return \"hello\";\n}\n",
          new_text: "function greet() {\n  return \"hello\";\n}\n",
        },
        output: { bytesWritten: 39 },
      },
    ];
  }

  async execute(input: unknown): Promise<EditFileOutput | ToolErrorOutput> {
    try {
      const { path, old_text, new_text } = parseToolInput(editFileInputSchema, input);

      if (old_text.length === 0) {
        throw new Error("old_text must not be empty");
      }

      const targetPath = resolveWorkspacePath(path);
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
    } catch (error) {
      return toolErrorOutput(error);
    }
  }
}
