# 0.2.0 input planning / 输入规划

The CLI uses finite vocabulary, intent rules, and Node's built-in `Intl.Segmenter`. No translation service, model API, keys, new dependencies, or agent framework is involved. This improves some requests; it is not general language understanding.

CLI 使用有限词表、意图规则与 Node 自带中文分词。它不接翻译服务、模型 API、Key 或多代理框架，也不保证理解全部输入。

## Behavior / 行为

- Keep the original request in `plan.idea`. Infer find/build/learn/unclear intent with a reason; compound or implicit intent may be wrong.
- 保留原句；意图带规则依据，未明确的意图保留未知。找项目和学习不再默认给新产品开发方向，学习检索保留课程/资源清单。
- Compose domain words and positive requirements into up to two searches: a targeted query (including README text where appropriate) and a less restrictive query. Existing English free-text queries and explicit `--query` remain usable.
- 重要条件、否定条件、未映射中文要点单独展示。否定条件不自动加 GitHub 排除词，以免删掉只是提及该词的仓库；复杂否定和重复冲突仍可能误读。
- Unknown Chinese topics use Chinese segmentation instead of requiring English GitHub syntax. This can miss English-only projects. Unmapped words beside a known topic stay visible but may not enter a query.
- 模糊请求先澄清：不联网、不创建报告，退出码 2；`--json` 返回 `{ "status": "needs_clarification", "plan": ... }`。不是搜索成功，也不是断定一个项目。
- Ranking first checks main-topic words in metadata, then requirement words and targeted-query hits, followed by existing phrase/term criteria. It does not rank by stars or license. Keyword matches can still be irrelevant.
- 条件表只说“出现相关文字/尚未核实”，可能包含否定、计划或无关语境；不能看作支持，更不是安装实测。原能力证据提取保留自己的限定规则。

## Compatibility / 兼容

- The discovery format remains `compass-discovery-v1.1`, with optional `plan.understanding`, `plan.topic_terms`, and candidate `requirement_clues`. `plan.method` adds `replay_queries`. JSON consumers should allow these additions. SQLite and stored-report schemas are unchanged.
- 离线重放默认读取留档中的查询与已尝试候选顺序，防止规划/排序改变后要求一份从未采集过的 README；不会联网补齐。显式 query 可覆盖，但仍必须存在于留档。
- AI input/review contracts stay at v1. The full original request and a requirements reminder are passed through existing fields. Export/import still does not call a model, and validation does not prove semantic support.

## Limits / 限制

No repository names or expected project answers are embedded in the planner. Examples used during development are not blind tests. Finite translation vocabulary, heuristic intent/negation, first-ten search coverage, and text-based ranking remain limitations. Independent testing and real task outcomes are still needed.

规划器没有预置仓库名或指定答案；开发参考案例不是盲测。查询能生成、GitHub 返回候选或 README 有文字，都不能据此宣布任务成功或产品价值得到证明。

Repository search fields follow [GitHub's official repository-search documentation](https://github.com/github/docs/blob/main/content/search-github/searching-on-github/searching-for-repositories.md). Raw GitHub responses are retained per run rather than treated as permanent current facts.
