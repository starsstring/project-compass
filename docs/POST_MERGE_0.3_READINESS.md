# v0.3 experimental source — post-merge readiness

As of 2026-10-21; [Issue #6](https://github.com/starsstring/project-compass/issues/6), [Draft PR #7](https://github.com/starsstring/project-compass/pull/7). **Engineering evidence, pending independent acceptance; no release approval.**

## Verified behavior and source state

The experiment and P2 replay fix were merged in [PR #5](https://github.com/starsstring/project-compass/pull/5), `main@0102201a4246ebc9c2aa704b117f86ec108efe61`; [main push CI](https://github.com/starsstring/project-compass/actions/runs/39550707734) passed. Package version remains **0.2.0**, latest release is [v0.2.0 Pre-release](https://github.com/starsstring/project-compass/releases/tag/v0.2.0); no v0.3.0 tag/release. This PR changes documentation and verification evidence, with no product source, tests, contracts, dependencies or workflow changes.

| This issue's new check | Actual observation | Evidence |
|---|---|---|
| Fresh detached checkout of that exact main commit, initially without node_modules/dist | Linux x64, Node 24.19.0 / npm 12.2.0: `npm ci`, build, test and contracts exit 0; **313 pass, 0 fail/skip** | [Commands, times, stdout hashes](../validation/issue-6/execution.json) |
| Historical native CLI with the existing public point-cloud plan | Reported exit 0, complete; 1 Search + 5 README, all HTTP 200; four output files, five candidates; no fallback. Executed preload identity was not recorded, so its enforcement is not attested | [Original sample/budget protocol](../validation/issue-6/protocol.json), [historical record and provenance limit](../validation/issue-6/first-run.json) |
| Fresh v2 replay of the retained plan/captures | exit 0; **0 fetch / 0 HTTP or socket attempts**; actual queries, searches, candidate order/READMEs, request metadata, entire captures and plan equal; guard/protocol digests pinned before execution and checked before/after | [V2 protocol](../validation/issue-6/protocol-v2.json), [new replay record](../validation/issue-6/replay.json) |
| Five controlled first-run error/clarification probes | Expected exits 2/4; zero network, no new output on input/clarification errors, existing report preserved | [Exact commands and diagnostics](../validation/issue-6/friction-probes.json) |
| GitHub CI for this PR | Existing workflow runs four required commands against exact PR head; final head/run verification is recorded in the delivery comment | [PR checks](https://github.com/starsstring/project-compass/pull/7/checks) |

These are Codex checks in a new clean directory on the same machine, **not** a second human evaluator or independent user test. GitHub CI is separate hosted execution. The historical record reports use of the platform proxy without a client Authorization header; proxy-injected authentication cannot be ruled out, so this is not proof of a purely anonymous environment. No synthetic replacement run was reported. No candidate was installed or executed. Raw third-party captures/reports stay local; public evidence contains metadata and hashes.

**P2 evidence correction:** the original sample/budget freeze did not bind the executed preload. The earlier byte-identical execution assurance is withdrawn; adding a retrospective digest cannot prove it. Only the new offline replay/probes use the precommitted verifier and recorded before/after digests. [Provenance checks](../validation/issue-6/provenance-checks.json) include a rejected wrong digest and two intentional, blocked canary attempts, separate from zero-attempt CLI runs. No new live discovery requests were made; historical live enforcement remains unproven.

## Reproduce the first-run path

From the exact main commit with the runtime above, run the four commands in [execution.json](../validation/issue-6/execution.json), then the two commands in the [English README](../README.md#try-the-merged-experiment-optional) / [中文 README](../README.zh-CN.md#试用已合并的实验入口可选). They use new `.compass/semantic-example` and `.compass/semantic-example-replay` directories, so no run-ID substitution is needed. Prepare JSON externally; Compass does not generate it or call a model. The [audit index](../validation/issue-6/README.md) explains instrumentation and retained artifacts.

## First-run friction audit — developer inspection, not a user study

| Friction | Observed basis and current limitation |
|---|---|
| External JSON preparation | Exact original idea, English object/action, conditions and schema must be supplied by the user/external tool. The public example works, but it does not establish that a new Chinese-speaking user can prepare a new valid plan unaided. |
| Chinese guidance | README, guide, schema link, examples, exits and replay are available. Fixed output paths remove manual run-ID copying. Node/npm versions are now explicit. No Windows/macOS or nontechnical-user execution was observed. |
| Error recovery | Missing-file and idea-mismatch diagnostics state what to check; existing-output errors require a fresh directory. Schema failures list categories but **do not locate the offending field**; the user must consult the schema/guide. Recorded rather than expanding into a product fix. |
| Unknown evidence | All 20 candidate-condition entries remain unknown; Markdown explicitly says conditions are unverified. Replay separately states that the original fallback status is unknown (`null`), not that fallback happened or was disproved. `--prepare-ai` remains a later material-export flow, not plan generation. |

## Decision and one next experiment

**Conditional engineering readiness for a labeled Linux source preview remains subject to independent acceptance, including the historical live provenance gap.** Install/build/contracts, full offline tests and first-run artifacts were recorded; zero-network replay is now freshly bound to the committed guard. This repairs new offline evidence, not the original live execution attestation. Final PR-head CI and acceptance must still be assessed at the linked checks/delivery; this is not authority to merge, bump version, tag or publish. Packaged release artifacts and cross-platform installation remain unchecked.

Search quality, external-plan semantics and hard-condition satisfaction are still unproven. This known example is not blind or a repeat of Issue #3/#4 research. Real GitHub semantic fallback remains unexercised; Issue #4's unrelated OpenAPI/Morse-code result and README404/partial case remain failures/limits. No satisfaction, market-value or accuracy claim follows from successful commands.

**Only recommended next experiment (not executed or authorized here): external-plan preparation walkthrough.** Chosen because copying the public example does not test the prerequisite of preparing a new plan. Give two previously uninvolved Chinese-speaking developers the public instructions and one unfamiliar, nonprivate task. Without author coaching, ask each to prepare a plan and explain a known/unknown distinction; an observer checks it offline with the existing validator. Record time, help and the first incorrect field, not satisfaction or retrieval scores. Stop after one attempt per person or 15 minutes: if both succeed unaided, stop adding onboarding features; if either fails, propose only the smallest instruction/example correction at the first observed obstacle. Do not build a model service, UI or new scoring on this evidence.
