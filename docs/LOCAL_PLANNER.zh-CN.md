# 自动语义计划：本地模型实验

[English](LOCAL_PLANNER.md) | 简体中文 · [首页](../README.zh-CN.md)

**目标**：用户只输入中文想法，不再手写 JSON。结构化语义计划只是 Compass 内部的可审计中间数据。

当前阶段提供一个**明确选择才启用**的本地模型实现，使用本机 [Ollama](https://ollama.com/) 的 `127.0.0.1:11434/api/generate`。Compass 不自动下载模型、不读取密钥、不直接调用付费 AI API。**普通无模型模式原样保留。**

## 首次准备

需要先自行安装 Ollama，并下载本地模型（有显著磁盘/内存需求，需按电脑性能选择）。例如：

```sh
ollama pull qwen2.5:7b
```

服务启动后，在 Project Compass 目录运行：

```sh
npm ci
npm run build
npm run compass -- "我想找支持 Markdown、不上传到云端的离线开源笔记工具" --local-model qwen2.5:7b
```

**不用创建 JSON 文件。** Compass 向本机 Ollama 发送原始想法，请求一份严格 JSON 结构，程序先检查 Schema、原始语句一致性、英文检索词上限和否定/排除字段，再按原有 GitHub 请求预算调查。保存 `report.md`、`report.json`、`captures.json` 和可复查的内部 `semantic-plan.json`。

只想快速开始、不安装 AI 时仍可以直接运行：

```sh
npm run compass -- "我想找一个 Markdown 笔记工具"
```

没有安装/启动模型时，`--local-model` 会明确报错，不会悄悄联网调用别的 AI，也不自动生成看似可靠的错误计划。去掉 `--local-model` 即可退回原本有限规则模式。

## 安全和事实边界

- 只有显式输入 `--local-model` 才请求本机 Ollama；服务地址固定为 `127.0.0.1:11434`，不支持用户指定外部 URL、不跟随重定向。每任务最多调用一次；超时 60 秒；响应上限 64 KiB；生成计划上限 32 KiB。
- Ollama 本身支持本地和云端模型。如果用户在 Ollama 中配置了云端模型，是否发生外部传输/计费由该 Ollama 配置决定；**Compass 只固定访问本地接口，不能代替用户保证 Ollama 内部永远不联网**。使用前请选择已下载的本地模型，不要将隐私信息放入想法。
- 未通过严格校验的模型输出会在 GitHub 检索前失败，不自动纠错为“已满足”；否定条件保留为 excluded，所有候选的硬条件仍是 `unknown`。模型语义和建议**未独立证实**。
- 模型只生成检索计划，不阅读任意网页，也不执行仓库代码；后续检索最多 2 次 GitHub Search + 5 次 README。实际发往 GitHub 的仍是短英文检索词，而非全部原始中文想法。
- 自动计划模式与 `--query`、`--semantic-plan`、`--replay`、`--import-ai` 互斥。保存的计划可配合 `--semantic-plan` + `--replay` 离线复核，重放不再调用本地模型。
- CI 用假的 Ollama/GitHub 响应测试，不下载或调用真实模型。**这还不是面向新用户的跨机器质量评估，也不证明本地模型理解正确。**

该功能在 PR 中独立审核、合并前不改变正式发布版本。未来是否增加更易安装的 AI 提供方，需要单独评估成本、隐私和用户授权。
