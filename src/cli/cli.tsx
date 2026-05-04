import path from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { render, Box, Text, useInput, usePaste, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { Message } from "../shared/types.js";
import { Agent } from "../agent/agent.js";
import { DEFAULT_AGENT_INSTRUCTIONS } from "../agent/agent-instructions.js";
import { WriteFileTool } from "../tools/write.js";
import { ReadFileTool } from "../tools/read.js";
import { SearchTool } from "../tools/search.js";
import { EditFileTool } from "../tools/edit.js";
import { ACCENT, SESSION_SLASH_COMMANDS, SLASH_COMMANDS, type SlashCommand } from "./types.js";
import { buildBlocks } from "./blocks.js";
import { Welcome } from "./components/Welcome.js";
import { Transcript, renderBlocks } from "./components/Transcript.js";
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
const SESSION_COMMANDS_WITH_NAME = new Set(["save", "load", "delete"]);

function Chat(props: {
    agent: Agent;
    session: Session;
    messages: Message[];
}) {
    const [input, setInput] = useState("");
    const [inputVersion, setInputVersion] = useState(0);
    const [typedSlashCommandInput, setTypedSlashCommandInput] = useState(false);
    const [inputIncludesPaste, setInputIncludesPaste] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
    const [slashCommandOutput, setSlashCommandOutput] = useState<{
        title: string;
        text: string;
    } | undefined>();
    const { stdout } = useStdout();
    const width = Math.max(20, (stdout.columns || 80) - 2);
    const trimmedInput = input.trim();
    const shouldTreatAsSlashCommand =
        input.startsWith("/") && typedSlashCommandInput && !inputIncludesPaste;
    const isSessionCommandInput = trimmedInput === "/session" || input.startsWith("/session ");
    const sessionCommandInput = input.slice("/session".length).trimStart();
    const sessionCommandParts = sessionCommandInput.length > 0
        ? sessionCommandInput.split(/\s+/)
        : [];
    const isSelectingSessionSubcommand =
        shouldTreatAsSlashCommand &&
        isSessionCommandInput &&
        (
            sessionCommandParts.length === 0 ||
            (sessionCommandParts.length === 1 && !/\s$/.test(input))
        );
    const matchingSlashCommands = shouldTreatAsSlashCommand
        ? isSelectingSessionSubcommand
            ? SESSION_SLASH_COMMANDS.filter((command) =>
                command.name.startsWith(sessionCommandInput),
            )
            : SLASH_COMMANDS.filter((command) => command.name.startsWith(trimmedInput))
        : [];
    const isNestedSlashCommandMenu = matchingSlashCommands.length > 0 && isSelectingSessionSubcommand;

    const blocks = useMemo(() => buildBlocks(props.messages, loading), [props.messages, loading]);
    const rows = useMemo(() => renderBlocks(blocks, width), [blocks, width]);

    function getSelectedSlashCommand(): SlashCommand | undefined {
        return matchingSlashCommands[selectedSlashCommandIndex] ?? matchingSlashCommands[0];
    }

    function getSlashCommandCompletion(command: SlashCommand): string {
        if (isSessionCommandInput) {
            return SESSION_COMMANDS_WITH_NAME.has(command.name)
                ? `/session ${command.name} `
                : `/session ${command.name}`;
        }

        return command.name === "/session" ? "/session " : command.name;
    }

    function updateInput(value: string) {
        if (loading) return;
        setInput(value);
        if (!value.startsWith("/")) {
            setTypedSlashCommandInput(false);
            setInputIncludesPaste(false);
        }
        if (!value) {
            setInputIncludesPaste(false);
        }
    }

    function completeSlashCommand(value: string) {
        updateInput(value);
        setTypedSlashCommandInput(true);
        setInputIncludesPaste(false);
        setInputVersion((version) => version + 1);
    }

    useEffect(() => {
        setSelectedSlashCommandIndex(0);
    }, [input]);

    useInput((inputValue, key) => {
        if (loading) return;

        if (inputValue === "/" && input.length === 0) {
            setTypedSlashCommandInput(true);
            setInputIncludesPaste(false);
        } else if (input.length === 0 && inputValue.length > 0 && !key.return) {
            setTypedSlashCommandInput(false);
        }

        if (matchingSlashCommands.length > 0) {
            if (isNestedSlashCommandMenu) {
                if (key.escape) {
                    updateInput("");
                    return;
                }
                if (key.backspace || key.delete) {
                    completeSlashCommand(input.slice(0, -1));
                    return;
                }
                if (
                    inputValue.length > 0 &&
                    !key.return &&
                    !key.tab &&
                    !key.ctrl &&
                    !key.meta
                ) {
                    completeSlashCommand(input + inputValue);
                    return;
                }
            }
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
            if (key.tab) {
                const selectedCommand = getSelectedSlashCommand();
                if (selectedCommand) {
                    completeSlashCommand(getSlashCommandCompletion(selectedCommand));
                }
            }
            if (key.return && isNestedSlashCommandMenu) {
                const selectedCommand = getSelectedSlashCommand();
                if (!selectedCommand) return;
                if (SESSION_COMMANDS_WITH_NAME.has(selectedCommand.name)) {
                    completeSlashCommand(`/session ${selectedCommand.name} `);
                    return;
                }
                void handleSlashCommand(`/session ${selectedCommand.name}`);
            }
            return;
        }
    });

    usePaste((text) => {
        if (loading) return;

        updateInput(input + text);
        setInputIncludesPaste(true);
        if (input.length === 0) {
            setTypedSlashCommandInput(false);
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
            case "/pwd":
                setSlashCommandOutput({
                    title: "/pwd",
                    text: process.cwd(),
                });
                return true;
            case "/status":
                setSlashCommandOutput({
                    title: "/status",
                    text: formatSessionStatus(props.agent, props.session),
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
        updateInput("");
        if (value.trim().startsWith("/") && shouldTreatAsSlashCommand) {
            if (isSessionCommandInput && matchingSlashCommands.length > 0) {
                const selectedCommand = getSelectedSlashCommand();
                if (!selectedCommand) return;
                if (SESSION_COMMANDS_WITH_NAME.has(selectedCommand.name)) {
                    completeSlashCommand(`/session ${selectedCommand.name} `);
                    return;
                }
                const handled = await handleSlashCommand(`/session ${selectedCommand.name}`);
                if (handled) return;
            }

            const selectedCommand = matchingSlashCommands.length > 0
                ? getSelectedSlashCommand()
                : undefined;
            if (selectedCommand?.name === "/session") {
                completeSlashCommand("/session ");
                return;
            }
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

            <Box borderStyle="round" borderColor={loading ? "gray" : ACCENT} paddingX={1}>
                <Text color={loading ? "gray" : ACCENT} bold>
                    ❯{" "}
                </Text>
                {isNestedSlashCommandMenu ? (
                    <>
                        <Text color={ACCENT}>/session</Text>
                        <Text color="gray"> choose action</Text>
                    </>
                ) : (
                    <TextInput
                        key={inputVersion}
                        value={input}
                        onChange={updateInput}
                        onSubmit={handleSubmit}
                        placeholder={loading ? "Working..." : "Ask anything, or type / for commands"}
                    />
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

function formatSessionStatus(agent: Agent, session: Session): string {
    const messages = session.getMessages().map(({ msg }) => msg);
    const roleCounts = messages.reduce<Record<Message["role"], number>>(
        (counts, message) => ({
            ...counts,
            [message.role]: counts[message.role] + 1,
        }),
        {
            agent: 0,
            assistant: 0,
            slash_command: 0,
            system: 0,
            tool: 0,
            user: 0,
        },
    );
    const toolCallCount = messages.reduce((count, message) => (
        message.role === "assistant" ? count + (message.toolCalls?.length ?? 0) : count
    ), 0);
    const failedToolResultCount = messages.filter(
        (message) => message.role === "tool" && message.type === "error",
    ).length;
    const agentErrorCount = messages.filter((message) => message.role === "agent").length;
    const transcriptCharacters = messages.reduce((count, message) => count + message.text.length, 0);
    const systemMessageCharacters = agent.getSystemInstructions().length;
    const provider = agent.getProvider();

    return [
        `Provider: ${provider.getProvider()}`,
        `Model: ${provider.getModel()}`,
        `Messages: ${messages.length}`,
        `User messages: ${roleCounts.user}`,
        `Assistant messages: ${roleCounts.assistant}`,
        `Tool calls: ${toolCallCount}`,
        `Tool results: ${roleCounts.tool}`,
        `Failed tool results: ${failedToolResultCount}`,
        `Agent errors: ${agentErrorCount}`,
        `Transcript size: ${transcriptCharacters} characters`,
        `System message size: ${systemMessageCharacters} characters`,
    ].join("\n");
}
