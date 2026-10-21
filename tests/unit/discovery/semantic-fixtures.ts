import type { ExternalSemanticPlan } from '../../../src/discovery/model.js';

// Issue #3 T03 is a known regression, not a new/held-out input.
export const semanticIdea = '有没有 Linux 工具能找出内容相似但文件名不同的重复照片';
export function semanticFixture(): ExternalSemanticPlan {
  return { version: 1, idea: semanticIdea, intent: 'find_project',
    core: { object: 'duplicate image', action: 'finder' }, alternative: { object: 'similar image', action: 'finder' },
    required_conditions: ['Linux', '按内容相似'], excluded_conditions: ['上传照片'],
    unknowns: ['实际识别效果未核实'], clarification: null };
}
