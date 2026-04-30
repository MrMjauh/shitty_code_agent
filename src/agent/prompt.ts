import type { Tool } from "../tools/tools.js";

export type CompileSystemInstructions = (tools: Tool[]) => string;

export const SystemInstructions: CompileSystemInstructions = (tools) => {
    const base = formatBaseInstructions();

    if (tools.length === 0) return base;

    const toolDocs = tools.map(formatToolDoc).join("\n\n");

    return `${base}\n\n## Tools\n\n${toolDocs}`;
};

function formatBaseInstructions() {
    const workCarefully = [
        "Work carefully:",
        "- Inspect relevant files before proposing or making edits.",
        "- Prefer small, scoped changes that match existing code style.",
        "- Do not overwrite unrelated user changes.",
        "- Paths are relative to the current working directory.",
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
