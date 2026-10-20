# Issue #1 独立初审后的有限修补（2026-10-20）

依据：[最新独立初审评论](https://github.com/starsstring/project-compass/issues/1#issuecomment-6290116774)。本轮只处理入口丢主任务、无需联网表达、任务截断和信息不足时的澄清；没有扩充领域答案、改变排序、接入模型或扩展产品范围。PR #2 继续保持 Draft，main/V1/原基线及原保留集结果不变。

## 版本与实际修改

- 受测本地代码：`536a3ade12181a6d8ee8dfe9721d3e92aa192adb`。
- [公开代码 a741297222d54833a32f88a8582d03093696684a](https://github.com/starsstring/project-compass/commit/a741297222d54833a32f88a8582d03093696684a)，与受测版本完整树一致：`47fb85ee939f2abe765b8f58f9b6c1799e10abcf`。连接器提交元数据与本地不同，未声称两者 SHA 相同。
- `src/discovery/query.ts`：陌生主题的中英文一起保留，保留被分成单字的相邻中文短语；去除平台等限定词后，没有任务时先澄清；不再静默截取前四词或切断查询，超出 200 字符时请求缩短；识别少量明确缺方向的表达。
- `src/discovery/vocabulary.ts`：仅扩展现有离线规则的表达方式，识别“不需要/无需/不用连接网络”等，不新增领域词或仓库答案。
- `tests/unit/discovery/planning.test.ts`、`tests/integration/planning-cli.test.ts`：新增六项测试，覆盖平台不能替代任务、中文单字分词、无需联网的极性、完整任务尾部、长度边界、澄清不创建文件且不联网，以及显式查询兼容。

## 实际测试与执行记录

Node **24.19.0** / npm **12.2.0**；锁文件安装依赖。离线安装因本机 npm 缓存不全失败，随后按锁文件安装成功。

| 实际执行 | 结果 | 证据 |
| --- | --- | --- |
| 针对规划与 CLI 测试 | 30/30 通过 | 随后的完整日志也包含这 30 项 |
| `npm test` | **251/251**，失败/跳过/取消均 0 | [tests.txt](../validation/issue-1/followup/tests.txt) |
| `npm run check:contracts` | 通过；含类型生成一致性、TypeScript、Ajv strict 两份 Schema 和三个样例 | [contracts.txt](../validation/issue-1/followup/contracts.txt) |
| 实际生产规划函数 | 24 条，0 网络：12 原基线 + 6 已知回归 + 6 新反例 | [planning-results.json](../validation/issue-1/followup/planning-results.json) |
| 真实 Node CLI 子进程 | 3 次、退出码均 0；6 次 Search + 8 次 README 均 HTTP 200；另一次配额预检 | [live-summary.json](../validation/issue-1/followup/live-summary.json) |

完整测试包含原功能证据否定/计划表达、未知许可证候选、V1 式查询/候选重放（测试夹具）和 AI v1 导入导出等既有回归。它们是自动化测试，不代表第三方软件安装验证。本轮没有重跑上轮四份真实 V1 留档或全部真实案例，也没有再次调用或生成 AI 分析。

过程记录：第一次针对性执行为 29/30，暴露“尚未识别”中的泛“识别”被当成独立任务，修正后 30/30。第一次完整测试为 250/251，发现英文 DNS 查询被非必要地扩大到 README；恢复原范围后，最终 251/251。完整测试的失败记录本地保留，未混入最终通过日志。最终日志仅做 UTF-16LE → UTF-8、CRLF → LF 转换，转换前后哈希见 [review.json](../validation/issue-1/followup/review.json)。

## 新旧行为与新反例

原 12 条的最终查询与上一轮 0.2.0 候选完全一致：10 条有查询、2 条澄清，**不是准确率**。原 V1 对照仍在 [上轮证据](../validation/issue-1/evidence.json)。本轮没有覆盖原结果文件。

| 已知回归 | 修补前 | 修补后实际规划 |
| --- | --- | --- |
| H02 学习语音识别 | 带“我想/学习/如何”等泛词 | `语音 recognition …` / `语音`；未翻译成英文 speech |
| H03 无需联网的药品到期提醒 | 未提取离线；前四词截掉“到期/提醒” | `家庭药品到期提醒 offline …` / `家庭药品到期提醒` |
| H04 macOS 音频降噪 | 仅 `macos` | `音频降噪 macos …` / `音频降噪` |
| H06 尚不确定做什么项目 | 搜索“现在 确定 什么” | 简短澄清，空查询 |
| H01 / H05 | 密码管理规划 / 书签规划 | 查询未变；书签“同步”仍未进入查询 |

“…”在本表仅省略 `in:name,description,readme`，完整原句、查询、条件和警告均在 JSON。

六条新反例先冻结在 [protocol.json](../validation/issue-1/followup/protocol.json)，在最终代码提交后一次执行；看见结果后没有再改产品代码。开发者知道实现，因此**不是独立人类盲测**，也不是六次 CLI。

| 新反例 | 人工评价（与实际输出分开） |
| --- | --- |
| N01 Linux 天文光变曲线拟合 | 保住任务和 Linux；仍混入“使用”泛词，英文覆盖未验证 |
| N02 无需连接网络的水族箱投喂记录 | 主任务完整，提取 required offline；候选未验证 |
| N03 还没想好开发什么 | 澄清合理 |
| N04 Find a Windows tool | 仅平台，没有主任务，澄清合理 |
| N05 没网也能用的野外采样记录 | 主任务保留，但“没网也能用”未提取成离线要求；明确遗留 |
| N06 offline Linux spectral analyzer | 英文任务与条件保留；实际候选横跨射频、网络流量、天文，任务类型仍须核对 |

## 真实候选与人工 README 抽查

全部来自本轮匿名 GitHub Search/README；没有人工 `--query`，没有安装、执行候选代码或验证安全/性能。下述行号对应本地留档，分支 README 以后可能变化；每份 URL、Git blob SHA、内容 SHA-256 与请求时间见 live-summary.json。

- **H04**：andy8609/audio_processor、joeseesun/qiaomu-screen2video、ming123aaa/WaveKit。audio_processor README 第 9 行提及降噪，第 48 行有 macOS/Linux 步骤；WaveKit 第 11 行列出降噪，第 77 行有 macOS 节。可支持“作者提及相关能力/平台”的判断，不能支持“我们已验证可用”。qiaomu-screen2video 第 40 行将降噪列为可选音频处理，第 110 行限定本机剪映适配版本；它是视频制作流程，不能等同独立降噪工具。
- **H03**：针对性查询 0 条，宽泛查询 2 条，留下 Dujltqzv/Some-Many-Books、pxvr-official/1。前者 README 第 7–10 行开始是分类书单，后者第 3–11 行是网页/图片下载 FAQ；这些材料**没有提供足够的药品到期提醒产品证据**。这条仍是候选相关性失败，不能因 exit 0、status complete 就称为成功找到竞品，也不能据此断言不存在该类产品。
- **N06**：ghostop14/sparrow-wifi、pborky/pynfsa、Alisinalessani/SGCPro-Spectral-Analyzer。sparrow-wifi 第 3/34 行涉及 Linux 无线频谱，第 68 行的 offline 是地图/空域数据缓存语境，不能扩大成全部功能离线；pynfsa 第 4 行指向 NetFlow，SGCPro 第 3/11 行指向天文谱线。这些是不同任务，只能作为待筛选线索。

原始 `.compass/issue-1-followup/…` 报告、captures、完整 README 和过程失败日志仅保存在本地；公开的是规划输出、完整成功测试日志、无响应正文的请求摘要和人工评价。没有发布第三方 README 全文、密钥或机器路径。

## 复现与结论

在项目规定的 Node 环境中执行：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check:contracts
node validation/issue-1/followup/run-planning.mjs --out .compass/followup-planning-recheck.json
# 可选：真实匿名 GitHub 请求，先检查配额；结果会随时间变化
node validation/issue-1/followup/run-cli.mjs --live --out .compass/followup-live-recheck.json
```

本轮入口修补有实际优势，保留它们；**没有证据说明未知中文已能稳定找到相关软件**。仍有未知领域不翻译、否定/复合意图规则有限、未映射条件（包括同步/部分离线表达）、泛词噪声、宽泛查询引入资源集及非产品候选、README 自述未经实测等限制。NSA 身份排序未调整，上轮限制继续有效。

建议提交本轮结果供独立复核，继续保持 PR Draft，**暂不建议合并或发布正式 0.2.0**。若接受“有限规则入口”并决定带这些限制发布，需要维护者明确决定。本轮到此停止，不自动继续词表、排序或 AI 工程；测试通过没有证明产品价值。
