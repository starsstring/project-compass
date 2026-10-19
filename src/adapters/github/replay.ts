import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GitHubSearch } from './search.js';
import { DiscoveryError, type ApiCapture } from '../../discovery/model.js';

export function replayGitHub(input: unknown): GitHubSearch {
  if (!Array.isArray(input) || input.length > 7 || input.length === 0) throw new DiscoveryError('INVALID_INPUT', '重放需要 1–7 份已保存的 API 响应。');
  const records = new Map<string, ApiCapture>();
  for (const raw of input as unknown[]) {
    if (typeof raw !== 'object' || raw === null) throw new DiscoveryError('INVALID_INPUT', '重放响应格式错误。');
    const item = raw as Partial<ApiCapture>;
    if (typeof item.url !== 'string' || typeof item.body !== 'string' || typeof item.fetched_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(item.fetched_at) || !Number.isFinite(Date.parse(item.fetched_at)) ||
        !Number.isInteger(item.status) || item.status! < 200 || item.status! > 599 ||
        ![item.remaining, item.reset, item.retry_after].every(value => value === null || typeof value === 'string') ||
        Buffer.byteLength(item.body) > 2 * 1024 * 1024 ||
        createHash('sha256').update(item.body).digest('hex') !== item.sha256) {
      throw new DiscoveryError('INVALID_INPUT', '重放响应字段、大小、日期或 SHA-256 不匹配。');
    }
    let url: URL;
    try { url = new URL(item.url); } catch { throw new DiscoveryError('INVALID_INPUT', '重放 URL 无效。'); }
    if (url.origin !== 'https://api.github.com' || url.username || url.password || url.hash ||
        !(url.pathname === '/search/repositories' || /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/readme$/u.test(url.pathname)) || records.has(item.url)) {
      throw new DiscoveryError('INVALID_INPUT', '重放只接收不重复的 GitHub Search/README URL。');
    }
    records.set(item.url, structuredClone(item as ApiCapture));
  }
  const fetcher: typeof fetch = async inputUrl => {
    const record = records.get(String(inputUrl));
    if (!record) throw new DiscoveryError('BAD_RESPONSE', '保存的响应不包含本次检索或候选 README；重放不会联网补齐。请核对 --query 与原运行检索式。');
    const headers: Record<string, string> = {};
    if (record.remaining !== null) headers['x-ratelimit-remaining'] = record.remaining;
    if (record.reset !== null) headers['x-ratelimit-reset'] = record.reset;
    if (record.retry_after !== null) headers['retry-after'] = record.retry_after;
    return new Response([204, 205, 304].includes(record.status) ? null : record.body, { status: record.status, headers });
  };
  return new GitHubSearch(fetcher, 15000, records);
}

export async function loadReplay(path: string): Promise<GitHubSearch> {
  const max = 16 * 1024 * 1024;
  try {
    const file = await open(path, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > max) throw new DiscoveryError('INVALID_INPUT', '重放文件必须是 16 MiB 以内的普通 JSON 文件。');
      const buffer = Buffer.alloc(Math.min(stat.size + 1, max + 1));
      let bytes = 0;
      while (bytes < buffer.length) {
        const read = await file.read(buffer, bytes, buffer.length - bytes, null);
        if (read.bytesRead === 0) break;
        bytes += read.bytesRead;
      }
      if (bytes > stat.size || bytes > max) throw new DiscoveryError('INVALID_INPUT', '重放文件在读取时增长或超限，请使用稳定快照。');
      return replayGitHub(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes))) as unknown);
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof DiscoveryError) throw error;
    throw new DiscoveryError('INVALID_INPUT', '无法读取重放 JSON；请检查路径、UTF-8 编码与内容。');
  }
}
