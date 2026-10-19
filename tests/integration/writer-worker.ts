import { workerData, parentPort } from 'node:worker_threads';
import { openSqliteStore } from '../../src/adapters/sqlite/store.js';
import type { ReportRevision } from '../../src/domain/index.js';

const data = workerData as { path: string; report: ReportRevision; initialize?: boolean };
if (!parentPort) throw new Error('Worker entry only.');
const port = parentPort;
if (data.initialize) {
  port.postMessage('ready');
  port.once('message', async () => {
    const opened = await openSqliteStore({ path: data.path, create: true });
    const result = opened.ok ? opened.value.check() : opened;
    if (opened.ok) opened.value.close();
    port.postMessage(result); port.close();
  });
} else {
  const opened = await openSqliteStore({ path: data.path });
  if (!opened.ok) { port.postMessage(opened); port.close(); }
  else {
    port.postMessage('ready');
    port.once('message', () => {
      const result = opened.value.saveReport(data.report, data.report.parent_revision_id);
      opened.value.close(); port.postMessage(result); port.close();
    });
  }
}
