# 使用说明

先执行 `npm ci` 和 `npm run build`。正常使用不需要数据库、Token 或模型服务。

```powershell
npm run compass -- "本地 Markdown 笔记工具" --limit 3 --out ".compass/first-run"
npm run compass -- "校园宠物领养互助系统" --query "animal adoption" --query "pet adoption"
node dist/src/cli.js "本地笔记工具" --query "markdown notes" --json
node dist/src/cli.js --help
```

参数：`--query` 最多两条；`--limit` 为 1–5；`--out` 必须是新目录；`--json` 输出 JSON。直接调用 node 可以避免 npm 提示文字混入机器读取的 JSON。

## 离线复查

```powershell
node dist/src/cli.js "原来的创意" --replay ".compass/discovery/原运行号/captures.json" --out ".compass/replay-1"
```

原运行如果指定过 `--query`，重放时也需给出相同检索词。重放检查文件结构和响应哈希，不会联网补齐；报告保留原采集时间并明确标为重放。文件上限 16 MiB、最多七份响应，旧报告不会被覆盖。

## 结果解读

候选最多五项；相关性表示文本匹配，不保证适合你的平台和任务。功能表的“作者提及”“存在限制/冲突”“材料未确认”须分别理解。建议包含已有能力证据、最小改动、验证方法及停止条件；它们是候选验证方向，不是已证实的市场空缺。

每条检索只读取 GitHub 前十项，并过滤归档、Fork、明确的课程/资源清单及未识别许可项。排序不按 Star 数。链接和默认分支可以变化；本地响应、时间、blob 标识及哈希用于复查，不代表整个仓库固定于同一提交。

## 错误处理

| 退出码 | 含义与下一步 |
|---|---|
| 0 | 有限检索完成，可能零候选；阅读筛选原因 |
| 2 | 输入/参数有误；未知中文主题可指定英文 query |
| 4 | 输出目录已存在或写入失败；选择新目录 |
| 5 | 网络、限流或部分完成；保留现有结果，稍后换新目录重试 |

匿名 API 配额较小。遇到限流不会无限重试；网络失败不会被写成“没有竞品”。失败时尽量保存 `failure.json` 和已有响应。不要为了重试删除原报告。
