import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, sha256 } from '../src/lib/content';
import { tokenize, suggestRelations, candidateRelation } from '../src/lib/relations';
test('Chinese words without whitespace yield matching lexical candidates', () => {
  assert.ok(tokenize('保存森林录音').includes('森林'));
  const s = loadStore();
  const c = suggestRelations(s, { minScore: 0.03 });
  assert.ok(c.length > 0);
  assert.ok(c.every((x) => x.score >= 0.03 && x.matching_terms.length));
  assert.ok(
    c
      .map(candidateRelation)
      .every(
        (r) => r.type === 'related_topic' && r.decision === 'proposed' && r.decided_by === null,
      ),
  );
});
test('symmetric candidate identity is stable from either endpoint', () => {
  const c = {
    source: { entity_type: 'revision' as const, entity_id: 'r-a', body_sha256: sha256('a') },
    target: { entity_type: 'answer' as const, entity_id: 'a-b', body_sha256: sha256('b') },
    score: 0.5,
    matching_terms: ['信息'],
    method_version: 'test',
  };
  assert.equal(
    candidateRelation(c).id,
    candidateRelation({ ...c, source: c.target, target: c.source }).id,
  );
});
test('known and rejected same-version relations are not repeatedly suggested', () => {
  const s = loadStore(),
    r = s.relations['rel-1'];
  r.decision = 'rejected';
  const candidates = suggestRelations(s, { minScore: 0, limit: 100 });
  assert.ok(
    !candidates.some(
      (c) =>
        new Set([c.source.entity_id, c.target.entity_id]).has(r.source_ref.entity_id) &&
        new Set([c.source.entity_id, c.target.entity_id]).has(r.target_ref.entity_id),
    ),
  );
});
