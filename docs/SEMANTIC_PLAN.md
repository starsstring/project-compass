# External semantic plans (experimental prototype)

English | [简体中文](SEMANTIC_PLAN.zh-CN.md) · [Home](../README.md)

This optional Issue #4 prototype accepts a user-prepared JSON file. It does not
call a model, generate a semantic plan, verify its author, or establish that its
interpretation is correct. Ordinary CLI input still uses the published finite
rules. The package version remains 0.2.0; this is not a 0.3.0 release.

## Run the example

With Node 24.19.x / npm 12.2.0, install and build as usual. The idea must match the
file's `idea` (CLI leading/trailing whitespace is trimmed):

```sh
npm ci
npm run build
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan examples/semantic-plan.json
```

This is a known Issue #3 regression/example, not a blind test or proof that a
candidate meets the request. It creates a new `.compass/discovery/<run-id>/` with
`report.md`, `report.json`, `captures.json`, and the validated `semantic-plan.json`.
Pass `--json` for structured stdout or `--out <new-directory>` for a chosen path.

The [example](../examples/semantic-plan.json) and
[strict schema](../contracts/semantic-plan-v1.schema.json) define these fields:

| Field | Meaning and bounds |
|---|---|
| `version` | Number `1`; extra fields/versions are rejected |
| `idea` | Original single-line request, 4–2000 characters |
| `intent` | `find_project`, `develop`, `learn`, or `unclear`; an external declaration |
| `core` | English `object` and `action`; may be null only with a clarification |
| `alternative` | Optional/null alternative `object` and `action` |
| `required_conditions` | Up to 16 nonempty strings, each at most 200 characters |
| `excluded_conditions` | Same bounds; retained, not automatic exclusion filters |
| `unknowns` | Same bounds; an empty list does not establish certainty |
| `clarification` | Null or a nonempty question of at most 200 characters |

The file is at most 32 KiB of valid UTF-8 JSON. Controls, terminal escapes, bidi
controls, unknown fields, invalid shapes and mismatched ideas are rejected.
English core phrases use letters/digits and single spaces/hyphens, begin with a
letter, and have at most 64 characters per field. A combined query must fit four
whitespace words and 100 characters; Boolean operators/query syntax are rejected.
Excess is rejected rather than truncated. Runtime checks enforce combined bounds
in addition to JSON Schema validation.

Only the supplied English query terms go to GitHub, not the whole idea or the
condition lists. Review those terms before searching; they are external data,
not an automatic privacy or correctness guarantee.

## Bounded fallback

The program joins `object + action`, lowercases it, and deduplicates an identical
alternative. It does not concatenate all hard constraints into an AND query.

1. Search the first query, first page only (at most ten results).
2. Reuse the existing eligibility filter. Learning intent retains course/list
   materials; find/develop intent uses the existing tool filter.
3. Only a **successful, complete search with zero eligible candidates** may try
   the precomputed alternative. An eligible candidate with unknown conditions
   stops fallback, even if it later receives a README error.
4. Rank with the existing criteria and fetch at most five READMEs total.

The whole task uses at most two Search calls and five README GETs. Incomplete
Search, errors, rate limits and timeouts never become zero recall. README 404
stays `partial`/exit 5; it does not cause another search or candidate replacement.
The public examples do not claim a real fallback has happened.

JSON keeps `format: compass-discovery-v1.1` and the existing `plan.method` values
(`explicit_query` or `replay_queries` for this path). Optional `plan.semantic`
records external/unverified provenance, the validated input, and a SHA-256 of
its JSON serialization (not the formatted file bytes). Optional `query_execution`
records planned/actual queries, replay status and the fallback reason. Its reason
is `primary_empty`, `primary_has_candidates`, `primary_incomplete`,
`primary_failed`, `no_alternative`, or `replay_actual_queries`. `plan.queries`
contains the actual attempted queries. Failed searches retain execution metadata
in `failure.json` as well.

Conditions and unknowns are displayed separately. Each candidate's optional
`external_conditions` remains `unknown`. Mentions, negations, roadmap items and
missing documentation do not automatically establish support/non-support or a
score. Existing capability evidence qualification is retained. No candidate is
installed or executed.

## Clarification and compatible modes

```sh
node dist/src/cli.js "我只知道想做一款给老人用的软件，功能还没想好" --semantic-plan examples/semantic-plan-clarification.json --json
```

An explicit question returns `needs_clarification`/exit 2, with no request or
report directory. `unclear` intent alone may still have a concrete core and does
not invent a question.

- `--query` and `--semantic-plan` are mutually exclusive; neither silently wins.
- `--import-ai` cannot be combined with a semantic plan. Existing AI import stays
  offline and unchanged.
- `--prepare-ai` can export captured candidates as before. It does not generate
  this semantic plan or call a model; AI v1 contracts remain unchanged. The
  separate `semantic-plan.json` preserves the external conditions alongside the
  existing export files. No-candidate exports still fail with a diagnostic.
- Default rules, ordinary `--query`, existing capture arrays, AI v1 files and
  persisted SQLite/report contracts remain usable without the new option.

## Offline replay

Use the saved snapshot to retain its declared intent/conditions:

```sh
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan ".compass/discovery/<run-id>/semantic-plan.json" --replay ".compass/discovery/<run-id>/captures.json" --out ".compass/replay-new"
```

Replay uses only archived query order and attempted README order/hashes, never a
new fallback or missing material. Even if a different external plan is supplied,
its newly generated queries are not sent or requested from the archive. Changed
semantic labels remain unverified current context, not proof of the original
capture's interpretation. An explicit clarification still returns exit 2.

Exit 2 also covers invalid files/conflicting modes; exit 4 covers an existing or
unwritable destination; exit 5 covers network/partial results. Retain failed
captures and choose a new directory for a later run. Do not replace credentials
or repeatedly retry rate limits. Report limitations and source errors separately
from candidate relevance and untested hard requirements.

The six post-implementation inputs in
[semantic-validation-cases.json](../tests/fixtures/semantic-validation-cases.json)
were created after the recorded design/implementation freezes. Their synthetic
CLI tests prove contracts and budgets, not semantic accuracy or independent
generalization. [Delivery evidence](ISSUE_4_DELIVERY.md) records actual commands,
bounded live runs, failures and remaining limits.
