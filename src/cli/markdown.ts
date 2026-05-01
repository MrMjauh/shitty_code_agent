import { Marked } from "marked";
// @ts-ignore - marked-terminal does not ship its own types
import { markedTerminal } from "marked-terminal";

const md = new Marked();
md.use(
    markedTerminal({
        reflowText: false,
        width: Math.max(40, (process.stdout.columns || 100) - 6),
        tab: 2,
    }) as any,
);

export function renderMarkdown(text: string): string {
    const out = md.parse(text);
    const rendered = typeof out === "string" ? out.replace(/\n+$/, "") : "";

    if (rendered !== text && /\x1b\[/.test(rendered)) {
        return rendered;
    }

    return renderBasicMarkdown(text);
}

function renderBasicMarkdown(text: string): string {
    return text
        .replace(/^#{1,6}\s+(.+)$/gm, "\x1b[1m$1\x1b[22m")
        .replace(/^\s*[*-]\s+(.+)$/gm, "  - $1")
        .replace(/\*\*(.+?)\*\*/g, "\x1b[1m$1\x1b[22m")
        .replace(/\n+$/, "");
}
