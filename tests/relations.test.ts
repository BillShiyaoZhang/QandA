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

test('support and conflict decisions require actual excerpts and a nonblank rationale', async () => {
  const { validateStore, publication } = await import('../src/lib/content');
  const { relationSchema } = await import('../src/lib/schema');
  const { publicStore } = await import('../src/lib/graph');
  for (const type of ['supports', 'conflicts_with'] as const) {
    const s = loadStore(),
      a = s.answers['a-001-a'],
      b = s.answers['a-001-b'];
    const r = {
      ...structuredClone(s.relations['rel-1']),
      id: 'test-' + type,
      type,
      source_ref: { entity_type: 'answer' as const, entity_id: a.id, body_sha256: a.body_sha256 },
      target_ref: { entity_type: 'answer' as const, entity_id: b.id, body_sha256: b.body_sha256 },
      source_excerpt: s.bodies[a.id].slice(0, 20),
      target_excerpt: s.bodies[b.id].slice(0, 20),
      rationale: 'Test annotation about these two quoted claims.',
    };
    s.relations[r.id] = r;
    s.publications['relation:' + r.id] = publication('relation', r.id);
    validateStore(s);
    assert.ok(publicStore(s).relations[r.id]);
    r.rationale = '   ';
    assert.equal(relationSchema.safeParse(r).success, false);
    assert.throws(() => validateStore(s), /理由不能为空白/);
    r.rationale = 'A reason';
    r.target_excerpt = 'an excerpt absent from the answer';
    assert.throws(() => validateStore(s), /片段不存在/);
  }
});
