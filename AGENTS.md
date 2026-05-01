# Agent Instructions

These instructions apply to the whole repository.

## Code Style

- Prefer explicit required values over optional or undefined parameters.
- Do not use default constructor parameters for required configuration. For example, avoid `constructor(apiKey: string, model = "deepseek-v4-flash")`; require callers to pass every value intentionally.
- Prefer an options object when a function or constructor takes more than two or three arguments. This keeps call sites readable and makes future changes less error-prone.
- Keep changes scoped to the current task and follow the existing module structure.

## Configuration

- Always validate environment variables with Zod before using them.
- Environment validation should happen at the boundary where configuration is read, not deep inside business logic.
- Treat missing or malformed environment variables as startup errors with clear messages.

## Input Validation

- Always validate user input before using it.
- Prefer Zod schemas for structured input validation.
- Keep validation close to the input boundary so downstream code can assume typed, validated values.

## Architecture Notes

- Model providers live in `src/agent/models`.
- All model providers must implement the `Model` interface.
- Provider selection and environment parsing should stay centralized instead of being spread through UI or agent logic.
