import { describe, expect, test } from "vitest";
import { buildBlocks } from "./blocks.js";

describe("buildBlocks", () => {
    test("renders error messages as error blocks", () => {
        expect(buildBlocks([
            { role: "agent", status: "error", text: "Something failed." },
        ], false)).toEqual([
            { kind: "error", text: "Something failed." },
        ]);
    });

    test("renders in-progress assistant reasoning and text before loading status", () => {
        expect(buildBlocks([
            { role: "user", text: "Explain this." },
            {
                role: "assistant",
                reasoningContent: "Need to inspect context.",
                text: "Here is the answer.",
                toolCalls: [],
            },
        ], true)).toEqual([
            { kind: "user", text: "Explain this." },
            { kind: "reasoning", text: "Need to inspect context." },
            { kind: "assistant", text: "Here is the answer." },
        ]);
    });

    test("renders committed assistant reasoning before assistant text", () => {
        expect(buildBlocks([
            {
                role: "assistant",
                reasoningContent: "Consider the constraints.",
                text: "Final answer.",
                toolCalls: [],
            },
        ], false)).toEqual([
            { kind: "reasoning", text: "Consider the constraints." },
            { kind: "assistant", text: "Final answer." },
        ]);
    });

    test("keeps the loading status when no streamed draft text exists", () => {
        expect(buildBlocks([
            { role: "user", text: "Explain this." },
        ], true)).toEqual([
            { kind: "user", text: "Explain this." },
            { kind: "status", text: "thinking..." },
        ]);
    });
});
