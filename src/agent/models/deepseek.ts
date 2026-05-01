import { OpenAiCompatibleProvider } from "./openai-compatible.js";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

type DeepSeekOptions = {
    apiKey: string;
    model: string;
};

export class DeepSeek extends OpenAiCompatibleProvider {
    constructor(options: DeepSeekOptions) {
        super({
            provider: "deepseek",
            model: options.model,
            apiKey: options.apiKey,
            apiUrl: DEEPSEEK_API_URL,
        });
    }
}
