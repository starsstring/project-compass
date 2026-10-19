# Project Compass

输入项目创意，找到真实 GitHub 仓库，生成带来源的功能摘要、能力比较和 1–3 个待验证的改进方向。

V1 是本地命令行工具，输出 Markdown 和 JSON。无需模型 Key、GitHub Token 或付费服务，支持中文关键词和显式英文检索词。

## 快速开始

需要 Node.js 24.19.x（含 npm）。克隆后运行：

```powershell
git clone https://github.com/starsstring/project-compass.git
cd project-compass
npm ci
npm run build
npm run compass -- "我想做一个本地 Markdown 笔记工具"
```

结果保存在终端提示的 `.compass/discovery/<运行号>/`：

- `report.md`：可阅读的报告、来源与建议。
- `report.json`：结构化结果。
- `captures.json`：本次 API 原始响应，便于离线复查。

`--out` 必须使用新目录，已有结果不会覆盖。更多参数和退出码见 [使用说明](docs/USAGE.md)。

## 示例

```powershell
npm run compass -- "开发一个量化软件"
npm run compass -- "面向开发板的串口调试工具"
npm run compass -- "支持断点续传的下载工具"
npm run compass -- "校园宠物领养互助系统" --query "pet adoption"
```

量化输入会检索回测相关仓库，不会创建量化软件。复杂主题请用 `--query` 明确搜索范围。[合成报告示例](examples/synthetic-report.md) 展示输出格式，不代表真实搜索或产品能力。

## 能力与限制

- 每次最多两次 GitHub 搜索和五次 README 请求，匿名只读；不安装或执行候选仓库代码。
- 报告区分 API 信息、作者声称、推断与未知；能力与建议附材料引用。材料未提及不等于软件没有该功能。
- 使用有限中英关键词及能力规则和 Marked 正文解析，不调用语言模型；复杂否定、表格、用途和平台约束可能漏判或误判。
- 未识别许可证的结果会列为排除项，可能漏掉真实可复用项目。实际复用前仍需检查 LICENSE 与依赖条款。
- 不计算项目成功概率，不证明需求或盈利，也不代替安装实测。
- 运行结果默认忽略于 Git。检索词会发往 GitHub，请勿将私密信息写入检索词。

## 开发与验证

```powershell
npm test
npm run check:contracts
# 可选联网检查：最多 21 次 API 请求与 6 次网页 GET
npm run validate:live
```

代码结构与已知限制见 [开发说明](docs/DEVELOPMENT.md)。依赖及引用说明见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 许可证

采用 [MIT License](LICENSE)。第三方依赖各自的许可证继续适用。
