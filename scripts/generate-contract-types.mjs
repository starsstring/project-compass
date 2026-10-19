import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';

const root = new URL('../', import.meta.url);
// Conditional refinements remain runtime constraints. The generator emits the
// structural type; never replace Ajv validation with a TypeScript assertion.
const contracts = [
  ['report-v1.schema.json', 'ReportRevision', 'report.generated.ts'],
  ['decision-v1.schema.json', 'HumanDecision', 'decision.generated.ts'],
];
for (const [schemaFile, name, outputFile] of contracts) {
  const schema = JSON.parse(await readFile(new URL(`contracts/${schemaFile}`, root), 'utf8'));
  const output = await compile({ ...schema, title: name }, name, {
    bannerComment: `/* Generated from contracts/${schemaFile}. Do not edit. Run npm run generate:types. */`,
    // Keep bounded arrays as arrays, avoiding thousands of tuple unions.
    ignoreMinAndMaxItems: true,
    format: true,
    style: { singleQuote: true },
  });
  const destination = new URL(`src/domain/contracts/${outputFile}`, root);
  if (process.argv.includes('--check')) {
    if (await readFile(destination, 'utf8') !== output) {
      throw new Error(`Generated types are stale: ${outputFile}; run npm run generate:types`);
    }
  } else {
    await mkdir(new URL('src/domain/contracts/', root), { recursive: true });
    await writeFile(destination, output);
  }
}
console.log(process.argv.includes('--check') ? 'Contract types match schemas.' : 'Contract types generated.');
