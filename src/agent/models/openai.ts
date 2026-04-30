import type { Message, ModelResponse, ModelTool } from "../../shared/types.js";
import type { Model } from "./model.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAi implements Model {

    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model = "gpt-4o") {
        this.apiKey = apiKey;
        this.model = model;
    }
    
    getProvider(): string {
        return "openai";
    }

    getModel(): string {
        return this.model;
    }

    async sendMessage(msgs: Message[], tools: ModelTool[]): Promise<ModelResponse> {
        const response = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: msgs.map(formatMessage),
                ...(tools.length > 0 ? { tools: tools.map(formatTool) } : {}),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error ${response.status}: ${error}`);
        }

        const data = await response.json() as {
            choices: {
                message: {
                    content: string | null;
                    tool_calls?: {
                        id: string;
                        type: "function";
                        function: {
                            name: string;
                            arguments: string;
                        };
                    }[];
                };
            }[];
        };

        const message = data.choices[0]?.message;
        if (!message) throw new Error("Empty response from OpenAI");

        return {
            text: message.content ?? "",
            toolCalls: (message.tool_calls ?? []).map((toolCall) => ({
                id: toolCall.id,
                name: toolCall.function.name,
                input: parseToolArguments(toolCall.function.arguments),
            })),
        };
    }
}

function formatMessage(message: Message) {
    if (message.role === "tool") {
        return {
            role: "tool",
            tool_call_id: message.toolCallId ?? "",
            content: message.text,
        };
    }

    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
        return {
            role: "assistant",
            content: message.text || null,
            tool_calls: message.toolCalls.map((toolCall) => ({
                id: toolCall.id,
                type: "function",
                function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.input),
                },
            })),
        };
    }

    return {
        role: message.role,
        content: message.text,
    };
}

function formatTool(tool: ModelTool) {
    return {
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        },
    };
}

function parseToolArguments(value: string) {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return {};
    }
}
