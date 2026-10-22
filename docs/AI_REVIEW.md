# Optional AI review

English | [简体中文](AI_REVIEW.zh-CN.md) · [Usage](USAGE.md) · [Home](../README.md)

Compass can export captured repository materials for an assistant you choose, then import its structured analysis. The AI export/import stages use local files: they do not make any additional analysis-model call, handle a model API key, or verify which assistant generated the result. When used with `--local-model`, Compass has already called the chosen Ollama model for search planning; the generated instructions record that provenance. Ollama may itself route to a cloud model depending on its configuration. Search and rule-based reports still work without this step. CLI help, diagnostics, instructions, and generated report prose currently use Chinese.

## 1. Export materials

```sh
npm run compass -- "A local Markdown notes tool" --prepare-ai --out ".compass/ai-job"
```

This runs the normal anonymous GitHub search and adds four files alongside `report.md`, `report.json`, and `captures.json`:

| File | Purpose |
|---|---|
| `ai-input.json` | Versioned input package: idea, queries, candidate metadata, captured source text, hashes, status, and warnings |
| `ai-sources.md` | The same source text with source IDs and line numbers for citations |
| `ai-instructions.md` | The task to give your assistant, including the input hash and evidence rules |
| `ai-review.schema.json` | JSON Schema for the assistant's returned analysis |

To export without new network requests, replay existing captures using the original idea and any original explicit queries:

```sh
npm run compass -- "A local Markdown notes tool" --replay ".compass/first-run/captures.json" --prepare-ai --out ".compass/ai-job-offline"
```

The usual Chinese/English query rules still apply; unfamiliar Chinese topics need explicit `--query` terms. Replay does not fetch missing material. An export needs at least one candidate with source material; adjust the queries if none are available. Partial discovery can produce an input package with `status: "partial"`; retain and read its warnings. An export does not turn partial data into a complete search.

## 2. Ask your assistant separately

Review the package before sharing it with any service. It contains your idea and queries plus captured full READMEs, descriptions, metadata, and timestamps. Compass writes this exported review packet locally and does not automatically send these exported files to an analysis-model service. If `--local-model` was selected, the original idea was already sent to the configured Ollama endpoint for search planning.

Give your chosen assistant `ai-instructions.md`, `ai-input.json`, `ai-sources.md`, and `ai-review.schema.json`. Ask it to return a UTF-8 JSON file following those instructions and the schema, for example `.compass/returned-analysis.json`. The returned file is the review object itself, with `format: "compass-ai-review-v1"`; it is not the later import result envelope. Keep the original package unchanged.

Repository text is untrusted data, not instructions. The exported task asks the assistant to analyze only the package, without browsing, installing dependencies, executing repository code, sending messages, or publishing content. No installation or runtime test is implied by either the materials or the assistant's analysis.

## 3. Import the returned JSON

```sh
npm run compass -- --import-ai ".compass/returned-analysis.json" --ai-input ".compass/ai-job/ai-input.json" --out ".compass/ai-review"
```

Import has **no positional idea**. It requires the exact input package used for the analysis and rejects combinations with `--prepare-ai`, `--replay`, `--query`, or `--limit`. `--json` is supported; invoke `node dist/src/cli.js` directly when piping stdout to avoid npm banners.

Import is entirely offline. It validates before reserving a new output directory, never overwrites existing output, and saves:

| File | Purpose |
|---|---|
| `ai-review.md` | Chinese report separating author statements, inferences, unknowns, comparisons, and proposed validations |
| `ai-review.json` | A `compass-ai-review-result-v1` envelope with the review, import time, input hash, and validation limits |
| `ai-input.json` | Copy of the input package used for validation |

The input package is limited to 8 MiB and the returned review to 1 MiB. Invalid data/options return exit code 2; output I/O failures return 4. A validated import returns 0. Normal discovery returns 5 for network failure or partial results, even when partial AI materials were exported. See [usage](USAGE.md#errors-and-exit-codes) for all exit codes.

## Evidence format and validation limits

The strict, versioned schema rejects extra fields and separates each claim into one of three kinds:

| Kind | Required evidence boundary |
|---|---|
| `author_statement` | A statement attributed to one candidate's author, with source IDs and line ranges from that same repository |
| `inference` | An interpretation with `basis_ids` pointing to author statements or other inferences, plus explicit `assumptions` |
| `unknown` | An unconfirmed point with a `reason`; it cannot be used as evidence that a capability exists |

Every source, claim basis, unknown reference, and recommended direction must exist. Claim IDs must be unique, inference cycles are rejected, citations must stay within the source and cover at most 25 lines each, and comparisons must cover every candidate. A comparison that lists capability evidence must trace at least one author statement to that candidate; a candidate with no supported capability can have an empty basis and explicit unknowns. There can be zero to three directions; each includes its conditions, proposed change, validation input/steps/expected output, and stop condition. With no direction, `recommended_first_step.direction_id` must be `null`.

The review's `input_sha256` must match the validated input package. Hashes and reference checks detect structural inconsistencies and bind the result to that package; they cannot establish semantic truth, whether a citation supports the wording, whether a claim mixes statement and inference, or the authenticity of the text or generator. The saved result explicitly records `semantic_support: "not_checked"` and `generator_identity: "not_verified"`. A successful import is not proof of task fit, demand, a missing feature, or tested software behavior. Read the cited lines, retained partial-status warnings, and proposed validation before making a decision.
