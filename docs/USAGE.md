# Usage

The optional [external semantic-plan prototype](SEMANTIC_PLAN.md) adds
`--semantic-plan <json>` with a separate validated file and bounded fallback.
It conflicts with `--query`/`--import-ai`; it does not call a model.

English | [简体中文](USAGE.zh-CN.md) · [Home](../README.md)

Install with `npm ci` and build with `npm run build` first. Normal discovery needs no database, GitHub token, or model service. English input works; generated prose, diagnostics, and help currently use Chinese.

## Run a search

```sh
npm run compass -- "A local Markdown notes tool" --limit 3 --out ".compass/first-run"
npm run compass -- "A campus pet adoption service" --query "animal adoption" --query "pet adoption"
node dist/src/cli.js "A local notes tool" --query "markdown notes" --json
node dist/src/cli.js --help
```

| Option | Behavior |
|---|---|
| `--query "terms"` | Supply up to two searches; repeat the option for the second query |
| `--limit 3` | Show 1–5 candidates; default is 5 |
| `--out "directory"` | Save to a new directory; an existing directory is rejected |
| `--json` | Print structured JSON instead of Markdown to stdout |
| `--replay "captures.json"` | Analyze saved responses without network requests |
| `--prepare-ai` | Also export local materials and a return schema for a separately selected assistant |
| `--import-ai "analysis.json"` | Import an assistant's JSON offline; requires `--ai-input` and no positional idea |
| `--ai-input "ai-input.json"` | Supply the matching exported input package for import |
| `--help` | Show the current Chinese CLI help |

Use `node dist/src/cli.js` directly when piping JSON to another program, so npm's own banners do not enter stdout. JSON uses English field names; explanatory values may be Chinese. Unknown Chinese topics fall back to Chinese word segmentation, with limited English-README coverage. Vague input returns exit 2 and `status: needs_clarification` with `--json`, without network access or a report directory. You can clarify in natural language; an English query is optional. Matching terms do not guarantee relevant results.

## Optional local model: no JSON preparation

Install Ollama and a downloaded local model, then run:

```sh
ollama pull qwen2.5:7b
npm run compass -- "Find an offline Markdown notes tool" --local-model qwen2.5:7b
```

This explicit opt-in generates a validated internal plan on loopback. Basic mode remains model-free. See [local planner](LOCAL_PLANNER.md) for model resources, external transmission caveats in Ollama cloud configurations, invalid plan handling, and replay restrictions.

## Replay saved responses

After the first example above has saved its responses:

```sh
node dist/src/cli.js "A local Markdown notes tool" --replay ".compass/first-run/captures.json" --out ".compass/replay-1"
```

Reuse the original idea. Without `--query`, replay uses the saved search strings and attempted candidate order, including V1 captures; new planning rules do not silently replace historical searches. An explicit query must still match saved responses. Replay validates structure, hashes, and bounded size (16 MiB, at most seven responses), and never fetches missing responses. Reports preserve capture times and identify replay. Always choose a new output directory.

## Optional AI review

```sh
npm run compass -- "A local Markdown notes tool" --prepare-ai --out ".compass/ai-job"
# Export from existing captures without new network requests:
npm run compass -- "A local Markdown notes tool" --replay ".compass/first-run/captures.json" --prepare-ai --out ".compass/ai-job-offline"
# After a separately selected assistant returns JSON:
npm run compass -- --import-ai ".compass/returned-analysis.json" --ai-input ".compass/ai-job/ai-input.json" --out ".compass/ai-review"
```

Use the input package from the export that the assistant analyzed. Import accepts `--json` and `--out`, but conflicts with a positional idea, `--prepare-ai`, `--replay`, `--query`, and `--limit`. It validates before creating a new output directory and never uses the network. A successful import saves `ai-review.md`, `ai-review.json` (a result envelope containing the review), and a copy of `ai-input.json`.

The AI export/import step makes no additional analysis-model call, handles no model API key, and does not automatically send the exported packet. If combined with `--local-model`, Ollama was already called to plan the search (and may itself be configured to use a cloud model). The export contains full captured READMEs and stays local until you choose to share it. Review it before sending to any service; repository text is untrusted data, not instructions. The [AI review guide](AI_REVIEW.md) ([简体中文](AI_REVIEW.zh-CN.md)) explains the four export files, assistant step, strict format, and validation limits.

## Read the results

The capability table uses these labels:

| Report label | Meaning |
|---|---|
| 作者提及 | The author mentions the capability in the captured materials |
| 存在限制/冲突 | The materials contain a limitation or conflicting statement |
| 材料未确认 | The captured prose does not establish the capability; it does not mean the feature is absent |

Directions include source evidence, existing capabilities, a small proposed change, a validation action, and a condition for reusing an existing tool or stopping. They are investigations to consider, not confirmed unmet demand.

Only the first ten GitHub results per query are read, with up to five candidates shown. Archived projects and forks are filtered. Obvious course/resource lists are retained for learning requests and filtered for tool discovery. Public competitors with unknown or `NOASSERTION` license metadata remain eligible, with a warning to inspect actual LICENSE and dependency terms before reuse. License metadata and stars do not determine relevance ranking. Platform, audience, and actual runtime quality still need manual checking. Branch links can change; timestamps, response hashes, and Git blob identifiers help review the captured material, but do not pin the entire repository to one commit.

Recognized future/planned statements do not establish current capabilities; explicit absence and conflicting support statements remain qualified. These are conservative text rules, including common English/Chinese forms and nested roadmap headings, not full semantic understanding. Ambiguous or unfamiliar wording can still be missed or misread; inspect the cited text before relying on a comparison.

## Errors and exit codes

| Code | Meaning and next action |
|---|---|
| 0 | The bounded search completed, possibly with zero candidates, or an AI import passed structural/reference validation |
| 2 | Needs clarification (no network/output directory), or invalid data/options; clarify the request in natural language, or fix the indicated data error |
| 4 | Output already exists or cannot be written; choose a new writable directory |
| 5 | Network/rate-limit failure or partial results; keep captured evidence and try a new directory later |

Anonymous GitHub API limits may interrupt a run. The program does not retry indefinitely or report a network failure as “no competitors.” On failure it attempts to save `failure.json` and any available responses. Keep earlier output for review and use another directory when retrying.
