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

type JsonSchemaOneOf = {
    description?: string;
    oneOf: JsonSchemaProperty[];
};

export type JsonSchemaProperty =
    | JsonSchemaString
    | JsonSchemaNumber
    | JsonSchemaArray
    | JsonSchemaObject
    | JsonSchemaOneOf;

export type JsonSchema = JsonSchemaObject;

export type ModelResponse = {
    text: string;
    reasoningContent?: string;
    toolCalls: ToolCall[];
};

export type Message = {
    role: "system" | "user" | "assistant" | "tool" | "error";
    text: string;
    reasoningContent?: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
    toolName?: string;
}
