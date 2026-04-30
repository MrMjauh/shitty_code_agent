import type { Message, ModelResponse, ModelTool } from "../../shared/types.js";

export interface Model {

    getProvider(): string;
    getModel(): string;
    sendMessage(msgs: Message[], tools: ModelTool[]): Promise<ModelResponse>;
}
