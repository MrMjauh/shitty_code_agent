# erik_agent

Small terminal coding agent.

## Demo

![Demo](docs/img.png)

## Setup

```sh
pnpm install
cp .env.example .env
```

Configure one provider in `.env`:

```sh
MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=...
```

or:

```sh
MODEL_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

## Run

```sh
pnpm dev
```

## Check

```sh
pnpm build
pnpm test:run
```
