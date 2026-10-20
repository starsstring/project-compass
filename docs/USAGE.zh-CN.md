# 使用说明

[English](USAGE.md) | 简体中文 · [首页](../README.zh-CN.md)

先执行 `npm ci` 和 `npm run build`。正常使用不需要数据库、Token 或模型服务。支持英文创意输入；帮助、报错与报告文字目前以中文为主。

```powershell
npm run compass -- "本地 Markdown 笔记工具" --limit 3 --out ".compass/first-run"
npm run compass -- "校园宠物领养互助系统" --query "animal adoption" --query "pet adoption"
node dist/src/cli.js "本地笔记工具" --query "markdown notes" --json
node dist/src/cli.js --help
```

参数：`--query` 最多两条；`--limit` 为 1–5；`--out` 必须是新目录；`--json` 输出 JSON。直接调用 node 可以避免 npm 提示文字混入机器读取的 JSON。

`--prepare-ai` 额外导出供独立助手分析的本地资料；`--import-ai "analysis.json"` 与 `--ai-input "ai-input.json"` 一起离线导入结果，导入时不传创意位置参数。

## 离线复查

```powershell
node dist/src/cli.js "本地 Markdown 笔记工具" --replay ".compass/first-run/captures.json" --out ".compass/replay-1"
```

未指定 `--query` 时，自动复用留档中的查询及已尝试候选顺序，包括 V1 留档，不因新版规划改变而重搜。显式 query 仍须与留档一致。重放检查结构和哈希，不会联网补齐；报告保留原采集时间并明确标为重放。文件上限 16 MiB、最多七份响应，旧报告不会被覆盖。

## 可选 AI 分析

```powershell
npm run compass -- "本地 Markdown 笔记工具" --prepare-ai --out ".compass/ai-job"
# 从已有响应导出，不新增网络请求：
npm run compass -- "本地 Markdown 笔记工具" --replay ".compass/first-run/captures.json" --prepare-ai --out ".compass/ai-job-offline"
# 自行选择的助手返回 JSON 后：
npm run compass -- --import-ai ".compass/returned-analysis.json" --ai-input ".compass/ai-job/ai-input.json" --out ".compass/ai-review"
```

导入须使用助手实际分析的那份资料包。可配合 `--json` 和 `--out`，不能同时传创意、`--prepare-ai`、`--replay`、`--query` 或 `--limit`。导入全程离线，在新建输出目录前完成校验；成功后保存 `ai-review.md`、包含分析正文的结果信封 `ai-review.json`，以及 `ai-input.json` 副本。

程序没有模型调用或 Key 配置。导出包含已采集的完整 README，默认只留本地；发送给任何服务前先检查内容，仓库文字是不可信数据，不是指令。四份导出文件、助手步骤、严格格式与校验边界见 [AI 分析说明](AI_REVIEW.zh-CN.md)（[English](AI_REVIEW.md)）。

## 结果解读

候选最多五项；相关性表示文本匹配，不保证适合你的平台和任务。功能表的“作者提及”“存在限制/冲突”“材料未确认”须分别理解。建议包含已有能力证据、最小改动、验证方法及停止条件；它们是候选验证方向，不是已证实的市场空缺。

每条检索只读取 GitHub 前十项，过滤归档和 Fork；学习意图保留课程/资源清单，工具检索仍过滤明确清单。许可证元数据未知或为 `NOASSERTION` 的公开项目仍可成为竞品候选，附带复用前读取实际 LICENSE 和依赖条款的提示。相关性排序不使用许可证元数据或 Star 数。链接和默认分支可以变化；本地响应、时间、blob 标识及哈希用于复查，不代表整个仓库固定于同一提交。

识别为计划或未来的陈述不建立当前能力，明确否定及支持冲突保留限定。规则覆盖常见中英文表达和嵌套路线图标题，但不是完整语义理解；复杂混合句或陌生表达仍可能漏判、误判，使用比较结果前须核对引用原文。

## 错误处理

| 退出码 | 含义与下一步 |
|---|---|
| 0 | 有限检索完成（可能零候选），或 AI 导入通过结构/引用校验 |
| 2 | 需要澄清，或数据/参数有误；`--json` 时澄清返回 `status: needs_clarification`，不联网/创建报告目录。补充自然语言即可重试 |
| 4 | 输出目录已存在或写入失败；选择新目录 |
| 5 | 网络、限流或部分完成；保留现有结果，稍后换新目录重试 |

匿名 API 配额较小。遇到限流不会无限重试；网络失败不会被写成“没有竞品”。失败时尽量保存 `failure.json` 和已有响应。重试时保留原报告并使用新目录。
