import type { Message } from "../shared/types.js";
import type { Block } from "./types.js";

export function buildBlocks(messages: Message[], loading: boolean): Block[] {
    const blocks: Block[] = [];

    for (const message of messages) {
        if (message.role === "user") {
            blocks.push({ kind: "user", text: message.text });
            continue;
        }
        if (message.role === "tool") {
            blocks.push({ kind: "tool_result", ...summarizeToolResult(message.text) });
            continue;
        }
        if (message.role === "error") {
            blocks.push({ kind: "error", text: message.text });
            continue;
        }
        if (message.role === "assistant") {
            if (message.text.trim().length > 0) {
                blocks.push({ kind: "assistant", text: message.text });
            }
            if (message.toolCalls && message.toolCalls.length > 0) {
                for (const toolCall of message.toolCalls) {
                    blocks.push({
                        kind: "tool_call",
                        tool: toolCall.name,
                        summary: formatToolArgs(toolCall.input),
                    });
                }
                continue;
            }
        }
    }

    if (loading) {
        blocks.push({ kind: "status", text: "thinking..." });
    }

    return blocks;
}

function formatToolArgs(input: unknown): string {
    if (!input || typeof input !== "object") return "";
    const obj = input as Record<string, unknown>;

    if (typeof obj.action === "string") {
        if (typeof obj.path === "string") return `${obj.action} ${obj.path}`;
        if (typeof obj.prefix === "string") return `${obj.action} prefix=${obj.prefix}`;
        if (typeof obj.query === "string") return `${obj.action} query=${obj.query}`;
        return obj.action;
    }
    if (typeof obj.path === "string") return obj.path;
    if (Array.isArray(obj.query)) return `query=${obj.query.join(",")}`;
    if (typeof obj.query === "string") return `query=${obj.query}`;

    const firstString = Object.entries(obj).find(([, v]) => typeof v === "string");
    if (firstString) {
        const [k, v] = firstString;
        return `${k}=${truncate(String(v), 50)}`;
    }
    return "";
}

function summarizeToolResult(text: string): { ok: boolean; summary: string } {
    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.error === "string") {
            return { ok: false, summary: `error: ${truncate(parsed.error, 80)}` };
        }
        if (typeof parsed.content === "string") {
            const lineCount = parsed.content.split("\n").length;
            return { ok: true, summary: `read ${parsed.content.length} chars · ${lineCount} lines` };
        }
        if (Array.isArray(parsed.files)) {
            const list = parsed.files.slice(0, 3).join(", ");
            const more = parsed.files.length > 3 ? `, +${parsed.files.length - 3} more` : "";
            return {
                ok: true,
                summary: `${parsed.files.length} match${parsed.files.length === 1 ? "" : "es"}${parsed.files.length ? ` — ${list}${more}` : ""}`,
            };
        }
        if (Array.isArray(parsed.entries)) {
            const entries = parsed.entries as { path?: unknown; type?: unknown }[];
            const list = entries
                .slice(0, 3)
                .map((entry) => `${String(entry.path ?? "")}${entry.type === "directory" ? "/" : ""}`)
                .join(", ");
            const more = entries.length > 3 ? `, +${entries.length - 3} more` : "";
            return {
                ok: true,
                summary: `${entries.length} entr${entries.length === 1 ? "y" : "ies"}${entries.length ? ` — ${list}${more}` : ""}`,
            };
        }
        if (Array.isArray(parsed.matches)) {
            const matches = parsed.matches as { path?: unknown; lineNumber?: unknown }[];
            const list = matches
                .slice(0, 3)
                .map((match) => `${String(match.path ?? "")}:${String(match.lineNumber ?? "")}`)
                .join(", ");
            const more = matches.length > 3 ? `, +${matches.length - 3} more` : "";
            return {
                ok: true,
                summary: `${matches.length} match${matches.length === 1 ? "" : "es"}${matches.length ? ` — ${list}${more}` : ""}`,
            };
        }
        if (typeof parsed.bytesWritten === "number") {
            return { ok: true, summary: `wrote ${parsed.bytesWritten} bytes` };
        }
        return { ok: true, summary: truncate(text, 80) };
    } catch {
        return { ok: true, summary: truncate(text, 80) };
    }
}

function truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}
