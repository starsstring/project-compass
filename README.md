# Project Compass

English | [简体中文](README.zh-CN.md)

Find GitHub alternatives before building your idea. Project Compass searches real repositories, compares capabilities described in their materials, and saves a report with sources and 1–3 directions to investigate.

Project Compass is a local command-line tool. It needs no GitHub token, model API key, or paid service. **Chinese and English input are supported; CLI help, diagnostics, and generated report text currently use Chinese.** Documentation is available in both languages.

**Repository status (2026-10-21):** the external semantic-plan experiment was merged into `main` in [PR #5](https://github.com/starsstring/project-compass/pull/5), after independent engineering review and CI. The `package.json` version is still `0.2.0`, and the latest GitHub release remains the [v0.2.0 pre-release](https://github.com/starsstring/project-compass/releases/tag/v0.2.0). **There is no v0.3.0 tag or release.** Cloning `main` uses the merged experimental source, not the published release snapshot.

0.2.0 adds limited intent/requirement rules and Chinese word segmentation, with focused and broader searches when appropriate. Vague requests ask for clarification without accessing GitHub. Reports retain the original request and show requirement text clues as unverified; this is not general semantic understanding. [Planning behavior and limits](docs/INPUT_PLANNING.md).

## Quick start

Use Node.js 24.19.x and npm 12.2.0 (`node --version` / `npm --version` to check). If needed, install the pinned npm with `npm install --global npm@12.2.0` in a writable Node installation. Then run:

```sh
git clone https://github.com/starsstring/project-compass.git
cd project-compass
npm ci
npm run build
npm run compass -- "A local Markdown notes tool"
```

The terminal prints the output directory, usually `.compass/discovery/<run-id>/`:

| File | Contents |
|---|---|
| `report.md` | A readable report with repository links, capabilities, sources, and proposed investigations |
| `report.json` | Structured results for your own scripts |
| `captures.json` | Original API responses, timestamps, and hashes for offline review |

The top of `report.md` now includes a **one-minute reading guide**: up to three candidate links, a cited author statement when available, unverified conditions, and one concrete validation action. It does **not** decide whether your idea will succeed or prove that any candidate meets all requirements.

Each run creates a new directory. Existing output is never overwritten. See the [usage guide](docs/USAGE.md) for options, replay, and exit codes.

## Optional local-model planning (no manual JSON)

For complex ideas, explicitly opt into an **installed local Ollama model**; Compass generates the internal semantic plan automatically before bounded GitHub search:

```sh
ollama pull qwen2.5:7b
npm run compass -- "Find an offline Markdown notes tool that does not upload to cloud" --local-model qwen2.5:7b
```

Normal model-free idea input remains available. This requires a running Ollama and local computing resources; Compass itself does not directly call a paid AI API, but Ollama may use cloud models depending on user configuration. Model interpretation and candidate constraints remain unverified. Read [local planner limits](docs/LOCAL_PLANNER.md). **Users do not write JSON.**

## Optional AI review

Add `--prepare-ai` to export the captured materials, numbered sources, instructions, and a JSON Schema for an assistant you choose. Compass does not call a model, require a model key, or send this package to a service. You can then import the assistant's JSON offline; Compass checks its structure, input hash, and references, while semantic support and generator identity remain unverified.

```sh
npm run compass -- "A local Markdown notes tool" --prepare-ai --out ".compass/ai-job"
npm run compass -- --import-ai ".compass/returned-analysis.json" --ai-input ".compass/ai-job/ai-input.json" --out ".compass/ai-review"
```

The package includes captured full READMEs. Review it before sharing it with any service, and treat repository text as untrusted data. See the [AI review guide](docs/AI_REVIEW.md) ([简体中文](docs/AI_REVIEW.zh-CN.md)) for the separate assistant step, offline export, and validation limits.

## What it does

An optional [external semantic-plan prototype](docs/SEMANTIC_PLAN.md) accepts
`--semantic-plan <json>` and tries short queries with a bounded zero-candidate
fallback. The JSON is user/external input whose semantics remain unverified;
Compass does not generate it or call a model. Default rule input is unchanged.
The Issue #4 experiment has passed engineering review and is merged into `main`; it is **not** a v0.3.0 release, integrated LLM planning, or evidence of improved real-world search quality.

1. Accepts a request, infers a possible find/build/learn intent, preserves requirements, and derives up to two searches using finite rules. Unmapped Chinese words remain visible; explicit queries still take precedence.
2. Retrieves up to five GitHub candidates, with links, descriptions, language, license metadata, update time, and reasons for text relevance.
3. Extracts prose from descriptions and READMEs, summarizes supported capability statements, and shows a comparison table with source references.
4. Separates author statements, rule-based inferences, limitations, and unknowns. Missing documentation is not treated as a missing feature.
5. When the materials support it, proposes 1–3 investigations with existing capability evidence, a small proposed change, a validation action, and a condition for reusing an existing tool or stopping. No candidates can mean no directions.
6. Saves reports and raw responses locally, and can analyze saved responses again without network requests.

### Try the merged experiment (optional)

The JSON plan is [externally prepared](docs/SEMANTIC_PLAN.md); it is **not** generated by the CLI. After `npm ci` and `npm run build`, run the repository's public example:

```sh
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan examples/semantic-plan.json --out ".compass/semantic-example"
```

This example writes to `.compass/semantic-example/`. Replay its saved responses with the next command. Both output directories must be new; for another run, choose fresh directories and update the replay input paths accordingly:

```sh
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan ".compass/semantic-example/semantic-plan.json" --replay ".compass/semantic-example/captures.json" --out ".compass/semantic-example-replay"
```

This is an already published **example/regression**, not an independent usability or candidate-quality test. See the [semantic-plan guide](docs/SEMANTIC_PLAN.md) for format, input validation, and replay limits.

The [post-merge readiness record](docs/POST_MERGE_0.3_READINESS.md) separates the first-run checks from search-quality limits and release approval.

## When to use it

| Your task | What Compass helps you do |
|---|---|
| Explore a personal open-source idea | Find related projects before starting another implementation |
| Start a quantitative research tool | Find backtesting/trading frameworks and inspect documented capabilities to decide what to try |
| Build a board debugging utility | Compare serial monitor/terminal projects as possible components or alternatives |
| Explore a notes or download tool | Compare stated features and choose one small difference to validate |
| Revisit an earlier investigation | Reanalyze saved responses and inspect sources without spending another API request |

```sh
npm run compass -- "A backtesting tool"
npm run compass -- "A serial monitor for development boards"
npm run compass -- "A download manager with resume support"
npm run compass -- "A campus pet adoption service" --query "pet adoption"
```

Backtesting input searches for relevant tools; it does not run strategies or create trading software. For unfamiliar or complex topics, use `--query` to control the search. Capability analysis is most specific for the supported notes, serial, download, and backtesting topics.

The [synthetic report](examples/synthetic-report.md) shows the current Chinese output format. Its repository and capabilities are fictional test data, not live search results.

## Scope and limitations

- Each run makes at most two GitHub Search requests and five README requests, anonymously and read-only. It reads only the first ten results per query; this is not an exhaustive competitor search.
- Archived repositories, forks, and obvious course/resource lists are excluded. Unknown or `NOASSERTION` license metadata does not exclude a public competitor or lower its relevance ranking. Discovery does not grant reuse rights; check actual LICENSE and dependency terms before reuse.
- Search uses text matching, and analysis uses disclosed rules and the Marked lexer. Complex negation, tables, platform constraints, and unfamiliar topics may be missed or misread. No language model is called.
- Capabilities are statements from repository materials, not installation tests. Text relevance does not establish task fit, user demand, or a market gap.
- V1 has no graphical interface, repository-URL audit, full Issue/user-feedback analysis, automatic code generation, success probability, or continuous monitoring.
- Only search queries are sent to GitHub. Keep private information out of queries. Generated reports and captures are ignored by Git by default.

## Development and checks

```sh
npm test
npm run check:contracts
# Optional live check: up to 21 API requests and 6 repository page GETs
# Also checks clarification with no requests or report directory
npm run validate:live
```

See [development notes](docs/DEVELOPMENT.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## License

[MIT License](LICENSE). Third-party dependencies retain their own license terms.
