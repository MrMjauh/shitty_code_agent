import { spawn } from "node:child_process";
import type { Message, ModelResponse } from "../../shared/types.js";
import type { Tool } from "../../tools/tools.js";
import type { Provider } from "./provider.js";

type ClaudeCliOptions = {
    cliPath: string;
    model: string;
};

type ClaudeJsonResult = {
    is_error?: boolean;
    result?: unknown;
    error?: unknown;
    message?: {
        content?: unknown;
    };
};

export class ClaudeCli implements Provider {
    private readonly cliPath: string;
    private readonly model: string;

    constructor(options: ClaudeCliOptions) {
        this.cliPath = options.cliPath;
        this.model = options.model;
    }

    getProvider(): string {
        return "claude";
    }

    getModel(): string {
        return this.model;
    }

    async generateContent(system: Message, msgs: Message[], _tools: Tool[]): Promise<ModelResponse> {
        const output = await runClaudeCli({
            cliPath: this.cliPath,
            model: this.model,
            systemPrompt: system.text,
            prompt: formatConversation(msgs),
        });

        return {
            text: parseClaudeOutput(output),
            toolCalls: [],
        };
    }
}

function runClaudeCli(options: {
    cliPath: string;
    model: string;
    systemPrompt: string;
    prompt: string;
}): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(options.cliPath, [
            "--print",
            "--output-format",
            "json",
            "--model",
            options.model,
            "--system-prompt",
            options.systemPrompt,
            "--no-session-persistence",
            "--tools",
            "",
        ], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
        });
        child.on("error", (error) => {
            reject(new Error(`Failed to start Claude CLI at "${options.cliPath}": ${error.message}`));
        });
        child.on("close", (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(new Error(
                `Claude CLI exited with code ${code ?? "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`,
            ));
        });

        child.stdin.end(options.prompt);
    });
}

function parseClaudeOutput(output: string): string {
    const trimmed = output.trim();
    if (!trimmed) {
        throw new Error("Claude CLI returned an empty response");
    }

    let parsed: ClaudeJsonResult;
    try {
        parsed = JSON.parse(trimmed) as ClaudeJsonResult;
    } catch {
        return trimmed;
    }

    if (parsed.is_error) {
        throw new Error(`Claude CLI returned an error: ${formatUnknown(parsed.error ?? parsed.result)}`);
    }

    const text = extractText(parsed.result) ?? extractText(parsed.message?.content);
    if (text === undefined) {
        throw new Error(`Claude CLI returned an unsupported JSON response: ${trimmed}`);
    }

    return text;
}

function extractText(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return undefined;

    const parts = value
        .map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object" && "text" in part) {
                const text = (part as { text?: unknown }).text;
                return typeof text === "string" ? text : undefined;
            }
            return undefined;
        })
        .filter((part): part is string => part !== undefined);

    return parts.length > 0 ? parts.join("\n") : undefined;
}

function formatConversation(messages: Message[]): string {
    return messages
        .filter((message) => message.role !== "slash_command")
        .map(formatMessage)
        .join("\n\n");
}

function formatMessage(message: Message): string {
    switch (message.role) {
        case "system":
            return `System:\n${message.text}`;
        case "user":
            return `User:\n${message.text}`;
        case "assistant": {
            const toolCalls = message.toolCalls && message.toolCalls.length > 0
                ? `\n\nAssistant tool calls:\n${JSON.stringify(message.toolCalls, null, 2)}`
                : "";
            return `Assistant:\n${message.text}${toolCalls}`;
        }
        case "tool":
            return `Tool result (${message.toolName ?? "unknown"}, ${message.type}):\n${message.text}`;
        case "agent":
            return `Agent error:\n${message.text}`;
        case "slash_command":
            return "";
    }
}

function formatUnknown(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}
