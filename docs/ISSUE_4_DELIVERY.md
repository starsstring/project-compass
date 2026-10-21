# Issue #4 experimental prototype delivery — pending independent review

本交付按 Issue #4 实施，不代表 v0.3.0 发布或验收通过。独立工作分支为 `feat/0.3-semantic-query-prototype`，基线为 v0.2.0 `85241267113a81ab190f598281a659752c8ea3b5`。包/锁文件版本、AI v1 和 SQLite/持久化报告协议未变，无新增依赖。

## Implementation and reproducible use

新增显式 `--semantic-plan <json>`：严格校验32 KiB/版本/原句/字段/控制字符与英文词；生成最多4词/100字符的核心+动作查询，去重可选同义查询。首查完整成功、现有筛选后零候选才回退。最多2 Search、每条前10、总共5 README；错误、不完整、非零候选或README404不触发回退。

数据流：外部JSON → Schema/运行时校验 → 短查询 → 原有 GitHubSearch/discover 筛选排序 → 限额内README/既有证据提取 → 兼容JSON/Markdown及原始captures。`query_execution`记录计划/实际查询和回退原因；失败JSON也保存。条件/否定/未知分别留存，候选条件一律unknown，未自动过滤或宣称满足。

```sh
npm run build
node dist/src/cli.js "有没有能在浏览器里打开 LAS/LAZ 点云、测量两点距离并查看剖面的工具？" --semantic-plan examples/semantic-plan.json
```

完整使用、澄清、模式互斥、故障和重放说明见 [中文指南](SEMANTIC_PLAN.zh-CN.md) / [English guide](SEMANTIC_PLAN.md)。`--query`/AI导入与新选项互斥；AI导出不调用模型。重放只使用实际留档查询与README顺序/哈希，三次真实留档回放均为零网络。

兼容性：无新选项时保留规则/显式查询路径。仍是 `compass-discovery-v1.1`，沿用原method枚举，仅新增可选语义来源/条件/执行信息。GitHub客户端明确裁至首10项，保持原每页预算。

## Actual offline checks

Linux x64 / Node v24.19.0 / npm 12.2.0。以下为本次新执行，精确UTC时间、退出码和日志哈希见 [execution.json](../validation/issue-4/execution.json)。

| 命令 | 结果 | 原始命令日志 |
|---|---|---|
| `npm run build` | exit 0 | [build.txt](../validation/issue-4/build.txt) |
| `npm test` | 311/311，失败/跳过/取消/待办均0 | [tests.txt](../validation/issue-4/tests.txt) |
| `npm run check:contracts` | exit 0 | [contracts.txt](../validation/issue-4/contracts.txt) |

原有252项未删除或弱化；新增59项包括输入边界/恶意结构/不匹配原句、英文查询界限、同义去重、硬请求上限、过滤后零候选、非零未知不回退、不完整/403/429/真实超时/网络失败/README404、澄清零请求零目录、负面条件不删候选、未来/否定文本不冒充支持、实际留档顺序/哈希重放、AI v1兼容和真实子进程重放。

固定假数据的**完整CLI回退集成**已实际触发：第一次成功空结果，第二次返回候选，验证2 Search+最多5 README、最终报告/原因/保存结果。不是把 Issue #3 的守卫单测当真实联网回退。

## Six post-freeze inputs

设计先冻结，完成实现和初始53项专项后再创建六条新输入；首次6/6通过，未据其结果调参产品实现。最终套件里的重复运行按回归处理。数据与分类见 [cases](../tests/fixtures/semantic-validation-cases.json)、[first-use log](../validation/issue-4/first-new-input-validation.txt)、[actual per-case output](../validation/issue-4/new-input-results.json)。它们是Codex自建首次验证集，不是独立人类盲测；合成传输证明程序契约，不证明候选适配。

| ID | 覆盖 | 实际首次行为 |
|---|---|---|
| V01 | CityGML专业长尾 | 合成首查空→真实CLI链路回退；2 Search+1 README |
| V02 | OpenAPI中文翻译/保留参数代码 | 明确任务+unclear意图仍可搜索；1+1 |
| V03 | 本地DICOM隐私/不上传 | README404保持partial/exit5，不回退；1+1 |
| V04 | TLA+学习/否定开发 | 课程清单因learn意图保留；1+1 |
| V05 | MIDI→MusicXML/否定音频及云服务 | 条件unknown，不因文字直接删候选；1+1 |
| V06 | 果园需求未定 | 澄清exit2、0请求、无报告目录 |

冻结原始本地SHA因 GitHub GH007 邮箱保护在首次发布前改用公开noreply作者/提交者。只变提交身份元数据，所有tree/消息/日期不变；冻结文件不悄悄重写，[对应关系](../validation/issue-4/commit-provenance.json)：

- `7d960e5188a1716fd8b70d93cbe799ecad78729a` → 公开 `6540ed4370ed991262c7563e42ada8f25b48b7fa`，tree `0a8c23161c80657df05274f0755309aa036253e9`。
- `d73d7f1ffe670a857e2a3ef60ca346b16daea605` → 公开 `77420856eb58daa9a7cd2363c64738662989cc7d`，tree `026834394bd0fd6e9f770bc51aaefcfe6b738fd4`。
- `8a5a54bfe2039d8a3ec2c8f1f33e3f4a158038d6` → 公开 `d67080f454b057be7ee96de84f8762c9129434b6`，tree `34f6fa0335568e19c6c6651143985dc3834ed170`。

## Bounded real GitHub validation

真实样本/顺序/查询及最多21次预算在请求前冻结为 [live-protocol.json](../validation/issue-4/live-protocol.json)，三条均用新入口，不加显式query、不改词、不换样本。未运行候选代码或模型，未获取新凭据、安装付费工具或执行候选的安装命令。

| 样本 | 实际查询 | Search+README | 退出/报告 | 核心相关性最高分 | 回退 |
|---|---|---:|---|---:|---|
| V01 | `citygml validator` | 1+5 | 0/complete | 2 | primary_has_candidates，未执行 |
| V02 | `openapi documentation translator` | 1+1 | 0/complete | 0 | primary_has_candidates，未执行 |
| V03 | `dicom anonymizer` | 1+5 | 5/partial | 2 | primary_has_candidates，未执行 |

实际14次=3 Search+11 README，低于21；13个200、1个404。一次配额检查另计（Search remaining30/core14990足够6/15最坏预算）。没有重试、额外验链或凭据切换；平台托管代理可能注入认证，未证明纯匿名IP条件。所有客户端请求未主动添加Authorization。运行窗口UTC `2026-10-20T18:26:06.297Z`–`2026-10-20T18:26:15.863Z`。

**V02是明确失败例**：OpenAPI翻译检索实际返回摩斯码转换器，核心评分0；只是文档中含OpenAPI。不因人工发现不相关就擅自调用第二条查询。V03一份README404，保持partial/exit5；未替换候选。三次回放保持原退出状态、查询、候选顺序和响应元数据/哈希，外网请求0。

0/1/2/3是人工材料评分，不是生产功能的自动评分。2=核心作者材料支持但重要条件未知/有限；3要求全部硬条件作者材料明确支持，不等于安装实测。本次没有3。应用自身的所有外部条件仍为unknown。逐候选记录及短引：

| 样本/排名 | 候选与来源 | 分数 | 依据及硬条件未知 |
|---|---|---:|---|
| V01/1 | [virtualcitySYSTEMS/cityGML-Validator](https://github.com/virtualcitySYSTEMS/cityGML-Validator/blob/main/README.md)；README L1; empty description；“cityGML-Validator” | 1 | 只有标题，无正文/简介建立具体几何检验能力。CityGML关联可见，闭合检查与无效面定位均 unknown。 |
| V01/2 | [Project-PLATEAU/CityGML-geometry-validator](https://github.com/Project-PLATEAU/CityGML-geometry-validator/blob/main/README.md)；README L5–16, L26, L38–44；“位相一貫性検証機能” | 2 | 作者说明 CityGML 2.0 建筑拓扑一致性检查、JSON日志；闭合性和无效面精确定位仍 unknown。需要商用 FME，不是独立可用程序；未安装执行或购买服务。 |
| V01/3 | [tudelft3d/CityGML-schema-validation](https://github.com/tudelft3d/CityGML-schema-validation/blob/master/README.md)；README L3–9；“against the XSD schemas” | 1 | XSD结构校验不等于三维闭合/几何面定位；后两项 unknown。 |
| V01/4 | [tudelft3d/CityGML-QIE-3Dvalidation](https://github.com/tudelft3d/CityGML-QIE-3Dvalidation/blob/master/README.md)；README L1–13, L41–52；“unit test” | 1 | 是几何错误测试数据和预期输出规范，并非已实现的检查工具。不能把 should-return 规范当现有能力。 |
| V01/5 | [tum-gis/3dcitydb-v5-docker-sfcgal-patched](https://github.com/tum-gis/3dcitydb-v5-docker-sfcgal-patched/blob/main/README.md)；README L3–36；“Strips validity assertions” | 1 | 目标是让几何计算绕过某些有效性/自交断言，属于相邻环境补丁，不证明能发现闭合缺陷或定位无效面；未执行。 |
| V02/1 | [ElyahuAnavi/morse-code-translator](https://github.com/ElyahuAnavi/morse-code-translator/blob/main/README.md)；README L15–22, L119–120；“Morse Code Translator API” | 0 | 实际功能是文本与摩斯码转换，OpenAPI只用于其接口文档生成，不是文档中文翻译。中文输出、参数名和示例保留均 unknown。非零且可纳入候选，依冻结规则不能人工触发回退。 |
| V03/1 | [KitwareMedical/dicom-anonymizer](https://github.com/KitwareMedical/dicom-anonymizer/blob/master/README.md)；README L3–9, L26；“anonymize DICOM files” | 2 | DICOM字段按标准匿名化有作者材料；本地CLI完整流程和无上传承诺仍 unknown。日期匿名化保留而非直接删除；不作隐私合规或实测保证。 |
| V03/2 | [chop-dbhi/dicom-anon](https://github.com/chop-dbhi/dicom-anon/blob/master/README.md)；README L26–42, L47–49；“DICOM anonymization script” | 2 | 输入/输出目录和CLI去标识流程有材料；不上传仍 unknown。作者明确本地审计库会保留原身份信息，且不能检测像素烧录信息，不能据匿名化名称宣称全部身份已去除。 |
| V03/3 | [RSNA/anonymizer](https://github.com/RSNA/anonymizer/blob/master/readme.md)；README L1, L77–87；“headless DICOM receive” | 1 | 本次README主要为安装/GUI及headless接收入口；对所需元数据处理和无上传流程材料不足，保守按相邻定位评分。不是声称项目没有匿名化能力。 |
| V03/4 | [johnperry/DicomAnonymizerTool](https://github.com/johnperry/DicomAnonymizerTool)；Search description; README HTTP 404；“command-line tool” | 1 | 仅描述调用匿名化器的CLI包装；具体字段处理和无上传证据 unknown。README 404原样保留，不补抓或替换。 |
| V03/5 | [bill4278/Anonymizer](https://github.com/bill4278/Anonymizer/blob/MergeLogBrowserIntoMainWindow/README.md)；README L5–7；“DICOM” | 2 | 正文声明DICOM文件/压缩包匿名化；元数据细项、CLI方式与不上传均 unknown，不把GUI标题或线程性能宣称当验收。 |

完整必要响应/文件hash和README对象身份见 [live-results.json](../validation/issue-4/live-results.json)，评分见 [live-reviews.json](../validation/issue-4/live-reviews.json)。14份响应哈希及10份成功README解码正文/Git blob身份已核对。原始captures/第三方全文只在本地 `.compass/issue-4-live-*`，未提交；公开哈希不是独立第三方重跑证明。

## Remaining limits and acceptance status

- **真实回退仍未发生**：三个首查都有既有过滤规则可纳入的候选，即使相关性0也不能触发；只证明离线完整回退链路，不能宣称真实回退增益。
- 外部文件语义/来源未验证，英语词可能不相关、过窄或丢硬条件；新增入口没有内置模型/通用AI理解或硬条件自动验收。
- 六条自建输入不是独立盲集，真实检索仅三条；候选README自述不是安装/隐私安全证明，尤其不能把DICOM匿名化名称当完整去身份保证。
- 无模型API调用，但模型选型、真实调用token/成本与跨平台运行未验证。初始交付未新增GitHub Actions，不能把该轮云机本地测试称为GitHub CI通过；后续补充的 [Node24 CI配置](../.github/workflows/ci.yml) 与实际运行结果另见 [PR #5](https://github.com/starsstring/project-compass/pull/5)，不改变本报告的原始研究结论。
- 当前为**实验原型待独立验收**。提供Draft PR后停止；不合并、不关闭Issue、不创建0.3标签或发布。
