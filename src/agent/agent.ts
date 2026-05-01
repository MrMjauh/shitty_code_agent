import type { Tool } from "../tools/tools.js";
import type { Provider } from "./models/provider.js";
import { type AgentInstructions } from "./agent-instructions.js";
import { createFileLogger, type AgentLogger } from "./logger.js";
import type { Message, ModelResponse, ToolCall } from "../shared/types.js";

const DEFAULT_MAX_TOOL_ITERATIONS = 50;

export type OnNewMessage = (msg: Message, history: Message[]) => void;
export type AgentOptions = {
    tools: Tool[];
    provider: Provider;
    compileInstructions: AgentInstructions;
    maxToolIterations?: number;
    logger?: AgentLogger;
};

export class Agent {

    private options: Required<AgentOptions>;
    private history: Message[] = [];
    private onNewMessageCallback: OnNewMessage = () => {};

    constructor(options: AgentOptions) {
        this.options = {
            ...options,
            maxToolIterations: options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS,
            logger: options.logger ?? createFileLogger(),
        };
    }

    public onNewMessage(callback: OnNewMessage) {
        this.onNewMessageCallback = callback;
    }

    public clearHistory() {
        this.history = [];
    }

    public getProvider(): Provider {
        return this.options.provider;
    }

    public getSystemInstructions() {
        return this.options.compileInstructions({
            tools: this.options.tools,
            maxToolIterations: this.options.maxToolIterations,
        });
    }

    public async sendMessage(msg: string): Promise<string> {
        const { compileInstructions, provider, tools, maxToolIterations } = this.options;
        // By recompiling each time, we can load in different tools etc during an active session
        const systemMessage: Message = { role: "system", text: compileInstructions({ tools, maxToolIterations }) };
        // Buid the full message history
        const sendMessageHistory: Message[] = [
              systemMessage,
            ...this.history,
        ];

        const userMessage: Message = { role: "user", text: msg };
        this.onNewMessageCallback(userMessage, sendMessageHistory);
        let response: ModelResponse;

        try {
            response = await provider.sendMessage(userMessage, sendMessageHistory, tools);
        } catch (error) {
            sendMessageHistory.push(userMessage);
            return this.finishWithError(
                sendMessageHistory,
                "Provider failed while sending the message.",
                "Provider sendMessage failed",
                { error: formatError(error) },
            );
        }

        const firstAssistantMessage = createAssistantMessage(response);

        sendMessageHistory.push(userMessage);
        this.onNewMessageCallback(firstAssistantMessage, sendMessageHistory);
        sendMessageHistory.push(firstAssistantMessage);

        let error: { msg: string} | undefined;
        let toolIterations = 0;

        while (true) {
            if (response.toolCalls.length === 0) break;

            if (toolIterations + response.toolCalls.length > maxToolIterations) {
                error = {
                    msg: `Stopped after ${maxToolIterations} tool call iterations to avoid a possible infinite loop.`
                }
                this.options.logger.error("Exceeded max tool iterations", {
                    maxToolIterations,
                    completedToolIterations: toolIterations,
                    pendingToolCalls: response.toolCalls.map(formatToolCallForLog),
                });
                break;
            }

            // Iterate over all tools, and it to the history
            for (const toolCall of response.toolCalls) {
                toolIterations++;
                const tool = tools.find((t) => t.name() === toolCall.name);

                const toolResult = tool
                    ? await this.executeTool(tool, toolCall)
                    : { error: `Unknown tool: ${toolCall.name}` };

                if (!tool) {
                    this.options.logger.error("Unknown tool call", {
                        toolCall: formatToolCallForLog(toolCall),
                    });
                } else if (isToolErrorResult(toolResult)) {
                    this.options.logger.error("Tool returned an error", {
                        toolCall: formatToolCallForLog(toolCall),
                        error: toolResult.error,
                    });
                }

                const toolMessage: Message = {
                    role: "tool",
                    text: JSON.stringify(toolResult),
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                };
                this.onNewMessageCallback(toolMessage, sendMessageHistory);
                sendMessageHistory.push(toolMessage);
            }

            // Here we dont send a message, but generate content from the new set of tool calls
            try {
                response = await provider.generateContent(sendMessageHistory, tools);
            } catch (error) {
                return this.finishWithError(
                    sendMessageHistory,
                    "Provider failed while generating content.",
                    "Provider generateContent failed",
                    { error: formatError(error) },
                );
            }
            const assistantMessage = createAssistantMessage(response);
            this.onNewMessageCallback(assistantMessage, sendMessageHistory);
            sendMessageHistory.push(assistantMessage);
        }
    
        if (error?.msg) {
            const errorMsg: Message = { role: "error", text: error.msg };
            sendMessageHistory.push(errorMsg);
            this.onNewMessageCallback(errorMsg, sendMessageHistory);
            this.history = sendMessageHistory.slice(1);
            return error.msg;
        }

        // History now becomes, all but the first message (system message)
        this.history = sendMessageHistory.slice(1);
        return response.text;
    }

    private async executeTool(tool: Tool, toolCall: ToolCall) {
        try {
            return await tool.execute(toolCall.input);
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private finishWithError(
        history: Message[],
        userMessage: string,
        logMessage: string,
        metadata: Record<string, unknown>,
    ) {
        this.options.logger.error(logMessage, metadata);
        const errorMsg: Message = { role: "error", text: userMessage };
        history.push(errorMsg);
        this.onNewMessageCallback(errorMsg, history);
        this.history = history.slice(1);
        return userMessage;
    }
}

function createAssistantMessage(response: ModelResponse): Message {
    return {
        role: "assistant",
        text: response.text,
        ...(response.reasoningContent ? { reasoningContent: response.reasoningContent } : {}),
        toolCalls: response.toolCalls,
    };
}

function isToolErrorResult(result: unknown): result is { error: string } {
    return Boolean(
        result
            && typeof result === "object"
            && "error" in result
            && typeof (result as Record<string, unknown>).error === "string"
    );
}

function formatError(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return { message: String(error) };
}

function formatToolCallForLog(toolCall: ToolCall) {
    return {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
    };
}
