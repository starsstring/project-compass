# Automatic semantic planning: optional local-model experiment

[简体中文](LOCAL_PLANNER.zh-CN.md) | English · [Home](../README.md)

**Goal:** users enter an idea, not a JSON file. The semantic plan is an internal, auditable representation.

For this experiment, you explicitly opt into a local [Ollama](https://ollama.com/) server on `127.0.0.1:11434`. Compass does not download models, read API keys, or directly call a paid model API. The existing model-free command is unchanged.

Download an appropriate local model first (this uses local disk, CPU/GPU and RAM), for example:

```sh
ollama pull qwen2.5:7b
npm ci
npm run build
npm run compass -- "Find an offline, open-source Markdown notes editor that does not upload to the cloud" --local-model qwen2.5:7b
```

The application requests an internal JSON plan from Ollama, validates the original idea, strict Schema, and bounded English search phrases **before any GitHub search**, and produces the normal report. The generated `semantic-plan.json` is audit data, **not an input the end user prepares**.

Without Ollama, simply omit `--local-model` to use the existing rule-driven path. Invalid/missing models fail explicitly without falling back silently to an unverified interpretation.

### Boundaries

- Exactly one explicitly requested localhost model call (`http://127.0.0.1:11434/api/generate`); 60s timeout, 64 KiB HTTP response maximum, 32 KiB plan maximum; no redirects or user-selectable remote API base URL.
- Ollama can itself use cloud models depending on **your Ollama configuration**. Compass only connects to loopback and cannot guarantee a configured Ollama model never forwards data or incurs costs. Choose a downloaded local model; do not supply sensitive ideas.
- Generated semantics remain unverified; required/excluded conditions remain `unknown` for candidates. No automatic claim of feature fulfillment or market opportunity.
- The GitHub budget stays at up to 2 Search and 5 README GETs. Only the short search terms are sent to GitHub. No repository code is executed.
- `--local-model` is incompatible with `--query`, `--semantic-plan`, `--replay` and `--import-ai`. For offline replay, use the saved plan through the original `--semantic-plan` + `--replay` path; it does not call Ollama again.
- CI uses mocked responses. This feature has not established live local-model accuracy, hardware compatibility or independent user usability, and it is not a new version release.

This is a deliberately narrow provider experiment. Future providers require separate privacy, consent and spending safeguards.
