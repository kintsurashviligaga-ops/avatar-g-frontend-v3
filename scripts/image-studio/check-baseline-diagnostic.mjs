#!/usr/bin/env node
// This checks historical diagnostic evidence, not the release candidate's test result.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const result = JSON.parse(readFileSync('evidence/lease-baseline.json', 'utf8'));
const log = readFileSync('evidence/lease-baseline.log', 'utf8');
assert.equal(Number(process.argv[2]), 124, 'Unmodified baseline must reach its known timer deadline');
assert.equal(result.numPassedTests, 6);
assert.equal(result.numFailedTests, 1);
assert.equal(result.numPendingTests, 0);
const failures = result.testResults.flatMap(s => s.assertionResults).filter(t => t.status === 'failed');
assert.equal(failures.length, 1);
assert.equal(failures[0].fullName, 'lease queue on a real Postgres + PostgREST (local, isolated) E: a worker dies mid-render; once its lease lapses the sweep takes the job over as attempt 2 and delivers it, charged once');
assert.match(log, /rate-limit\.ts:62/);
assert.match(log, /Timeout/);
console.log('EXPECTED_BASELINE_FAILURE_CONFIRMED: 6 pass, 1 known fixture failure, baseline timer deadline. This is not a release-test PASS.');
