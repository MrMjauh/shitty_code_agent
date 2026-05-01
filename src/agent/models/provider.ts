import type { Message, ModelResponse } from "../../shared/types.js";
import type { Tool } from "../../tools/tools.js";

export interface Provider {

    getProvider(): string;
    getModel(): string;
    generateContent(history: Message[], tools: Tool[]): Promise<ModelResponse>;
    sendMessage(msg: Message, history: Message[], tools: Tool[]): Promise<ModelResponse>;

}
