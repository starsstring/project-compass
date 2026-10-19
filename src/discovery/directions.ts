import type { Candidate, Direction, SearchPlan } from './model.js';

export function topicOf(plan: SearchPlan): 'quant' | 'notes' | 'serial' | 'download' | 'general' {
  const text = `${plan.idea} ${plan.queries.join(' ')}`;
  if (/量化|回测|\b(?:backtest|quantitative|algorithmic trading)/iu.test(text)) return 'quant';
  if (/笔记|知识库|\bnotes?\b|note-taking/iu.test(text)) return 'notes';
  if (/串口|\bserial\b/iu.test(text)) return 'serial';
  if (/下载|续传|\bdownload/iu.test(text)) return 'download';
  return 'general';
}
export function relevantCapabilities(plan: SearchPlan): string[] | undefined {
  const keys = {
    quant: ['backtest', 'live', 'paper', 'optimize', 'costs', 'portfolio', 'data', 'report'],
    notes: ['markdown', 'files', 'sync', 'collaborate', 'links', 'transfer'],
    serial: ['serial', 'report', 'record', 'protocol', 'transfer'],
    download: ['download', 'resume', 'integrity', 'batch'],
  };
  const topic = topicOf(plan);
  return topic === 'general' ? undefined : keys[topic];
}

function basisFor(candidates: Candidate[], keys: string[]): Direction['evidence'] {
  const found: Direction['evidence'] = [];
  for (const candidate of candidates) for (const capability of candidate.analysis.capabilities) {
    if (!keys.includes(capability.key) || capability.state !== 'author_mentioned') continue;
    const id = capability.evidence_ids[0];
    const source = candidate.analysis.evidence.find(item => item.id === id);
    if (source) found.push({ repository: candidate.full_name, evidence_id: source.id, url: source.url, capability: capability.label });
  }
  return found;
}

export function buildDirections(plan: SearchPlan, candidates: Candidate[]): Direction[] {
  if (!candidates.length) return [];
  const directions: Direction[] = [];
  const add = (title: string, refs: Direction['evidence'], available: string, proposed: string, validation: string, stop: string) => {
    if (!refs.length) return;
    const evidence = refs.slice(0, 5);
    directions.push({ title, evidence, basis: [...new Set(evidence.map(item => candidates.find(repo => repo.full_name === item.repository)!.url))],
      already_available: available, proposed_change: proposed,
      hypothesis: '这是由本次材料支持的候选验证任务；尚未证实用户需求或竞品功能缺口。', validation, stop_if: stop });
  };
  const topic = topicOf(plan);
  if (topic === 'quant') {
    const backtests = basisFor(candidates, ['backtest']);
    const names = [...new Set(backtests.map(item => item.repository))];
    add('先复用回测引擎，做一份可复查的策略比较报告', backtests,
      `${names.join('、')} 的材料已经描述策略回测；再次实现回测内核的差异化依据不足。`,
      '仅增加一个离线研究入口：输入一份自有 OHLCV 数据、两个简单策略及同一资金/费用/成交规则，输出逐笔交易、收益与回撤的对照。先选择目标市场，不连接实盘。',
      '用小型固定数据手算一笔成交和费用，再运行两个策略；报告必须能定位结果差异，不能只展示收益曲线或承诺盈利。',
      '如果候选自带报告已经满足比较与复查，直接使用现成功能，不另建平台。');
    if (names.length >= 2) add('做跨引擎的成交与成本口径差异检查', backtests,
      `${names.slice(0, 2).join(' 与 ')} 都描述回测，但本次文档不能证明两者采用相同成交和成本假设。`,
      `给 ${names.slice(0, 2).join(' 与 ')} 各写一个小适配器，把同一输入转为统一交易账本；只解释买卖时点、费用、滑点和仓位差异，不重建交易引擎。`,
      '使用十根构造 K 线、固定信号和一项费用；逐笔对齐成交。再仅改变一个费用参数，检查能否准确指出哪笔记录变化。先读现有导出与分析接口。',
      '若既有导出/测试已能清楚解释差异，保留脚本或贡献文档，不做独立产品。');
    const scope = candidates.flatMap(repo => repo.analysis.limitations.filter(limit => /\b(?:data (?:only|coverage)|markets?|equities|ETF|stocks?|only.{0,35}data)\b|数据.*(?:仅|不支持)|仅.*数据|市场/iu.test(limit.text))
      .map(limit => ({ repo, limit, source: repo.analysis.evidence.find(item => item.id === limit.evidence_id)! })));
    if (scope.length) add('在已有数据入口上增加市场与字段兼容检查', scope.map(({ repo, source }) => ({ repository: repo.full_name,
      evidence_id: source.id, url: source.url, capability: '作者说明的数据/市场范围' })),
      scope.map(({ repo, source }) => `${repo.full_name} 的 ${source.locator} 包含数据或适用范围说明`).join('；'),
      '只接受用户选定市场的一份自有样例数据，核对时间、复权、价格/数量单位和必填字段，输出可解释的拒绝原因；不据此承诺跨市场支持。',
      '先核查对应数据入口，再用一份有效数据和一份故意缺列/错误单位的负对照，检查是否在回测前解释问题。',
      '若数据提供方或现有框架已完成这些检查，优先复用其导入流程。');
  } else if (topic === 'notes') {
    add('复用现有笔记工具，先验证一份真实笔记库', basisFor(candidates, ['markdown', 'files']),
      '候选已描述 Markdown 或本地文件能力，通用编辑器本身不是本轮证明的空白。',
      '选定一个目标平台，只整理一个十篇自有 Markdown 笔记库的导入、搜索和导出流程；保留原文件。',
      '核对标题、正文、相对链接及附件，记录实际需要手工修复的项目；先核查候选内置导入/导出。',
      '现成工具已满足完整流程时直接使用，不再开发通用笔记软件。');
    add('做笔记迁移前后的链接与附件差异检查', basisFor(candidates, ['links', 'transfer']),
      '本次候选材料已经出现链接、附件或导入/导出能力；这些能力可以作为迁移核查的集成点。',
      '只读比较迁移前后两个目录的相对链接、附件引用和正文数量，生成修复清单；不另造编辑器或同步服务。',
      '用十篇笔记、三个附件和一个故意断开的链接，检查能否精确定位问题；同时核查候选是否已有等价检查。',
      '如果已有迁移器能产出同样清单，采用该工具或补文档。');
  } else if (topic === 'serial') {
    add('复用已有收发工具，补一份可复查的串口故障记录', basisFor(candidates, ['serial']),
      '本次材料已描述串口收发或监视，通用串口窗口已有候选。',
      '固定一块开发板和一个串口，整理端口参数、时间戳、原始收发字节与断连位置，形成一份离线故障报告。',
      '先检查候选现有日志功能，用回环或可控设备验证一段固定字节序列和一次断连；不向未知设备发送控制命令。',
      '若现成日志已足以复查，就使用现成工具，不新增串口终端。');
    add('把波形或会话记录转成可重放的诊断样例', basisFor(candidates, ['report', 'record']),
      '部分候选已经描述绘图或记录能力，适合作为诊断样例的来源；不据此认定缺少重放。',
      '仅从已保存日志生成一份参数说明、预期字节与时间线，把实时界面上的一次问题变为可重复的离线输入。',
      '核查现有保存/导出/重放入口，然后比较同一记录两次重放的字节顺序与时间线，定位一次预置异常。',
      '候选自带重放满足要求时只整理操作示例。');
  } else if (topic === 'download') {
    add('复用已有下载与续传能力，缩小到一个目标环境', basisFor(candidates, ['download', 'resume']),
      '候选已描述下载或恢复能力，资料中同时可能出现框架与成品应用，需按目标平台选择。',
      '限定桌面应用或某个开发语言的一种集成，只增加下载任务及中断原因的清晰报告。',
      '对自有受控文件执行下载、中断和恢复，检查收到的字节与任务状态；先核查候选现成恢复功能。',
      '若现成应用或库已覆盖任务，直接复用，不另写下载引擎。');
    add('做续传边界与最终文件一致性检查', basisFor(candidates, ['resume', 'integrity']),
      '材料出现续传或校验能力，但本次材料不能保证各种服务端变化下都正确。',
      '给已有下载器提供本地受控 HTTP 样例：Range 可用、忽略 Range、文件改变三种情况，输出恢复行为和最终 SHA-256 的检查表。',
      '先查候选已有测试，然后各执行一次中断恢复，验证错误内容不会被当作成功；不抓取未知站点或绕过限制。',
      '已有测试已覆盖这些边界时，优先补文档或贡献一个最小案例。');
  }
  if (!directions.length) {
    const repo = candidates[0]!;
    const source = repo.analysis.evidence[0];
    if (source) add(`先核实 ${repo.full_name} 的现有能力再决定投入`, [{ repository: repo.full_name, evidence_id: source.id, url: source.url, capability: '已取得作者材料' }],
      `${repo.full_name} 有可读取的作者材料，但当前规则不足以支持具体差异化结论。`,
      '只把原创意落实为一项输入、输出和目标平台，逐项对照已取得材料；缺少支持的项目保留未知，不填造功能缺口。',
      '选择一条最接近的作者能力说明，手工验证它能否完成该输入输出；先完成这一项再考虑新开发。',
      '若现有工具已满足该任务，采用现成工具；证据仍不足时暂缓开发。');
  }
  return directions.slice(0, 3);
}
