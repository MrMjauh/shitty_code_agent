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
    if (typeof out !== "string") return text;
    return out.replace(/\n+$/, "");
}
