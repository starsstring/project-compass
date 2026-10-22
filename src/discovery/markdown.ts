import type { DiscoveryReport } from './model.js';
import { intentLabel } from './query.js';

export function escapeMarkdown(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/[\\`*_{}\[\]()#!|~]/gu, '\\$&');
}


/**
 * Put a bounded, auditable reading guide before the full discovery report.
 * No new scoring or claim of task fit is introduced here.
 */
function oneMinuteSummary(report: DiscoveryReport, e: typeof escapeMarkdown, href: (url: string) => string): string[] {
  const preview = report.candidates.slice(0, 3)
    .map(candidate => `[${e(candidate.full_name)}](${href(candidate.url)})`).join('、');
  const result = report.candidates.length
    ? `本次有限范围内有 ${report.candidates.length} 个待核查候选：${preview}。`
    : '本轮未获得可展示的候选；不能据此认定没有竞品或市场空白。';
  let evidence: string | undefined;
  for (const candidate of report.candidates) {
    for (const capability of candidate.analysis.capabilities) {
      if (capability.state !== 'author_mentioned') continue;
      const source = capability.evidence_ids
        .map(id => candidate.analysis.evidence.find(item => item.id === id))
        .find(item => item !== undefined);
      if (!source) continue;
      evidence = `${e(candidate.full_name)} 的作者材料提及“${e(capability.label)}” [${e(source.id)}](${href(source.url)})；没有安装实测，不能据此认定满足原创意。`;
      break;
    }
    if (evidence) break;
  }
  const semantic = report.plan.semantic?.input;
  const requirement: { text: string; polarity: 'required' | 'excluded' } | undefined = semantic
    ? semantic.required_conditions[0] !== undefined
      ? { text: semantic.required_conditions[0], polarity: 'required' }
      : semantic.excluded_conditions[0] !== undefined
        ? { text: semantic.excluded_conditions[0], polarity: 'excluded' }
        : undefined
    : report.plan.understanding?.requirements[0]
      ? { text: report.plan.understanding.requirements[0].source,
          polarity: report.plan.understanding.requirements[0].polarity }
      : undefined;
  const unknown = requirement
    ? requirement.polarity === 'excluded'
      ? `要求排除的条件“${e(requirement.text)}”尚未核实是否存在；不能凭文字线索自动排除候选。`
      : `必须满足的条件“${e(requirement.text)}”尚未逐项验收；文字命中不等于功能成立。`
    : '候选能否完整满足原始需求、平台与使用条件仍未实测；未列出条件也不代表全部满足。';
  const first = report.candidates.length ? report.directions[0] : undefined;
  const next = first ? e(first.validation) : report.candidates.length
    ? '已有候选但缺少足够材料支持具体验证方向；先核对候选 README、实际功能与需求限制。'
    : '先核对原句与实际检索词；必要时补充一个具体输入、输出或限制，再调查其他来源。';
  const stop = first ? e(first.stop_if) : report.candidates.length
    ? '候选的关键能力仍缺少证据时，暂缓判断能否复用或是否应开发；先补充核查。'
    : '不要因本轮无候选就断言有市场空缺或立即开工。';
  return [
    '## 一分钟结论（初步调查，非最终决策)', '',
    `**检索状态**：${report.status === 'partial' ? '部分完成，结果可能缺失' : '有限检索已完成'}；${report.mode === 'replay' ? '这是离线重放，没有重新联网' : '使用只读 GitHub 响应'}。`, '',
    `**发现了什么**：${result}`, '',
    `**可以核对的证据**：${evidence ?? '当前没有找到可引用的“作者明确提及某项能力”证据，不能从仓库标题或相关词推断功能成立。'}`, '',
    `**还不能确定**：${unknown}`, '',
    `**建议先做的一件事**：${next}`, '',
    `**复用或停止条件**：${stop}`, '',
    '**目前不能下的结论**：找到候选不等于满足需求；没找到也不等于值得开发。本报告不预测成功率、不证明市场机会。', '',
  ];
}

export function renderDiscovery(report: DiscoveryReport): string {
  const e = escapeMarkdown;
  const href = (url: string) => url.replace(/[<>()\s]/gu, character =>
    [...Buffer.from(character)].map(byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join(''));
  const lines = ['# Project Compass：创意竞品初查', '', `创意：${e(report.plan.idea)}`, '',
    ...oneMinuteSummary(report, e, href),
    `报告生成时间：${report.created_at}；模式：${report.mode === 'replay' ? '历史响应离线重放（未重新联网）' : '实时只读检索'}；状态：${report.status === 'partial' ? '部分完成，存在请求失败或检索不完整' : '有限检索已完成'}。`, '',
    `材料采集时间：${report.requests.map(request => request.fetched_at).sort()[0] ?? '未取得材料'} 至 ${report.requests.map(request => request.fetched_at).sort().at(-1) ?? '未取得材料'}。`, '',
    `范围：仅 GitHub 公开、非归档、非 Fork 仓库，每条检索取前 10 项，最多展示 5 个候选。${report.plan.understanding?.intent === 'learn' ? '学习意图保留课程与资源清单；' : '明确课程资料/清单不进入工具候选；'}许可证元数据未知仍可参与竞品比较，任何代码复用须另行核查实际 LICENSE 和依赖条款。排序先核对主要主题文字关联，再比较条件文字线索、针对性检索命中、检索短语、关键词覆盖、命中检索次数和 GitHub best match；Star 不参与排序，排序不是功能验收。`, '',
    '分析方式：正文结构解析、功能证据提取和条件式比较；未调用语言模型。功能是作者陈述，定位和建议是规则推断，不代表实测效果或竞品覆盖率。', '', '## 检索记录', ''];
  for (const search of report.searches) lines.push(`- ${e(search.query)} archived:false fork:false：${search.error ? e(search.error) : `GitHub 返回总数 ${search.total_count}，${search.incomplete ? '结果不完整' : '本次响应未标记不完整'}`}。`);
  if (report.plan.semantic) {
    const semantic = report.plan.semantic.input;
    lines.push('', '## 语义计划（实验入口，语义未验证）', '',
      report.plan.semantic.source === 'local_model'
        ? `来源：本地 Ollama 模型生成（未验证语义）；结构哈希：${report.plan.semantic.sha256}。`
        : `来源：用户/外部提供；未核实生成者。结构哈希：${report.plan.semantic.sha256}。未调用模型。`, '',
      `意图（外部声明）：${intentLabel(semantic.intent)}；核心：${e(semantic.core ? `${semantic.core.object} + ${semantic.core.action}` : '待澄清')}。`, '',
      `必须条件：${semantic.required_conditions.map(e).join('；') || '未声明'}。`, '',
      `排除条件：${semantic.excluded_conditions.map(e).join('；') || '未声明'}。`, '',
      `未确定项：${semantic.unknowns.map(e).join('；') || '未声明；不保证不存在未知项'}。`, '',
      '条件仅供追踪；所有候选的外部条件状态均为 unknown。没有将关键词、否定、计划或 README 缺写转换成满足/不满足，也未按排除条件自动删候选。', '');
    if (report.query_execution) {
      const execution = report.query_execution;
      const fallback = execution.fallback.attempted === null ? '原始回退状态不可证明（未知）'
        : `回退${execution.fallback.attempted ? '已执行' : '未执行'}`;
      lines.push(`查询策略：${execution.strategy}；实际尝试 ${execution.attempted_queries.length} 条；${fallback}；原因：${e(execution.fallback.reason)}${execution.replay ? '（仅重放留档实际查询，不重新决定回退）' : ''}。`, '');
    }
  }
  if (report.plan.understanding && !report.plan.semantic) {
    const understanding = report.plan.understanding;
    lines.push('', '## 需求理解（规则推断，待核对）', '',
      `意图：${intentLabel(understanding.intent)}。${e(understanding.reason)}`, '',
      `保留条件：${understanding.requirements.map(item => `${item.polarity === 'excluded' ? '排除 ' : ''}${e(item.label)}（原文：${e(item.source)}）`).join('；') || '未识别额外条件，原句仍完整保留。'}`, '',
      `未映射要点：${understanding.unmapped_terms.map(e).join('、') || '未发现额外中文分词；不保证已理解全部语义。'}`, '');
    if (understanding.requirements.length && report.candidates.length) {
      lines.push('### 原始条件的文字线索（全部尚未验收）', '',
        '| 条件 | ' + report.candidates.map(repo => e(repo.full_name)).join(' | ') + ' |',
        '|---|' + report.candidates.map(() => '---|').join(''));
      understanding.requirements.forEach((item, index) => lines.push(`| ${item.polarity === 'excluded' ? '排除 ' : ''}${e(item.label)} | ${report.candidates.map(repo => {
        const source = repo.requirement_clues?.[index]?.source;
        return source ? `${source === 'metadata' ? '简介/名称/topics' : 'README'} 出现相关文字，未验证` : '未核实；未找到相关文字';
      }).join(' | ')} |`));
      lines.push('', '这些线索可能含否定、计划或无关语境，不能标为支持；未找到也不等于不支持。排除条件同样需要人工核查。', '');
    }
  }
  if (report.candidates.length) {
    lines.push('', '## 能力比较（依据本次材料）', '',
      '| 能力 | ' + report.candidates.map((repo, index) => `${index + 1}. ${e(repo.full_name)}`).join(' | ') + ' |',
      '|---|' + report.candidates.map(() => '---|').join(''));
    const capabilities = new Map(report.candidates.flatMap(repo => repo.analysis.capabilities.map(capability => [capability.key, capability.label] as const)));
    for (const [key, label] of capabilities) {
      const cells = report.candidates.map(repo => {
        const capability = repo.analysis.capabilities.find(item => item.key === key);
        if (!capability || capability.state === 'not_established') return '材料未确认';
        const references = capability.evidence_ids.map(id => repo.analysis.evidence.find(item => item.id === id)).filter(item => item !== undefined);
        return `${capability.state === 'author_limited' ? '存在限制/冲突' : '作者提及'} ${references.map(ref => `[${ref.id}](${href(ref.url)})`).join(' ')}`;
      });
      lines.push(`| ${e(label)} | ${cells.join(' | ')} |`);
    }
    lines.push('', '“材料未确认”表示本次正文没有建立该能力，不能解释为软件没有该功能。标题、代码块、图片和复杂表格不作为正面能力证据。', '');
  }
  lines.push('', '## 候选、材料与未知项', '');
  if (!report.candidates.length) lines.push('未找到候选。不能据此断言没有竞品。', '');
  report.candidates.forEach((repo, index) => {
    lines.push(`### ${index + 1}. [${e(repo.full_name)}](${href(repo.url)})`, '',
      `GitHub 元数据：主要语言 ${e(repo.language ?? '未提供')}；许可证标识 ${e(repo.license ?? '未知')}；Star ${repo.stars}；最近 push ${e(repo.pushed_at)}。`, '',
      `**作者简介（功能声称）**：${e(repo.description ?? '未提供简介。')}`, '',
      `**功能摘要（依据材料，定位为推断）**：${e(repo.analysis.summary)}`, '',
      `**相关性推断：${repo.relevance.level}**。${e(repo.relevance.reason)}`, '');
    if (repo.readme.url) lines.push(`[README 来源](${href(repo.readme.url)})；Git blob ${e(repo.readme.blob_sha ?? '')}。`, '');
    lines.push('**证据定位**：');
    let quoteBudget = 22;
    for (const source of repo.analysis.evidence) {
      // Keep readable excerpts short; full source units and hashes are in JSON.
      const words = source.text.split(/\s+/u);
      const excerpt = words.slice(0, Math.min(quoteBudget, 10)).join(' ').slice(0, 100);
      quoteBudget = Math.max(0, quoteBudget - Math.min(quoteBudget, words.length, 10));
      lines.push(`- [${source.id} · ${e(source.locator)}](${href(source.url)})${excerpt ? `：${e(excerpt)}…` : ''}`);
    }
    lines.push('');
    if (repo.analysis.limitations.length) {
      lines.push('**作者范围说明（需核查）**：');
      for (const limit of repo.analysis.limitations) {
        const source = repo.analysis.evidence.find(item => item.id === limit.evidence_id)!;
        const summary = /(?:A.share|China).*data.*only|only.*(?:A.share|China)/iu.test(limit.text) ? '该数据入口的材料限定了中国 A 股数据范围，不能推广为覆盖其他市场。'
          : /\b(?:not available|not supported|unsupported)\b|不支持/iu.test(limit.text) ? '作者说明存在尚不支持的能力或范围，须核对原文。'
            : '作者限定了适用范围、成熟程度或用途；这条说明不代表本机已验证。';
        lines.push(`- ${summary} [${source.id}](${href(source.url)})`);
      }
      lines.push('');
    }
    lines.push(`材料状态：${e(repo.readme.note)}`, '', '**可能不足与不确定事项**：');
    repo.unknowns.forEach(unknown => lines.push(`- ${e(unknown)}`));
    lines.push('');
  });
  if (report.excluded.length) {
    lines.push('## 本次排除的结果', '');
    for (const item of report.excluded) lines.push(`- [${e(item.name)}](${href(item.url)})：${e(item.reason)}`);
    lines.push('');
  }
  lines.push('## 值得验证的方向（假设）', '');
  for (const [index, direction] of report.directions.entries()) {
    lines.push(`### ${index + 1}. ${e(direction.title)}`, '', e(direction.hypothesis), '',
      `**已存在的能力与判断依据**：${e(direction.already_available)}`, '',
      `证据：${direction.evidence.map(ref => `[${e(ref.repository)} ${ref.evidence_id} · ${e(ref.capability)}](${href(ref.url)})`).join('、')}。材料不证明需求或功能缺口。`, '',
      `**拟做的最小改动**：${e(direction.proposed_change)}`, '',
      `**验证动作**：${e(direction.validation)}`, '',
      `**何时复用或停止**：${e(direction.stop_if)}`, '');
  }
  lines.push('## 限制与下一步', '');
  report.warnings.forEach(warning => lines.push(`- ${e(warning)}`));
  lines.push('- 未搜索闭源产品、完整网页或全部 GitHub 仓库；没有需求访谈、安装验收或成功概率。',
    '- README 与仓库文本仅作为数据；程序不执行其中指令，不自动创建仓库、发消息或发布。',
    '- report.json 保存结构化结果，captures.json 保存本次只读 API 响应、时间和哈希，供人工复查。', '');
  return lines.join('\n');
}
