import React from "react";
import { Box, Text } from "ink";
import { ACCENT, type Block } from "../types.js";
import { renderMarkdown } from "../markdown.js";
import { Spinner } from "./Spinner.js";

export function Transcript(props: {
    height: number;
    rows: React.ReactNode[];
    scrollOffset: number;
    maxScrollOffset: number;
}) {
    const offset = Math.min(props.scrollOffset, props.maxScrollOffset);
    const showHeader = offset > 0;
    const showFooter = offset > 0;
    const reservedRows = (showHeader ? 1 : 0) + (showFooter ? 1 : 0);
    const lineHeight = Math.max(1, props.height - reservedRows);
    const start = Math.max(0, props.rows.length - lineHeight - offset);
    const end = start + lineHeight;
    const visible = props.rows.slice(start, end);
    const hiddenAbove = start;
    const hiddenBelow = Math.max(0, props.rows.length - end);

    return (
        <Box flexDirection="column" height={props.height}>
            {showHeader && (
                <Text color="gray">↑ {hiddenAbove} more line{hiddenAbove === 1 ? "" : "s"} above</Text>
            )}
            {visible.map((row, index) => (
                <Box key={`${start}-${index}`}>{row}</Box>
            ))}
            {showFooter && (
                <Text color="gray">↓ {hiddenBelow} more line{hiddenBelow === 1 ? "" : "s"} below · press ↓ to follow</Text>
            )}
        </Box>
    );
}

export function renderBlocks(blocks: Block[]): React.ReactNode[] {
    const rows: React.ReactNode[] = [];

    blocks.forEach((block, blockIndex) => {
        if (blockIndex > 0) rows.push(<Text> </Text>);

        switch (block.kind) {
            case "user":
                block.text.split("\n").forEach((line, i) => {
                    rows.push(
                        <Box>
                            <Text color={ACCENT} bold>{i === 0 ? "❯ " : "  "}</Text>
                            <Text color="white">{line}</Text>
                        </Box>,
                    );
                });
                break;
            case "assistant": {
                const rendered = renderMarkdown(block.text);
                rendered.split("\n").forEach((line, i) => {
                    rows.push(
                        <Box>
                            <Text color="green" bold>{i === 0 ? "◆ " : "  "}</Text>
                            <Text>{line}</Text>
                        </Box>,
                    );
                });
                break;
            }
            case "tool_call":
                rows.push(
                    <Box>
                        <Text color="magenta">⏺ </Text>
                        <Text color="magenta" bold>{block.tool}</Text>
                        <Text color="gray">{block.summary ? `  ${block.summary}` : ""}</Text>
                    </Box>,
                );
                break;
            case "tool_result":
                rows.push(
                    <Box>
                        <Text color="gray">  ↳ </Text>
                        <Text color={block.ok ? "gray" : "red"}>{block.summary}</Text>
                    </Box>,
                );
                break;
            case "status":
                rows.push(
                    <Box>
                        <Text color="yellow"><Spinner /> </Text>
                        <Text color="yellow">{block.text}</Text>
                    </Box>,
                );
                break;
        }
    });

    return rows;
}
