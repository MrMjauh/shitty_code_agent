import React from "react";
import { Box, Text } from "ink";
import { ACCENT, type Block } from "../types.js";
import { renderMarkdown } from "../markdown.js";
import { Spinner } from "./Spinner.js";

export function Transcript(props: {
    rows: React.ReactNode[];
}) {
    return (
        <Box flexDirection="column">
            {props.rows.map((row, index) => (
                <Box key={index}>{row}</Box>
            ))}
        </Box>
    );
}

export function renderBlocks(blocks: Block[], width = Math.max(40, (process.stdout.columns || 100) - 2)): React.ReactNode[] {
    return renderBlocksForWidth(blocks, width);
}

export function renderBlocksForWidth(blocks: Block[], width: number): React.ReactNode[] {
    const rows: React.ReactNode[] = [];
    const usableWidth = Math.max(20, width);

    blocks.forEach((block, blockIndex) => {
        if (blockIndex > 0) rows.push(<Text> </Text>);

        switch (block.kind) {
            case "user":
                block.text.split("\n").forEach((line, i) => {
                    const wrapped = wrapLine(line, usableWidth - 2);
                    wrapped.forEach((wrappedLine, wrappedIndex) => {
                        rows.push(
                            <Box>
                                <Text color={ACCENT} bold>{i === 0 && wrappedIndex === 0 ? "❯ " : "  "}</Text>
                                <Text color="white">{wrappedLine}</Text>
                            </Box>,
                        );
                    });
                });
                break;
            case "assistant": {
                const rendered = renderMarkdown(block.text);
                rendered.split("\n").forEach((line, i) => {
                    const wrapped = wrapLine(line, usableWidth - 2);
                    wrapped.forEach((wrappedLine, wrappedIndex) => {
                        rows.push(
                            <Box>
                                <Text color="green" bold>{i === 0 && wrappedIndex === 0 ? "◆ " : "  "}</Text>
                                <Text>{wrappedLine}</Text>
                            </Box>,
                        );
                    });
                });
                break;
            }
            case "error":
                block.text.split("\n").forEach((line, i) => {
                    const wrapped = wrapLine(line, usableWidth - 2);
                    wrapped.forEach((wrappedLine, wrappedIndex) => {
                        rows.push(
                            <Box>
                                <Text color="red" bold>{i === 0 && wrappedIndex === 0 ? "! " : "  "}</Text>
                                <Text color="red">{wrappedLine}</Text>
                            </Box>,
                        );
                    });
                });
                break;
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

function wrapLine(line: string, width: number): string[] {
    if (visibleLength(line) <= width) return [line];

    const rows: string[] = [];
    let current = "";
    let currentLength = 0;

    for (let index = 0; index < line.length;) {
        const ansi = line.slice(index).match(/^\x1b\[[0-9;]*m/);
        if (ansi) {
            current += ansi[0];
            index += ansi[0].length;
            continue;
        }

        const char = line[index] ?? "";
        if (currentLength >= width) {
            rows.push(current);
            current = "";
            currentLength = 0;
        }
        current += char;
        currentLength++;
        index++;
    }

    rows.push(current);
    return rows;
}

function visibleLength(value: string): number {
    return value.replace(/\x1b\[[0-9;]*m/g, "").length;
}
