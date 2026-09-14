import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const database = 'lms_auto_comment';
const fixture = resolve('tests/fixtures/db/pre-owner-schema.sql');
const runs = [];

function wrangler(args, label) {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', ...args], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, CI: '1' },
  });
  if (result.status !== 0) throw new Error(`${label} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function execute(persist, sql, label) {
  const output = wrangler(['execute', database, '--local', '--persist-to', persist, '--command', sql, '--json'], label);
  const start = output.indexOf('[');
  if (start < 0) throw new Error(`${label} returned no JSON: ${output}`);
  return JSON.parse(output.slice(start));
}

function apply(persist, label) {
  wrangler(['migrations', 'apply', database, '--local', '--persist-to', persist], label);
}

function verify(persist, label, expectLegacyRow) {
  const columnsResult = execute(persist, 'PRAGMA table_info(grading_jobs)', `${label} columns`);
  const indexesResult = execute(persist, 'PRAGMA index_list(grading_jobs)', `${label} indexes`);
  const columns = columnsResult.flatMap((entry) => entry.results || []);
  const indexes = indexesResult.flatMap((entry) => entry.results || []);
  const owner = columns.find((column) => column.name === 'owner_email');
  if (!owner || Number(owner.notnull) !== 0) throw new Error(`${label}: owner_email must exist and be nullable`);
  if (!indexes.some((index) => index.name === 'idx_grading_jobs_owner_created')) {
    throw new Error(`${label}: owner index is missing`);
  }
  if (expectLegacyRow) {
    const rowResult = execute(persist, "SELECT id, owner_email FROM grading_jobs WHERE id = 'legacy-job'", `${label} legacy row`);
    const row = rowResult.flatMap((entry) => entry.results || [])[0];
    if (!row || row.owner_email !== null) throw new Error(`${label}: pre-owner job was not preserved with a null owner`);
  }
}

try {
  const fresh = mkdtempSync(join(tmpdir(), 'tool-lms-d1-fresh-'));
  runs.push(fresh);
  apply(fresh, 'fresh migration');
  verify(fresh, 'fresh migration', false);

  const upgrade = mkdtempSync(join(tmpdir(), 'tool-lms-d1-upgrade-'));
  runs.push(upgrade);
  wrangler(['execute', database, '--local', '--persist-to', upgrade, '--file', fixture], 'pre-owner fixture');
  execute(upgrade, "INSERT INTO grading_jobs (id, class_id, status, total_items, completed_items, failed_items, created_at, updated_at) VALUES ('legacy-job', 'class-1', 'completed', 1, 1, 0, '2026-01-01', '2026-01-01')", 'seed legacy job');
  apply(upgrade, 'upgrade migration');
  verify(upgrade, 'upgrade migration', true);
  console.log('Verified isolated fresh and pre-owner upgrade D1 migrations.');
} finally {
  for (const directory of runs) rmSync(directory, { recursive: true, force: true });
}
