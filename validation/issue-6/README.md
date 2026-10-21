# Issue #6 verification evidence

The source under test is the exact merged main commit
`0102201a4246ebc9c2aa704b117f86ec108efe61`, checked out as a new detached Git
worktree at `/workspace/.delivery/project-compass/issue-6/clean-main`.
It had no `node_modules`, `dist`, or uncommitted files before installation.
This is a fresh checkout on the same Codex machine, not an independent user.

## Provenance correction after P2 review

The v1 records did not save the executed preload's digest. The earlier
"byte-identical to the external file used" assurance is **withdrawn** for those
runs: comparing a preserved file later cannot prove which bytes a past process
loaded. [first-run.json](first-run.json) remains a historical live observation
with `executed_preload_identity_proven: false`; its recovered snapshot digest is
explicitly retrospective. No new live Search/README requests were made to repair
this omission. The original protocol and result values are not backdated.

[protocol-v2.json](protocol-v2.json) was frozen in commit
`d1b72ad55172cb73caa5deba69363ac37a18c115` **before the new offline execution**.
It pins the guard SHA-256
`e40634bc17e4f9c5172871e50d7100e68568580a48fab5feaaff7983a9dd5922`
and Git blob `14ed06fa06457f9f39b1846af63c38d7cf21c660`. The guard already exists
in `51da74b` and is unchanged in the freeze commit. New processes import that
tracked file from a detached checkout of the freeze commit, not an external copy.
Each new replay/probe record includes the freeze commit, protocol SHA-256, exact
argv, and matching **before/after** preload SHA-256 and blob checks. The prior
offline records remain available in the `51da74b` history; current files contain
the new runs, not retrofitted digests presented as old execution attestations.

- [provenance-checks.json](provenance-checks.json): a wrong digest is rejected
  before launch; a canary intentionally attempts one fetch and one https.request,
  both blocked before transport. These **two counted canary attempts are not
  mislabeled zero**. Includes the new offline build result and retained-input
  hash checks; [build stdout](provenance-build.txt).
- [replay.json](replay.json) and [friction-probes.json](friction-probes.json):
  fresh, hash-bound offline runs with zero fetch/HTTP/socket attempts, seven
  replay equalities and the five expected probe exits. They do not rerun or
  re-attest the historical live discovery.

## Original checks and retained materials

- [protocol.json](protocol.json): frozen in commit `8290583` before validation
  and real CLI requests, but **only the sample/budget, not the preload identity**;
  one existing public sample, at most 2 Search/5 README,
  no retries/replacements/candidate page GETs/model calls. One quota preflight
  is recorded separately from the six discovery requests.
- [execution.json](execution.json), [install](install.txt), [build](build.txt),
  [tests](tests.txt), [contracts](contracts.txt): exact commands, UTC times,
  exits and SHA-256 hashes of complete local validation stdout/stderr.
- [first-run.json](first-run.json): instrumented native CLI command, real
  request URLs/statuses, response hashes and local artifact inventory. It
  records 1 Search + 5 README, all HTTP 200, complete/exit 0. No synthetic
  transport was used, and no candidate-quality scoring was performed.
- [replay.json](replay.json): new v2 native CLI on saved responses, exit 0;
  every equality check passed, global fetch and HTTP/socket counts all zero.
- [friction-probes.json](friction-probes.json): exact malformed/missing-file,
  mismatched-idea, existing-output and clarification probes, expected exits,
  diagnostics and zero-network counts; not a usability study.
- [network-guard.mjs](network-guard.mjs): audit-only preload, pinned by v2 for
  the new offline runs only. `COMPASS_SMOKE_MODE=live`
  permits only the frozen queries and bounded GitHub Search/README requests;
  any other mode blocks fetch/HTTP/socket calls. It writes counts to
  `COMPASS_SMOKE_METRICS` on process exit. It does not alter planning, analysis,
  saved responses or output rendering and is not part of the product CLI.

The exact instrumented argv, environment overrides and digests are in the JSON
files. To reproduce offline, check out the main source and the verifier freeze
commit separately, build the main source, verify the guard and protocol hashes,
and use the recorded replay/probe argv with your retained captures and new output
directories. Verify the same hashes again after each process. No network-enabled
rerun is part of v2. The public README commands omit the audit-only preload.
Historical anonymous-IP conditions remain unverified.

Full captured third-party README bodies, raw reports and live stdout remain
only in the ignored `.compass/semantic-example*` directories and the local
delivery workspace. Published inventories/hashes do not substitute for an
independent download of all raw artifacts. GitHub CI is a separate source of
evidence: [PR #7 checks](https://github.com/starsstring/project-compass/pull/7/checks)
and its final delivery comment bind the successful run to the latest head;
the local 313-test count must not be mislabeled as independently read CI stdout.
