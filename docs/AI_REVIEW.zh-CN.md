# 可选 AI 分析

[English](AI_REVIEW.md) | 简体中文 · [使用说明](USAGE.zh-CN.md) · [首页](../README.zh-CN.md)

Compass 可以把已采集的仓库材料导出，供你自行选择的助手分析，再导入结构化结果。资料导出和导入属于本地文件流程：它们不会额外调用 AI 分析模型或处理模型 API Key，也不能验证结果由哪个助手生成。若同时使用 `--local-model`，Compass 此前已经调用用户选择的 Ollama 模型生成检索计划，导出的说明会标明这一来源；Ollama 本身可能按用户配置调用云端模型。检索和规则报告不依赖此步骤。帮助、报错、任务说明及报告文字目前以中文为主。

## 1. 导出材料

```powershell
npm run compass -- "本地 Markdown 笔记工具" --prepare-ai --out ".compass/ai-job"
```

这会执行正常的匿名 GitHub 检索，在 `report.md`、`report.json`、`captures.json` 之外增加四个文件：

| 文件 | 用途 |
|---|---|
| `ai-input.json` | 带版本的资料包：创意、检索词、候选元数据、来源全文、哈希、状态和提示 |
| `ai-sources.md` | 相同来源文字，附来源 ID 和行号，供引用 |
| `ai-instructions.md` | 给助手的任务，含输入哈希和证据规则 |
| `ai-review.schema.json` | 助手返回 JSON 须遵循的 Schema |

若要不新增网络请求，用已有响应重放，并沿用原创意和原来显式指定的检索词：

```powershell
npm run compass -- "本地 Markdown 笔记工具" --replay ".compass/first-run/captures.json" --prepare-ai --out ".compass/ai-job-offline"
```

中英文检索规则不变；陌生中文主题需用 `--query` 明确检索词。重放不会补抓缺失材料。导出至少需要一个有来源材料的候选；没有候选时先调整检索。部分完成的检索可导出 `status: "partial"` 的资料包，须保留并阅读提示。导出不会把部分材料变为完整调查。

## 2. 单独交给助手

发送给任何服务前先检查资料包。它包含你的创意、检索词，以及已采集的完整 README、简介、元数据和时间。Compass 只在本地写入这份待分析资料包，不会自动将导出的资料文件发送给 AI 分析服务；如果启用了 `--local-model`，原始创意此前已发送给用户配置的 Ollama 接口用于检索规划。

把 `ai-instructions.md`、`ai-input.json`、`ai-sources.md`、`ai-review.schema.json` 交给你选择的助手，要求按说明和 Schema 返回 UTF-8 JSON，例如保存为 `.compass/returned-analysis.json`。返回文件是 `format: "compass-ai-review-v1"` 的分析对象本身，不是后续导入生成的结果信封。保留原资料包不变。

仓库文字是不可信数据，不是给助手的指令。导出的任务要求助手仅分析包内材料，不联网、不安装依赖、不执行仓库代码、不发消息、不发布内容。来源材料和助手分析均不代表安装或运行实测。

## 3. 导入返回的 JSON

```powershell
npm run compass -- --import-ai ".compass/returned-analysis.json" --ai-input ".compass/ai-job/ai-input.json" --out ".compass/ai-review"
```

导入时**不传创意位置参数**，须提供助手实际分析的那份输入包，不能混用 `--prepare-ai`、`--replay`、`--query` 或 `--limit`。支持 `--json`；向其他程序传递 stdout 时直接调用 `node dist/src/cli.js`，避免 npm 提示文字混入。

导入全程离线，在新建输出目录前完成校验，不覆盖已有输出，成功后保存：

| 文件 | 用途 |
|---|---|
| `ai-review.md` | 中文报告，分列作者陈述、推断、未知、条件比较和待验证方向 |
| `ai-review.json` | `compass-ai-review-result-v1` 结果信封，含分析正文、导入时间、输入哈希和校验边界 |
| `ai-input.json` | 本次校验使用的输入包副本 |

输入包上限 8 MiB，返回分析上限 1 MiB。数据/参数有误退出 2，输出 I/O 失败退出 4，导入校验通过退出 0。正常检索遇网络失败或部分完成退出 5，即使已导出部分 AI 材料。完整退出码见 [使用说明](USAGE.zh-CN.md#错误处理)。

## 证据格式与校验边界

严格、带版本的 Schema 不接受额外字段，每条声明只能属于以下一种类型：

| 类型 | 证据要求 |
|---|---|
| `author_statement` | 归属于一个候选作者的陈述，引用同一仓库的来源 ID 和真实行范围 |
| `inference` | 推断，用 `basis_ids` 指向作者陈述或其他推断，并列出 `assumptions` 前提 |
| `unknown` | 尚未确认的事项，说明 `reason`；不能用来证明某功能存在 |

引用的来源、依据声明、未知项和推荐方向都须存在。声明 ID 不得重复，推断依据不得循环；引用不能越界，每处最多 25 行；比较须覆盖全部候选。列有能力依据的候选判断，其来源链须包含该候选的作者陈述；没有已支持能力时，可以使用空依据并明确未知。可提出零至三个方向，每个方向须写明条件、最小动作、验证输入/步骤/预期输出和停止条件。无方向时，`recommended_first_step.direction_id` 须为 `null`。

分析的 `input_sha256` 须匹配校验后的资料包。哈希和引用检查能发现结构不一致，把结果绑定到该包；它们不能判定语义真伪、引用是否支持正文、作者陈述与推断是否混写，也不能证明来源文字或生成者身份真实。结果会明确记录 `semantic_support: "not_checked"` 和 `generator_identity: "not_verified"`。导入成功不能证明任务适配、真实需求、功能缺失或软件运行表现。做决定前仍需阅读引用行、保留的部分完成提示和实际验证方案。
