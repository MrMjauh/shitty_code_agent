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
import { createFileLogger } from "../agent/logger.js";

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

    function handleSlashCommand(value: string): boolean {
        const [command] = value.trim().split(/\s+/);
        switch (command) {
            case "/clear":
                props.session.clear();
                setSlashCommandOutput(undefined);
                return true;
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

    async function handleSubmit(value: string) {
        if (!value.trim() || loading) return;
        setInput("");
        if (value.trim().startsWith("/")) {
            const selectedCommand = matchingSlashCommands.length > 0
                ? matchingSlashCommands[selectedSlashCommandIndex]
                : undefined;
            if (handleSlashCommand(selectedCommand?.name ?? value)) return;
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

export function startCli() {
    const modelConfiguration = modelConfigurationSchema.safeParse(process.env);
    if (modelConfiguration.error) {
        throw new CodeAgentError(
            `Cannot start cli, invalid model configuration:\n${formatEnvErrors(modelConfiguration.error.issues)}`,
        );
    }
    const logger = createFileLogger();
    const session = new Session();
    const provider = createProviderFromConfig(modelConfiguration.data);
    const agent = new Agent(
        session,
    {
        provider,
        compileInstructions: DEFAULT_AGENT_INSTRUCTIONS,
        logger,
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
    session.onCleared(rerender);
    session.onMessageCommitted(rerender);
}

function formatEnvErrors(issues: { path: PropertyKey[]; message: string }[]): string {
    return issues
        .map((issue) => {
            const path = issue.path.map(String).join(".");
            return `- ${path || "MODEL_PROVIDER"}: ${issue.message}`;
        })
        .join("\n");
}
