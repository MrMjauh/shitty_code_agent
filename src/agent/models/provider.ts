import type { Message, ModelResponse } from "../../shared/types.js";
import type { Tool } from "../../tools/tools.js";

export type ModelStreamEvent =
    | { type: "reasoning_delta"; text: string }
    | { type: "content_delta"; text: string }
    | { type: "done"; response: ModelResponse };

export type ModelResponseStream = AsyncIterable<ModelStreamEvent>;

export interface Provider {

    getProvider(): string;
    getModel(): string;
    generateContent(system: Message, msgs: Message[], tools: Tool[]): ModelResponseStream;

}
