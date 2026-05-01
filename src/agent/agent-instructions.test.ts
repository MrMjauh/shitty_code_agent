import { describe, expect, test } from "vitest";
import { DEFAULT_AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import type { Tool } from "../tools/tools.js";

describe("SystemInstructions", () => {
    test("renders the base prompt without tools", () => {
        expect(DEFAULT_AGENT_INSTRUCTIONS({ tools: [], maxToolIterations: 50 })).toMatchInlineSnapshot(`
          "You are a coding agent working in the user's current repository.

          Work carefully:
          - Inspect relevant files before proposing or making edits.
          - Prefer small, scoped changes that match existing code style.
          - Do not overwrite unrelated user changes.
          - Paths are relative to the current working directory.
          - You can make at most 50 tool calls in a single user turn. Plan tool use accordingly.

          Final response:
          - Be concise.
          - Say what changed.
          - Mention any verification performed."
        `);
    });

    test("renders tool documentation in the final prompt output", () => {
        const tools: Tool[] = [
            testTool({
                name: "search",
                description: "Search project files by query.",
                examples: [
                    {
                        description: "Find agent files",
                        input: { query: "agent", limit: 5 },
                        output: { files: ["src/agent/agent.ts", "src/agent/prompt.ts"] },
                    },
                ],
            }),
            testTool({
                name: "write_file",
                description: "Write complete file contents.",
                examples: [
                    {
                        description: "Create a TypeScript file",
                        input: { path: "src/hello.ts", content: "export const hello = 'world';\n" },
                        output: { bytesWritten: 30 },
                    },
                ],
            }),
        ];

        expect(DEFAULT_AGENT_INSTRUCTIONS({ tools, maxToolIterations: 12 })).toMatchInlineSnapshot(`
          "You are a coding agent working in the user's current repository.

          Work carefully:
          - Inspect relevant files before proposing or making edits.
          - Prefer small, scoped changes that match existing code style.
          - Do not overwrite unrelated user changes.
          - Paths are relative to the current working directory.
          - You can make at most 12 tool calls in a single user turn. Plan tool use accordingly.

          Final response:
          - Be concise.
          - Say what changed.
          - Mention any verification performed.

          ## Tools

          ### search

          Search project files by query.

          Examples:
          - Find agent files
            Input:
              {
                "query": "agent",
                "limit": 5
              }
            Output:
              {
                "files": [
                  "src/agent/agent.ts",
                  "src/agent/prompt.ts"
                ]
              }

          ### write_file

          Write complete file contents.

          Examples:
          - Create a TypeScript file
            Input:
              {
                "path": "src/hello.ts",
                "content": "export const hello = 'world';\\n"
              }
            Output:
              {
                "bytesWritten": 30
              }"
        `);
    });
});

function testTool({
    name,
    description,
    examples,
}: {
    name: string;
    description: string;
    examples: { input: unknown; output: unknown; description: string }[];
}): Tool {
    return {
        name: () => name,
        description: () => description,
        inputSchema: () => ({ type: "object", properties: {} }),
        example: () => examples,
        execute: async () => ({}),
    };
}
