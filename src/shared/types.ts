export type ToolCall = {
    // Opaque provider-generated tool call identifier that must be echoed back with the tool result.
    id: string;
    name: string;
    input: unknown;
};

type JsonSchemaString = {
    type: "string";
    description?: string;
    enum?: string[];
};

type JsonSchemaNumber = {
    type: "number";
    description?: string;
};

type JsonSchemaArray = {
    type: "array";
    description?: string;
    items: JsonSchemaProperty;
};

type JsonSchemaObject = {
    type: "object";
    description?: string;
    additionalProperties?: boolean;
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
};

export type JsonSchemaProperty =
    | JsonSchemaString
    | JsonSchemaNumber
    | JsonSchemaArray
    | JsonSchemaObject;

export type JsonSchema = JsonSchemaObject;

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
