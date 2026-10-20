# Usage

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

Use `node dist/src/cli.js` directly when piping JSON to another program, so npm's own banners do not enter stdout. JSON uses English field names; explanatory string values may be Chinese. Unknown Chinese topics need explicit queries. An arbitrary English phrase can produce search terms, but matching terms do not guarantee relevant results.

## Replay saved responses

After the first example above has saved its responses:

```sh
node dist/src/cli.js "A local Markdown notes tool" --replay ".compass/first-run/captures.json" --out ".compass/replay-1"
```

Reuse the original idea and any explicit `--query` options. Replay validates structure, response hashes, and bounded input size (16 MiB, at most seven responses). It never fetches missing responses. Reports preserve capture times and clearly identify replay; the new report is not a fresh online check. Always choose a new output directory.

## Optional AI review

```sh
npm run compass -- "A local Markdown notes tool" --prepare-ai --out ".compass/ai-job"
# Export from existing captures without new network requests:
npm run compass -- "A local Markdown notes tool" --replay ".compass/first-run/captures.json" --prepare-ai --out ".compass/ai-job-offline"
# After a separately selected assistant returns JSON:
npm run compass -- --import-ai ".compass/returned-analysis.json" --ai-input ".compass/ai-job/ai-input.json" --out ".compass/ai-review"
```

Use the input package from the export that the assistant analyzed. Import accepts `--json` and `--out`, but conflicts with a positional idea, `--prepare-ai`, `--replay`, `--query`, and `--limit`. It validates before creating a new output directory and never uses the network. A successful import saves `ai-review.md`, `ai-review.json` (a result envelope containing the review), and a copy of `ai-input.json`.

No model call or key handling is implemented. The export contains full captured READMEs and stays local until you choose to share it. Review it before sending to any service; repository text is untrusted data, not instructions. The [AI review guide](AI_REVIEW.md) ([简体中文](AI_REVIEW.zh-CN.md)) explains the four export files, assistant step, strict format, and validation limits.

## Read the results

The capability table uses these labels:

| Report label | Meaning |
|---|---|
| 作者提及 | The author mentions the capability in the captured materials |
| 存在限制/冲突 | The materials contain a limitation or conflicting statement |
| 材料未确认 | The captured prose does not establish the capability; it does not mean the feature is absent |

Directions include source evidence, existing capabilities, a small proposed change, a validation action, and a condition for reusing an existing tool or stopping. They are investigations to consider, not confirmed unmet demand.

Only the first ten GitHub results per query are read, with up to five candidates shown. Archived projects, forks, obvious course/resource lists, and unrecognized licenses are filtered. Stars do not determine ranking. Platform, audience, and actual runtime quality still need manual checking. Branch links can change; timestamps, response hashes, and Git blob identifiers help review the captured material, but do not pin the entire repository to one commit.

## Errors and exit codes

| Code | Meaning and next action |
|---|---|
| 0 | The bounded search completed, possibly with zero candidates, or an AI import passed structural/reference validation |
| 2 | Invalid data/options, including an unreadable or invalid AI JSON file; use explicit queries for an unrecognized topic |
| 4 | Output already exists or cannot be written; choose a new writable directory |
| 5 | Network/rate-limit failure or partial results; keep captured evidence and try a new directory later |

Anonymous GitHub API limits may interrupt a run. The program does not retry indefinitely or report a network failure as “no competitors.” On failure it attempts to save `failure.json` and any available responses. Keep earlier output for review and use another directory when retrying.
