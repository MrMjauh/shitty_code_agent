import React from "react";
import { Box, Text } from "ink";
import { Agent } from "../../agent/agent.js";

export function StatusBar({ agent, loading }: { agent: Agent; loading: boolean }) {
    return (
        <Box justifyContent="space-between" paddingX={1}>
            <Box>
                <Text color={loading ? "yellow" : "green"}>● </Text>
                <Text color="gray">
                    {agent.getProvider()} · {agent.getModel()}
                </Text>
            </Box>
            <Text color="gray">{shortenPath(process.cwd())}  ↑↓ scroll · / commands</Text>
        </Box>
    );
}

function shortenPath(path: string): string {
    const home = process.env.HOME;
    if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
    return path;
}
