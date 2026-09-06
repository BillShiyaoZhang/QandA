import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contributionTargets } from '../src/lib/contribution';
import { loadStore } from '../src/lib/content';
import { answerName } from '../src/lib/view';
import { publicStore } from '../src/lib/graph';

test('the picker keeps historical versions, marks archived references, and excludes withdrawn content', () => {
  const s = loadStore();
  s.questions['q-001'].state = 'archived';
  s.publications['answer:a-001-a'].state = 'withdrawn';
  const targets = contributionTargets(publicStore(s));
  assert.equal(targets.find((t) => t.id === 'q-001.r1')?.archived, true);
  assert.equal(targets.find((t) => t.id === 'a-001-b')?.archived, true);
  assert.equal(
    targets.find((t) => t.id === 'a-001-a'),
    undefined,
  );
  assert.ok(targets.some((t) => t.id === 'q-006.r1'));
  assert.ok(targets.some((t) => t.id === 'q-006.r2'));
  assert.ok(targets.every((t) => !t.label.includes(t.id)));
});

test('picker version numbering uses actual instants, matching the history page', () => {
  const s = loadStore();
  s.revisions['q-006.r1'].created_at = '2026-09-06T02:00:00+08:00';
  s.revisions['q-006.r2'].created_at = '2026-09-05T20:00:00Z';
  const targets = contributionTargets(s);
  assert.match(targets.find((t) => t.id === 'q-006.r1')!.label, /第 1 版/);
  assert.match(targets.find((t) => t.id === 'q-006.r2')!.label, /第 2 版/);
});

test('a community answer with no model claim is not presented as AI output', () => {
  const a = loadStore().answers['a-001-a'];
  a.is_example = false;
  a.generation.display_name = null;
  a.generation.requested_model = null;
  a.generation.returned_model = null;
  assert.equal(answerName(a), '社区回答');
  a.generation.display_name = '提交者报告的模型';
  assert.equal(answerName(a), '提交者报告的模型');
});
