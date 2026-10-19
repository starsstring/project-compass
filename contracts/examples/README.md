# 契约样例

这些是合成数据，不是真实用户、竞品能力、模型运行或市场结果。

- [report-initial.json](report-initial.json)：人工构造的初版，未知评分为 null。
- [report-corrected.json](report-corrected.json)：替换来源快照、纠正主张、保留父版本；没有真实网页采集。
- [human-decision.json](human-decision.json)：仅示范决定结构，actor 明确是 synthetic_test_actor；不代表当前用户的决定。

来源 URL 使用 example.com；不得将它计入需求证据。Schema 正式验证由 T01 实现；现有 SQL 测试只验证存储约束。生成样例的字段与测试夹具一致，见 tests/architecture/fixtures.mjs。
