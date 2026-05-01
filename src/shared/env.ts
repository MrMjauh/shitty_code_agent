import { z } from "zod";


const requiredEnvValue = (name: string) =>
    z.string({ error: `Missing required environment variable: ${name}` })
        .trim()
        .min(1, `Missing required environment variable: ${name}`);

export const modelConfigurationSchema = z.discriminatedUnion("MODEL_PROVIDER", [
    z.object({
    MODEL_PROVIDER: z.literal("openai"),
    OPENAI_API_KEY: requiredEnvValue("OPENAI_API_KEY"),
    OPENAI_MODEL: requiredEnvValue("OPENAI_MODEL"),
}),
    z.object({
        MODEL_PROVIDER: z.literal("deepseek"),
        DEEPSEEK_API_KEY: requiredEnvValue("DEEPSEEK_API_KEY"),
        DEEPSEEK_MODEL: requiredEnvValue("DEEPSEEK_MODEL"),
    })
])

export type ModelConfiguration = z.infer<typeof modelConfigurationSchema>;