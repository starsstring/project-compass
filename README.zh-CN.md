# Project Compass

[English](README.md) | 简体中文

在开始开发前，先找真实的 GitHub 替代方案。输入项目创意，获得带来源的功能摘要、能力比较和 1–3 个值得验证的方向。

V1 是本地命令行工具，输出 Markdown 和 JSON，无需 GitHub Token、模型 Key 或付费服务。支持中英文创意输入；帮助、报错和报告文字目前以中文为主，项目文档提供中英文版本。

## 快速开始

需要 Node.js 24.19.x（含 npm）。克隆后运行：

```powershell
git clone https://github.com/starsstring/project-compass.git
cd project-compass
npm ci
npm run build
npm run compass -- "我想做一个本地 Markdown 笔记工具"
```

终端会提示输出目录，通常为 `.compass/discovery/<运行号>/`：

| 文件 | 内容 |
|---|---|
| `report.md` | 可阅读的仓库链接、能力比较、来源与候选方向 |
| `report.json` | 供脚本读取的结构化结果 |
| `captures.json` | 原始 API 响应、时间与哈希，供离线复查 |

每次使用新目录，已有结果不会覆盖。参数、离线重放和退出码见 [使用说明](docs/USAGE.zh-CN.md)。

## 可选 AI 分析

添加 `--prepare-ai`，将已采集材料、编号来源、任务说明和 JSON Schema 导出，供你自行选择的助手分析。Compass 不调用模型、不需要模型 Key，也不会把资料包发送给服务。随后可离线导入助手返回的 JSON；程序检查结构、输入哈希和引用，语义支持与生成者身份仍未核实。

```powershell
npm run compass -- "本地 Markdown 笔记工具" --prepare-ai --out ".compass/ai-job"
npm run compass -- --import-ai ".compass/returned-analysis.json" --ai-input ".compass/ai-job/ai-input.json" --out ".compass/ai-review"
```

资料包包含已采集的完整 README。发送给任何服务前先检查内容，并把仓库文字视为不可信数据。独立助手步骤、离线导出和校验边界见 [AI 分析说明](docs/AI_REVIEW.zh-CN.md)（[English](docs/AI_REVIEW.md)）。

## 当前已实现

1. 输入创意，通过有限中英词表生成最多两条检索；也可自己指定检索词。
2. 获取最多五个 GitHub 候选，展示链接、简介、语言、许可证元数据、更新时间和文本关联依据。
3. 解析简介和 README 正文，提取有依据的功能陈述，生成带引用的摘要和能力比较表。
4. 分开标明作者陈述、规则推断、限制和未知；材料没提到某功能，不等于软件没有该功能。
5. 在材料足够时提出 1–3 个待验证方向，说明已有能力、最小改动、验证动作，以及何时复用现成工具或停止投入；没有候选时可能不生成方向。
6. 本地保存报告与原始响应，并支持不联网的离线重放。

## 使用场景

| 你正在做的事 | Compass 能帮什么 |
|---|---|
| 为个人开源项目选题 | 先找到相关现成项目，了解是否值得继续从零开发 |
| 准备做量化研究工具 | 找回测/交易框架，比较材料描述的能力，挑选需要实际试用的方案 |
| 为开发板做调试工具 | 比较串口监视器和终端，寻找可复用组件或替代工具 |
| 想做笔记或下载工具 | 比较已有能力，选出一个小差异进行验证 |
| 回顾之前的调查 | 用保存的响应重新分析、复查引用，节省重复 API 请求 |

```powershell
npm run compass -- "开发一个量化软件"
npm run compass -- "面向开发板的串口调试工具"
npm run compass -- "支持断点续传的下载工具"
npm run compass -- "校园宠物领养互助系统" --query "pet adoption"
```

量化输入检索的是相关工具，不会运行策略或创建交易软件。陌生、复杂主题可用 `--query` 明确检索范围。功能分析目前对笔记、串口、下载、回测主题更具体。

[合成报告示例](examples/synthetic-report.md) 展示当前中文输出格式，仓库和能力均为虚构测试数据，不是真实搜索结果。

## 范围与限制

- 单次最多两次 GitHub Search 和五次 README 请求，匿名只读。每条搜索只取前十项，不是穷尽竞品调查。
- 排除归档、Fork、明显课程/资源清单及未识别许可项，并解释原因。许可筛选会漏掉真实可用项目；复用前仍要读取实际 LICENSE 和依赖条款。
- 检索采用文本匹配，分析使用公开规则和 Marked 正文解析。复杂否定、表格、平台约束与陌生主题可能漏判或误判，没有调用语言模型。
- 功能描述来自作者材料，没有安装实测；文本关联不能证明任务适配、真实需求或市场空缺。
- V1 尚无图形界面、输入仓库链接自动审计、完整 Issue/用户反馈分析、自动开发、成功概率或持续监控。
- 只把检索词发往 GitHub，请勿夹带私密信息。报告和原始响应默认被 Git 忽略。

## 开发与检查

```powershell
npm test
npm run check:contracts
# 可选联网检查：最多 21 次 API 请求与 6 次候选网页 GET
npm run validate:live
```

参见 [开发说明](docs/DEVELOPMENT.zh-CN.md) 与 [第三方说明](THIRD_PARTY_NOTICES.zh-CN.md)。

## 许可证

采用 [MIT License](LICENSE)。第三方依赖各自的许可证继续适用。
