import { describe, expect, test } from "vitest";
import { Agent } from "./agent.js";
import type { AgentLogger } from "./logger.js";
import type { Provider } from "./models/provider.js";
import type { Message, ModelResponse } from "../shared/types.js";
import type { Tool } from "../tools/tools.js";

describe("Agent", () => {
    const testTool: Tool = {
        name: () => "test_tool",
        description: () => "Test tool",
        inputSchema: () => ({
            type: "object",
            properties: {
                value: { type: "string" },
            },
            required: ["value"],
        }),
        example: () => [],
        execute: async () => ({ ok: true }),
    };

    test("stops executing tools after the configured iteration limit", async () => {
        const model = new RepeatingToolCallModel();
        const logger = testLogger();
        let toolExecutions = 0;
        const emittedMessages: Message[][] = [];

        const agent = new Agent({
            provider: model,
            compileInstructions: () => "system",
            tools: [
                {
                    ...testTool,
                    execute: async () => {
                        toolExecutions++;
                        return { ok: true };
                    },
                },
            ],
            maxToolIterations: 2,
            logger: logger.logger,
        });

        agent.onNewMessage((_, messages) => emittedMessages.push([...messages]));

        const response = await agent.sendMessage("loop forever");

        expect(response).toBe("Stopped after 2 tool call iterations to avoid a possible infinite loop.");
        expect(toolExecutions).toBe(2);
        expect(model.calls).toBe(3);
        expect(model.tools.at(0)?.at(0)?.name()).toBe("test_tool");
        expect(model.tools.at(0)?.at(0)?.description()).toBe("Test tool");
        expect(model.tools.at(0)?.at(0)?.inputSchema()).toEqual({
            type: "object",
            properties: {
                value: { type: "string" },
            },
            required: ["value"],
        });
        expect(emittedMessages.at(-1)?.at(-1)).toEqual({
            role: "error",
            text: response,
        });
        expect(logger.entries).toContainEqual(expect.objectContaining({
            message: "Exceeded max tool iterations",
            metadata: expect.objectContaining({
                maxToolIterations: 2,
                completedToolIterations: 2,
            }),
        }));
    });

    test("preserves provider reasoning content in assistant history", async () => {
        const model = new ReasoningContentModel();
        const agent = new Agent({
            provider: model,
            compileInstructions: () => "system",
            tools: [testTool],
            logger: testLogger().logger,
        });

        await agent.sendMessage("use a tool");

        expect(model.generateContentHistory).toContainEqual({
            role: "assistant",
            text: "",
            reasoningContent: "internal reasoning",
            toolCalls: [
                {
                    id: "call-1",
                    name: "test_tool",
                    input: { value: "x" },
                },
            ],
        });
    });

    test("logs unknown tool calls", async () => {
        const logger = testLogger();
        const agent = new Agent({
            provider: new UnknownToolModel(),
            compileInstructions: () => "system",
            tools: [],
            logger: logger.logger,
        });

        await expect(agent.sendMessage("use missing tool")).resolves.toBe("done");

        expect(logger.entries).toContainEqual(expect.objectContaining({
            message: "Unknown tool call",
            metadata: expect.objectContaining({
                toolCall: expect.objectContaining({
                    name: "missing_tool",
                }),
            }),
        }));
    });

    test("logs tool error results", async () => {
        const logger = testLogger();
        const agent = new Agent({
            provider: new SingleToolCallModel(),
            compileInstructions: () => "system",
            tools: [
                {
                    ...testTool,
                    execute: async () => {
                        throw new Error("tool exploded");
                    },
                },
            ],
            logger: logger.logger,
        });

        await expect(agent.sendMessage("use a tool")).resolves.toBe("done");

        expect(logger.entries).toContainEqual(expect.objectContaining({
            message: "Tool returned an error",
            metadata: expect.objectContaining({
                error: "tool exploded",
                toolCall: expect.objectContaining({
                    name: "test_tool",
                }),
            }),
        }));
    });

    test("emits and logs provider exceptions as error messages", async () => {
        const logger = testLogger();
        const emittedMessages: Message[][] = [];
        const agent = new Agent({
            provider: new ThrowingProviderModel(),
            compileInstructions: () => "system",
            tools: [testTool],
            logger: logger.logger,
        });

        agent.onNewMessage((_, messages) => emittedMessages.push([...messages]));

        const response = await agent.sendMessage("fail");

        expect(response).toBe("Provider failed while sending the message.");
        expect(emittedMessages.at(-1)?.at(-1)).toEqual({
            role: "error",
            text: response,
        });
        expect(logger.entries).toContainEqual(expect.objectContaining({
            message: "Provider sendMessage failed",
            metadata: expect.objectContaining({
                error: expect.objectContaining({
                    message: "provider exploded",
                }),
            }),
        }));
    });
});

class RepeatingToolCallModel implements Provider {
    calls = 0;
    tools: Tool[][] = [];

    getProvider() {
        return "test";
    }

    getModel() {
        return "repeating-tool-call";
    }

    async sendMessage(_: Message, __: Message[], tools: Tool[]): Promise<ModelResponse> {
        return this.nextResponse(tools);
    }

    async generateContent(_: Message[], tools: Tool[]): Promise<ModelResponse> {
        return this.nextResponse(tools);
    }

    private nextResponse(tools: Tool[]): ModelResponse {
        this.calls++;
        this.tools.push(tools);
        return {
            text: "",
            toolCalls: [
                {
                    id: `call-${this.calls}`,
                    name: "test_tool",
                    input: { value: "x" },
                },
            ],
        };
    }
}

class ReasoningContentModel implements Provider {
    generateContentHistory: Message[] = [];

    getProvider() {
        return "test";
    }

    getModel() {
        return "reasoning-content";
    }

    async sendMessage(): Promise<ModelResponse> {
        return {
            text: "",
            reasoningContent: "internal reasoning",
            toolCalls: [
                {
                    id: "call-1",
                    name: "test_tool",
                    input: { value: "x" },
                },
            ],
        };
    }

    async generateContent(history: Message[]): Promise<ModelResponse> {
        this.generateContentHistory = [...history];
        return {
            text: "done",
            toolCalls: [],
        };
    }
}

class SingleToolCallModel implements Provider {
    getProvider() {
        return "test";
    }

    getModel() {
        return "single-tool-call";
    }

    async sendMessage(): Promise<ModelResponse> {
        return {
            text: "",
            toolCalls: [
                {
                    id: "call-1",
                    name: "test_tool",
                    input: { value: "x" },
                },
            ],
        };
    }

    async generateContent(): Promise<ModelResponse> {
        return {
            text: "done",
            toolCalls: [],
        };
    }
}

class UnknownToolModel extends SingleToolCallModel {
    override getModel() {
        return "unknown-tool";
    }

    override async sendMessage(): Promise<ModelResponse> {
        return {
            text: "",
            toolCalls: [
                {
                    id: "call-1",
                    name: "missing_tool",
                    input: { value: "x" },
                },
            ],
        };
    }
}

class ThrowingProviderModel implements Provider {
    getProvider() {
        return "test";
    }

    getModel() {
        return "throwing-provider";
    }

    async sendMessage(): Promise<ModelResponse> {
        throw new Error("provider exploded");
    }

    async generateContent(): Promise<ModelResponse> {
        return {
            text: "unused",
            toolCalls: [],
        };
    }
}

function testLogger(): { logger: AgentLogger; entries: { message: string; metadata?: Record<string, unknown> }[] } {
    const entries: { message: string; metadata?: Record<string, unknown> }[] = [];
    return {
        entries,
        logger: {
            error: (message, metadata) => {
                entries.push(metadata ? { message, metadata } : { message });
            },
        },
    };
}
