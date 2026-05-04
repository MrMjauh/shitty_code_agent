import type { Tool } from "../tools/tools.js";

export type AgentInstructionOptions = {
    tools: Tool[];
    maxLoops: number;
};

export type AgentInstructions = (options: AgentInstructionOptions) => string;

export const DEFAULT_AGENT_INSTRUCTIONS: AgentInstructions = ({ tools, maxLoops }) => {
    const base = formatBaseInstructions(maxLoops);

    if (tools.length === 0) return base;

    const toolDocs = tools.map(formatToolDoc).join("\n\n");

    return `${base}\n\n## Tools\n\n${toolDocs}`;
};

function formatBaseInstructions(maxLoops: number) {
    const workCarefully = [
        "Work carefully:",
        "- For casual conversation, greetings, or simple non-code questions, respond directly without using tools.",
        "- Use tools only when they materially help answer the user's request.",
        "- Inspect relevant files before proposing or making edits.",
        "- Prefer small, scoped changes that match existing code style.",
        "- Do not overwrite unrelated user changes.",
        "- Paths are relative to the current working directory.",
        `- You can make at most ${maxLoops} loops in a single user turn. Plan tool use accordingly.`,
    ];

    const sections = [
        "You are a coding agent working in the user's current repository.",
        workCarefully.join("\n"),
    ];

    sections.push([
        "Final response:",
        "- Be concise.",
        "- Say what changed.",
        "- Mention any verification performed.",
    ].join("\n"));

    return sections.join("\n\n");
}

function formatToolDoc(tool: Tool) {
    const examples = tool.example()
        .map((example) => [
            `- ${example.description}`,
            "  Input:",
            indent(JSON.stringify(example.input, null, 2), 4),
            "  Output:",
            indent(JSON.stringify(example.output, null, 2), 4),
        ].join("\n"))
        .join("\n\n");

    return [
        `### ${tool.name()}`,
        "",
        tool.description(),
        "",
        "Examples:",
        examples,
    ].join("\n");
}

function indent(value: string, spaces: number) {
    const prefix = " ".repeat(spaces);
    return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}
