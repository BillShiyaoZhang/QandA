import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, sha256 } from '../src/lib/content';
import { validateContentChange } from '../src/lib/retired-examples';
import { emptyStore } from '../src/lib/schema';
test('only the exact initial corpus can be retired into an empty library', () => {
  validateContentChange(emptyStore(), loadStore());
});
test('sample flags do not permit deleting modified or real records', () => {
  const baseline = loadStore();
  baseline.bodies['a-001-a'] = 'Actual user content';
  baseline.answers['a-001-a'].body_sha256 = sha256('Actual user content');
  assert.throws(() => validateContentChange(emptyStore(), baseline), /已发布实体被删除/);
});
test('retirement exception does not permit partial deletion or preserve repurposed identifiers', () => {
  const base = loadStore(),
    next = structuredClone(base);
  delete next.bodies['a-001-a'];
  delete next.answers['a-001-a'];
  delete next.publications['answer:a-001-a'];
  assert.throws(() => validateContentChange(next, base));
});
test('a submission receipt prevents matching the initial example corpus', () => {
  const base = loadStore();
  base.imports['test-receipt'] = {
    schema_version: 1,
    id: 'test-receipt',
    key: 'test',
    source_url: 'https://example.com',
    source_updated_at: '2026-09-06T00:00:00Z',
    source_body_sha256: sha256('real'),
    submission_sha256: sha256('real'),
    reviewer: 'actual',
    reviewed_at: '2026-09-06T00:00:00Z',
    entity_ids: ['a-001-a'],
  };
  assert.throws(() => validateContentChange(emptyStore(), base), /收据被覆盖/);
});
