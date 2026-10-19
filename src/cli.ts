import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { GitHubSearch } from './adapters/github/search.js';
import { loadReplay } from './adapters/github/replay.js';
import { planSearch } from './discovery/query.js';
import { discover } from './discovery/analyze.js';
import { DiscoveryError } from './discovery/model.js';
import { renderDiscovery } from './discovery/markdown.js';

const help = `Project Compass V1 — GitHub 竞品初查（匿名只读，无模型 Key）

用法：npm run compass -- "项目创意" [--query "检索词"] [--limit 5] [--out "新目录"] [--json] [--replay "captures.json"]
示例：npm run compass -- "我想做一个本地 Markdown 笔记工具"
      npm run compass -- "面向开发板的串口调试工具" --query "serial monitor"

--query 可重复，最多两条；省略时用有限中英关键词规则。
--out 必须为尚不存在的目录；默认 .compass/discovery/<唯一运行号>。
--limit 1–5；--json 输出结构化报告；--help 显示帮助。
--replay 使用已有响应重新分析，不联网；检索词须与原运行一致。
只把生成/指定的检索式发送给 GitHub。最多 2 次搜索 + 5 次 README 请求。
不自动读取 Token，不调用付费 API，不执行仓库代码。`;

interface CliIO { fetcher?: typeof fetch; stdout?: (text: string) => void; stderr?: (text: string) => void }

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
      } });
    } catch { throw new DiscoveryError('INVALID_INPUT', '参数无法识别，请运行 npm run compass -- --help。'); }
    if (parsed.values.help) { stdout(`${help}\n`); return 0; }
    if (parsed.positionals.length !== 1) throw new DiscoveryError('INVALID_INPUT', '请用引号传入一段项目创意；用 --help 查看示例。');
    const plan = planSearch(parsed.positionals[0]!, parsed.values.query);
    const limit = parsed.values.limit === undefined ? 5 : Number(parsed.values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new DiscoveryError('INVALID_INPUT', '--limit 必须为 1–5。');
    const client = parsed.values.replay ? await loadReplay(parsed.values.replay) : new GitHubSearch(io.fetcher);
    const output = resolve(parsed.values.out ?? join('.compass', 'discovery', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`));
    // Reserve an exclusive run directory before network access. Never overwrite.
    try { await mkdir(dirname(output), { recursive: true }); await mkdir(output); }
    catch { throw new DiscoveryError('OUTPUT', '输出目录已存在或无法创建；请使用一个新的 --out 目录。'); }
    try {
      stderr(`${client.mode === 'replay' ? '历史响应离线重放' : 'GitHub 只读检索'}：${plan.queries.join(' / ')}\n`);
      const report = await discover(plan, client, limit);
      const markdown = renderDiscovery(report);
      await writeFile(join(output, 'captures.json'), JSON.stringify(client.captures, null, 2) + '\n', { flag: 'wx' });
      await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      await writeFile(join(output, 'report.md'), markdown, { flag: 'wx' });
      stdout(parsed.values.json ? JSON.stringify(report, null, 2) + '\n' : markdown);
      stderr(`已保存：${join(output, 'report.md')}\n${join(output, 'report.json')}\n`);
      return report.status === 'partial' ? 5 : 0;
    } catch (error) {
      // Keep available evidence on failure, without saving a success report.
      await writeFile(join(output, 'captures.json'), JSON.stringify(client.captures, null, 2) + '\n', { flag: 'wx' }).catch(() => undefined);
      await writeFile(join(output, 'failure.json'), JSON.stringify({ status: 'failed', plan, error: error instanceof DiscoveryError ?
        { code: error.code, message: error.message } : { code: 'OUTPUT', message: '结果写入失败；已有文件保留。' } }, null, 2) + '\n', { flag: 'wx' }).catch(() => undefined);
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
