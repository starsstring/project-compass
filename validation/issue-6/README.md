# Issue #6 verification evidence

The source under test is the exact merged main commit
`0102201a4246ebc9c2aa704b117f86ec108efe61`, checked out as a new detached Git
worktree at `/workspace/.delivery/project-compass/issue-6/clean-main`.
It had no `node_modules`, `dist`, or uncommitted files before installation.
This is a fresh checkout on the same Codex machine, not an independent user.

- [protocol.json](protocol.json): frozen in commit `8290583` before validation
  and real CLI requests; one existing public sample, at most 2 Search/5 README,
  no retries/replacements/candidate page GETs/model calls. One quota preflight
  is recorded separately from the six discovery requests.
- [execution.json](execution.json), [install](install.txt), [build](build.txt),
  [tests](tests.txt), [contracts](contracts.txt): exact commands, UTC times,
  exits and SHA-256 hashes of complete local validation stdout/stderr.
- [first-run.json](first-run.json): instrumented native CLI command, real
  request URLs/statuses, response hashes and local artifact inventory. It
  records 1 Search + 5 README, all HTTP 200, complete/exit 0. No synthetic
  transport was used, and no candidate-quality scoring was performed.
- [replay.json](replay.json): native CLI on saved responses, exit 0; every
  equality check passed, global fetch and HTTP/socket guard counts all zero.
- [friction-probes.json](friction-probes.json): exact malformed/missing-file,
  mismatched-idea, existing-output and clarification probes, expected exits,
  diagnostics and zero-network counts; not a usability study.
- [network-guard.mjs](network-guard.mjs): audit-only preload, byte-identical
  to the external file used in the recorded commands. `COMPASS_SMOKE_MODE=live`
  permits only the frozen queries and bounded GitHub Search/README requests;
  any other mode blocks fetch/HTTP/socket calls. It writes counts to
  `COMPASS_SMOKE_METRICS` on process exit. It does not alter planning, analysis,
  saved responses or output rendering and is not part of the product CLI.

The exact instrumented argv and environment overrides are in the JSON files.
To reproduce, use a fresh checkout of the source commit, complete its four
validation commands, and replace the absolute preload/metrics paths with your
copy of the guard and a writable metrics file. The README commands omit this
audit-only preload. Set `NODE_USE_ENV_PROXY=1` only if your environment requires
the provided proxy. The client did not add Authorization; platform proxy
authentication cannot be ruled out, so anonymous-IP conditions are unverified.

Full captured third-party README bodies, raw reports and live stdout remain
only in the ignored `.compass/semantic-example*` directories and the local
delivery workspace. Published inventories/hashes do not substitute for an
independent download of all raw artifacts. GitHub CI is a separate source of
evidence: [PR #7 checks](https://github.com/starsstring/project-compass/pull/7/checks)
and its final delivery comment bind the successful run to the latest head;
the local 313-test count must not be mislabeled as independently read CI stdout.
