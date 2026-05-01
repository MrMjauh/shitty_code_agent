import React, { useEffect, useMemo, useRef, useState } from "react";
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

function Chat(props: { agent: Agent }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
    const [scrollOffset, setScrollOffset] = useState(0);
    const stickToBottomRef = useRef(true);
    const { stdout } = useStdout();
    const height = stdout.rows || 24;
    const matchingSlashCommands = input.startsWith("/")
        ? SLASH_COMMANDS.filter((c) => c.name.startsWith(input.trim()))
        : [];
    const dropdownHeight = matchingSlashCommands.length > 0 ? matchingSlashCommands.length + 2 : 0;
    const transcriptHeight = Math.max(4, height - dropdownHeight - 5);

    const blocks = useMemo(() => buildBlocks(messages, loading), [messages, loading]);
    const rows = useMemo(() => renderBlocks(blocks), [blocks]);
    const maxScrollOffset = Math.max(0, rows.length - transcriptHeight);

    useEffect(() => {
        props.agent.onNewMessage((_, allMessages) => setMessages(allMessages));
    }, [props.agent]);

    useEffect(() => {
        setSelectedSlashCommandIndex(0);
    }, [input]);

    useEffect(() => {
        if (stickToBottomRef.current) {
            setScrollOffset(0);
        } else {
            setScrollOffset((offset) => Math.min(offset, maxScrollOffset));
        }
    }, [rows.length, maxScrollOffset]);

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

        if (key.pageUp) {
            setScrollOffset((offset) => {
                const next = Math.min(maxScrollOffset, offset + Math.max(1, transcriptHeight - 2));
                stickToBottomRef.current = next === 0;
                return next;
            });
            return;
        }
        if (key.pageDown) {
            setScrollOffset((offset) => {
                const next = Math.max(0, offset - Math.max(1, transcriptHeight - 2));
                stickToBottomRef.current = next === 0;
                return next;
            });
            return;
        }
        if (key.upArrow) {
            setScrollOffset((offset) => {
                const next = Math.min(maxScrollOffset, offset + 1);
                stickToBottomRef.current = next === 0;
                return next;
            });
        }
        if (key.downArrow) {
            setScrollOffset((offset) => {
                const next = Math.max(0, offset - 1);
                stickToBottomRef.current = next === 0;
                return next;
            });
        }
    });

    function addLocalMessage(text: string) {
        setMessages((prev) => [...prev, { role: "assistant", text }]);
    }

    function handleSlashCommand(value: string): boolean {
        const [command] = value.trim().split(/\s+/);
        switch (command) {
            case "/clear":
                props.agent.clearHistory();
                setMessages([]);
                stickToBottomRef.current = true;
                return true;
            case "/help":
                addLocalMessage(
                    `**Available commands**\n\n${SLASH_COMMANDS.map((c) => `- \`${c.name}\` — ${c.description}`).join("\n")}`,
                );
                return true;
            case "/pwd":
                addLocalMessage(`\`${process.cwd()}\``);
                return true;
            case "/system":
                addLocalMessage(props.agent.getSystemInstructions());
                return true;
            case "/exit":
                process.exit(0);
            default:
                addLocalMessage(`Unknown command: ${command}. Type /help for available commands.`);
                return true;
        }
    }

    async function handleSubmit(value: string) {
        if (!value.trim() || loading) return;
        setInput("");
        stickToBottomRef.current = true;
        if (value.trim().startsWith("/")) {
            const selectedCommand = matchingSlashCommands[selectedSlashCommandIndex];
            if (handleSlashCommand(selectedCommand?.name ?? value)) return;
        }

        setLoading(true);
        try {
            await props.agent.sendMessage(value);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Box flexDirection="column" height={height} paddingX={1}>
            <Box flexDirection="column" height={transcriptHeight}>
                {messages.length === 0 && !loading ? (
                    <Welcome agent={props.agent} />
                ) : (
                    <Transcript
                        height={transcriptHeight}
                        rows={rows}
                        scrollOffset={scrollOffset}
                        maxScrollOffset={maxScrollOffset}
                    />
                )}
            </Box>

            {matchingSlashCommands.length > 0 && (
                <SlashCommandDropdown
                    commands={matchingSlashCommands}
                    selectedIndex={selectedSlashCommandIndex}
                />
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

export function startCli() {
    const modelConfiguration = modelConfigurationSchema.safeParse(process.env);
    if (modelConfiguration.error) {
        throw new CodeAgentError("Cannot start cli, missing envs", modelConfiguration.error);
    }
    const provider = createProviderFromConfig(modelConfiguration.data);
    const agent = new Agent({
        provider,
        compileInstructions: DEFAULT_AGENT_INSTRUCTIONS,
        tools: [
            new ReadFileTool(),
            new EditFileTool(),
            new WriteFileTool(),
            new SearchTool(),
        ],
    });
    render(<Chat agent={agent} />);
}
