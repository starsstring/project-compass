import { Lexer, type Token } from 'marked';
import { createHash } from 'node:crypto';
import type { CandidateAnalysis, Capability, Evidence, Repository } from './model.js';

interface Prose { text: string; source: Evidence['source']; url: string; locator: string; section: string }
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/** Read the lexer tree as text; never invoke Marked's HTML renderer. */
function inlineText(tokens: Token[], depth = 0): string {
  if (depth > 20) return '';
  return tokens.map(token => {
    if (['image', 'html', 'code'].includes(token.type)) return ' ';
    if ('tokens' in token && Array.isArray(token.tokens)) return inlineText(token.tokens, depth + 1);
    return 'text' in token && typeof token.text === 'string' ? token.text : ' ';
  }).join('');
}

export function extractProse(content: string, url: string): Prose[] {
  const source = content.replace(/\r\n?/gu, '\n');
  const output: Prose[] = [];
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === '\n') lineStarts.push(index + 1);
  const lineAt = (offset: number) => {
    let low = 0, high = lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (lineStarts[middle]! <= offset) low = middle; else high = middle;
    }
    return low + 1;
  };
  let section = '';
  const headings: string[] = [];
  const walk = (tokens: Token[], parentStart: number, parentEnd: number, depth: number) => {
    if (depth > 20 || output.length >= 2000) return;
    let cursor = parentStart;
    for (const token of tokens) {
      if (output.length >= 2000) break;
      const found = source.indexOf(token.raw, cursor);
      const located = found >= parentStart && found + token.raw.length <= parentEnd;
      const start = located ? found : parentStart;
      cursor = start + token.raw.length;
      const line = lineAt(start);
      // Nested Markdown can strip quote/list markers. Fall back to the whole
      // containing source range, never invent an exact child line number.
      const endOffset = located ? start + token.raw.length : parentEnd;
      const end = lineAt(Math.max(start, start + source.slice(start, endOffset).trimEnd().length - 1));
      if (token.type === 'heading') {
        headings.length = token.depth;
        headings[token.depth - 1] = inlineText(token.tokens ?? []);
        section = headings.filter(Boolean).join(' / ');
        continue;
      }
      if (['code', 'html', 'table', 'def', 'space', 'hr'].includes(token.type)) continue;
      if (token.type === 'list') {
        for (const item of token.items as { raw: string; tokens: Token[] }[]) walk(item.tokens, start, endOffset, depth + 1);
      } else if (token.type === 'blockquote') walk(token.tokens ?? [], start, endOffset, depth + 1);
      else if (token.type === 'paragraph' || token.type === 'text') {
        const tokens = token.tokens ?? [token];
        // A navigation link titled "Migration" is not a claim that the product
        // migrates user data. Require prose outside a bare reference/label.
        if (tokens.every(item => ['link', 'image', 'html', 'br', 'strong', 'em'].includes(item.type) ||
          (item.type === 'text' && 'text' in item && !/[\p{L}\p{N}]/u.test(String(item.text))))) continue;
        const text = inlineText(tokens).replace(/\s+/gu, ' ').trim();
        if (text.length < 15 || /^(?:from \w|import \w|pip |npm |sudo |curl |conda |python |\.\. |[=~_-]+$)/iu.test(text)) continue;
        // Separate sentences so a limitation on one feature does not negate all
        // features in a long paragraph. Skip headings, code, tables and images.
        for (const sentence of text.split(/(?<=[。！？;；])\s*|(?<=[.!?])\s+(?=[A-Z])/u)) {
          if (sentence.length < 15 || sentence.length > 800) continue;
          output.push({ text: sentence, source: 'readme', url: `${url}#L${line}-L${end}`, locator: `README L${line}–L${end}`, section });
        }
      }
    }
  };
  walk(Lexer.lex(source, { gfm: true }), 0, source.length, 0);
  return output;
}

const features = [
  ['backtest', '策略回测', /\bbacktest(?:ing|s)?\b|回测/iu],
  ['live', '实盘交易接口', /\blive trad(?:ing|e)\b|实盘/iu],
  ['paper', '模拟交易', /\bpaper trad(?:ing|e)\b|模拟交易/iu],
  ['optimize', '参数优化', /\boptimi[sz](?:ation|e|er|ing)\b|参数优化/iu],
  ['costs', '费用或滑点建模', /\b(?:commissions?|slippage|transaction costs|trading fees)\b|手续费|滑点/iu],
  ['portfolio', '投资组合管理', /\bportfolio(?:s)?\b|资产配置|投资组合/iu],
  ['data', '数据接入或导入', /\b(?:data (?:feeds?|loading|import|sources?)|(?:historical|market) data|OHLCV?|CSV)\b|数据导入|数据接入/iu],
  ['report', '图表或分析报告', /\b(?:plots?|plotting|charts?|tearsheets?|visuali[sz]ation|dashboards?)\b|可视化|绘图|分析报告/iu],
  ['markdown', 'Markdown 文本处理', /\bmarkdown\b|Markdown笔记/iu],
  ['files', '本地文件存储', /\b(?:local files?|plain.text files?|file.based|local.first)\b|本地文件|本地优先/iu],
  ['sync', '同步', /\bsync(?:hroni[sz](?:ation|e))?\b|同步/iu],
  ['collaborate', '实时协作', /\bcollaborat(?:ion|ive|e)\b|实时协作/iu],
  ['links', '笔记链接或附件', /\b(?:backlinks?|wiki.links?|attachments?)\b|双链|附件/iu],
  ['transfer', '数据导入或导出', /\b(?:export(?:ing)?|import(?:ing)?|migrat(?:e|ion))\b|导入|导出|迁移/iu],
  ['serial', '串口数据收发', /\b(?:serial (?:port|terminal|monitor|device|API)|UART|serialport)\b|串口/iu],
  ['record', '记录或会话保存', /\b(?:record(?:ing)?|logg?ing|log files?|save (?:data|sessions?))\b|记录|录制|会话保存/iu],
  ['protocol', '其他通信协议', /\b(?:Bluetooth|TCP|UDP|I2C|SPI|CAN bus)\b|蓝牙/iu],
  ['download', '文件下载', /\bdownload(?:ing|s|er)?\b|下载/iu],
  ['resume', '断点续传或恢复', /\b(?:resum(?:e|able|ing)|breakpoint|relaunch recovery)\b|断点续传/iu],
  ['integrity', '完整性校验', /\b(?:checksums?|hash verification|integrity (?:check|verification)|SHA-?256)\b|完整性校验|哈希校验/iu],
  ['batch', '多任务下载', /\b(?:batch|multiple files|multi.task|parallel download)\b|批量下载|多任务/iu],
] as const;

export function capabilityLabel(key: string): string { return features.find(row => row[0] === key)?.[1] ?? key; }

function uncertain(sentence: Prose): boolean {
  return /todo|roadmap|planned|wishlist|coming soon|future|upcoming|计划|待实现|路线图/iu.test(sentence.section) ||
    /\b(?:planned|roadmap|wishlist|coming soon|future (?:releases?|versions?)|not (?:yet )?released|plan(?:s|ned)? to|will (?:be )?(?:support(?:ed)?|add(?:ed)?|implement(?:ed)?)|(?:wish|hope) to|(?:we are|we're|is|are) working on)\b|(?:计划|打算|准备).{0,12}(?:支持|添加|加入|实现|提供)|(?:将会?|即将)(?:支持|添加|加入|实现|提供)|尚未发布|暂未发布|仍在开发|待实现/iu.test(sentence.text);
}
function denied(text: string, match: RegExpMatchArray): boolean {
  const start = match.index ?? 0;
  const before = text.slice(Math.max(0, start - 80), start);
  const after = text.slice(start + match[0].length, start + match[0].length + 45);
  return /(?:\b(?:not|never|cannot|can't|doesn't|don't)\s+(?:currently\s+)?(?:support|provide|allow|include|offer|handle|implement|enable|perform|use)(?:\s+[\w-]+){0,3}\s*|\bno plans? to (?:support|provide|add|implement)\s*|\b(?:no|without|not)\s*(?:built.in\s+)?|(?:不|尚不|暂不|未|尚未|暂未)(?:支持|提供|实现|开放).{0,12}|无法.{0,8})$/iu.test(before) ||
    /^\s*(?:(?:is|are|was|were|remains?)\s+)?(?:(?:currently|still)\s+)?(?:not\s+(?:(?:currently|yet|fully|natively)\s+)?(?:supported|available|implemented|enabled)\b|unavailable\b|unsupported\b|removed\b|disabled\b|cannot\s+(?:be\s+)?(?:used|enabled|supported)\b)/iu.test(after) ||
    /^\s*(?:功能)?(?:(?:目前|当前|仍|暂时))?(?:在(?:本|此|当前)版本(?:中)?)?(?:(?:尚未|暂未|尚不|暂不|不|未)(?:支持|提供|实现|可用|开放)|不可用|(?:已被|已)?(?:移除|禁用))/u.test(after);
}

export function analyzeCandidate(repo: Repository, readme: { content: string; url: string } | null): CandidateAnalysis {
  const units: Prose[] = repo.description ? [{ text: repo.description, source: 'description', url: repo.url, locator: 'GitHub description', section: '' }] : [];
  if (readme) units.push(...extractProse(readme.content, readme.url).filter(unit =>
    !/install|requirements|dependencies|licen[sc]e|acknowledg|contribut|sponsor|funding|copyright|running tests|development|安装|依赖|许可|开发测试/iu.test(unit.section) &&
    !/\b(?:WITHOUT WARRANTY|MERCHANTABILITY|FITNESS FOR A PARTICULAR PURPOSE)\b/iu.test(unit.text)));
  const evidence: Evidence[] = [];
  const register = (unit: Prose): string => {
    const existing = evidence.find(item => item.text === unit.text && item.locator === unit.locator);
    if (existing) return existing.id;
    const id = `E${evidence.length + 1}`;
    evidence.push({ id, source: unit.source, url: unit.url, locator: unit.locator, text: unit.text, text_sha256: sha(unit.text) });
    return id;
  };
  const capabilities: Capability[] = [];
  for (const [key, label, pattern] of features) {
    const hits = units.filter(unit => pattern.test(unit.text) && !uncertain(unit));
    // A repeated feature may be supported in one scope and denied in another.
    // Inspect every occurrence instead of trusting just the first match.
    const hasDenial = (unit: Prose) => [...unit.text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))].some(match => denied(unit.text, match));
    const negative = hits.find(hasDenial);
    const positive = hits.find(unit => !hasDenial(unit));
    // Contradictory author material is a limitation to inspect, never silently
    // convert it into an assertion of support.
    capabilities.push({ key, label, state: negative ? 'author_limited' : positive ? 'author_mentioned' : 'not_established',
      evidence_ids: [...new Set([negative, positive].filter((unit): unit is Prose => unit !== undefined).map(register))] });
  }
  const limitations = units.filter(unit => /\b(?:only|not (?:available|supported)|does not support|unsupported|limited to|experimental|alpha)\b|仅支持|仅限|不支持|尚不支持|暂不支持/iu.test(unit.text) && !uncertain(unit) &&
    (features.some(([, , pattern]) => pattern.test(unit.text)) || /\b(?:markets?|system|Windows|Linux|macOS|Android|iOS|Python|pypy|adapter|alpha|beta|experimental|OAuth)\b|数据|平台|系统/iu.test(unit.text)))
    .sort((a, b) => Number(/\b(?:data|markets?)\b|数据|市场/iu.test(b.text)) - Number(/\b(?:data|markets?)\b|数据|市场/iu.test(a.text)))
    .slice(0, 3).map(unit => ({ text: unit.text, evidence_id: register(unit) }));
  const classify = (text: string) => /\b(?:framework|library|engine|SDK|NSURLSession|URLSession)\b|框架|引擎|开发库/iu.test(text) ? '框架/开发库（需编程集成）'
    : /\b(?:extension|plugin)\b|插件/iu.test(text) ? '插件/扩展'
      : /\b(?:webapp|web app|collaborat\w*|self.hosted)\b|网页|协作/iu.test(text) ? 'Web/协作工具（部署方式待核查）'
        : /\b(?:app|application|editor|terminal|manager|monitor)\b|应用|编辑器|软件|工具/iu.test(text) ? '应用/工具（安装方式待核查）' : null;
  const role = classify(repo.description ?? '') ?? units.slice(0, 12).filter(unit => /\bis (?:a|an|the)\b|\bprovides (?:a|an)\b|本项目|一款|这是/iu.test(unit.text))
    .map(unit => classify(unit.text)).find(label => label !== null) ?? '用途分类待核查';
  const supported = capabilities.filter(item => item.state === 'author_mentioned');
  const summary = `${role}。${supported.length ? `作者材料描述的能力：${supported.slice(0, 7).map(item => item.label).join('、')}。` : '材料不足以形成可靠功能摘要。'}${limitations.length ? '材料含适用范围或限制，需查看下方证据。' : ''}`;
  return { summary, role, capabilities, evidence, limitations };
}
