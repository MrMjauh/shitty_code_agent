import React from "react";
import { Box, Text } from "ink";
import { Agent } from "../../agent/agent.js";
import { ACCENT } from "../types.js";

export function Welcome({ agent }: { agent: Agent }) {
    return (
        <Box flexDirection="column" justifyContent="center" alignItems="flex-start" paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={2} paddingY={1}>
                <Text color={ACCENT} bold>{"  ◆ erik · agentic cli"}</Text>
                <Text color="gray">  a small coding agent for your terminal</Text>
            </Box>
            <Box flexDirection="column" marginTop={1} paddingX={2}>
                <InfoLine label="model" value={`${agent.getProvider().getProvider()} / ${agent.getProvider().getModel()}`} />
                <InfoLine label="cwd" value={process.cwd()} />
                <InfoLine label="tools" value="read · edit · write · search" />
            </Box>
            <Box flexDirection="column" marginTop={1} paddingX={2}>
                <Text color="gray">tips</Text>
                <Text color="gray">  · type <Text color={ACCENT}>/</Text> to browse commands</Text>
                <Text color="gray">  · <Text color={ACCENT}>↑</Text>/<Text color={ACCENT}>↓</Text> to scroll, <Text color={ACCENT}>pgup</Text>/<Text color={ACCENT}>pgdn</Text> for pages</Text>
                <Text color="gray">  · press <Text color={ACCENT}>enter</Text> to send</Text>
            </Box>
        </Box>
    );
}

function InfoLine({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Box width={8}>
                <Text color="gray">{label}</Text>
            </Box>
            <Text>{value}</Text>
        </Box>
    );
}
