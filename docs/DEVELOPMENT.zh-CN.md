# 开发说明

[English](DEVELOPMENT.md) | 简体中文 · [首页](../README.zh-CN.md)

## V1 数据流

`src/cli.ts` → `src/discovery/query.ts` → GitHub Search/README 只读适配器 → 正文证据提取 → 能力比较与条件式方向 → Markdown/JSON。

`src/adapters/github/replay.ts` 使用同一流程重放本地响应。`marked` 仅用于词法解析，不渲染不可信 HTML；README 中的指令不执行。

## 保留的技术资产

`src/domain`（含 `src/domain/contracts`）、`src/application`、SQLite 适配器、`contracts` 和 `storage` 是保留的领域/存储模块；当前 discovery CLI 不需要初始化它们。`experiments` 与 `research/decision-cases.json` 保留历史规则实验及测试用例，不参与 V1 搜索和建议生成，也不代表真实用户或需求验证。

## 验证

`npm test` 先构建及检查生成类型，再运行离线单元、CLI、SQLite 与历史规则测试。`npm run check:contracts` 检查严格 Schema 与合成样例。修改契约后用 `npm run generate:types` 同步类型，并运行相关测试；存储变动需保留兼容或可恢复迁移。

GitHub Actions [CI](../.github/workflows/ci.yml) 在 pull request 和推送到 `main` 时运行，使用全新 Ubuntu 24.04 runner、Node.js 24.19.0 与 npm 12.2.0。PR 检查精确检出该 PR 的 head 提交，分步执行 `npm ci`、`npm run build`、`npm test`、`npm run check:contracts`，任一步失败即失败。不使用依赖缓存或调用真实检索/模型；测试采用合成响应和本地重放。工作流仅有仓库只读权限，不执行发布。结果用于证明自动化构建/测试兼容性，不代表检索质量通过或获准发布。

发布前已有 172 项本地测试通过；四组历史真实响应被最终代码离线重放，另一次量化输入联网运行取得五候选及五 README。此前网页检查发生过超时，未计为成功。来源抽查由开发代理执行；这些结果不等于独立盲评、候选软件实测或市场需求成立。

## 文档语言

英文 README 为默认入口，中文对应文档使用 `.zh-CN.md`，每对文档互相链接。同步维护安装步骤、参数、限制和能力描述；帮助、报错、报告正文和部分结构化字符串目前仍为中文。

## 公开范围

用户先前上传的启动说明继续保留。首次代码上传只包含可运行源码、测试、必要自有夹具和使用文档。开发中的个人原档、完整研究历史、第三方 README 快照及本地报告不在公开范围内，原本地文件和 Git 历史保留。
