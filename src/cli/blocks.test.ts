import { describe, expect, test } from "vitest";
import { buildBlocks } from "./blocks.js";

describe("buildBlocks", () => {
    test("renders error messages as error blocks", () => {
        expect(buildBlocks([
            { role: "error", text: "Something failed." },
        ], false)).toEqual([
            { kind: "error", text: "Something failed." },
        ]);
    });
});
