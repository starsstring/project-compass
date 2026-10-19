import { DiscoveryError, type SearchPlan } from './model.js';

// A small, disclosed vocabulary, not a translator or a model. No repository names.
const concepts = [
  { pattern: /断点续传|下载|\bdownload(?:er|s|ing)?\b|\bresume\b/iu, terms: ['download', 'resume'], alternatives: ['download manager', 'download resume'] },
  { pattern: /串口|\bserial(?:[ -]port)?\b/iu, terms: ['serial', 'monitor', 'terminal'], alternatives: ['serial monitor', 'serial terminal'] },
  { pattern: /笔记|知识库|\bnotes?\b|note-taking/iu, terms: ['notes'], alternatives: ['notes', 'note-taking'] },
  { pattern: /密码|\bpassword\b/iu, terms: ['password'], alternatives: ['password manager'] },
  { pattern: /记账|预算|\bbudget\b|\bexpense/iu, terms: ['expense'], alternatives: ['expense tracker', 'budget'] },
  { pattern: /待办|任务管理|\btodo\b|task management/iu, terms: ['todo'], alternatives: ['todo', 'task management'] },
  { pattern: /截图|\bscreenshot/iu, terms: ['screenshot'], alternatives: ['screenshot'] },
  { pattern: /书签|\bbookmark/iu, terms: ['bookmark'], alternatives: ['bookmark manager'] },
  { pattern: /量化|回测|\bbacktest|algorithmic trading/iu, terms: ['backtesting'], alternatives: ['backtesting', 'quantitative trading'] },
] as const;
const modifiers = [
  { pattern: /markdown/iu, term: 'markdown' },
  { pattern: /\bssh\b/iu, term: 'ssh' },
  { pattern: /\bpdf\b/iu, term: 'pdf' },
  { pattern: /命令行|\bcli\b/iu, term: 'cli' },
] as const;
const stopwords = new Set('i a an the want would like to build create make develop tool app application software for with and or of on my me that can using simple local project open source github help users user is it this'.split(' '));

export function planSearch(ideaInput: string, explicitQueries: string[] = []): SearchPlan {
  const idea = ideaInput.trim();
  if (idea.length < 4 || idea.length > 2000 || /[\u0000-\u001f\u007f]/u.test(idea)) {
    throw new DiscoveryError('INVALID_INPUT', '请提供 4–2000 字符的单行项目创意。');
  }
  if (explicitQueries.length > 2 || explicitQueries.some(query => !query.trim() || query.length > 200 || /[\u0000-\u001f\u007f]/u.test(query))) {
    throw new DiscoveryError('INVALID_INPUT', '--query 最多两条，每条 1–200 字符。');
  }
  if (explicitQueries.length) {
    const queries = [...new Set(explicitQueries.map(query => query.trim()))];
    return { idea, queries, terms: [...new Set(queries.flatMap(query => query.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? []))]
      .filter(term => !/^(?:archived|false|fork|in|readme|language|stars|true)$/u.test(term)),
    method: 'explicit_query', warnings: ['使用用户指定检索词；文本关联不等于任务适配或真实需求。'] };
  }
  const matches = concepts.filter(concept => concept.pattern.test(idea));
  const modifierTerms = modifiers.filter(modifier => modifier.pattern.test(idea)).map(modifier => modifier.term);
  const english = (idea.toLowerCase().match(/[a-z][a-z0-9+#.-]*/g) ?? []).filter(term => !stopwords.has(term));
  let queries: string[];
  if (matches.length === 1) {
    const concept = matches[0]!;
    queries = concept.alternatives.slice(0, 2).map(query => [...modifierTerms, query].join(' '));
  } else if (matches.length > 1) {
    queries = [[...modifierTerms, ...matches.flatMap(item => item.terms)].join(' ')];
  } else {
    const terms = [...new Set(english)].slice(0, 4);
    if (!terms.length) throw new DiscoveryError('INVALID_INPUT', '当前关键词规则未识别此创意。请用 --query 提供 1–2 条 GitHub 检索词（建议英文），不会据此编造结果。');
    queries = [terms.join(' ')];
  }
  const terms = [...new Set([...modifierTerms, ...matches.flatMap(item => item.terms), ...(matches.length ? [] : english.slice(0, 4))])];
  return { idea, queries: [...new Set(queries)], terms, method: 'keyword_rules', warnings: [
    '检索词由有限中英关键词规则生成，可能遗漏受众、平台及复合需求；请核对检索式，必要时用 --query 修正。',
    ...(/量化|回测|\bbacktest|algorithmic trading/iu.test(idea) ? ['本次量化主题主要检索策略研究/回测和交易框架，未覆盖所有行情数据、风控、券商接口或成品终端；未指定市场，不默认限定 A 股或实盘。'] : []),
  ] };
}
