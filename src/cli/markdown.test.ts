import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.js";

describe("renderMarkdown", () => {
    it("strips raw ** markers from bold spans", () => {
        const out = renderMarkdown("**hello**");
        expect(out).not.toContain("**");
    });

    it("emits ANSI escape codes for bold spans", () => {
        const out = renderMarkdown("**hello**");
        expect(out).toMatch(/\[/);
    });

    it("renders a list without leaving the leading * marker", () => {
        const out = renderMarkdown("* one\n* two");
        expect(out).not.toMatch(/^\s*\* one/m);
    });

    it("renders headings", () => {
        const out = renderMarkdown("# title");
        expect(out).not.toContain("# title");
        expect(out).toMatch(/title/);
    });
});
