import path from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { render, Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { Message } from "../shared/types.js";
import { Agent } from "../agent/agent.js";
import { DEFAULT_AGENT_INSTRUCTIONS } from "../agent/agent-instructions.js";
import { WriteFileTool } from "../tools/write.js";
import { ReadFileTool } from "../tools/read.js";
import { SearchTool } from "../tools/search.js";
import { EditFileTool } from "../tools/edit.js";
import { ACCENT, SLASH_COMMANDS } from "./types.js";
import { buildBlocks } from "./blocks.js";
import { Welcome } from "./components/Welcome.js";
import { Transcript, renderBlocks } from "./components/Transcript.js";
import { Spinner } from "./components/Spinner.js";
import { StatusBar } from "./components/StatusBar.js";
import { SlashCommandDropdown } from "./components/SlashCommandDropdown.js";
import { modelConfigurationSchema } from "../shared/env.js";
import { CodeAgentError } from "../shared/error.js";
import { createProviderFromConfig } from "../agent/models/index.js";
import { Session } from "../shared/session.js";
import {
  deleteFile,
  deleteSessionFile,
  listSessionFiles,
  readSessionFile,
  writeSessionFile,
} from "../shared/db.js";

const SESSION_DIR = path.join(process.cwd(), "sessions");
const CURRENT_SESSION_FILE = path.join(SESSION_DIR, ".current.json");

function Chat(props: {
    agent: Agent;
    session: Session;
    messages: Message[];
}) {
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
    const [slashCommandOutput, setSlashCommandOutput] = useState<{
        title: string;
        text: string;
    } | undefined>();
    const { stdout } = useStdout();
    const width = Math.max(20, (stdout.columns || 80) - 2);
    const matchingSlashCommands = input.startsWith("/")
        ? SLASH_COMMANDS.filter((c) => c.name.startsWith(input.trim()))
        : [];

    const blocks = useMemo(() => buildBlocks(props.messages, loading), [props.messages, loading]);
    const rows = useMemo(() => renderBlocks(blocks, width), [blocks, width]);

    useEffect(() => {
        setSelectedSlashCommandIndex(0);
    }, [input]);

    useInput((_, key) => {
        if (matchingSlashCommands.length > 0) {
            if (key.upArrow) {
                setSelectedSlashCommandIndex((i) =>
                    i === 0 ? matchingSlashCommands.length - 1 : i - 1,
                );
            }
            if (key.downArrow) {
                setSelectedSlashCommandIndex((i) =>
                    i === matchingSlashCommands.length - 1 ? 0 : i + 1,
                );
            }
            return;
        }
    });

    async function handleSlashCommand(value: string): Promise<boolean> {
        const parts = value.trim().split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1);
        switch (command) {
            case "/clear": {
                props.session.clear();
                // Clear the auto-save file too
                await deleteFile(CURRENT_SESSION_FILE);
                setSlashCommandOutput(undefined);
                return true;
            }
            case "/help":
                setSlashCommandOutput({
                    title: "/help",
                    text: SLASH_COMMANDS.map((slashCommand) =>
                        `${slashCommand.name} - ${slashCommand.description}`,
                    ).join("\n"),
                });
                return true;
            case "/pwd":
                setSlashCommandOutput({
                    title: "/pwd",
                    text: process.cwd(),
                });
                return true;
            case "/system":
                setSlashCommandOutput({
                    title: "/system",
                    text: props.agent.getSystemInstructions(),
                });
                return true;
            case "/session":
                return handleSessionCommand(args);
            case "/exit":
                process.exit(0);
            default:
                setSlashCommandOutput({
                    title: "Unknown Command",
                    text: `Unknown command: ${command}`,
                });
                return true;
        }
    }

    async function handleSessionCommand(args: string[]): Promise<boolean> {
        const subcommand = args[0];

        if (!subcommand) {
            setSlashCommandOutput({
                title: "/session",
                text: "Usage: /session save <name>, /session load <name>, /session list, /session delete <name>, /session reset",
            });
            return true;
        }

        switch (subcommand) {
            case "save": {
                const name = args[1];
                if (!name) {
                    setSlashCommandOutput({
                        title: "/session save",
                        text: "Usage: /session save <name>",
                    });
                    return true;
                }
                const filePath = path.join(SESSION_DIR, `${name}.json`);
                await writeSessionFile(props.session, filePath);
                setSlashCommandOutput({
                    title: "/session save",
                    text: `Session saved as "${name}"`,
                });
                return true;
            }
            case "load": {
                const name = args[1];
                if (!name) {
                    setSlashCommandOutput({
                        title: "/session load",
                        text: "Usage: /session load <name>",
                    });
                    return true;
                }
                const filePath = path.join(SESSION_DIR, `${name}.json`);
                try {
                    await readSessionFile(props.session, filePath);
                    // Also overwrite the current session file
                    await writeSessionFile(props.session, CURRENT_SESSION_FILE);
                    setSlashCommandOutput({
                        title: "/session load",
                        text: `Session "${name}" loaded (${props.session.getMessages().length} messages)`,
                    });
                } catch {
                    setSlashCommandOutput({
                        title: "/session load",
                        text: `Session "${name}" not found. Use /session list to see available sessions.`,
                    });
                }
                return true;
            }
            case "list": {
                const names = await listSessionFiles(SESSION_DIR);
                if (names.length === 0) {
                    setSlashCommandOutput({
                        title: "/session list",
                        text: "No saved sessions found.",
                    });
                } else {
                    setSlashCommandOutput({
                        title: "/session list",
                        text: names.map((n) => `  ${n}`).join("\n"),
                    });
                }
                return true;
            }
            case "delete": {
                const name = args[1];
                if (!name) {
                    setSlashCommandOutput({
                        title: "/session delete",
                        text: "Usage: /session delete <name>",
                    });
                    return true;
                }
                const deleted = await deleteSessionFile(SESSION_DIR, name);
                setSlashCommandOutput({
                    title: "/session delete",
                    text: deleted
                        ? `Session "${name}" deleted.`
                        : `Session "${name}" not found.`,
                });
                return true;
            }
            case "reset": {
                props.session.clear();
                await deleteFile(CURRENT_SESSION_FILE);
                setSlashCommandOutput({
                    title: "/session reset",
                    text: "Current session cleared.",
                });
                return true;
            }
            default:
                setSlashCommandOutput({
                    title: "/session",
                    text: `Unknown subcommand: ${subcommand}\nUsage: /session save <name>, /session load <name>, /session list, /session delete <name>, /session reset`,
                });
                return true;
        }
    }

    async function handleSubmit(value: string) {
        if (!value.trim() || loading) return;
        setInput("");
        if (value.trim().startsWith("/")) {
            const selectedCommand = matchingSlashCommands.length > 0
                ? matchingSlashCommands[selectedSlashCommandIndex]
                : undefined;
            const handled = await handleSlashCommand(selectedCommand?.name ?? value);
            if (handled) return;
        }

        setSlashCommandOutput(undefined);
        setLoading(true);
        try {
            await props.agent.sendMessage(value);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box flexDirection="column">
                {props.messages.length === 0 && !loading ? (
                    <Welcome agent={props.agent} />
                ) : (
                    <Transcript rows={rows} />
                )}
            </Box>

            {matchingSlashCommands.length > 0 && (
                <SlashCommandDropdown
                    commands={matchingSlashCommands}
                    selectedIndex={selectedSlashCommandIndex}
                />
            )}

            {slashCommandOutput && matchingSlashCommands.length === 0 && (
                <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
                    <Text color={ACCENT} bold>{slashCommandOutput.title}</Text>
                    {slashCommandOutput.text.split("\n").map((line, index) => (
                        <Text key={index} color="gray">{line}</Text>
                    ))}
                </Box>
            )}

            <Box borderStyle="round" borderColor={loading ? "yellow" : ACCENT} paddingX={1}>
                <Text color={loading ? "yellow" : ACCENT} bold>
                    {loading ? <Spinner /> : "❯"}
                    {" "}
                </Text>
                <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    placeholder={loading ? "Working..." : "Ask anything, or type / for commands"}
                />
            </Box>

            <StatusBar agent={props.agent} loading={loading} />
        </Box>
    );
}

export async function startCli() {
    const modelConfiguration = modelConfigurationSchema.safeParse(process.env);
    if (modelConfiguration.error) {
        throw new CodeAgentError(
            `Cannot start cli, invalid model configuration:\n${formatEnvErrors(modelConfiguration.error.issues)}`,
        );
    }
    const session = new Session();
    const provider = createProviderFromConfig(modelConfiguration.data);
    const agent = new Agent(
        session,
    {
        provider,
        compileInstructions: DEFAULT_AGENT_INSTRUCTIONS,
        tools: [
            new ReadFileTool(),
            new EditFileTool(),
            new WriteFileTool(),
            new SearchTool(),
        ],
    });

    // Auto-load previous session on startup
    try {
        await readSessionFile(session, CURRENT_SESSION_FILE);
    } catch {
        // No previous session — that's fine
    }

    const renderChat = () => (
        <Chat
            agent={agent}
            session={session}
            messages={session.getMessages().map(({ msg }) => msg)}
        />
    );
    const app = render(renderChat());
    const rerender = () => app.rerender(renderChat());

    // The onCleared callback only triggers UI rerender;
    // file deletion for /clear is handled explicitly in the slash command.
    session.onCleared(rerender);

    session.onMessageCommitted(async () => {
        // Auto-save after each committed message
        await writeSessionFile(session, CURRENT_SESSION_FILE);
        rerender();
    });
}

function formatEnvErrors(issues: { path: PropertyKey[]; message: string }[]): string {
    return issues
        .map((issue) => {
            const path = issue.path.map(String).join(".");
            return `- ${path || "MODEL_PROVIDER"}: ${issue.message}`;
        })
        .join("\n");
}
