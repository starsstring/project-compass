import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { GitHubSearch } from './adapters/github/search.js';
import { loadReplay } from './adapters/github/replay.js';
import { planSearch, intentLabel } from './discovery/query.js';
import { discover } from './discovery/analyze.js';
import { DiscoveryError, type QueryExecution } from './discovery/model.js';
import { renderDiscovery } from './discovery/markdown.js';
import { createAiInput, aiInstructions, renderAiSources, aiReviewSchemaJson, readBoundedJson, validateAiInput, serializeAiInput, AI_INPUT_MAX_BYTES, AI_REVIEW_MAX_BYTES } from './advice/input.js';
import { createReviewResult, renderAiReview } from './advice/review.js';
import { planSemanticSearch, readSemanticPlan } from './discovery/semantic-plan.js';
import { planWithLocalModel } from './discovery/local-planner.js';

const help = `Project Compass 0.2.0 — GitHub 项目初查（基础模式无模型 Key）

用法：npm run compass -- "项目创意" [--query "检索词"] [--limit 5] [--out "新目录"] [--json] [--replay "captures.json"] [--prepare-ai]
导入：npm run compass -- --import-ai "分析.json" --ai-input "ai-input.json" [--out "新目录"] [--json]
示例：npm run compass -- "我想做一个本地 Markdown 笔记工具"
      npm run compass -- "面向开发板的串口调试工具" --query "serial monitor"
      npm run compass -- "找一个离线 Markdown 笔记工具" --local-model qwen2.5:7b

--query 可重复，最多两条；省略时用有限词表、条件规则与中文分词规划。
--semantic-plan <json> 实验入口：显式外部语义计划；不调用模型。
--local-model <模型名> 显式调用本机 Ollama，自动生成语义计划，无需手写 JSON；必须先自行下载本地模型，可能占用计算资源。
--local-model 与 --semantic-plan/--query/--replay/--import-ai 互斥；本机接口固定 127.0.0.1:11434。
--out 必须为尚不存在的目录；默认 .compass/discovery/<唯一运行号>。
--limit 1–5；--json 输出结构化报告；--help 显示帮助。
--replay 使用已有响应重新分析，不联网；未指定 --query 时自动使用留档检索词。
--prepare-ai 额外导出资料、编号来源、AI 任务说明和返回格式；导出步骤不另外调用分析模型。
--import-ai 与 --ai-input 离线导入分析；结构/引用通过不代表语义正确或生成者已验证。
只把生成/指定的检索式发送给 GitHub。最多 2 次搜索 + 5 次 README 请求。
不自动读取 Token，不直接调用付费 API；本机 Ollama 是否使用云端模型取决于用户配置。不会执行仓库代码。`;

interface CliIO { fetcher?: typeof fetch; plannerFetcher?: typeof fetch; stdout?: (text: string) => void; stderr?: (text: string) => void }

async function reserveOutput(path: string | undefined, category: string): Promise<string> {
  const output = resolve(path ?? join('.compass', category, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`));
  try { await mkdir(dirname(output), { recursive: true }); await mkdir(output); }
  catch { throw new DiscoveryError('OUTPUT', '输出目录已存在或无法创建；请使用一个新的 --out 目录。'); }
  return output;
}

export async function runCli(args: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? (text => { process.stdout.write(text); });
  const stderr = io.stderr ?? (text => { process.stderr.write(text); });
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
        query: { type: 'string', multiple: true }, limit: { type: 'string' }, out: { type: 'string' },
        json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
        replay: { type: 'string' },
        'semantic-plan': { type: 'string' }, 'local-model': { type: 'string' },
        'prepare-ai': { type: 'boolean' }, 'import-ai': { type: 'string' }, 'ai-input': { type: 'string' },
      } });
    } catch { throw new DiscoveryError('INVALID_INPUT', '参数无法识别，请运行 npm run compass -- --help。'); }
    if (parsed.values.help) { stdout(`${help}\n`); return 0; }
    if (parsed.values['import-ai'] !== undefined) {
      if (!parsed.values['ai-input'] || parsed.positionals.length || parsed.values['prepare-ai'] !== undefined || parsed.values.replay !== undefined || parsed.values.query !== undefined || parsed.values.limit !== undefined || parsed.values['semantic-plan'] !== undefined || parsed.values['local-model'] !== undefined) {
        throw new DiscoveryError('INVALID_INPUT', '导入须提供 --import-ai 和 --ai-input，不与创意、检索或资料导出参数混用。');
      }
      // Validate everything before creating output, and never construct a network client.
      const input = validateAiInput(await readBoundedJson(parsed.values['ai-input'], AI_INPUT_MAX_BYTES));
      const result = createReviewResult(await readBoundedJson(parsed.values['import-ai'], AI_REVIEW_MAX_BYTES), input);
      const markdown = renderAiReview(result, input);
      const inputJson = serializeAiInput(input);
      const output = await reserveOutput(parsed.values.out, 'ai-review');
      try {
        await writeFile(join(output, 'ai-input.json'), inputJson, { flag: 'wx' });
        await writeFile(join(output, 'ai-review.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
        await writeFile(join(output, 'ai-review.md'), markdown, { flag: 'wx' });
      } catch { throw new DiscoveryError('OUTPUT', 'AI 分析写入失败；已有文件保留，请换新目录重试。'); }
      stdout(parsed.values.json ? JSON.stringify(result, null, 2) + '\n' : markdown);
      stderr(`已保存：${join(output, 'ai-review.md')}\n结构/引用检查通过；语义与生成者未核实。未调用模型或网络。\n`);
      return 0;
    }
    if (parsed.values['ai-input'] !== undefined) throw new DiscoveryError('INVALID_INPUT', '--ai-input 只与 --import-ai 一起使用。');
    if (parsed.values['semantic-plan'] !== undefined && parsed.values.query !== undefined) throw new DiscoveryError('INVALID_INPUT', '--semantic-plan 与 --query 不能同时使用。');
    if (parsed.values['local-model'] !== undefined && (parsed.values.query !== undefined || parsed.values['semantic-plan'] !== undefined || parsed.values.replay !== undefined)) {
      throw new DiscoveryError('INVALID_INPUT', '--local-model 不与 --query、--semantic-plan 或 --replay 混用；离线重放请使用已有 semantic-plan.json。');
    }
    if (parsed.positionals.length !== 1) throw new DiscoveryError('INVALID_INPUT', '请用引号传入一段项目创意；用 --help 查看示例。');
    const limit = parsed.values.limit === undefined ? 5 : Number(parsed.values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new DiscoveryError('INVALID_INPUT', '--limit 必须为 1–5。');
    const replay = parsed.values.replay !== undefined ? await loadReplay(parsed.values.replay) : undefined;
    if (replay && !replay.savedQueries?.length) throw new DiscoveryError('INVALID_INPUT', '重放文件没有检索记录；未联网。');
    const idea = parsed.positionals[0]!;
    const localModel = parsed.values['local-model'];
    const semantic = localModel !== undefined
      ? await planWithLocalModel(idea, localModel, io.plannerFetcher)
      : parsed.values['semantic-plan'] !== undefined
        ? await readSemanticPlan(parsed.values['semantic-plan'], idea) : undefined;
    const plan = semantic ? planSemanticSearch(semantic, idea, replay?.savedQueries)
      : planSearch(idea, parsed.values.query ?? replay?.savedQueries);
    if (localModel !== undefined && plan.semantic) {
      plan.semantic.source = 'local_model';
      plan.understanding!.reason = '本地 Ollama 模型生成的语义声明；结构经过校验，语义未验证。';
      plan.warnings = [
        '本次使用用户显式选择的本地 Ollama 模型自动生成计划；结构校验不证明理解或条件已成立。',
        '模型可能误读否定词或遗漏限制；请核对原始要求与未验证条件。',
        '候选硬条件均为 unknown；不将关键词、否定或 README 文字当成功能验收。',
      ];
    }
    if (replay && parsed.values.query === undefined && !semantic) {
      plan.method = 'replay_queries';
      const automatic = planSearch(parsed.positionals[0]!);
      plan.warnings = [...automatic.warnings];
      if (JSON.stringify(automatic.queries) !== JSON.stringify(plan.queries)) plan.warnings.push('使用留档中的原始查询；当前规划不同，重放不替换历史查询或重新联网。');
    }
    if (!plan.queries.length) {
      const clarification = { status: 'needs_clarification', plan };
      stdout(parsed.values.json ? JSON.stringify(clarification, null, 2) + '\n' : `需要澄清：${plan.understanding?.clarification}\n未联网；补充后可直接重新运行，无需英文检索词。\n`);
      return 2;
    }
    stderr(`意图（${localModel !== undefined ? '本地模型声明，未验证' : semantic ? '外部声明，未验证' : '规则推断'}）：${intentLabel(plan.understanding!.intent)}；${plan.understanding!.reason}\n`);
    const client = replay ?? new GitHubSearch(io.fetcher);
    const output = await reserveOutput(parsed.values.out, 'discovery');
    let executedPlan = plan;
    let queryExecution: QueryExecution | undefined;
    try {
      stderr(`${client.mode === 'replay' ? '历史响应离线重放' : 'GitHub 只读检索'}：${plan.queries.join(' / ')}\n`);
      const report = await discover(plan, client, limit);
      executedPlan = report.plan;
      queryExecution = report.query_execution;
      const aiInput = parsed.values['prepare-ai'] ? createAiInput(report, client.captures) : undefined;
      const markdown = renderDiscovery(report);
      await writeFile(join(output, 'captures.json'), JSON.stringify(client.captures, null, 2) + '\n', { flag: 'wx' });
      await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      await writeFile(join(output, 'report.md'), markdown, { flag: 'wx' });
      if (semantic) await writeFile(join(output, 'semantic-plan.json'), JSON.stringify(semantic, null, 2) + '\n', { flag: 'wx' });
      if (aiInput) {
        await writeFile(join(output, 'ai-input.json'), serializeAiInput(aiInput), { flag: 'wx' });
        await writeFile(join(output, 'ai-sources.md'), renderAiSources(aiInput), { flag: 'wx' });
        await writeFile(join(output, 'ai-instructions.md'), aiInstructions(aiInput, localModel === undefined ? 'no_model' : 'local_model'), { flag: 'wx' });
        await writeFile(join(output, 'ai-review.schema.json'), aiReviewSchemaJson(), { flag: 'wx' });
        stderr(`AI 资料已导出：${join(output, 'ai-instructions.md')}；${localModel === undefined ? '本次未调用语义规划模型' : '本次已调用本地 Ollama 生成检索计划'}，导出步骤未再次调用分析模型或发送资料。\n`);
      }
      stdout(parsed.values.json ? JSON.stringify(report, null, 2) + '\n' : markdown);
      stderr(`已保存：${join(output, 'report.md')}\n${join(output, 'report.json')}\n`);
      return report.status === 'partial' ? 5 : 0;
    } catch (error) {
      // Keep available evidence on failure, without saving a success report.
      await writeFile(join(output, 'captures.json'), JSON.stringify(client.captures, null, 2) + '\n', { flag: 'wx' }).catch(() => undefined);
      const execution = error instanceof DiscoveryError ? error.query_execution ?? queryExecution : queryExecution;
      await writeFile(join(output, 'failure.json'), JSON.stringify({ status: 'failed', plan: executedPlan, error: error instanceof DiscoveryError ?
        { code: error.code, message: error.message } : { code: 'OUTPUT', message: '结果写入失败；已有文件保留。' },
        ...(execution ? { query_execution: execution } : {}) }, null, 2) + '\n', { flag: 'wx' }).catch(() => undefined);
      if (semantic) await writeFile(join(output, 'semantic-plan.json'), JSON.stringify(semantic, null, 2) + '\n', { flag: 'wx' }).catch(() => undefined);
      if (error instanceof DiscoveryError) throw error;
      throw new DiscoveryError('OUTPUT', '结果写入失败；请检查输出目录，已有文件保留。');
    }
  } catch (error) {
    const failure = error instanceof DiscoveryError ? error : new DiscoveryError('OUTPUT', '运行失败；没有自动删除或覆盖已有数据。');
    stderr(`${failure.code}: ${failure.message}\n`);
    return failure.code === 'INVALID_INPUT' ? 2 : failure.code === 'OUTPUT' ? 4 : 5;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
