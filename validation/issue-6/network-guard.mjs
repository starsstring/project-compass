import { writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

const mode = process.env.COMPASS_SMOKE_MODE;
const metrics = { mode, started_at: new Date().toISOString(), fetch_calls: 0, other_network_attempts: [], requests: [] };
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  metrics.fetch_calls++;
  const url = new URL(String(input));
  const row = { url: url.href, status: null, kind: null, client_authorization: new Headers(init?.headers).has('authorization') };
  metrics.requests.push(row);
  if (mode !== 'live') throw Error('External fetch forbidden during offline validation');
  if (row.client_authorization || url.origin !== 'https://api.github.com' || url.username || url.password) throw Error('Unexpected request origin or authorization');
  row.kind = url.pathname === '/search/repositories' ? 'search'
    : /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/readme$/u.test(url.pathname) ? 'readme' : null;
  if (!row.kind) throw Error('Request outside frozen Search/README scope');
  if (row.kind === 'search' && !['point cloud viewer archived:false fork:false', 'point cloud visualization archived:false fork:false'].includes(url.searchParams.get('q'))) throw Error('Query differs from frozen sample');
  if (metrics.requests.filter(r => r.kind === row.kind).length > (row.kind === 'search' ? 2 : 5)) throw Error('Frozen request budget exceeded');
  const response = await nativeFetch(input, init);
  row.status = response.status;
  return response;
};
if (mode !== 'live') {
  for (const [module, methods, name] of [[http, ['request', 'get'], 'http'], [https, ['request', 'get'], 'https'],
    [net, ['connect', 'createConnection'], 'net'], [tls, ['connect'], 'tls']]) {
    for (const method of methods) module[method] = () => {
      metrics.other_network_attempts.push(`${name}.${method}`);
      throw Error('External connection forbidden during offline validation');
    };
  }
  syncBuiltinESMExports();
}
process.on('exit', code => writeFileSync(process.env.COMPASS_SMOKE_METRICS,
  JSON.stringify({ ...metrics, completed_at: new Date().toISOString(), process_exit_code: code }, null, 2) + '\n'));
