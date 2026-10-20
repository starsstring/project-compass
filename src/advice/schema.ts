import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import type { AiInput, AiReview } from './model.js';

const string = { type: 'string', minLength: 1, maxLength: 2000 };
const id = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,31}$' };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const repository = { type: 'string', pattern: '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$', maxLength: 220 };
const strings = { type: 'array', items: string, maxItems: 20 };
const ids = { type: 'array', items: id, minItems: 1, maxItems: 40, uniqueItems: true };
const nullableString = { anyOf: [{ ...string, minLength: 0 }, { type: 'null' }] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const array = (items: unknown, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems });
const reference = object({ source_id: id, start_line: { type: 'integer', minimum: 1, maximum: 1100000 }, end_line: { type: 'integer', minimum: 1, maximum: 1100000 } });

export const aiInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...object({ format: { const: 'compass-ai-input-v1' }, sha256: digest, content: object({
    idea: { ...string, minLength: 4 }, queries: array({ ...string, maxLength: 200 }, 1, 2),
    status: { enum: ['complete', 'partial'] }, warnings: strings,
    candidates: array(object({ repository, url: string, description: nullableString, language: nullableString, license: nullableString,
      stars: { type: 'integer', minimum: 0 }, pushed_at: { type: 'string', format: 'date-time' }, readme_status: { enum: ['captured', 'unavailable'] } }), 1, 5),
    sources: array(object({ id, repository, kind: { enum: ['description', 'readme'] }, url: string,
      captured_at: { type: 'string', format: 'date-time' }, response_sha256: digest,
      blob_sha: { anyOf: [{ type: 'string', pattern: '^[a-f0-9]{40,64}$' }, { type: 'null' }] },
      text: { type: 'string', maxLength: 1048576 }, text_sha256: digest,
      line_count: { type: 'integer', minimum: 1, maximum: 1100000 } }), 1, 10),
  }) }),
};

export const aiReviewSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...object({ format: { const: 'compass-ai-review-v1' }, input_sha256: digest,
    claims: array({ oneOf: [
      object({ id, kind: { const: 'author_statement' }, repository, text: string, evidence: array(reference, 1, 5) }),
      object({ id, kind: { const: 'inference' }, text: string, basis_ids: ids, assumptions: strings }),
      object({ id, kind: { const: 'unknown' }, text: string, reason: string }),
    ] }, 1, 40),
    comparisons: array(object({ repository, basis_ids: { ...ids, minItems: 0 }, assessment: string, unknown_ids: ids }), 1, 5),
    directions: array(object({ id, title: string, basis_ids: ids, condition: string, proposed_change: string,
      validation: object({ input: string, steps: { ...strings, minItems: 1, maxItems: 10 }, expected_output: string }), stop_if: string }), 0, 3),
    recommended_first_step: object({ direction_id: { anyOf: [id, { type: 'null' }] }, reason: string }),
    limitations: { ...strings, minItems: 1 },
  }),
};
const ajv = new Ajv2020({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false, formats: fullFormats });
export const inputValidator = ajv.compile<AiInput>(aiInputSchema);
export const reviewValidator = ajv.compile<AiReview>(aiReviewSchema);
