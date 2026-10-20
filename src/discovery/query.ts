import { DiscoveryError, type SearchPlan, type InputUnderstanding, type SearchRequirement } from './model.js';
import { concepts, qualifiers } from './vocabulary.js';

const stopwords = new Set('i a an the want would like to build create make develop tool app application software for with and or of on my me that can using simple local project open source github help users user is it this find looking remember learn study without exclude not no need needs require required support supports'.split(' '));
const chineseStopwords = new Set('我 想 做 一个 一种 可以 能 的 地 得 用于 面向 支持 开发 软件 工具 应用 平台 项目 创意 方向 全新 尚未 未 识别 未知 了解 非常 厉害 强大 功能 好用 有趣 有用 大家 用户 需要 实现 帮助'.split(' '));
const unique = (terms: string[]) => [...new Set(terms)];
const words = (input: string) => (input.toLowerCase().match(/[a-z][a-z0-9+#.-]*/gu) ?? []).filter(term => !stopwords.has(term));
const inReadme = ' in:name,description,readme';

export function intentLabel(intent: InputUnderstanding['intent']): string {
  return { find_project: '寻找已有项目', develop: '开发创意', learn: '学习探索', unclear: '意图未明确' }[intent];
}

function understand(idea: string): InputUnderstanding {
  let intent: InputUnderstanding['intent'] = 'unclear';
  let reason = '未出现明确的寻找、开发或学习表达，先保留不确定性。';
  const signals = [
    { intent: 'find_project' as const, pattern: /我记得|有个(?:工具|项目|软件)|寻找|查找|有没有|想找|找一个|\b(?:find|remember)\b|looking for/iu },
    { intent: 'learn' as const, pattern: /学习|入门|\b(?:learn|study)\b/iu },
    { intent: 'develop' as const, pattern: /我想(?:做|开发|创建)|想做|开发一个|\b(?:build|create|develop|make)\b/iu },
  ].flatMap(item => {
    const match = item.pattern.exec(idea);
    if (!match || /不(?:想|要)?$|not(?: to)?\s*$/iu.test(idea.slice(Math.max(0, match.index - 8), match.index))) return [];
    return [{ intent: item.intent, index: match.index, source: match[0] }];
  }).sort((a, b) => a.index - b.index);
  if (signals[0]) { intent = signals[0].intent; reason = `根据最先出现的意图表达“${signals[0].source}”推断；复合意图仍需人工核对。`; }
  const requirements: SearchRequirement[] = qualifiers.flatMap(item => {
    const match = item.pattern.exec(idea); if (!match) return [];
    const before = idea.slice(Math.max(0, match.index - 18), match.index);
    const excluded = /(?:不需要|不要|不用|无需|排除|without|exclude|not|no)\s*$/iu.test(before);
    return [{ key: item.key, label: item.label, source: match[0], terms: [...item.terms], polarity: excluded ? 'excluded' as const : 'required' as const }];
  });
  return { intent, reason, requirements, unmapped_terms: [], clarification: null };
}

export function mentionsRequirement(text: string, requirement: SearchRequirement): boolean {
  return requirement.terms.some(term => {
    if (/\p{Script=Han}/u.test(term)) return text.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/ /gu, '[\\s_-]*');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'iu').test(text);
  });
}

export function planSearch(ideaInput: string, explicitQueries: string[] = []): SearchPlan {
  const idea = ideaInput.trim();
  if (idea.length < 4 || idea.length > 2000 || /[\u0000-\u001f\u007f]/u.test(idea)) {
    throw new DiscoveryError('INVALID_INPUT', '请提供 4–2000 字符的单行需求。');
  }
  if (explicitQueries.length > 2 || explicitQueries.some(query => !query.trim() || query.length > 200 || /[\u0000-\u001f\u007f]/u.test(query))) {
    throw new DiscoveryError('INVALID_INPUT', '--query 最多两条，每条 1–200 字符。');
  }
  const understanding = understand(idea);
  if (explicitQueries.length) {
    const queries = unique(explicitQueries.map(query => query.trim()));
    return { idea, queries, terms: unique(queries.flatMap(words)).filter(term => !/^(?:archived|false|fork|in|readme|language|stars|true|name|description)$/u.test(term)),
      method: 'explicit_query', understanding, warnings: ['使用指定检索词；原始需求和条件仍保留，文本关联不等于任务适配。'] };
  }
  const matches = concepts.filter(concept => concept.pattern.test(idea));
  const positive = understanding.requirements.filter(item => item.polarity === 'required');
  const legacy = positive.filter(item => qualifiers.find(row => row.key === item.key)?.role === 'legacy').map(item => item.terms[0]!);
  const advanced = positive.filter(item => qualifiers.find(row => row.key === item.key)?.role !== 'legacy');
  const english = unique(words(idea));
  const chinese = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(idea)]
    .filter(item => item.isWordLike && /\p{Script=Han}/u.test(item.segment) && item.segment.length >= 2 && !chineseStopwords.has(item.segment))
    .map(item => item.segment);
  let unmapped = idea;
  for (const item of [...concepts, ...qualifiers]) unmapped = unmapped.replace(new RegExp(item.pattern.source, 'giu'), ' ');
  unmapped = unmapped.replace(/我记得|有个|我想|想要|准备|创建|学习|寻找|查找|有没有|需要|接近|代码/gu, ' ');
  understanding.unmapped_terms = unique([...new Intl.Segmenter('zh', { granularity: 'word' }).segment(unmapped)]
    .filter(item => item.isWordLike && /\p{Script=Han}/u.test(item.segment) && item.segment.length >= 2 && !chineseStopwords.has(item.segment)).map(item => item.segment)).slice(0, 12);
  const warnings = ['规划来自有限词表、规则与中文分词，未调用模型；意图是推断，条件文字线索不代表功能已验证。'];
  const ambiguous = /一切|万能|\b(?:everything|anything)\b|(?:很|非常|特别)?(?:厉害|强大|好用)的(?:软件|工具|项目)/iu.test(idea);
  let queries: string[];
  if (ambiguous || (!matches.length && !english.length && !chinese.length)) {
    understanding.clarification = /逆向/iu.test(idea)
      ? '你是在找某个已有项目，还是想学习或开发逆向工具？请补充对象，例如程序、APK、硬件或协议。'
      : '你想找现成工具、开发软件还是学习？请补充一个要解决的具体问题或输入输出。';
    return { idea, queries: [], terms: [], method: 'keyword_rules', understanding, warnings };
  }
  let core: string[];
  if (matches.length) core = matches.length === 1 ? [matches[0]!.alternatives[0]!] : unique(matches.flatMap(item => [...item.terms]));
  else core = english.length ? english.slice(0, 4) : unique(chinese).slice(0, 4);
  // Retain unmapped English nouns (APK/Java/DNS/etc.) alongside a known topic.
  const mapped = new Set([...matches.flatMap(item => [...item.terms, ...item.alternatives]), ...understanding.requirements.flatMap(item => item.terms)].flatMap(item => words(item)));
  const extraEnglish = matches.length ? english.filter(term => !mapped.has(term)).slice(0, 3) : [];
  const task = advanced.filter(item => qualifiers.find(row => row.key === item.key)?.role === 'task');
  if (advanced.length || extraEnglish.length) {
    const focused = unique([...legacy, ...core, ...task.map(item => item.terms[0]!), ...advanced.filter(item => !task.includes(item)).map(item => item.terms[0]!), ...extraEnglish]);
    const broadTask = task.find(item => ['ocr', 'evaluation'].includes(item.key));
    const broadCore = matches.length === 1 && matches[0]!.alternatives.length > 1 ? [matches[0]!.alternatives[1]!] : core;
    const broad = unique([...legacy, ...broadCore, ...(broadTask ? [broadTask.terms[0]!] : [])]);
    queries = [focused.join(' ').slice(0, 170) + inReadme, broad.join(' ').slice(0, 190)];
  } else if (matches.length === 1) queries = matches[0]!.alternatives.slice(0, 2).map(query => [...legacy, query].join(' '));
  else queries = [unique([...legacy, ...core]).join(' ').slice(0, 170) + (!matches.length && !english.length ? inReadme : '')];
  if (!matches.length && !english.length) warnings.push('未识别英文主题：保留中文分词检索，不保证覆盖英文 README；查询为空或不相关时请补充用途。');
  if (understanding.unmapped_terms.length) warnings.push(`尚未映射的中文要点：${understanding.unmapped_terms.join('、')}；原文保留，不保证这些条件已进入查询。`);
  if (understanding.requirements.some(item => item.polarity === 'excluded')) warnings.push('否定条件已保留，但不生成 GitHub 排除词，避免误删只是在文档中提及该词的候选；需要逐项核对。');
  if (/量化|回测|\bbacktest|algorithmic trading/iu.test(idea)) warnings.push('本次量化主题主要检索策略研究/回测和交易框架，未覆盖所有行情数据、风控、券商接口或成品终端；未指定市场，不默认限定 A 股或实盘。');
  const terms = unique([...legacy, ...core.flatMap(term => words(term).length ? words(term) : [term]), ...advanced.flatMap(item => words(item.terms[0]!)), ...extraEnglish]);
  const topic_terms = matches.length ? unique(matches.flatMap(item => [...item.terms, ...item.alternatives])) : core;
  return { idea, queries: unique(queries), terms, topic_terms, method: 'keyword_rules', understanding, warnings };
}
