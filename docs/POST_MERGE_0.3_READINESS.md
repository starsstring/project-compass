# v0.3 experimental source — post-merge readiness (working draft)

> Status: **not a release approval**; issue [#6](https://github.com/starsstring/project-compass/issues/6). Last independently checked on 2026-10-21. Items labeled pending have **not** been verified.

## Verified historical facts

| Item | Evidence | Interpretation |
| --- | --- | --- |
| Source merged into `main` | [PR #5](https://github.com/starsstring/project-compass/pull/5), merge commit `0102201a4246ebc9c2aa704b117f86ec108efe61` | Experimental code present in default branch |
| Post-merge CI | [GitHub Actions run 39550707734](https://github.com/starsstring/project-compass/actions/runs/39550707734) `push`, `success` | Existing automated steps passed on the merge commit; not a manual end-user smoke test |
| P2 fallback-replay fix | PR #5 commit `87192901c7f4e65c62f8ac8b92226bad9b8e66ce`; original Codex review + subsequent independent review | Archived search count is not used to assert historical semantic fallback. In replay the fallback state is `null` (unknown). |
| Published artifact | [v0.2.0 pre-release](https://github.com/starsstring/project-compass/releases/tag/v0.2.0); `package.json` at main has version 0.2.0 | **There is no v0.3.0 tag or release.** Source merge is not a release. |

The previously completed [Issue #3](https://github.com/starsstring/project-compass/issues/3) three-query-method research and [Issue #4](https://github.com/starsstring/project-compass/issues/4) validation are **not** independent blind benchmarks. For the semantic experiment, the CLI reads externally supplied JSON; it does not generate a plan or call a model. Three bounded live checks from Issue #4 did not exercise real fallback, and the OpenAPI translation search returned an unrelated Morse-code project. Conditions remain unverified rather than asserted as met.

## First-run user path — documented, not yet independently executed for this issue

From a clean checkout of the merged `main` with Node.js 24.19.x and npm 12.2.0:

```sh
npm ci
npm run build
npm test
npm run check:contracts
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan examples/semantic-plan.json
```

Use the `captures.json` and `semantic-plan.json` paths shown by the output directory for a **new-output-directory** `--replay` run; see the [Chinese guide](SEMANTIC_PLAN.zh-CN.md) or [English guide](SEMANTIC_PLAN.md). Only the short search terms go to GitHub. Captures and reports can contain public third-party source text; never publish whole captured READMEs by default.

**Still pending (do not interpret this draft as verification):**

- [ ] A second clean Node 24 checkout independently ran the four commands above and retained exact stdout/exit codes.
- [ ] Exact live/synthetic mode and any network/permission blocker recorded for a CLI first-run smoke (maximum 2 Search + 5 README; sample frozen before live use).
- [ ] First-run output path, report/captures and replay request equality/zero external-network calls independently verified.
- [ ] New PR head CI success independently verified, and the final deliverable audited.

## Friction audit (inspectable design facts; not a user study)

- **External plan burden:** Users must know the JSON fields, create a file matching the original input verbatim, and supply English core object/action words; the CLI does **not** invoke a model. This is the largest first-run obstacle for a nontechnical Chinese-speaking developer.
- **Two separate AI workflows:** `--prepare-ai` exports GitHub materials for an external assistant after discovery; it is not a pre-search semantic planner. Do not conflate the two.
- **Evidence interpretation:** README descriptions and keyword matches are author claims or textual relevance, not installation checks, market demand, privacy guarantees or proven hard-condition compliance.
- **Documentation drift:** `main` previously claimed the experiment was still awaiting independent review. The companion README corrections in this Draft PR align status without changing CLI behavior.

## One candidate next experiment after issue #6 passes

**Unassisted first-run trial (not yet authorized as a feature build):** give two independent, previously uninvolved users the public README and an unfamiliar project-finding task. Without telling them how to make the JSON, observe whether they can get a provenance-aware report and identify one relevant known/unknown distinction. Record completion, minutes, assistance, incorrect claims, and exact stumbling steps; do not collect private search text or access credentials. Compare with the same participants using ordinary ChatGPT or direct GitHub search on the same task, and disclose small-sample and ordering effects.

**Decision gate:** if new users cannot finish the external-plan path, prioritize the smallest remedy for plan preparation/user guidance rather than adding scoring, a UI, or a model API. If Compass adds no meaningful evidentiary or decision value beyond existing tools, shrink or redirect the product rather than claiming success.

**Release gate:** No `v0.3.0` tag or GitHub Release, no version bump, and no merge of this documentation PR without separate user approval.
