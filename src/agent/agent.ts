import type { Tool } from "../tools/tools.js";
import type { Provider } from "./models/provider.js";
import { type AgentInstructions } from "./agent-instructions.js";
import type { Message } from "../shared/types.js";

export type OnNewMessage = (messages: Message[]) => void;
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

    public getProvider(): Provider {
        return this.options.provider;
    }

    public getSystemInstructions() {
        return this.options.compileInstructions(this.options.tools);
    }

    public clearHistory() {
        this.history = [];
        this.onNewMessageCallback([]);
    }

    public async sendMessage(msg: string): Promise<string> {
        const { compileInstructions, provider, tools, maxToolIterations } = this.options;
        const messages: Message[] = [
            { role: "system", text: compileInstructions(tools) },
            ...this.history,
            { role: "user", text: msg },
        ];
        this.emitMessages(messages);

        let response = await provider.sendMessage(messages, tools);

        let toolIterations = 0;

        while (true) {
            if (response.toolCalls.length === 0) break;

            if (toolIterations + response.toolCalls.length > maxToolIterations) {
                response = {
                    text: `Stopped after ${maxToolIterations} tool call iterations to avoid a possible infinite loop.`,
                    toolCalls: [],
                };
                break;
            }

            messages.push({ role: "assistant", text: response.text, toolCalls: response.toolCalls });
            this.emitMessages(messages);

            for (const toolCall of response.toolCalls) {
                toolIterations++;
                const tool = tools.find((t) => t.name() === toolCall.name);

                const toolResult = tool
                    ? await this.executeTool(tool, toolCall.input)
                    : { error: `Unknown tool: ${toolCall.name}` };

                messages.push({
                    role: "tool",
                    text: JSON.stringify(toolResult),
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                });
                this.emitMessages(messages);
            }

            response = await provider.sendMessage(messages, tools);
        }

        messages.push({ role: "assistant", text: response.text });
        this.emitMessages(messages);
        this.history = messages.slice(1);

        return response.text;
    }

    private emitMessages(messages: Message[]) {
        this.onNewMessageCallback(messages.slice(1));
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
