import type { Message, ModelResponse } from "../../shared/types.js";
import type { Tool } from "../../tools/tools.js";
import type { ModelResponseStream, ModelStreamEvent, Provider } from "./provider.js";

type OpenAiCompatibleProviderOptions = {
    provider: string;
    model: string;
    apiKey: string;
    apiUrl: string;
    streaming: boolean;
};

type CompletionResponse = {
    choices: {
        message: {
            content: string | null;
            reasoning_content?: string;
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

type StreamChunk = {
    choices?: {
        delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: {
                index?: number;
                id?: string;
                type?: "function";
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }[];
        };
    }[];
};

type ToolCallAccumulator = {
    id?: string;
    name?: string;
    arguments: string;
};

export class OpenAiCompatibleProvider implements Provider {
    private readonly provider: string;
    private readonly model: string;
    private readonly apiKey: string;
    private readonly apiUrl: string;
    private readonly streaming: boolean;

    constructor(options: OpenAiCompatibleProviderOptions) {
        this.provider = options.provider;
        this.model = options.model;
        this.apiKey = options.apiKey;
        this.apiUrl = options.apiUrl;
        this.streaming = options.streaming;
    }

    getProvider(): string {
        return this.provider;
    }

    getModel(): string {
        return this.model;
    }

    async *generateContent(system: Message, msgs: Message[], tools: Tool[]): ModelResponseStream {
        if (!this.streaming) {
            yield {
                type: "done",
                response: await this.createCompletion([system, ...msgs], tools),
            };
            return;
        }

        yield* this.createStreamingCompletion([system, ...msgs], tools);
    }

    private async createCompletion(messages: Message[], tools: Tool[]): Promise<ModelResponse> {
        const response = await fetch(this.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages.map(formatMessage),
                ...(tools.length > 0 ? { tools: tools.map(formatTool) } : {}),
                stream: false,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`${this.provider} API error ${response.status}: ${error}`);
        }

        const data = await response.json() as CompletionResponse;

        const message = data.choices[0]?.message;
        if (!message) throw new Error(`Empty response from ${this.provider}`);

        return {
            text: message.content ?? "",
            ...(message.reasoning_content ? { reasoningContent: message.reasoning_content } : {}),
            toolCalls: (message.tool_calls ?? []).map((toolCall) => ({
                id: toolCall.id,
                name: toolCall.function.name,
                input: parseToolArguments(toolCall.function.arguments),
            })),
        };
    }

    private async *createStreamingCompletion(
        messages: Message[],
        tools: Tool[],
    ): ModelResponseStream {
        const response = await fetch(this.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages.map(formatMessage),
                ...(tools.length > 0 ? { tools: tools.map(formatTool) } : {}),
                stream: true,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`${this.provider} API error ${response.status}: ${error}`);
        }
        if (!response.body) {
            throw new Error(`Empty streaming response from ${this.provider}`);
        }

        yield* parseOpenAiCompatibleStreamChunks(decodeUtf8Stream(response.body));
    }
}

function formatMessage(message: Message) {
    const reasoningContent = "reasoningContent" in message && message.reasoningContent
        ? { reasoning_content: message.reasoningContent }
        : {};

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
            ...reasoningContent,
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
        ...reasoningContent,
    };
}

function formatTool(tool: Tool) {
    return {
        type: "function",
        function: {
            name: tool.name(),
            description: tool.description(),
            parameters: tool.inputSchema(),
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

export async function* parseOpenAiCompatibleStreamChunks(
    chunks: AsyncIterable<string> | Iterable<string>,
): ModelResponseStream {
    let text = "";
    let reasoningContent = "";
    let buffer = "";
    let done = false;
    const toolCalls = new Map<number, ToolCallAccumulator>();
    const events: ModelStreamEvent[] = [];
    const handleStreamChunk = (streamChunk: StreamChunk) => {
        const delta = streamChunk.choices?.[0]?.delta;
        if (!delta) return;

        if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
            events.push({ type: "reasoning_delta", text: delta.reasoning_content });
        }
        if (delta.content) {
            text += delta.content;
            events.push({ type: "content_delta", text: delta.content });
        }
        for (const [fallbackIndex, toolCallDelta] of (delta.tool_calls ?? []).entries()) {
            const index = toolCallDelta.index ?? fallbackIndex;
            const current = toolCalls.get(index) ?? { arguments: "" };
            if (toolCallDelta.id) current.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) {
                current.name = `${current.name ?? ""}${toolCallDelta.function.name}`;
            }
            if (toolCallDelta.function?.arguments) {
                current.arguments += toolCallDelta.function.arguments;
            }
            toolCalls.set(index, current);
        }
    };

    for await (const chunk of chunks) {
        buffer += chunk;

        let boundary = findEventBoundary(buffer);
        while (boundary) {
            const event = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary.length);
            processStreamEvent(event, {
                onDone: () => {
                    done = true;
                    buffer = "";
                },
                onChunk: handleStreamChunk,
            });
            yield* drainEvents(events);
            if (done) break;
            boundary = findEventBoundary(buffer);
        }
        if (done) break;
    }

    if (buffer.trim().length > 0) {
        processStreamEvent(buffer, {
            onDone: () => {
                done = true;
            },
            onChunk: handleStreamChunk,
        });
        yield* drainEvents(events);
    }

    const response: ModelResponse = {
        text,
        toolCalls: [...toolCalls.entries()]
            .sort(([left], [right]) => left - right)
            .flatMap(([, toolCall]) => {
                if (!toolCall.id || !toolCall.name) return [];
                return [{
                    id: toolCall.id,
                    name: toolCall.name,
                    input: parseToolArguments(toolCall.arguments),
                }];
            }),
    };
    if (reasoningContent.length > 0) {
        response.reasoningContent = reasoningContent;
    }

    yield { type: "done", response };
}

function* drainEvents(events: ModelStreamEvent[]): Iterable<ModelStreamEvent> {
    while (events.length > 0) {
        const event = events.shift();
        if (event) yield event;
    }
}

function processStreamEvent(
    event: string,
    handlers: {
        onDone: () => void;
        onChunk: (chunk: StreamChunk) => void;
    },
) {
    const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n")
        .trim();

    if (data.length === 0) return;
    if (data === "[DONE]") {
        handlers.onDone();
        return;
    }

    handlers.onChunk(JSON.parse(data) as StreamChunk);
}

function findEventBoundary(value: string): { index: number; length: number } | undefined {
    const windows = [
        { token: "\r\n\r\n", length: 4 },
        { token: "\n\n", length: 2 },
    ];

    const matches = windows
        .map((window) => ({ index: value.indexOf(window.token), length: window.length }))
        .filter((match) => match.index >= 0)
        .sort((left, right) => left.index - right.index);

    return matches[0];
}

async function* decodeUtf8Stream(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value, { stream: true });
        }

        const remainder = decoder.decode();
        if (remainder.length > 0) yield remainder;
    } finally {
        reader.releaseLock();
    }
}
