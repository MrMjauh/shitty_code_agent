import { OpenAiCompatibleProvider } from "./openai-compatible.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

type OpenAiOptions = {
    apiKey: string;
    model: string;
};

export class OpenAi extends OpenAiCompatibleProvider {
    constructor(options: OpenAiOptions) {
        super({
            provider: "openai",
            model: options.model,
            apiKey: options.apiKey,
            apiUrl: OPENAI_API_URL,
        });
    }
}
