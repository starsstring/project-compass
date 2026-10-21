import { GitHubSearch } from '../adapters/github/search.js';
import { DiscoveryError, type Candidate, type DiscoveryReport, type Repository, type SearchPlan } from './model.js';
import { analyzeCandidate, extractProse } from './evidence.js';
import { buildDirections, relevantCapabilities } from './directions.js';
import { intentLabel, mentionsRequirement, planSearch } from './query.js';
import type { QueryExecution } from './model.js';

function matches(repo: Repository, terms: string[]): string[] {
  const haystack = `${repo.full_name} ${repo.description ?? ''} ${repo.topics.join(' ')}`.toLowerCase();
  return terms.filter(term => haystack.includes(term === 'notes' ? 'note' : term === 'resume' ? 'resum' : term));
}

export function readmeExcerpt(content: string, terms: string[]): string | null {
  const lines = extractProse(content, 'https://github.com/').map(item => item.text);
  const line = lines.find(item => terms.some(term => item.toLowerCase().includes(term === 'notes' ? 'note' : term))) ?? lines[0];
  if (!line) return null;
  return line.split(/\s+/u).slice(0, 22).join(' ').slice(0, 180);
}

export async function discover(plan: SearchPlan, client: GitHubSearch, limit = 5): Promise<DiscoveryReport> {
  if (!plan.queries.length) throw new DiscoveryError('INVALID_INPUT', '请先澄清需求，再进行检索。');
  if (plan.queries.length > 2) throw new DiscoveryError('INVALID_INPUT', '每次任务最多两条查询。');
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new DiscoveryError('INVALID_INPUT', '--limit 必须为 1–5。');
  if (plan.semantic && client.mode === 'replay') {
    const actual = client.savedQueries;
    if (!actual?.length || actual.length > 2) throw new DiscoveryError('INVALID_INPUT', '语义重放需要 1–2 条留档实际查询。');
    plan = { ...plan, queries: [...actual], terms: planSearch(plan.idea, actual).terms };
  }
  const execution: QueryExecution | undefined = plan.semantic ? {
    strategy: 'semantic_short_fallback', planned_queries: [...plan.queries], attempted_queries: [], replay: client.mode === 'replay',
    // Captures preserve requests/responses, not the original query strategy.
    fallback: { attempted: client.mode === 'replay' ? null : false,
      reason: client.mode === 'replay' ? 'replay_actual_queries' : 'no_alternative' },
  } : undefined;
  const exclusionReason = (repo: Repository): string | null => plan.understanding?.intent !== 'learn'
    && /\b(?:lecture notes|course notes|raw markdown notes|curated list|awesome list|personal .*vault template)\b/iu.test(repo.description ?? '')
    ? '描述显示为课程资料、资源清单或个人模板；本轮不作为直接工具候选。' : null;
  const warnings = [...plan.warnings];
  if (plan.understanding) {
    warnings.push(`意图为${plan.semantic ? '外部声明（未验证）' : '规则推断'}：${intentLabel(plan.understanding.intent)}。`);
    if (plan.understanding.requirements.length) warnings.push(`原始条件（未验证）：${plan.understanding.requirements.map(item => `${item.polarity === 'excluded' ? '排除 ' : ''}${item.label}`).join('、')}。文字出现不代表条件满足；未出现也不证明不支持。`);
  }
  const searches: DiscoveryReport['searches'] = [];
  const found = new Map<number, Repository>();
  let partial = false;
  let lastSearchError: DiscoveryError | undefined;
  for (const [index, query] of plan.queries.entries()) {
    execution?.attempted_queries.push(query);
    try {
      const result = await client.search(query);
      searches.push({ query, total_count: result.total, incomplete: result.incomplete, error: null });
      if (result.incomplete) { partial = true; warnings.push(`GitHub 标记检索结果不完整：${query}`); }
      for (const repo of result.items) {
        const existing = found.get(repo.id);
        if (existing) existing.matched_queries.push(query);
        else found.set(repo.id, repo);
      }
      if (execution && client.mode === 'live' && index === 0) {
        if (result.incomplete) { execution.fallback.reason = 'primary_incomplete'; break; }
        if ([...found.values()].some(repo => exclusionReason(repo) === null)) {
          execution.fallback.reason = 'primary_has_candidates'; break;
        }
        if (plan.queries.length < 2) { execution.fallback.reason = 'no_alternative'; break; }
        execution.fallback = { attempted: true, reason: 'primary_empty' };
      }
    } catch (error) {
      if (!(error instanceof DiscoveryError)) throw error;
      lastSearchError = error;
      searches.push({ query, total_count: null, incomplete: true, error: `${error.code}: ${error.message}` });
      partial = true;
      if (execution && client.mode === 'live') {
        if (index === 0) execution.fallback.reason = 'primary_failed';
        break;
      }
      if (error.code === 'RATE_LIMIT') break;
    }
  }
  if (searches.every(search => search.error !== null)) {
    throw new DiscoveryError(lastSearchError?.code ?? 'NETWORK', searches.map(search => search.error).join('；'), execution);
  }
  if (execution) plan = { ...plan, queries: [...execution.attempted_queries], terms: planSearch(plan.idea, execution.attempted_queries).terms };
  const excluded: DiscoveryReport['excluded'] = [];
  const eligible = [...found.values()].filter(repo => {
    // Reanalysis keeps the originally attempted candidate set; it cannot fetch
    // README files for newly ranked search hits from an old offline snapshot.
    if (client.savedRepositories?.length && !client.savedRepositories.includes(repo.full_name)) return false;
    const reason = exclusionReason(repo);
    if (reason) { excluded.push({ name: repo.full_name, url: repo.url, reason }); return false; }
    return true;
  });
  const normalize = (value: string) => value.toLowerCase().replace(/[-_]/gu, ' ');
  const ordered = eligible.map((repo, index) => {
    const metadata = normalize(`${repo.full_name} ${repo.description ?? ''} ${repo.topics.join(' ')}`);
    const phrases = plan.queries.filter(query => metadata.includes(normalize(query.replace(/ in:name,description,readme$/u, ''))));
    const focused = plan.method === 'keyword_rules' && plan.queries.length === 2 && plan.queries[0]!.endsWith('in:name,description,readme') && repo.matched_queries.includes(plan.queries[0]!);
    const requirements = plan.understanding?.requirements.filter(item => item.polarity === 'required' && mentionsRequirement(metadata, item)).length ?? 0;
    return { repo, index, matched: matches(repo, plan.terms), phrases, focused: Number(focused), requirements,
      topic: Number(matches(repo, plan.topic_terms ?? []).length > 0),
      topicPhrases: matches(repo, (plan.topic_terms ?? []).filter(term => term.includes(' '))).length };
  })
    .sort((a, b) => client.savedRepositories?.length
      ? client.savedRepositories.indexOf(a.repo.full_name) - client.savedRepositories.indexOf(b.repo.full_name)
      : b.topic - a.topic || b.topicPhrases - a.topicPhrases || b.requirements - a.requirements || b.focused - a.focused || b.phrases.length - a.phrases.length || b.matched.length - a.matched.length || b.repo.matched_queries.length - a.repo.matched_queries.length || a.index - b.index)
    .slice(0, limit);
  const candidates: Candidate[] = [];
  for (const { repo, matched, phrases } of ordered) {
    let readme: Candidate['readme'];
    let material: { content: string; url: string } | null = null;
    try {
      const result = await client.readme(repo);
      material = result;
      readme = { status: 'captured', url: result.url, blob_sha: result.blob_sha, content_sha256: result.sha256,
        author_excerpt: readmeExcerpt(result.content, plan.terms), note: '作者 README 摘选；仅静态读取，不证明功能可用。完整响应见本地 captures.json。' };
    } catch (error) {
      if (!(error instanceof DiscoveryError)) throw error;
      partial = true;
      readme = { status: 'unavailable', url: null, blob_sha: null, content_sha256: null, author_excerpt: null,
        note: `${error.code}: ${error.message}` };
    }
    const analysis = analyzeCandidate(repo, material);
    const relevant = relevantCapabilities(plan);
    if (relevant) {
      analysis.capabilities = analysis.capabilities.filter(capability => relevant.includes(capability.key));
      const mentioned = analysis.capabilities.filter(capability => capability.state === 'author_mentioned');
      analysis.summary = `${analysis.role}。${mentioned.length ? `作者材料描述的能力：${mentioned.map(item => item.label).join('、')}。` : '本次正文中尚未确认与目标任务对应的能力。'}`;
      const referenced = new Set([...analysis.capabilities.flatMap(item => item.evidence_ids), ...analysis.limitations.map(item => item.evidence_id)]);
      analysis.evidence = analysis.evidence.filter(item => referenced.has(item.id));
    }
    const metadata = `${repo.full_name} ${repo.description ?? ''} ${repo.topics.join(' ')}`;
    const requirement_clues = plan.understanding?.requirements.map(item => ({ label: item.label, polarity: item.polarity,
      source: mentionsRequirement(metadata, item) ? 'metadata' as const : material && mentionsRequirement(material.content, item) ? 'readme' as const : null }));
    const external_conditions: Candidate['external_conditions'] = plan.semantic ? [
      ...plan.semantic.input.required_conditions.map(text => ({ kind: 'required' as const, text, status: 'unknown' as const })),
      ...plan.semantic.input.excluded_conditions.map(text => ({ kind: 'excluded' as const, text, status: 'unknown' as const })),
    ] : undefined;
    candidates.push({ ...repo, ...(requirement_clues ? { requirement_clues } : {}), ...(external_conditions ? { external_conditions } : {}), readme, analysis, relevance: {
      level: matched.length === 0 ? '待人工核查' : phrases.length > 0 ? '较强文本关联' : '部分文本关联',
      matched_terms: matched,
      reason: matched.length ? `名称/简介/topics 出现：${matched.join('、')}；完整检索短语匹配：${phrases.join(' / ') || '无'}；GitHub 检索式：${repo.matched_queries.join(' / ')}。未验证任务、平台与受众适配。`
        : 'GitHub 返回了该仓库，但名称/简介/topics 未命中规划词；可能只命中 README，也可能不相关，需人工排除。',
    }, unknowns: ['功能是否稳定可用、是否符合原创意的全部约束尚未实测。', '没有读取完整 Issue/用户反馈，不能据此确认功能不足、需求规模或维护响应。',
      repo.license && repo.license !== 'NOASSERTION' ? '许可证为 GitHub 元数据；复用代码前仍需读取实际 LICENSE 和依赖条款。' : 'GitHub 未识别许可证；仍作为公开竞品候选分析，不代表没有许可证或允许复用。复用前须读取实际 LICENSE 和依赖条款。'] });
  }
  if (!candidates.length) warnings.push('本次有限检索没有符合筛选条件的候选；不代表没有竞品。请更换 --query 或扩大人工检索范围。');
  const directions = buildDirections(plan, candidates);
  return { format: 'compass-discovery-v1.1', mode: client.mode, created_at: new Date().toISOString(), plan,
    status: partial ? 'partial' : 'complete', searches, candidates, excluded, directions, warnings,
    requests: client.captures.map(({ body: _body, ...capture }) => capture), ...(execution ? { query_execution: execution } : {}) };
}
