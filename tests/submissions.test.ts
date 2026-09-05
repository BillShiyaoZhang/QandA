import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDraft,
  reviewDraft,
  issueSubmission,
  submissionSchema,
  recoverTransaction,
} from '../src/lib/submissions';
import { loadStore, validateStore, canonical } from '../src/lib/content';
function fixture(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-import-')),
    root = path.join(dir, 'content'),
    drafts = path.join(dir, 'drafts');
  fs.cpSync(path.resolve('content'), root, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, root, drafts };
}
const source = (n = 1, body = 'source answer') => ({
  url: `https://github.com/BillShiyaoZhang/QandA/issues/${n}`,
  updated_at: '2026-09-06T01:00:00Z',
  author: 'test-contributor',
  body,
});
const answer = (body = 'A preserved answer') => ({
  kind: 'answer',
  question_revision_id: 'q-001.r1',
  body,
  public_consent: true,
});
test('unknown metadata imports without inventing model or context', (t) => {
  const f = fixture(t);
  const d = createDraft(f.root, f.drafts, source(), answer());
  assert.equal(
    loadStore(f.root).answers[Object.keys(d.files).find((p) => p.startsWith('answers/')) || ''],
    undefined,
  );
  reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish');
  const s = loadStore(f.root);
  validateStore(s);
  const a = Object.values(s.answers).find((a) => a.submitted_by === 'github:test-contributor')!;
  assert.equal(a.generation.generated_at, null);
  assert.equal(a.generation.requested_model, null);
  assert.equal(a.context.capture_kind, 'unknown');
});
test('published receipt deduplicates across fresh checkout and local-cache loss', (t) => {
  const f = fixture(t);
  const d = createDraft(f.root, f.drafts, source(), answer());
  const file = path.join(f.drafts, d.key + '.json');
  reviewDraft(f.root, file, 'reviewer', 'publish');
  const before = canonical(loadStore(f.root));
  fs.rmSync(f.drafts, { recursive: true });
  const again = createDraft(f.root, f.drafts, source(), answer());
  assert.equal(again.status, 'published');
  assert.equal(canonical(loadStore(f.root)), before);
});
test('identical text from different source attempts remains distinct', (t) => {
  const f = fixture(t),
    before = Object.keys(loadStore(f.root).answers).length;
  for (const n of [1, 2]) {
    const d = createDraft(f.root, f.drafts, source(n), answer());
    reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish');
  }
  assert.equal(Object.keys(loadStore(f.root).answers).length, before + 2);
});
test('edited source creates a new record without overwriting old answer', (t) => {
  const f = fixture(t);
  for (const [updated_at, body] of [
    ['2026-09-06T01:00:00Z', 'first'],
    ['2026-09-06T02:00:00Z', 'second'],
  ]) {
    const d = createDraft(f.root, f.drafts, { ...source(), updated_at, body }, answer(body));
    reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish');
  }
  const s = loadStore(f.root);
  assert.ok(Object.values(s.bodies).includes('first'));
  assert.ok(Object.values(s.bodies).includes('second'));
});
test('follow-up and first answer publish together', (t) => {
  const f = fixture(t),
    before = loadStore(f.root);
  const d = createDraft(f.root, f.drafts, source(), {
    kind: 'follow-up',
    parent_answer_id: 'a-001-a',
    body: 'How can we check that?',
    answer_body: 'Use another observation.',
    public_consent: true,
  });
  reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish');
  const after = loadStore(f.root);
  assert.equal(Object.keys(after.questions).length, Object.keys(before.questions).length + 1);
  assert.equal(Object.keys(after.answers).length, Object.keys(before.answers).length + 1);
  validateStore(after, before);
});
test('invalid nested submission leaves content and receipts unchanged', (t) => {
  const f = fixture(t),
    before = canonical(loadStore(f.root));
  assert.throws(
    () =>
      createDraft(f.root, f.drafts, source(), {
        kind: 'follow-up',
        parent_answer_id: 'missing',
        body: 'Question?',
        answer_body: 'Answer.',
        public_consent: true,
      }),
    /父答案/,
  );
  assert.equal(canonical(loadStore(f.root)), before);
  assert.equal(fs.existsSync(f.drafts) ? fs.readdirSync(f.drafts).length : 0, 0);
});
test('stale revision draft cannot unarchive or overwrite updated question', (t) => {
  const f = fixture(t);
  const d = createDraft(f.root, f.drafts, source(), {
    kind: 'revision',
    question_id: 'q-001',
    body: 'Clarified wording',
    public_consent: true,
  });
  const file = path.join(f.root, 'questions/q-001/question.json'),
    q = JSON.parse(fs.readFileSync(file, 'utf8'));
  q.state = 'archived';
  q.title = 'A newer title';
  fs.writeFileSync(file, JSON.stringify(q));
  assert.throws(
    () => reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish'),
    /变化|归档/,
  );
  assert.equal(loadStore(f.root).questions['q-001'].title, 'A newer title');
  assert.equal(loadStore(f.root).questions['q-001'].state, 'archived');
});
test('target publication state is rechecked at review', (t) => {
  const f = fixture(t);
  const d = createDraft(f.root, f.drafts, source(), answer());
  const file = path.join(f.root, 'publications/revision/q-001.r1.json'),
    p = JSON.parse(fs.readFileSync(file, 'utf8'));
  p.state = 'withdrawn';
  fs.writeFileSync(file, JSON.stringify(p));
  assert.throws(
    () => reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish'),
    /不可投稿/,
  );
});
test('relation draft confirms only during review, and withdraw invalidates it', (t) => {
  const f = fixture(t);
  const d = createDraft(f.root, f.drafts, source(), {
    kind: 'relation',
    source_id: 'a-002-a',
    target_id: 'a-003-a',
    rationale: 'Both explain representations.',
    public_consent: true,
  });
  assert.ok(Object.values(d.files).some((v) => v.includes('proposed')));
  const p = path.join(f.root, 'publications/answer/a-002-a.json'),
    v = JSON.parse(fs.readFileSync(p, 'utf8'));
  v.state = 'withdrawn';
  fs.writeFileSync(p, JSON.stringify(v));
  assert.throws(
    () => reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish'),
    /端点/,
  );
});
test('receipt restores cache after interrupted final status write', (t) => {
  const f = fixture(t);
  const d = createDraft(f.root, f.drafts, source(), answer()),
    file = path.join(f.drafts, d.key + '.json');
  reviewDraft(f.root, file, 'reviewer', 'publish');
  fs.writeFileSync(file, JSON.stringify(d));
  const before = canonical(loadStore(f.root));
  assert.equal(reviewDraft(f.root, file, 'other-reviewer', 'publish').status, 'published');
  assert.equal(canonical(loadStore(f.root)), before);
});
test('a live transaction lock blocks a second writer without mutation', (t) => {
  const f = fixture(t),
    d = createDraft(f.root, f.drafts, source(), answer());
  fs.writeFileSync(path.join(f.dir, '.qanda-content.lock'), String(process.pid));
  const before = canonical(loadStore(f.root));
  assert.throws(
    () => reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish'),
    /事务/,
  );
  assert.throws(() => recoverTransaction(f.root), /仍在运行/);
  assert.equal(canonical(loadStore(f.root)), before);
});
test('Issue form parser preserves ordinary headings and fenced field-looking content', () => {
  const body =
    '### 问题修订 ID\n\nq-001.r1\n\n### 答案正文\n\nFirst paragraph.\n\n### 推理过程\n\nSecond paragraph.\n\n```md\n### 模型显示名称\ncode, not a field\n```\n\n### 模型显示名称\n\n_No response_\n\n### 公开提交确认\n\n- [x] consent';
  const sub = submissionSchema.parse(issueSubmission(body, 'answer'));
  assert.ok(sub.body?.includes('Second paragraph.'));
  assert.ok(sub.body?.includes('code, not a field'));
  assert.equal(sub.model_name, null);
  assert.equal(sub.public_consent, true);
});
test('ambiguous duplicate form labels are rejected rather than truncating output', () => {
  assert.throws(
    () =>
      issueSubmission(
        '### 答案正文\nfirst\n### 模型显示名称\ninside body\n### 模型显示名称\nreal field',
        'answer',
      ),
    /歧义/,
  );
});

test('structured generation metadata and protocol survive import without invented identity evidence', async (t) => {
  const { unknownGeneration } = await import('../src/lib/schema');
  const f = fixture(t);
  const generation = {
    ...unknownGeneration(),
    provider: 'Declared provider',
    channel: 'web',
    returned_model: 'declared-id',
    protocol: 'Keep the original input; no tools.',
    parameters: { temperature: 0 },
    tools: 'none' as const,
  };
  const d = createDraft(f.root, f.drafts, source(), { ...answer(), generation });
  reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish');
  const a = Object.values(loadStore(f.root).answers).find(
    (x) => x.submitted_by === 'github:test-contributor',
  )!;
  assert.deepEqual(a.generation, generation);
  assert.equal(a.provenance.identity_evidence, 'submitter_reported');
  assert.equal(a.context.visible_history_completeness, 'unknown');
});

test('reviewing a root question without an answer creates an independently browsable empty root', async (t) => {
  const { publicStore, rootId } = await import('../src/lib/graph');
  const f = fixture(t),
    d = createDraft(f.root, f.drafts, source(), {
      kind: 'question',
      title: 'New root',
      body: 'A new question?',
      public_consent: true,
    });
  reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish');
  const s = publicStore(loadStore(f.root)),
    q = Object.values(s.questions).find((x) => x.title === 'New root')!;
  assert.equal(q.parent_answer_id, null);
  assert.equal(rootId(s, q.id), q.id);
  assert.ok(s.bodies[q.current_revision_id!]);
  assert.equal(
    Object.values(s.answers).filter((a) => a.question_revision_id === q.current_revision_id).length,
    0,
  );
});
test('both answers and sibling follow-ups retain separate descendant paths after root and intermediate revisions', async (t) => {
  const { questionPath, copyPath } = await import('../src/lib/graph');
  const f = fixture(t);
  let n = 20;
  const publish = (input: unknown) => {
    const d = createDraft(f.root, f.drafts, source(n++, JSON.stringify(input)), input);
    reviewDraft(f.root, path.join(f.drafts, d.key + '.json'), 'reviewer', 'publish');
    return d;
  };
  for (const [parent, title] of [
    ['a-001-a', 'Branch A'],
    ['a-001-b', 'Branch B'],
  ])
    publish({
      kind: 'follow-up',
      title,
      parent_answer_id: parent,
      body: title + ' question',
      answer_body: title + ' answer',
      public_consent: true,
    });
  let s = loadStore(f.root);
  const qa = Object.values(s.questions).find((q) => q.title === 'Branch A')!,
    qb = Object.values(s.questions).find((q) => q.title === 'Branch B')!,
    a = Object.values(s.answers).find((a) => a.question_revision_id === qa.current_revision_id)!;
  publish({
    kind: 'follow-up',
    title: 'Deeper A',
    parent_answer_id: a.id,
    body: 'Deeper A question',
    public_consent: true,
  });
  s = loadStore(f.root);
  const deep = Object.values(s.questions).find((q) => q.title === 'Deeper A')!,
    before = copyPath(s, deep.id).text;
  for (const q of [s.questions['q-001'], qa])
    publish({
      kind: 'revision',
      question_id: q.id,
      body: 'A revised question ' + q.id,
      public_consent: true,
    });
  s = loadStore(f.root);
  assert.equal(copyPath(s, deep.id).text, before);
  assert.ok(questionPath(s, qb.id).some((node) => node.id === 'a-001-b'));
  assert.ok(!questionPath(s, qb.id).some((node) => node.id === 'a-001-a'));
  assert.ok(questionPath(s, deep.id).some((node) => node.id === qa.current_revision_id));
  assert.notEqual(s.questions[qa.id].current_revision_id, qa.current_revision_id);
});
