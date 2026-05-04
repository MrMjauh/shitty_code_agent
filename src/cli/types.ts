export type SlashCommand = { name: string; description: string };

export type Block =
    | { kind: "user"; text: string }
    | { kind: "assistant"; text: string }
    | { kind: "error"; text: string }
    | { kind: "tool_call"; tool: string; summary: string }
    | { kind: "tool_result"; ok: boolean; summary: string }
    | { kind: "status"; text: string };

export const ACCENT = "cyan" as const;

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const SLASH_COMMANDS: SlashCommand[] = [
    { name: "/clear", description: "Clear the current conversation" },
    { name: "/help", description: "Show available slash commands" },
    { name: "/pwd", description: "Show the current working directory" },
    { name: "/system", description: "Show the current system instructions" },
    { name: "/session save", description: "Save the current session (e.g., /session save my-chat)" },
    { name: "/session load", description: "Load a saved session (e.g., /session load my-chat)" },
    { name: "/session list", description: "List all saved sessions" },
    { name: "/session delete", description: "Delete a saved session (e.g., /session delete my-chat)" },
    { name: "/session reset", description: "Clear the current session and auto-save file" },
    { name: "/exit", description: "Exit the agent" },
];
