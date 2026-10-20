# 0.2.0 最终发布检查（2026-10-20）

后续状态：本页保留当时的检查与阻断记录；维护者授权后的最小修复及新一次 252 项测试见 [修复验收记录](RELEASE_CHECK_0.2.0_FIX.md)。当前仍未批准实际发布。

依据：[维护者发布前检查要求](https://github.com/starsstring/project-compass/issues/1#issuecomment-6290907742)。本轮没有改产品、规则、排序、依赖或构建配置；只新增检查记录与 Release Notes 草稿。

**结论：需先解决一个验证脚本阻断，当前不执行发布。** 主要自动化检查通过，已接受的实验性检索限制不要求再次补词表。新发现的是 README 推荐的验证入口存在过期预期，不是要求扩大产品能力。

## 锁定范围与执行结果

- 受测候选：[dcc7469e40f3f9bb0aa45a76f9109d7ed311d169](https://github.com/starsstring/project-compass/commit/dcc7469e40f3f9bb0aa45a76f9109d7ed311d169)，完整树 `f6d6b58a35defe3d1e62d2f0f97f679b2e9993a4`。
- PR #2 对比 main `134943c027e6c86123363eb02b67ee962246f1ca` 共 36 个变更文件；本轮开始工作区干净，与远端 PR head 相同。后续仅有本轮报告/日志/诊断夹具，没有产品文件变化。
- 环境：Windows x64、Node **24.19.0**、npm **12.2.0**。`package.json`、锁文件顶层与根包版本均 **0.2.0**，CLI 帮助也是 0.2.0。
- 本轮从 **2026-10-20 20:36:48 到 20:37:19（UTC+8）**重新执行，完整精确 UTC 时间和退出码见 [execution.json](../validation/issue-1/release-check/execution.json)。没有把上轮 251 项日志当作本轮运行。

| 本轮实际命令 | 结果 | 新证据 |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | 锁文件安装通过，exit 0 | [install.txt](../validation/issue-1/release-check/install.txt) |
| `npm test` | **251/251**，失败/跳过/取消均 0，exit 0；包括 build、生成类型一致性和 TypeScript | [tests.txt](../validation/issue-1/release-check/tests.txt) |
| `npm run check:contracts` | 再次构建通过，Ajv strict 两份 Schema / 三样例通过，exit 0 | [contracts.txt](../validation/issue-1/release-check/contracts.txt) |

日志由实际子进程直接写入 UTF-8 文件，未筛选/改写，SHA-256 已记录。本轮没有新增真实 GitHub 候选检索；上轮 3 次真实 CLI / 14 个 HTTP 200 仍可在原 followup 记录复核，未冒称再次运行。

## 唯一新增阻断：公开验证脚本仍沿用 V1 的失败预期

`scripts/validate-v1-live.mjs` 末尾把“面向校园宠物领养的互助系统”作为不支持的输入，要求退出码 2；0.2.0 已能为它规划 `pet adoption campus community …` / `pet adoption`，因此它现在会联网，正常完成时退出码为 0。脚本仍以 `unsupportedExit !== 2` 判失败，README 两种语言还推荐 `npm run validate:live`。原声明的最多 21 次 API 请求也可能因这项多出的检索变为最多 28 次，另有原三案例最多 6 次页面 GET。

已实际隔离复现：在**不改源脚本**的情况下，以现有合成测试夹具替代所有 fetch；前三案例 exit 0、候选非空、页面检查 200；上述宠物输入 exit 0；整个脚本最后 exit 1。这里的 200 是合成响应，**不是实际 GitHub 网络测试或新检索质量证据**。结果见 [smoke-script-reproduction.json](../validation/issue-1/release-check/smoke-script-reproduction.json)。首次诊断辅助程序因 Windows import 路径格式失败，修正辅助程序后才取得上述复现，未计作产品失败。

可复现指令（执行原验证脚本，全部响应为夹具）：

```powershell
node --import ./validation/issue-1/release-check/smoke-preload.mjs scripts/validate-v1-live.mjs
```

**建议最小处理**：只替换验证脚本的过期失败案例，改用已测试会澄清的模糊输入（例如“我想做一个很厉害的软件”）；保留退出码 2 的断言并确认此步骤不联网。然后核验原脚本及请求预算。无需改规划器、扩词表或新增功能。本轮依 Issue 指令只报告并提出最小建议，没有擅自修补源脚本，也没有增加它到测试通过声明中。

## 发布安全、完整性与 GitHub 状态

- 检查候选树的 **100 个受版本控制文件**及与 main 的差异：未发现被跟踪的 `.compass`、`.tools`、原始 captures、node_modules、dist、私钥/环境文件；凭据样式和机器用户路径扫描无匹配；结构化材料没有长响应正文/README 全文。摘要和短来源片段保持来源归属。完整方法与边界见 [audit.json](../validation/issue-1/release-check/audit.json)，这是有限文件审查，不是全面安全审计。
- MIT LICENSE、两份第三方许可说明、V1 起始文档、两份持久化 Schema、原证据提取/重放代码及 AI v1 Schema 相对 V1 均保留；原历史证据没有删除/改写。许可证说明与锁文件继续保留。
- PR #2：open、**Draft**、未合并，GitHub 返回 `mergeable: true` / `clean`；main 未变化。可见 Tag refs / Release 列表为空，没有 `v0.2.0` 冲突。
- 没有 GitHub Actions workflow、check run 或 commit status；main 未保护，required checks / rulesets 为空。combined status 的 `pending` 配合 0 statuses 表示**没有结果**，不能称云端 CI 已通过。实际凭据能力/安全策略并未因此改变。
- GitHub 时间点快照见 [github-state.json](../validation/issue-1/release-check/github-state.json)。分支/标签状态会变化，真正合并和发布前还应回读。

尚未验证：Linux/macOS 实机、全新用户安装、候选软件安装/性能/安全、依赖漏洞扫描、独立人类盲测、跨语言召回率、AI 语义正确性和持续用户价值。本轮没有运行付费服务或模型。未知中文、漏条件、跨领域噪声和 README 自述局限已列入 [Release Notes 草稿](RELEASE_NOTES_0.2.0_DRAFT.md)。

## 后续发布步骤（尚未执行）

1. 维护者审阅本报告，决定上述验证脚本的最小处理；处理后保留实际核验记录，不因此重启产品开发。
2. 独立审查方给最终建议，维护者作**第二次明确批准**。当前保持 Draft，Issue 保持开放。
3. 批准后才将 PR 标记 Ready、合并到 main；核对实际合并提交和文件范围。如期间又改产品代码，应重新执行相应检查。
4. 再检查无标签/Release 冲突，将 `v0.2.0` 指向经确认的 main 合并结果，以草稿说明创建**实验性 Pre-release**；不得把未合并分支或旧候选 SHA 误作合并版本。此次不是 npm 发布，也不附带本地 dist/captures/第三方全文。
5. 发布后在 Issue 中给实际 Tag、Release 和最终提交链接，再按维护者决定处理 Issue；本轮不关闭 Issue、不发“已发布”公告。

本轮结论不是产品能力扩大或需求验证失败，而是一个可小范围修正的发布验证入口缺陷需要先处理；通过的 251 项测试和契约检查仍是有效的本轮执行结果。
