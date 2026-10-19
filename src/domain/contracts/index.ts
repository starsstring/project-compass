import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import reportSchema from '../../../contracts/report-v1.schema.json' with { type: 'json' };
import decisionSchema from '../../../contracts/decision-v1.schema.json' with { type: 'json' };
import type { ReportRevision } from './report.generated.js';
import type { HumanDecision } from './decision.generated.js';

export type { ReportRevision, HumanDecision };

// Compile once. Schema mistakes throw during startup; invalid data returns a
// result. Validation never coerces, inserts defaults or removes properties.
const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  validateFormats: true,
  formats: fullFormats,
});
// Generic URI permits scheme-only values. Source links require a parsed HTTPS
// host and must not embed credentials; validation does not fetch the URL.
ajv.addFormat('compass-https-url', {
  type: 'string',
  validate(value: string): boolean {
    if (/[\u0000-\u0020\u007f]/u.test(value) || value.includes('\\')) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname !== '' &&
        url.username === '' && url.password === '';
    } catch {
      return false;
    }
  },
});
const reportValidator = ajv.compile<ReportRevision>(reportSchema);
const decisionValidator = ajv.compile<HumanDecision>(decisionSchema);

export type ContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: {
    code: 'INVALID_INPUT' | 'UNSUPPORTED_SCHEMA';
    message: string;
    details: ErrorObject[];
  } };

function validate<T>(input: unknown, validator: ValidateFunction<T>): ContractResult<T> {
  // Distinguish a declared unsupported version from missing/malformed input.
  if (typeof input === 'object' && input !== null &&
      'schema_version' in input && typeof input.schema_version === 'string' &&
      input.schema_version !== '1.0') {
    return { ok: false, error: {
      code: 'UNSUPPORTED_SCHEMA', message: 'Supported schema_version is 1.0.',
      details: [{ instancePath: '/schema_version', schemaPath: '#/properties/schema_version/const',
        keyword: 'const', params: { allowedValue: '1.0' }, message: 'must equal 1.0' }],
    } };
  }
  if (validator(input)) return { ok: true, value: input };
  // Ajv reuses .errors on subsequent calls. Return an independent snapshot.
  return { ok: false, error: {
    code: 'INVALID_INPUT', message: 'Input does not conform to the JSON Schema.',
    details: structuredClone(validator.errors ?? []),
  } };
}

/** Structure only; ../report.ts and ../revisions.ts add semantics and history. */
export function validateReport(input: unknown): ContractResult<ReportRevision> {
  return validate(input, reportValidator);
}

export function validateHumanDecision(input: unknown): ContractResult<HumanDecision> {
  return validate(input, decisionValidator);
}
