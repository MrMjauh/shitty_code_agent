import React from "react";
import { Box, Text } from "ink";
import { ACCENT, type SlashCommand } from "../types.js";

export function SlashCommandDropdown(props: { commands: SlashCommand[]; selectedIndex: number }) {
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={0}>
            {props.commands.map((command, index) => (
                <Box key={command.name}>
                    <Box width={12}>
                        <Text
                            color={index === props.selectedIndex ? ACCENT : "white"}
                            bold={index === props.selectedIndex}
                        >
                            {index === props.selectedIndex ? "▸ " : "  "}
                            {command.name}
                        </Text>
                    </Box>
                    <Text color="gray">{command.description}</Text>
                </Box>
            ))}
        </Box>
    );
}
