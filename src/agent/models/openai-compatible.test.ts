import { describe, expect, test } from "vitest";
import { parseOpenAiCompatibleStreamChunks } from "./openai-compatible.js";
import type { ModelStreamEvent } from "./provider.js";

describe("parseOpenAiCompatibleStreamChunks", () => {
    test("emits reasoning content, answer content, and final tool call response", async () => {
        const events = await collectEvents(parseOpenAiCompatibleStreamChunks([
            'data: {"choices":[{"delta":{"reasoning_content":"plan "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"hel',
            'lo"}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read","arguments":"{\\"path\\":\\"AG"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ENTS.md\\"}"}}]}}]}\n\n',
            "data: [DONE]\n\n",
        ]));

        expect(events).toEqual([
            { type: "reasoning_delta", text: "plan " },
            { type: "content_delta", text: "hello" },
            {
                type: "done",
                response: {
                    reasoningContent: "plan ",
                    text: "hello",
                    toolCalls: [{
                        id: "call_1",
                        name: "read",
                        input: { path: "AGENTS.md" },
                    }],
                },
            },
        ]);
    });

    test("ignores empty events and emits an empty final response for done-only streams", async () => {
        await expect(collectEvents(parseOpenAiCompatibleStreamChunks([
            ": keep-alive\n\n",
            "data: [DONE]\n\n",
        ]))).resolves.toEqual([{
            type: "done",
            response: {
                text: "",
                toolCalls: [],
            },
        }]);
    });
});

async function collectEvents(stream: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
    const events: ModelStreamEvent[] = [];
    for await (const event of stream) {
        events.push(event);
    }
    return events;
}
