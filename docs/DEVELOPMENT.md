# Development

English | [简体中文](DEVELOPMENT.zh-CN.md) · [Home](../README.md)

## V1 data flow

`src/cli.ts` → `src/discovery/query.ts` → read-only GitHub Search/README adapters → prose evidence extraction → capability comparison and conditional directions → Markdown/JSON.

`src/adapters/github/replay.ts` reuses the analysis flow with local responses. Marked is used as a lexer, without rendering untrusted HTML. Commands in READMEs are never executed.

## Retained modules

`src/domain` (including `src/domain/contracts`), `src/application`, the SQLite adapter, `contracts`, and `storage` retain earlier domain/storage work. The current discovery CLI does not need to initialize them. `experiments` and `research/decision-cases.json` contain earlier rule experiments and fixtures; they do not generate V1 search results or establish user demand.

## Checks

```sh
npm test
npm run check:contracts
```

Tests build the project, verify generated types, and run offline unit, CLI, SQLite, and earlier rule checks. Contract checks compile strict schemas and validate synthetic examples. After changing contracts, run `npm run generate:types`, inspect the generated diff, and run the related checks. Storage changes need compatibility or a recoverable migration.

GitHub Actions [CI](../.github/workflows/ci.yml) runs on pull requests and pushes to `main`, using a fresh Ubuntu 24.04 runner with Node.js 24.19.0 and npm 12.2.0. It checks out the exact PR head commit and runs `npm ci`, `npm run build`, `npm test`, and `npm run check:contracts` as separate steps that fail the job on error. There is no dependency cache or live discovery/model call; the tests use synthetic responses and local replay. The workflow uses read-only repository permissions and does not publish. Its results establish automated build/test compatibility, not retrieval quality or release approval.

Before the first code upload, 172 local tests passed. Four sets of historical real responses were replayed with the final V1 implementation; another live backtesting-themed run retrieved five candidates and five READMEs. Earlier page checks included timeouts, which were not counted as successes. A development agent reviewed selected sources. These observations are not independent blind evaluation, installation testing of candidate software, or market validation.

## Documentation languages

The English README is the default entry point. Chinese equivalents use `.zh-CN.md`; each pair links to the other language. Keep installation, options, limits, and supported capabilities consistent across both versions. CLI help, diagnostics, report prose, and some structured string values remain Chinese. Documentation translation does not add a new language option to the application.

## Publication scope

The public source snapshot includes runnable code, tests, necessary original fixtures, and usage documentation. The user's previously uploaded project brief is retained. Personal development archives, full internal research history, third-party README snapshots, and local reports were excluded from the code upload; the original local material and history remain preserved.
