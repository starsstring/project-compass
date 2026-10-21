import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../../contracts/semantic-plan-v1.schema.json' with { type: 'json' };
import { DiscoveryError, type ExternalSemanticPlan, type SemanticCore, type SearchPlan } from './model.js';
import { planSearch } from './query.js';

export const SEMANTIC_PLAN_MAX_BYTES = 32 * 1024;
const validate = new Ajv2020({ strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false })
  .compile<ExternalSemanticPlan>(schema);
function invalid(message: string): never { throw new DiscoveryError('INVALID_INPUT', message); }

function query(core: SemanticCore): string {
  const text = `${core.object} ${core.action}`.toLowerCase();
  const words = text.split(' ');
  if (words.length > 4 || text.length > 100 || words.some(word => /^(?:and|or|not)$/u.test(word))) {
    return invalid('语义核心对象+动作须为最多 4 个英文空格词、100 字符，不接受布尔检索操作符；不会截断。');
  }
  return text;
}

export function validateSemanticPlan(input: unknown, idea: string): ExternalSemanticPlan {
  if (!validate(input)) return invalid('外部语义计划不符合 semantic-plan-v1 Schema；请检查版本、字段、长度、控制字符与英文核心短语。');
  if (input.idea !== idea.trim()) return invalid('语义计划的 idea 必须与 CLI 原句一致。');
  // Validate even unused alternatives/clarifications; external fields never get
  // a route around query bounds. No semantic correctness or authorship is inferred.
  if (input.core) query(input.core);
  if (input.alternative) query(input.alternative);
  return structuredClone(input);
}

export function planSemanticSearch(input: unknown, idea: string, replayQueries?: string[]): SearchPlan {
  const semantic = validateSemanticPlan(input, idea);
  const queries = semantic.clarification ? [] : [...new Set([
    query(semantic.core!), ...(semantic.alternative ? [query(semantic.alternative)] : []),
  ])];
  const actual = semantic.clarification ? [] : replayQueries ?? queries;
  // Reuse the existing input/query bounds and explicit-query ranking terms.
  const base = planSearch(idea, actual);
  return { ...base, queries: [...actual], terms: actual.length ? base.terms : [], method: replayQueries ? 'replay_queries' : 'explicit_query',
    understanding: { intent: semantic.intent, reason: '用户/外部语义计划声明，来源身份与语义均未验证。',
      requirements: [], unmapped_terms: [], clarification: semantic.clarification },
    semantic: { source: 'external', verification: 'unverified',
      sha256: createHash('sha256').update(JSON.stringify(semantic)).digest('hex'), input: semantic },
    warnings: ['实验入口：使用用户/外部提供的语义计划；未调用模型，结构校验不证明语义正确。',
      '必须/排除条件仅追踪，候选条件均为 unknown；不将文字、否定或计划当成功能支持或排除依据。',
      ...(replayQueries ? ['重放仅使用留档实际查询/README，不重新决定回退；当前外部计划不证明原采集时的语义理解。'] : [])] };
}

export async function readSemanticPlan(path: string, idea: string): Promise<ExternalSemanticPlan> {
  try {
    // NONBLOCK avoids hanging on a supplied FIFO before fstat rejects it.
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > SEMANTIC_PLAN_MAX_BYTES) return invalid('语义计划须为 32 KiB 以内的普通 JSON 文件。');
      const buffer = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await file.read(buffer, size, buffer.length - size, null);
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      if (size > stat.size) return invalid('语义计划读取时增长，请使用稳定快照。');
      return validateSemanticPlan(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))) as unknown, idea);
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof DiscoveryError) throw error;
    return invalid('无法读取语义计划；请检查普通文件路径、UTF-8 编码与 JSON 格式。');
  }
}
