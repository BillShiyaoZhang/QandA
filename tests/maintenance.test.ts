import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyReviewedFiles } from '../src/lib/maintenance';
import { recoverTransaction } from '../src/lib/submissions';
import { loadStore, canonical, sha256, validateStore } from '../src/lib/content';
import { publicStore, copyPath } from '../src/lib/graph';
function fixture(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-maintain-')),
    root = path.join(dir, 'content');
  fs.cpSync(path.resolve('content'), root, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, root };
}
test('maintenance preserves historical content and rejects stale reviewed state', (t) => {
  const f = fixture(t),
    s = loadStore(f.root),
    q = s.questions['q-001'];
  applyReviewedFiles(
    f.root,
    { 'questions/q-001/question.json': JSON.stringify({ ...q, state: 'archived' }) },
    s,
  );
  assert.equal(loadStore(f.root).questions[q.id].state, 'archived');
  assert.throws(() => applyReviewedFiles(f.root, {}, s), /已改变/);
  assert.equal(fs.existsSync(path.join(f.dir, '.qanda-content.lock')), false);
});
test('invalid maintenance never swaps content', (t) => {
  const f = fixture(t),
    s = loadStore(f.root);
  assert.throws(
    () =>
      applyReviewedFiles(
        f.root,
        {
          'questions/q-001/question.json': JSON.stringify({
            ...s.questions['q-001'],
            current_revision_id: 'q-002.r1',
          }),
        },
        s,
      ),
    /当前修订/,
  );
  assert.equal(canonical(loadStore(f.root)), canonical(s));
  assert.equal(fs.existsSync(f.root + '.transaction-backup'), false);
});
test('recovery rolls back interruption between directory renames', (t) => {
  const f = fixture(t),
    before = canonical(loadStore(f.root)),
    staging = fs.mkdtempSync(path.join(f.dir, '.qanda-stage-'));
  fs.cpSync(f.root, staging, { recursive: true });
  fs.writeFileSync(f.root + '.transaction.json', JSON.stringify({ staging, key: 'unused' }));
  fs.renameSync(f.root, f.root + '.transaction-backup');
  recoverTransaction(f.root);
  assert.equal(canonical(loadStore(f.root)), before);
  assert.equal(fs.existsSync(staging), false);
  assert.equal(fs.existsSync(f.root + '.transaction.json'), false);
});
test('recovery finalizes a committed maintenance swap only with matching content hash', (t) => {
  const f = fixture(t),
    before = loadStore(f.root),
    staging = fs.mkdtempSync(path.join(f.dir, '.qanda-stage-'));
  fs.cpSync(f.root, staging, { recursive: true });
  const q = { ...before.questions['q-001'], state: 'archived' };
  fs.writeFileSync(path.join(staging, 'questions/q-001/question.json'), JSON.stringify(q));
  const hash = sha256(canonical(loadStore(staging)));
  fs.writeFileSync(f.root + '.transaction.json', JSON.stringify({ staging, expectedHash: hash }));
  fs.renameSync(f.root, f.root + '.transaction-backup');
  fs.renameSync(staging, f.root);
  recoverTransaction(f.root);
  assert.equal(loadStore(f.root).questions[q.id].state, 'archived');
  assert.equal(fs.existsSync(f.root + '.transaction-backup'), false);
});
test('recovery keeps ambiguous backup for manual inspection', (t) => {
  const f = fixture(t),
    staging = fs.mkdtempSync(path.join(f.dir, '.qanda-stage-'));
  fs.cpSync(f.root, f.root + '.transaction-backup', { recursive: true });
  fs.writeFileSync(
    f.root + '.transaction.json',
    JSON.stringify({ staging, expectedHash: 'wrong' }),
  );
  assert.throws(() => recoverTransaction(f.root), /歧义/);
  assert.ok(fs.existsSync(f.root + '.transaction-backup'));
});
test('withdrawn question without current revision keeps a copy-path tombstone', (t) => {
  const f = fixture(t),
    s = loadStore(f.root);
  s.publications['question:q-001'].state = 'withdrawn';
  s.questions['q-001'].current_revision_id = null;
  validateStore(s);
  const visible = publicStore(s),
    copy = copyPath(visible, 'q-001');
  assert.equal(visible.questions['q-001'].title, '问题已撤回');
  assert.equal(copy.complete, false);
  assert.ok(copy.text.includes('不完整') || copy.text.includes('不能视为完整'));
});
test('maintenance CLI archives, reopens and withdraws with explicit replacement', (t) => {
  const f = fixture(t),
    run = (args: string[]) =>
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/manage-content.ts', ...args], {
        env: { ...process.env, CONTENT_DIR: f.root },
        encoding: 'utf8',
        stdio: 'pipe',
      });
  run(['--archive', '--id', 'q-006', '--reviewer', 'test']);
  assert.equal(loadStore(f.root).questions['q-006'].state, 'archived');
  run(['--reopen', '--id', 'q-006', '--reviewer', 'test']);
  assert.equal(loadStore(f.root).questions['q-006'].state, 'active');
  assert.throws(
    () => run(['--withdraw', 'revision', '--id', 'q-006.r2', '--reviewer', 'test']),
    /replacement/,
  );
  run([
    '--withdraw',
    'revision',
    '--id',
    'q-006.r2',
    '--replacement',
    'q-006.r1',
    '--reviewer',
    'test',
  ]);
  const s = loadStore(f.root);
  assert.equal(s.questions['q-006'].current_revision_id, 'q-006.r1');
  assert.equal(s.publications['revision:q-006.r2'].state, 'withdrawn');
  validateStore(s);
});
test('loader rejects metadata in a misleading filename', (t) => {
  const f = fixture(t);
  fs.renameSync(path.join(f.root, 'answers/a-001-a'), path.join(f.root, 'answers/misleading'));
  assert.throws(() => loadStore(f.root), /路径与实体/);
});
