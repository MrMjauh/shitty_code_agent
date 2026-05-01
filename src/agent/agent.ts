import type { Tool } from "../tools/tools.js";
import type { Provider } from "./models/provider.js";
import { type AgentInstructions } from "./agent-instructions.js";
import type { Message } from "../shared/types.js";

export type OnNewMessage = (msg: Message, allMessages: Message[]) => void;
export type AgentOptions = {
    tools: Tool[];
    provider: Provider;
    compileInstructions: AgentInstructions;
    maxToolIterations?: number;
};

export class Agent {

    private options: Required<AgentOptions>;
    private history: Message[] = [];
    private onNewMessageCallback: OnNewMessage = () => {};

    constructor(options: AgentOptions) {
        this.options = Object.assign({
            maxToolIterations: 10
        }, options);
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
        return this.options.compileInstructions(this.options.tools);
    }

    public async sendMessage(msg: string): Promise<string> {
        const { compileInstructions, provider, tools, maxToolIterations } = this.options;
        // By recompiling each time, we can load in different tools etc during an active session
        const systemMessage: Message = { role: "system", text: compileInstructions(tools) };
        // Buid the full message history
        const history: Message[] = [
              systemMessage,
            ...this.history,
        ];

        const userMessage: Message = { role: "user", text: msg };
        let response = await provider.sendMessage(userMessage, history, tools);
        history.push(userMessage);
        this.onNewMessageCallback(userMessage, history);
        const firstAssistantMessage: Message = { role: "assistant", text: response.text, toolCalls: response.toolCalls };
        history.push(firstAssistantMessage);
        this.onNewMessageCallback(firstAssistantMessage, history);

        let error: { msg: string} | undefined;
        let toolIterations = 0;

        while (true) {
            if (response.toolCalls.length === 0) break;

            if (toolIterations + response.toolCalls.length > maxToolIterations) {
                error = {
                    msg: `Stopped after ${maxToolIterations} tool call iterations to avoid a possible infinite loop.`
                }
                break;
            }

            // Iterate over all tools, and it to the history
            for (const toolCall of response.toolCalls) {
                toolIterations++;
                const tool = tools.find((t) => t.name() === toolCall.name);

                const toolResult = tool
                    ? await this.executeTool(tool, toolCall.input)
                    : { error: `Unknown tool: ${toolCall.name}` };

                const toolMessage: Message = {
                    role: "tool",
                    text: JSON.stringify(toolResult),
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                };
                history.push(toolMessage);
                this.onNewMessageCallback(toolMessage, history);
            }

            // Here we dont send a message, but generate content from the new set of tool calls
            response = await provider.generateContent(history, tools);
            const assistantMessage: Message = { role: "assistant", text: response.text, toolCalls: response.toolCalls };
            history.push(assistantMessage);
            this.onNewMessageCallback(assistantMessage, history);
        }
    
        if (error?.msg) {
            const errorMsg: Message = { role: "assistant", text: error.msg };
            history.push(errorMsg);
            this.onNewMessageCallback(errorMsg, history);
            this.history = history.slice(1);
            return error.msg;
        }

        // History now becomes, all but the first message (system message)
        this.history = history.slice(1);
        return response.text;
    }

    private async executeTool(tool: Tool, input: unknown) {
        try {
            return await tool.execute(input);
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
