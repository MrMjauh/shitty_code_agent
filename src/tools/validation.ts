import { z } from "zod";

export { z };

export type ToolErrorOutput = {
  error: string;
};

export function parseToolInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new Error(`Invalid input: ${formatZodError(result.error)}`);
}

export function toolErrorOutput(error: unknown): ToolErrorOutput {
  return {
    error: error instanceof Error ? error.message : String(error),
  };
}

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
