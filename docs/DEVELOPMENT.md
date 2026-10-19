# 开发说明

## V1 数据流

`src/cli.ts` → `src/discovery/query.ts` → GitHub Search/README 只读适配器 → 正文证据提取 → 能力比较与条件式方向 → Markdown/JSON。

`src/adapters/github/replay.ts` 使用同一流程重放本地响应。`marked` 仅用于词法解析，不渲染不可信 HTML；README 中的指令不执行。

## 保留的技术资产

`src/domain`（含 `src/domain/contracts`）、`src/application`、SQLite 适配器、`contracts` 和 `storage` 是保留的领域/存储模块；当前 discovery CLI 不需要初始化它们。`experiments` 与 `research/decision-cases.json` 保留历史规则实验及测试用例，不参与 V1 搜索和建议生成，也不代表真实用户或需求验证。

## 验证

`npm test` 先构建及检查生成类型，再运行离线单元、CLI、SQLite 与历史规则测试。`npm run check:contracts` 检查严格 Schema 与合成样例。修改契约后用 `npm run generate:types` 同步类型，并运行相关测试；存储变动需保留兼容或可恢复迁移。

发布前已有 172 项本地测试通过；四组历史真实响应被最终代码离线重放，另一次量化输入联网运行取得五候选及五 README。此前网页检查发生过超时，未计为成功。来源抽查由开发代理执行；这些结果不等于独立盲评、候选软件实测或市场需求成立。

此仓库首次代码上传只包含可运行源码、测试、必要自有夹具和使用文档。开发中的个人原档、完整研究历史、第三方 README 快照及本地报告不在公开范围内，原本地文件和 Git 历史保留。
