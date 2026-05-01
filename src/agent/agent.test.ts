import { describe, expect, test } from "vitest";
import { Agent } from "./agent.js";
import type { Provider } from "./models/provider.js";
import type { Message, ModelResponse } from "../shared/types.js";
import type { Tool } from "../tools/tools.js";

describe("Agent", () => {
    test("stops executing tools after the configured iteration limit", async () => {
        const model = new RepeatingToolCallModel();
        let toolExecutions = 0;
        const emittedMessages: Message[][] = [];

        const agent = new Agent({
            provider: model,
            compileInstructions: () => "system",
            tools: [
                {
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
                    execute: async () => {
                        toolExecutions++;
                        return { ok: true };
                    },
                } satisfies Tool,
            ],
            maxToolIterations: 2,
        });

        agent.onNewMessage((messages) => emittedMessages.push(messages));

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
            role: "assistant",
            text: response,
        });
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

    async sendMessage(_: Message[], tools: Tool[]): Promise<ModelResponse> {
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
