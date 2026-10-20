# Issue #4 implementation freeze

Baseline: v0.2.0, `85241267113a81ab190f598281a659752c8ea3b5`.
This design is frozen before implementation and before creating the six new
validation inputs. Those inputs will be created only after the implementation
and initial regression checks; they are not independent human blind tests.

## Interface and trust

- Add explicit `--semantic-plan <JSON>`; reject combining it with `--query` or
  AI review import. Default rules and existing explicit-query behavior stay intact.
- Publish a strict version-1 JSON Schema and a runtime validator. Bound the file
  to 32 KiB; bound all fields/arrays, reject extra fields, controls, invalid UTF-8,
  query operators and mismatched original ideas. English object/action phrases
  contain only ASCII letters/digits/hyphens/spaces; the combined query has at most
  four whitespace words and 100 characters. Reject excess rather than truncate.
- Require intent, core (nullable only with a clarification), required conditions,
  excluded conditions, unknowns and a nullable clarification. An alternative core
  phrase is optional. Unclear intent alone does not require clarification when
  the task is concrete. An explicit clarification causes exit 2 before network
  access or output-directory creation.
- The source is always external/unverified. No model calls, billing, credentials,
  repository answers or automatic semantic correctness claims are added.

## Search and reporting

- Deterministically join object + action, normalize case/spaces, and deduplicate
  an optional alternative. Do not add conditions or private original text.
- Reuse the current GitHub client, eligibility filter, ranking and evidence
  pipeline. For this opt-in strategy only, stop after a successful first search
  with eligible candidates. Run the precomputed alternative only if that first
  search is complete and has no eligible candidates. A filtered course/list is
  evaluated according to the declared external intent.
- Failed/incomplete searches never trigger fallback. README retrieval happens
  only for the final selected set: at most two Search calls (first ten each) and
  five README calls in total. README failures stay partial, not zero recall.
- Add optional report execution metadata (planned/attempted queries and fallback
  reason). Preserve metadata even in search failure output. Report actual queries;
  derive ranking terms from the queries actually attempted.
- Preserve required/excluded/unknown text separately and escape it in Markdown.
  Per-candidate external conditions remain `unknown`; keyword occurrence, plans
  or negations do not become support, exclusion filters or compatibility scores.
  Keep existing capability evidence qualification.

## Replay and compatibility

- Keep `compass-discovery-v1.1` and the captures array/body hashes unchanged.
  Add optional semantic provenance/condition/execution fields; do not modify
  persisted report/SQLite or AI v1 contracts.
- Save the validated external plan as `semantic-plan.json` in the ignored output
  directory. Replay with that snapshot preserves its declared intent/conditions.
- Replay always uses archived query order and captured README order; never run a
  newly generated fallback or fetch missing material. A changed external plan is
  still unverified context, not evidence of the original capture's understanding.
- Existing `--prepare-ai` may export captured candidates; it does not create a
  semantic plan or call a model. AI import remains unchanged.

## Validation and delivery

Add strict-input, controlled-query, clarification, negative-condition, actual
fallback-chain, request-budget, failure/partial and replay integration coverage;
retain all old tests. After initial implementation checks, freeze at least six
new inputs spanning long-tail/language conversion/offline/privacy/learning/
negation/clarification without tuning the planner to them. Record any subsequent
fixes and treat affected cases as known regressions. Run build, full tests and
contract checks, then preregister 2–3 bounded live inputs and a request cap.
Live captures/third-party full text stay ignored. Publish only safe summaries,
short citations and hashes. Finish with a Draft PR and one Issue #4 delivery
comment; do not merge, close the Issue, change the package version or release.

Compatibility refinement before the six new inputs: reuse the existing
`explicit_query` / `replay_queries` method values, identifying the external
strategy only through optional metadata. This keeps the existing method enum
usable by v1.1 consumers. An explicit clarification also precedes replay;
otherwise replay uses the archived queries. No new-input results informed this.
