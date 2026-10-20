# Issue #1：0.2.0 源码与证据交接

2026-10-20。范围：交接已经实现的最小输入规划，**本轮未继续改功能**。GitHub [Issue #1](https://github.com/starsstring/project-compass/issues/1) 为任务与验收协作入口；保持 Draft，不合并、不打标签、不发布 Release。

## 提交与验证关系

- 可访问代码：[5a540143429b2695546e7fc5e9c04d8297d3ace0](https://github.com/starsstring/project-compass/commit/5a540143429b2695546e7fc5e9c04d8297d3ace0)，父提交为 V1 main `134943c027e6c86123363eb02b67ee962246f1ca`。
- 原本地受测代码：`151a96708faf12ef6544ee352d3cd6731862dc2a`。它与公开代码提交的**完整文件树相同**：`fd60fe44d10500710e17ca2dde14b2457cc0eac2`。终端缺少推送凭据，采用已连接 GitHub 创建同树提交，因此 SHA/作者时间等元数据不同；不声称原 SHA 已上传。
- 本地报告提交 `65b022cd9d5b5f1f678292d160ab38a4d160eb0a` **未公开**。整分支推送被自动审查拦下后，改为白名单交接受测代码与本目录的安全证据。没有绕过拦截上传原研究历史。
- V1 源码、基线、原报告和原始采集仍保留在本地，公开 main 未由本轮修改。原 79 个 V1 跟踪文件及基线哈希已核对。

实现是有限意图/条件规则、中文分词回退、至多两条互补查询、模糊请求澄清、条件文字线索、按意图给核对动作，以及旧重放/AI 包兼容。SQLite/旧契约、依赖不变；没有模型 API、Key 管理、UI、多 Agent 或通用模型框架。源码差异是原 V1 之上的 19 文件增量。

## 可公开检查的证据

| 材料 | 实际情况 |
|---|---|
| [完整测试日志](../validation/issue-1/tests.txt) | Node 24.19.0 / npm 12.2.0，`npm test` **245/245**，失败/跳过/取消均 0 |
| [契约日志](../validation/issue-1/contracts.txt) | `npm run check:contracts` 通过，含 build、check:types、TypeScript、两份 Ajv strict Schema 与三样例 |
| [结构化证据](../validation/issue-1/evidence.json) | 原始 12 句、V1 查询/错误、新版规划、实际五类 CLI 的全部轮次及安全候选摘要、响应/产物哈希、README 定位 |
| [新增保留输入协议](../validation/issue-1/holdout-protocol.json) / [原始结果](../validation/issue-1/holdout-results.json) / [逐项评价](../validation/issue-1/holdout-review.json) | 新选六句，先冻结、一次运行、0 网络、结果后未改代码；只是开发者检查，不是独立人类盲测 |

完整测试和契约是同日已实际执行的结果，本次只核对相同代码与日志，**没有把它们冒充再次运行**。公开日志仅统一 LF 换行，文字未改；原字节哈希与公开文本哈希均在 evidence.json。

新旧 12 句由 6 条生成/6 条 `INVALID_INPUT` 变为 10 条生成/2 条澄清；不是理解准确率。历史 V1 与新版检索时间不同，新版 CLI 使用 limit=3 控制配额，不能把数量和索引变化当作因果效果。

## 真实 GitHub 案例与反例

- NSA 反编译工具：新版包含真实 [Ghidra](https://github.com/NationalSecurityAgency/ghidra)，原 README 有机构/反编译线索，但资源目录仍排在前面，尚未可靠确认唯一目标。
- 离线加密笔记：最终为 [Laverna](https://github.com/Laverna/laverna)、[Notesnook](https://github.com/streetwriters/notesnook)、[Trilium](https://github.com/TriliumNext/Trilium)。初轮错误排入聊天项目，撤回了“针对性查询绝对优先”后改善。加密同步不等于本地静态存储加密；文档不替代安全/运行实测。
- 植物病害手机应用：实际发现 Plant-Safe、Plant-Disease-Diagnostics、[GreenDoc](https://github.com/deepcpatel/GreenDoc)，手机/服务端处理有作者说明，模型精度和端侧可用性未验。
- RAG 评测：实际为 Catalyst、Ragas、rag-arena；后者文档描述用户投票/排行榜，不能等同自动指标评测。旧版也已有部分评测组件，不把全部成果说成从零新增。
- Windows 截图 OCR 翻译：实际为 Screenshot、TTime、eSearch，较旧版截图转代码/网页截图库更接近任务；仍是作者材料，不是安装验证。

两轮五案例和最后一例共 11 次真实 CLI、55 个搜索/README 响应均 200，另三次配额预检。五案例修正轮是本地 `5b1479c`；最终 `151a967` 对这五组真实响应做隔离函数排序复核（查询/候选不变），并另有一次最终笔记真实 CLI。**隔离复核不是五次最终代码新联网 CLI。** 四份 V1 留档最终 CLI 离线重放、旧真实 AI 包导入均成功，后者只验证结构与引用。

## 新保留输入暴露的缺口

| 输入类别 | 一次检查发现 |
|---|---|
| Linux 离线密码管理器 | 找工具/主题/条件在规划中保留；没有新候选实测 |
| 学习语音识别 | 学习意图正确，查询夹入“我想/学习/如何”等噪声 |
| 不需要联网的药品到期提醒 | 未识别无需联网约束，查询截断遗漏“到期提醒” |
| macOS 音频降噪工具 | 查询只剩 `macos`，主任务丢失；明确缺陷 |
| 同步全部书签 | 书签保留，同步只留在原句/未映射要点，未入查询 |
| 还不确定做什么项目 | 未强判意图，但仍发出泛词查询，没有提出关键澄清 |

这些结果后没有调参或修补，不能宣称六条通过、开放域质量提升或产品价值已证实。**当前只建议进入源码独立审查，不建议直接批准正式 0.2.0 Release。** 后续由维护者及独立审查明确这些问题的处理范围；本交接不扩大开发。

## 可复现与仅本地材料

克隆审查分支，使用规定环境：

```sh
git clone --branch codex/issue-1-review https://github.com/starsstring/project-compass.git
cd project-compass
npm ci
npm test
npm run check:contracts
node validation/issue-1/run-holdout.mjs
```

保留输入脚本只调用生产规划函数，不联网，默认写新的 `.compass` 结果文件。它不是 CLI 端到端测试。独立审查者应另选未见输入，分别评价意图、条件、候选与澄清，不沿用开发者评价作为标准答案。

原始 `captures.json`、第三方完整 README、原 Markdown/JSON 报告、机器特定环境清单及初次失败完整日志**仅本地保存、未公开**。本交接只公开摘要、定位、哈希和安全测试日志；哈希不能让未持有原文的人完成原文复核。若确需原始材料，应另行约定非公开交付。本次没有把私有原始数据作为公共源码审查前提。
