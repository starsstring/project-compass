# 0.2.0 验证脚本最小修复与验收（2026-10-20）

依据：[维护者限定授权](https://github.com/starsstring/project-compass/issues/1#issuecomment-6291409407)。仅消除公开验证脚本的过期失败断言，不修改生产检索规划器、领域词表、排序、报告生成、依赖、版本或契约。

## 修改与版本

- 公开修复提交：dd9868219ea483e55e968abe0b7314ecc86352a2；本地实际受测提交 `5c4c4fd36920320dd480858db9476fd47725f307`。两者完整树一致：`a040831aa8d9b5809a04e40070fce0ef24718d0d`；连接器提交元数据不同，未声称 SHA 相同。
- `scripts/validate-v1-live.mjs`：只将旧宠物领养失败输入换成“我想做一个很厉害的软件”，保留预期 exit 2；添加请求计数和输出目录检查，异常联网或创建报告也会使脚本失败。保留原摘要的 `failure_case` 字段，新增两个诊断字段。
- `README.md`、`README.zh-CN.md` 与脚本提示：确认上限为 **3 × (2 Search + 5 README) = 21 次 API 请求，另有最多 3 × 2 = 6 次候选网页 GET**；澄清案例 0 请求、不创建报告目录。无需再把上限提高到 28。
- `tests/integration/live-validation-script.test.ts`、`tests/fixtures/live-validation-preload.mjs`：新增一项真正执行完整源脚本的隔离回归，不复制脚本实现。全部 fetch 来自本项目合成夹具，使用五个候选覆盖请求上限。
- 后续文档/证据提交只更新本记录、旧报告状态与草稿状态并增加新日志；旧记录和原始失败复现未覆盖。

## 本轮实际执行

Windows x64 / Node **24.19.0** / npm **12.2.0**，版本仍为 **0.2.0**。生产源码、锁文件、配置及契约相对本轮起点 `e273a9b6f28cb3d14b4ef5fc16c1d5673f901333` 无变化；使用此前按锁文件安装的依赖，本轮没有重装依赖或运行新的真实 GitHub 候选检索。

| 实际命令 / 执行 | 结果 |
| --- | --- |
| `npm run build` + `node --test dist/tests/integration/live-validation-script.test.js` | build 与针对测试通过，1/1；完整源脚本退出 0 |
| `npm test`，2026-10-20 **21:08:04–21:08:28（UTC+8）** | **252/252**，失败/跳过/取消均 0，exit 0；包含新的完整脚本回归以及 build/生成类型检查/TypeScript |
| `npm run check:contracts`，**21:08:28–21:08:37（UTC+8）** | exit 0，构建、两份 Ajv strict Schema 与三样例通过 |

完整成功日志：[tests.txt](../validation/issue-1/smoke-fix/tests.txt)、[contracts.txt](../validation/issue-1/smoke-fix/contracts.txt)；精确 UTC 时间、命令、退出码、环境与原始日志 SHA-256：[execution.json](../validation/issue-1/smoke-fix/execution.json)。它们是本次新运行，不是旧 251 项日志。针对性测试的同一断言也在完整 252 项日志中。

隔离回归实际确认：

- 执行的是仓库完整 `scripts/validate-v1-live.mjs` 源文件，三个有效案例各 exit 0、五个合成候选、七次 API 响应和两个网页响应，整个脚本 exit 0。
- 合成请求合计 **21 API + 6 网页**，无意外 URL；这正好覆盖声明的上限。
- 澄清输入 exit **2**、请求计数 **0**，且指定的澄清报告目录不存在。请求计数和物理目录均有断言。
- **全部响应为合成数据，外网请求 0**；此处的 200 和候选不是新一轮真实 GitHub 检索证据，不证明候选质量。

复现完整脚本隔离回归：

```powershell
npm run build
node --test dist/tests/integration/live-validation-script.test.js
```

完整测试继续覆盖 V1 式重放夹具、旧留档查询/候选行为、AI v1 文件导入导出及证据/未知许可证回归；这些生产实现和协议未改。本轮未重放上轮全部真实留档，未调用模型，未安装候选软件或运行跨平台实机测试。

## 结论与边界

已消除独立审查确认的验证脚本阻断，**建议进入最终发布审批**；仍等待独立审查和维护者明确批准实际合并/实验性 Pre-release。该判断不代表通用中文检索、跨语言候选相关性、条件完整性、竞品覆盖率或市场价值得到验证。

未知中文/跨语言、复杂否定、书签同步等已披露限制保持不变，未借此扩词表或改变其他输入行为；README 作者声明仍不等于安装实测。没有新增云端 CI，不能把本地通过称为 GitHub CI 通过。

PR #2 保持 Draft，不标 Ready、不合并 main、不创建 Tag/Release、不关闭 Issue。下一步只需独立复核本修复与日志，再由维护者决定是否批准真正发布；本轮不自动进行该步骤。
