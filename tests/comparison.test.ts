import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, sha256, canonical } from '../src/lib/content';
import { compareConditions } from '../src/lib/comparison';
import type { Context } from '../src/lib/schema';
function pair() {
  const s = loadStore(),
    a = structuredClone(s.answers['a-001-a']),
    b = structuredClone(s.answers['a-001-b']);
  for (const x of [a, b]) {
    x.generation.protocol = 'A submitted protocol: use only the provided text.';
    x.generation.tools = 'none';
    x.generation.parameters = { temperature: 0, top_p: 1 };
    x.context = {
      snapshot_id: 'test-context',
      capture_kind: 'submitter_transcript',
      visible_history_completeness: 'complete',
      matches_site_path: 'unknown',
    };
  }
  const core = {
    messages: [{ role: 'user' as const, content: s.bodies['q-001.r1'] }],
    path_refs: [],
    attachments: [],
  };
  const snapshot: Context = {
    schema_version: 1,
    id: 'test-context',
    capture_kind: 'submitter_transcript',
    ...core,
    sha256: sha256(canonical(core)),
  };
  return [
    { answer: a, snapshot, revision: { id: 'q-001.r1', text: s.bodies['q-001.r1'] } },
    {
      answer: b,
      snapshot: structuredClone(snapshot),
      revision: { id: 'q-001.r1', text: s.bodies['q-001.r1'] },
    },
  ] as const;
}
test('equal partial transcripts cannot be treated as aligned conditions', () => {
  const [a, b] = pair();
  a.answer.context.visible_history_completeness = 'partial';
  b.answer.context.visible_history_completeness = 'partial';
  assert.equal(compareConditions(a, b).aligned, false);
  assert.ok(compareConditions(a, b).reasons.includes('可见历史未声明完整'));
});
test('missing or different protocol prevents condition alignment', () => {
  const [a, b] = pair();
  a.answer.generation.protocol = null;
  assert.equal(compareConditions(a, b).aligned, false);
  a.answer.generation.protocol = 'A different protocol';
  assert.ok(compareConditions(a, b).reasons.includes('生成协议不同'));
});
test('complete explicitly recorded conditions match despite parameter key order and provider difference', () => {
  const [a, b] = pair();
  b.answer.generation.parameters = { top_p: 1, temperature: 0 };
  b.answer.generation.provider = 'Another declared provider';
  assert.deepEqual(compareConditions(a, b), { aligned: true, reasons: [] });
});
test('equal empty snapshots and unspecified tool configuration cannot be aligned', () => {
  const [a, b] = pair();
  a.snapshot.messages = [];
  b.snapshot.messages = [];
  assert.equal(compareConditions(a, b).aligned, false);
  const [c, d] = pair();
  c.answer.generation.tools = 'used';
  d.answer.generation.tools = 'used';
  assert.ok(compareConditions(c, d).reasons.includes('工具配置无法对齐'));
});

test('identical input for a different actual question is not aligned to the selected revision', () => {
  const [a, b] = pair();
  a.snapshot.messages[0].content = 'A different question';
  b.snapshot.messages[0].content = 'A different question';
  assert.ok(compareConditions(a, b).reasons.includes('实际末轮提问与所选修订未对齐'));
});
test('generation order uses timestamp offsets and does not replace unknown time with submission time', async () => {
  const { compareGenerationTime: sort } = await import('../src/lib/generation');
  const a = { generated_at: '2026-01-01T12:00:00+08:00', time_precision: 'second' },
    b = { generated_at: '2026-01-01T06:00:00Z', time_precision: 'second' },
    unknown = { generated_at: null, time_precision: 'unknown' };
  assert.ok(sort(a, b, 'oldest') < 0);
  assert.ok(sort(a, b, 'newest') > 0);
  assert.ok(sort(unknown, a, 'oldest') > 0);
  assert.ok(sort(unknown, a, 'newest') > 0);
  assert.ok(sort(a, { generated_at: '2026-01-01', time_precision: 'day' }, 'oldest') < 0);
});
