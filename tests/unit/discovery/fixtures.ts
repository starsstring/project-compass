export function repository(name = 'sample/markdown-notes', id = 1, stars = 10) {
  return { id, full_name: name, html_url: `https://github.com/${name}`, private: false, fork: false, archived: false,
    description: 'A synthetic markdown notes application for tests.', topics: ['markdown', 'notes'], language: 'TypeScript',
    license: { spdx_id: 'MIT' }, stargazers_count: stars, pushed_at: '2026-10-18T00:00:00Z' };
}

export function fakeGitHub(options: { items?: unknown[]; readmeStatus?: number; incomplete?: boolean } = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const headers = { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '8' };
    if (url.includes('/search/repositories?')) return new Response(JSON.stringify({ total_count: options.items?.length ?? 1,
      incomplete_results: options.incomplete ?? false, items: options.items ?? [repository()] }), { headers });
    if (options.readmeStatus) return new Response('{}', { status: options.readmeStatus, headers });
    const name = new URL(url).pathname.replace(/^\/repos\//u, '').replace(/\/readme$/u, '');
    return new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from('A synthetic markdown note editor with local files.').toString('base64'),
      sha: 'a'.repeat(40), html_url: `https://github.com/${name}/blob/main/README.md` }), { headers });
  };
  return { fetcher, calls };
}
