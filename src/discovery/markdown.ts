import type { DiscoveryReport } from './model.js';

export function escapeMarkdown(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/[\\`*_{}\[\]()#!|~]/gu, '\\$&');
}

export function renderDiscovery(report: DiscoveryReport): string {
  const e = escapeMarkdown;
  const href = (url: string) => url.replace(/[<>()\s]/gu, character =>
    [...Buffer.from(character)].map(byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join(''));
  const lines = ['# Project Compass：创意竞品初查', '', `创意：${e(report.plan.idea)}`, '',
    `报告生成时间：${report.created_at}；模式：${report.mode === 'replay' ? '历史响应离线重放（未重新联网）' : '实时只读检索'}；状态：${report.status === 'partial' ? '部分完成，存在请求失败或检索不完整' : '有限检索已完成'}。`, '',
    `材料采集时间：${report.requests.map(request => request.fetched_at).sort()[0] ?? '未取得材料'} 至 ${report.requests.map(request => request.fetched_at).sort().at(-1) ?? '未取得材料'}。`, '',
    '范围：仅 GitHub 公开、非归档、非 Fork 仓库，每条检索取前 10 项，最多展示 5 个候选。明确课程资料/清单不进入工具候选；许可证元数据未知仍可参与竞品比较，任何代码复用须另行核查实际 LICENSE 和依赖条款。排序优先完整检索短语、关键词覆盖、命中检索次数及 GitHub best match，Star 不参与排序。', '',
    '分析方式：正文结构解析、功能证据提取和条件式比较；未调用语言模型。功能是作者陈述，定位和建议是规则推断，不代表实测效果或竞品覆盖率。', '', '## 检索记录', ''];
  for (const search of report.searches) lines.push(`- ${e(search.query)} archived:false fork:false：${search.error ? e(search.error) : `GitHub 返回总数 ${search.total_count}，${search.incomplete ? '结果不完整' : '本次响应未标记不完整'}`}。`);
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
