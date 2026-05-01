import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createLogger, format, transports, type Logger } from "winston";

export type AgentLogger = {
    error(message: string, metadata?: Record<string, unknown>): void;
};

export function createFileLogger(logFile = resolve(process.cwd(), "logs", "agent.log")): Logger {
    mkdirSync(dirname(logFile), { recursive: true });

    return createLogger({
        level: "error",
        format: format.combine(
            format.timestamp(),
            format.errors({ stack: true }),
            format.json(),
        ),
        transports: [
            new transports.File({ filename: logFile }),
        ],
    });
}
