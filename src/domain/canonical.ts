import { createHash } from 'node:crypto';
import { failure, success, type DomainResult } from './result.js';

/** Deterministic project JSON; arrays and strings retain their original order/bytes. */
export function canonicalJson(input: unknown): DomainResult<string> {
  const active = new Set<object>();
  function encode(value: unknown, path: string): DomainResult<string> {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return success(JSON.stringify(value));
    if (typeof value === 'number' && Number.isFinite(value)) return success(JSON.stringify(value));
    if (typeof value !== 'object' || value === null) return failure('INVALID_INPUT', path, 'Expected finite JSON data.');
    if (active.has(value)) return failure('INVALID_INPUT', path, 'Cyclic data is not JSON.');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      return failure('INVALID_INPUT', path, 'Expected a plain JSON object.');
    }
    if (Object.getOwnPropertySymbols(value).length) return failure('INVALID_INPUT', path, 'Symbol keys are not JSON.');
    active.add(value);
    const parts: string[] = [];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const result = encode(value[i], `${path}/${i}`);
        if (!result.ok) return result;
        parts.push(result.value);
      }
      active.delete(value);
      return success(`[${parts.join(',')}]`);
    }
    for (const key of Object.keys(value).sort()) {
      const result = encode((value as Record<string, unknown>)[key], `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`);
      if (!result.ok) return result;
      parts.push(`${JSON.stringify(key)}:${result.value}`);
    }
    active.delete(value);
    return success(`{${parts.join(',')}}`);
  }
  return encode(input, '');
}

export const sha256Text = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
export function hashCanonical(input: unknown): DomainResult<string> {
  const result = canonicalJson(input);
  return result.ok ? success(sha256Text(result.value)) : result;
}
/** For already Schema-validated JSON values only. */
export function sameJson(a: unknown, b: unknown): boolean {
  const left = canonicalJson(a), right = canonicalJson(b);
  return left.ok && right.ok && left.value === right.value;
}
