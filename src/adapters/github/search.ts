import { createHash } from 'node:crypto';
import { DiscoveryError, type ApiCapture, type Repository } from '../../discovery/model.js';

const digest = (body: string) => createHash('sha256').update(body).digest('hex');
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nullableText = (value: unknown): value is string | null => value === null || text(value);

export class GitHubSearch {
  readonly captures: ApiCapture[] = [];
  private blocked = false;
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 15000,
    private readonly replayRecords?: ReadonlyMap<string, ApiCapture>) {}
  get mode(): 'live' | 'replay' { return this.replayRecords ? 'replay' : 'live'; }
  get savedQueries(): string[] | undefined {
    if (!this.replayRecords) return undefined;
    return [...this.replayRecords.keys()].filter(url => new URL(url).pathname === '/search/repositories')
      .map(url => new URL(url).searchParams.get('q')?.replace(/ archived:false fork:false$/u, '') ?? '');
  }
  get savedRepositories(): string[] | undefined {
    return this.replayRecords ? [...this.replayRecords.keys()].filter(url => /^\/repos\/[^/]+\/[^/]+\/readme$/u.test(new URL(url).pathname))
      .map(url => new URL(url).pathname.slice('/repos/'.length, -'/readme'.length)) : undefined;
  }

  private async request(path: string): Promise<unknown> {
    if (this.blocked) throw new DiscoveryError('RATE_LIMIT', 'GitHub 已限流，本次运行不再请求。请稍后重试。');
    const url = `https://api.github.com${path}`;
    try {
      const response = await this.fetcher(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Project-Compass-V1-ReadOnly', 'X-GitHub-Api-Version': '2022-11-28' },
      });
      // Bound the stream, including responses without Content-Length.
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      if (reader) {
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 2 * 1024 * 1024) {
              await reader.cancel();
              throw new DiscoveryError('BAD_RESPONSE', 'GitHub 响应超过 2 MiB 上限。');
            }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
      }
      const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      const capture: ApiCapture = { url, fetched_at: this.replayRecords?.get(url)?.fetched_at ?? new Date().toISOString(), status: response.status,
        remaining: response.headers.get('x-ratelimit-remaining'), reset: response.headers.get('x-ratelimit-reset'),
        retry_after: response.headers.get('retry-after'), sha256: digest(body), body };
      this.captures.push(capture);
      if (response.status === 429 || (response.status === 403 && (capture.remaining === '0' || capture.retry_after !== null || /rate limit/iu.test(body)))) {
        this.blocked = true;
        throw new DiscoveryError('RATE_LIMIT', `GitHub 限流；reset=${capture.reset ?? '未知'}，retry-after=${capture.retry_after ?? '未知'}。请稍后重试。`);
      }
      if (!response.ok) throw new DiscoveryError('GITHUB', `GitHub HTTP ${response.status}；未把错误当作无竞品。`);
      try { return JSON.parse(body) as unknown; }
      catch { throw new DiscoveryError('BAD_RESPONSE', 'GitHub 返回了无法解析的 JSON。'); }
    } catch (error) {
      if (error instanceof DiscoveryError) throw error;
      throw new DiscoveryError('NETWORK', 'GitHub 请求失败或超时；请检查网络后重试。');
    }
  }

  async search(query: string): Promise<{ items: Repository[]; total: number; incomplete: boolean }> {
    const params = new URLSearchParams({ q: `${query} archived:false fork:false`, per_page: '10' });
    const data = await this.request(`/search/repositories?${params}`);
    if (!record(data) || !Array.isArray(data.items) || !Number.isInteger(data.total_count) || typeof data.incomplete_results !== 'boolean') {
      throw new DiscoveryError('BAD_RESPONSE', 'GitHub 搜索响应结构错误。');
    }
    const items = data.items.map((item: unknown): Repository => {
      if (!record(item) || !Number.isSafeInteger(item.id) || !text(item.full_name) ||
          !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(item.full_name) ||
          item.html_url !== `https://github.com/${item.full_name}` || !nullableText(item.description) ||
          !nullableText(item.language) || !Number.isSafeInteger(item.stargazers_count) || !text(item.pushed_at) ||
          !Array.isArray(item.topics) || !item.topics.every(text) || item.private !== false || item.archived !== false || item.fork !== false ||
          !(item.license === null || (record(item.license) && nullableText(item.license.spdx_id)))) {
        throw new DiscoveryError('BAD_RESPONSE', 'GitHub 仓库条目不符合预期；拒绝猜测链接或字段。');
      }
      return { id: item.id as number, full_name: item.full_name, url: item.html_url as string,
        description: item.description, topics: item.topics as string[], language: item.language,
        license: item.license === null ? null : (item.license as { spdx_id: string | null }).spdx_id,
        stars: item.stargazers_count as number, pushed_at: item.pushed_at, matched_queries: [query] };
    });
    return { items, total: data.total_count as number, incomplete: data.incomplete_results };
  }

  async readme(repo: Repository): Promise<{ content: string; url: string; blob_sha: string; sha256: string }> {
    const data = await this.request(`/repos/${repo.full_name}/readme`);
    if (!record(data) || data.encoding !== 'base64' || !text(data.content) || !/^[\sA-Za-z0-9+/=]*$/u.test(data.content) ||
        !text(data.sha) || !/^[a-f0-9]{40,64}$/u.test(data.sha) || !text(data.html_url) ||
        !data.html_url.startsWith(`${repo.url}/blob/`)) {
      throw new DiscoveryError('BAD_RESPONSE', 'README 响应结构或链接错误。');
    }
    const bytes = Buffer.from(data.content, 'base64');
    if (bytes.length > 1024 * 1024) throw new DiscoveryError('BAD_RESPONSE', 'README 超过 1 MiB 上限。');
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new DiscoveryError('BAD_RESPONSE', 'README 不是有效 UTF-8。'); }
    return { content, url: data.html_url, blob_sha: data.sha, sha256: digest(content) };
  }
}
