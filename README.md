# Project Compass

English | [简体中文](README.zh-CN.md)

Find GitHub alternatives before building your idea. Project Compass searches real repositories, compares capabilities described in their materials, and saves a report with sources and 1–3 directions to investigate.

V1 is a local command-line tool. It needs no GitHub token, model API key, or paid service. **English idea input is supported; CLI help, diagnostics, and generated report text currently use Chinese.** This release provides documentation in both languages.

## Quick start

Use Node.js 24.19.x with npm. Then run:

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

Each run creates a new directory. Existing output is never overwritten. See the [usage guide](docs/USAGE.md) for options, replay, and exit codes.

## What V1 does

1. Accepts an idea and derives up to two searches using a limited Chinese/English vocabulary. You can supply your own queries.
2. Retrieves up to five GitHub candidates, with links, descriptions, language, license metadata, update time, and reasons for text relevance.
3. Extracts prose from descriptions and READMEs, summarizes supported capability statements, and shows a comparison table with source references.
4. Separates author statements, rule-based inferences, limitations, and unknowns. Missing documentation is not treated as a missing feature.
5. When the materials support it, proposes 1–3 investigations with existing capability evidence, a small proposed change, a validation action, and a condition for reusing an existing tool or stopping. No candidates can mean no directions.
6. Saves reports and raw responses locally, and can analyze saved responses again without network requests.

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
- Archived repositories, forks, obvious course/resource lists, and results with unrecognized license metadata are excluded and explained. License filtering can omit useful projects; check actual LICENSE and dependency terms before reuse.
- Search uses text matching, and analysis uses disclosed rules and the Marked lexer. Complex negation, tables, platform constraints, and unfamiliar topics may be missed or misread. No language model is called.
- Capabilities are statements from repository materials, not installation tests. Text relevance does not establish task fit, user demand, or a market gap.
- V1 has no graphical interface, repository-URL audit, full Issue/user-feedback analysis, automatic code generation, success probability, or continuous monitoring.
- Only search queries are sent to GitHub. Keep private information out of queries. Generated reports and captures are ignored by Git by default.

## Development and checks

```sh
npm test
npm run check:contracts
# Optional live check: up to 21 API requests and 6 repository page GETs
npm run validate:live
```

See [development notes](docs/DEVELOPMENT.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## License

[MIT License](LICENSE). Third-party dependencies retain their own license terms.
