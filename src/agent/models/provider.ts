import type { Message, ModelResponse } from "../../shared/types.js";
import type { Tool } from "../../tools/tools.js";

export interface Provider {

    getProvider(): string;
    getModel(): string;
    sendMessage(msgs: Message[], tools: Tool[]): Promise<ModelResponse>;

}
