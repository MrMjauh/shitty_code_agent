import type { Tool } from "../tools/tools.js";
import type { Model } from "./models/model.js";
import { type CompileSystemInstructions, SystemInstructions } from "./prompt.js";
import type { Message, ModelTool } from "../shared/types.js";

const DEFAULT_MAX_TOOL_ITERATIONS = 10;

export type OnNewMessage = (messages: Message[]) => void;
export type AgentOptions = {
    maxToolIterations?: number;
};

export class Agent {

    private model: Model;
    private history: Message[] = [];
    private compileInstructions: CompileSystemInstructions = SystemInstructions;
    private tools: Tool[] = [];
    private maxToolIterations = DEFAULT_MAX_TOOL_ITERATIONS;
    private onNewMessageCallback: OnNewMessage = () => {};

    constructor(
        model: Model,
        compileInstructions: CompileSystemInstructions,
        tools: Tool[],
        options: AgentOptions = {},
    ) {
        this.model = model;
        this.compileInstructions = compileInstructions;
        this.tools = tools;
        this.maxToolIterations = normalizeMaxToolIterations(options.maxToolIterations);
    }

    public onNewMessage(callback: OnNewMessage) {
        this.onNewMessageCallback = callback;
    }

    public getProvider() {
        return this.model.getProvider();
    }

    public getModel() {
        return this.model.getModel();
    }

    public getSystemInstructions() {
        return this.compileInstructions(this.tools);
    }

    public clearHistory() {
        this.history = [];
        this.onNewMessageCallback([]);
    }

    public async sendMessage(msg: string): Promise<string> {
        const messages: Message[] = [
            { role: "system", text: this.compileInstructions(this.tools) },
            ...this.history,
            { role: "user", text: msg },
        ];
        this.emitMessages(messages);

        let response = await this.model.sendMessage(messages, this.modelTools());

        let toolIterations = 0;

        while (true) {
            if (response.toolCalls.length === 0) break;

            if (toolIterations + response.toolCalls.length > this.maxToolIterations) {
                response = {
                    text: `Stopped after ${this.maxToolIterations} tool call iterations to avoid a possible infinite loop.`,
                    toolCalls: [],
                };
                break;
            }

            messages.push({ role: "assistant", text: response.text, toolCalls: response.toolCalls });
            this.emitMessages(messages);

            for (const toolCall of response.toolCalls) {
                toolIterations++;
                const tool = this.tools.find((t) => t.name() === toolCall.name);

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

            response = await this.model.sendMessage(messages, this.modelTools());
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

    private modelTools(): ModelTool[] {
        return this.tools.map((tool) => ({
            name: tool.name(),
            description: tool.description(),
            inputSchema: tool.inputSchema(),
        }));
    }
}

function normalizeMaxToolIterations(value: number | undefined) {
    if (value === undefined) return DEFAULT_MAX_TOOL_ITERATIONS;
    if (!Number.isFinite(value) || value < 1) return DEFAULT_MAX_TOOL_ITERATIONS;
    return Math.floor(value);
}
