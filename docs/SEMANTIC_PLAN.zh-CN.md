# 外部语义计划（实验原型）

[English](SEMANTIC_PLAN.md) | 简体中文 · [首页](../README.zh-CN.md)

这是 Issue #4 的显式可选入口：读取用户自行准备的 JSON，不调用模型，不自动生成计划，不验证生成者或语义正确性。普通输入继续使用既有有限规则。包版本仍为 0.2.0；本原型不是 0.3.0 发布。

## 可复制示例

使用 Node 24.19.x / npm 12.2.0，按锁文件安装、构建。原句必须与文件的 `idea` 一致（CLI 首尾空白会被去掉）：

```sh
npm ci
npm run build
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan examples/semantic-plan.json
```

这是 Issue #3 已公开的回归/示例，不是盲测或候选适配证明。程序在新的 `.compass/discovery/<run-id>/` 保存 `report.md`、`report.json`、`captures.json`、校验后的 `semantic-plan.json`。可加 `--json`，或以 `--out <新目录>` 指定位置。

文件格式见[示例](../examples/semantic-plan.json)和[严格 Schema](../contracts/semantic-plan-v1.schema.json)：

| 字段 | 含义与边界 |
|---|---|
| `version` | 数字 `1`；拒绝其他版本、多余字段 |
| `idea` | 4–2000 字符的原始单行需求 |
| `intent` | `find_project/develop/learn/unclear`，只是外部声明 |
| `core` | 英文 `object` 和 `action`；只有提供澄清问题时才允许为 null |
| `alternative` | 可选或 null 的另一组 `object/action` |
| `required_conditions` | 必须条件，最多16项，每项1–200字符且不为空白 |
| `excluded_conditions` | 排除条件，同上；不自动删除候选 |
| `unknowns` | 未确定项，同上；空列表不证明没有未知 |
| `clarification` | null 或不超过200字符的非空问题 |

文件最多32 KiB，须为普通 UTF-8 JSON 文件。拒绝控制字符、终端转义、双向控制字符、未知字段、非法结构和不匹配的原句。核心短语以字母开头，仅含英文字母/数字及单空格、连字符，每字段不超过64字符；合并后最多4个空格词、100字符，拒绝布尔操作符和检索语法。超限报错，不截断。合并长度等跨字段边界由运行时在 Schema 之外继续校验。

只有核心/同义英文查询词发往 GitHub，完整原句和条件列表不发送。请检查外部词语，不把这个边界误解为自动隐私或语义正确性保证。

## 有限回退与证据

先按 `object + action` 拼接、小写化、去重，不把所有条件、否定或中文原句串成 AND 检索。

1. 首查只读取前页最多10项。
2. 复用原有筛选；学习意图保留课程/资料清单，找项目/开发意图使用既有工具筛选。
3. 仅首查**成功、完整、筛选后零候选**时，执行预定的第二条。只要有可纳入候选，即使硬条件未知、之后 README 404，也不回退。
4. 使用既有排序，最终最多读取5份 README。

整次任务最多2次 Search、5次 README GET。不完整搜索、限流、网络错误、超时不当作零召回；README 404 保留 partial/退出5，不补搜或替换候选。公开示例并不保证实际触发回退。

报告仍为 `compass-discovery-v1.1`，沿用 `plan.method` 的 `explicit_query/replay_queries` 值。新增可选 `plan.semantic` 保存外部未验证来源、原计划及结构化 JSON 序列化哈希（不是格式化文件的字节哈希）；`query_execution` 保存预定/实际查询、重放与回退原因。原因为 `primary_empty/primary_has_candidates/primary_incomplete/primary_failed/no_alternative/replay_actual_queries`。`plan.queries` 是实际尝试的查询；搜索失败时 `failure.json` 也保留执行元数据。

必须、排除、未确定项分别展示。每个候选的 `external_conditions` 一律为 `unknown`；文字命中、否定、计划或没写不能自动变成满足/不满足或评分。既有能力证据的否定/未来限定仍保留。程序不安装执行候选项目。

## 澄清与模式组合

```sh
node dist/src/cli.js "我只知道想做一款给老人用的软件，功能还没想好" --semantic-plan examples/semantic-plan-clarification.json --json
```

有明确澄清问题时，返回 `needs_clarification`/退出2，不联网、不创建报告目录。仅意图 unclear 而核心具体时不凭空追问。

- 与 `--query` 互斥，不能静默覆盖。
- 与 `--import-ai` 互斥；旧 AI 导入仍离线且含义不变。
- 可配合 `--prepare-ai` 导出已有候选材料；它不会生成语义计划或调用模型，AI v1 协议未改。旁边保存的 `semantic-plan.json` 单独保留外部条件。零候选仍无法准备 AI 材料，并保留诊断。
- 不加新选项时，原规则、显式查询、captures 数组、AI v1 和 SQLite/报告契约继续使用。

## 离线重放与故障

使用保存的语义快照保留原声明的意图/条件：

```sh
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan ".compass/discovery/<run-id>/semantic-plan.json" --replay ".compass/discovery/<run-id>/captures.json" --out ".compass/replay-new"
```

重放只使用留档实际查询和尝试过的 README 顺序/哈希，不重新决定回退、不联网补材料。即使改了外部计划，也不会执行新查询；变化后的语义标签只是当前未验证上下文，不证明原采集时的理解。显式澄清仍退出2。

captures 数组没有原始查询策略的来源记录，所以语义回放中的 `query_execution.fallback.attempted` 为 `null`，原因仍为 `replay_actual_queries`；Markdown 明示“原始回退状态不可证明（未知）”。一条或两条留档搜索均如此，即使留档实际上来自语义回退，也不能凭次数或当前计划证明历史决策。读取这份可选实验元数据时，必须区分 `null`（未知）与 `false`（未尝试）。实时运行仍记录 `true/false`；不加 `--semantic-plan` 的普通报告不变。

退出2也表示非法文件/模式冲突；退出4表示目标已存在或写入失败；退出5表示网络错误或 partial。保留原结果，重试时换新目录；不要为限流更换身份或凭据。来源失败、候选相关性与硬条件未实测分别报告。

[六条实现冻结后创建的输入](../tests/fixtures/semantic-validation-cases.json)用于首次验证，仍不是独立人类盲测；它们的合成传输 CLI 测试只证明软件契约/预算，不证明候选适配或泛化。[交付证据](ISSUE_4_DELIVERY.md)记录实际命令、有限真实请求、失败与限制。
