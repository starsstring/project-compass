import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReport, validateHumanDecision } from '../dist/src/domain/contracts/index.js';

for (const [name, validate] of [
  ['report-initial.json', validateReport],
  ['report-corrected.json', validateReport],
  ['human-decision.json', validateHumanDecision],
]) {
  const input = JSON.parse(readFileSync(new URL(`../contracts/examples/${name}`, import.meta.url), 'utf8'));
  const result = validate(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  console.log(`${name}: valid`);
}
console.log('Both JSON Schemas compiled with Ajv 2020-12 strict:true. This command checks structure; domain tests run via npm test.');
