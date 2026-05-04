import type { ModelConfiguration } from "../../shared/env.js";
import { CodeAgentError } from "../../shared/error.js";
import { ClaudeCli } from "./claude.js";
import { DeepSeek } from "./deepseek.js";
import { OpenAi } from "./openai.js";

export const createProviderFromConfig = (config: ModelConfiguration) => {
    switch (config.MODEL_PROVIDER) {
        case "claude": return new ClaudeCli({ cliPath: config.CLAUDE_CLI_PATH, model: config.CLAUDE_MODEL })
        case "deepseek": return new DeepSeek({ apiKey: config.DEEPSEEK_API_KEY, model: config.DEEPSEEK_MODEL })
        case "openai": return new OpenAi({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL })
        default: throw new CodeAgentError(`Cannot instanstiate MODEL_PROVIDER ${(config as ModelConfiguration).MODEL_PROVIDER}`)
    }
}
