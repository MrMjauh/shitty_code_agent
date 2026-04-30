import type { JsonSchema } from "../shared/types.js";

export interface Tool {
    name(): string;
    description(): string;
    inputSchema(): JsonSchema;
    example(): { input: unknown; output: unknown; description: string }[];

    execute(input: unknown): Promise<unknown>;
}
