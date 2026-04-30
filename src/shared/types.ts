export type ToolCall = {
    id: string;
    name: string;
    input: unknown;
};

export type JsonSchema = Record<string, unknown>;

export type ModelTool = {
    name: string;
    description: string;
    inputSchema: JsonSchema;
};

export type ModelResponse = {
    text: string;
    toolCalls: ToolCall[];
};

export type Message = {
    role: "system" | "user" | "assistant" | "tool";
    text: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
    toolName?: string;
}
