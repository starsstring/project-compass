import { GitHubSearch } from '../../../src/adapters/github/search.js';
import { discover } from '../../../src/discovery/analyze.js';
import { planSearch } from '../../../src/discovery/query.js';
import { createAiInput } from '../../../src/advice/input.js';
import type { AiInput, AiReview } from '../../../src/advice/model.js';
import { fakeGitHub } from './fixtures.js';

export async function aiFixture() {
  const fake = fakeGitHub();
  const client = new GitHubSearch(fake.fetcher);
  const report = await discover(planSearch('a markdown notes tool'), client, 5);
  return { fake, client, report, input: createAiInput(report, client.captures) };
}
export function reviewFixture(input: AiInput): AiReview {
  const repository = input.content.candidates[0]!.repository;
  return { format: 'compass-ai-review-v1', input_sha256: input.sha256,
    claims: [
      { id: 'A1', kind: 'author_statement', repository, text: '作者描述了一个合成 Markdown 笔记工具。', evidence: [{ source_id: 'R1-D', start_line: 1, end_line: 1 }] },
      { id: 'I1', kind: 'inference', text: '它是值得检查的候选。', basis_ids: ['A1'], assumptions: ['用户需要本地笔记。'] },
      { id: 'U1', kind: 'unknown', text: '实际可用性未知。', reason: '没有安装实测。' },
    ], comparisons: [{ repository, basis_ids: ['I1'], assessment: '若任务符合，可先试用。', unknown_ids: ['U1'] }],
    directions: [{ id: 'D1', title: '先试用已有工具', basis_ids: ['I1'], condition: '需要一个本地笔记工具。', proposed_change: '先直接复用，不编写新编辑器。',
      validation: { input: '一份自有笔记。', steps: ['核对导入和导出结果。'], expected_output: '可复查的记录。' }, stop_if: '现成工具已经够用。' }],
    recommended_first_step: { direction_id: 'D1', reason: '先明确现成工具是否满足需求。' }, limitations: ['这是合成测试，不是实际试用。'] };
}
