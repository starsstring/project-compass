export type DomainCode = 'INVALID_INPUT' | 'UNSUPPORTED_SCHEMA' | 'INVALID_REFERENCE' |
  'SOURCE_INTEGRITY' | 'POLICY_VIOLATION' | 'REVISION_CONFLICT' | 'ID_CONFLICT';
export type DomainResult<T> = { ok: true; value: T } | {
  ok: false; error: { code: DomainCode; message: string; details: { path: string; message: string }[] };
};
export const success = <T>(value: T): DomainResult<T> => ({ ok: true, value });
export function failure(code: DomainCode, path: string, message: string): DomainResult<never> {
  return { ok: false, error: { code, message, details: [{ path, message }] } };
}
