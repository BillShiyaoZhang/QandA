import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadStore,
  validateStore,
  sha256,
  canonical,
  publication,
  safePath,
} from '../src/lib/content';
import { publicStore, copyPath, questionPath, isArchived } from '../src/lib/graph';
import { generationSchema, emptyStore } from '../src/lib/schema';
import { markdown } from '../src/lib/view';
const seed = () => loadStore(process.env.CONTENT_DIR!);
const clone = () => structuredClone(seed());
test('seed corpus has roots, multiple answers, sibling branches, and stable revisions', () => {
  const s = seed();
  validateStore(s);
  assert.ok(Object.values(s.questions).filter((q) => !q.parent_answer_id).length >= 15);
  assert.ok(Object.keys(s.answers).length >= 40);
  assert.equal(s.questions['q-006'].current_revision_id, 'q-006.r2');
  assert.equal(s.answers['a-006-a'].question_revision_id, 'q-006.r1');
});
test('history rejects overwritten answers, moved branches and rewritten annotations', () => {
  const base = seed();
  for (const mutate of [
    (s: any) => {
      s.bodies['a-001-a'] = 'replaced';
      s.answers['a-001-a'].body_sha256 = sha256('replaced');
    },
    (s: any) => (s.questions['q-follow-1'].parent_answer_id = 'a-002-a'),
    (s: any) => {
      s.bodies['note-forest'] = 'changed';
      s.annotations['note-forest'].body_sha256 = sha256('changed');
    },
  ]) {
    const s = structuredClone(base);
    mutate(s);
    assert.throws(() => validateStore(s, base), /覆盖|改接|改写/);
  }
});
test('current revision must belong to the question and be published', () => {
  for (const rid of ['q-002.r1', 'missing']) {
    const s = clone();
    s.questions['q-001'].current_revision_id = rid;
    assert.throws(() => validateStore(s), /当前修订/);
  }
  const s = clone();
  delete s.publications['revision:q-001.r1'];
  assert.throws(() => validateStore(s), /当前修订/);
});
test('main parent cycles and unresolved public ancestors are rejected', () => {
  const s = clone();
  s.questions['q-001'].parent_answer_id = 'a-follow-1';
  assert.throws(() => validateStore(s), /成环/);
  const p = clone();
  delete p.publications['answer:a-001-a'];
  assert.throws(() => validateStore(p), /公开祖先/);
});
test('copying a path preserves historical revision and excludes siblings and relations', () => {
  const s = clone();
  const p = copyPath(s, 'q-deeper-4', 'q-deeper-4.r1', 'a-deeper-4');
  assert.ok(p.text.includes('q-006.r1'));
  assert.ok(!p.text.includes('q-006.r2'));
  assert.ok(!p.text.includes('a-006-b'));
  assert.ok(!p.text.includes('q-014.r1'));
  assert.equal(p.complete, true);
  assert.throws(() => copyPath(s, 'q-001', 'q-002.r1'), /不属于/);
  assert.throws(() => copyPath(s, 'q-001', 'q-001.r1', 'a-002-a'), /不属于/);
});
test('archive inherits through the actual parent path', () => {
  const s = clone();
  s.questions['q-001'].state = 'archived';
  assert.equal(isArchived(s, 'q-deeper-1'), true);
  assert.equal(isArchived(s, 'q-deeper-2'), false);
});
test('withdrawal keeps descendants navigable and clears content and metadata', () => {
  const s = clone();
  const a = s.answers['a-001-a'];
  s.bodies[a.id] = 'UNIQUE_SECRET';
  a.body_sha256 = sha256('UNIQUE_SECRET');
  a.generation.declared_version = 'MODEL_METADATA_SECRET';
  a.generation.parameters = { hidden: 'PARAM_SECRET' };
  s.publications['answer:a-001-a'].state = 'withdrawn';
  const p = publicStore(s);
  assert.ok(p.answers[a.id]);
  assert.ok(p.questions['q-follow-1']);
  assert.ok(!JSON.stringify(p).includes('UNIQUE_SECRET'));
  assert.ok(!JSON.stringify(p).includes('MODEL_METADATA_SECRET'));
  assert.equal(copyPath(p, 'q-deeper-1').complete, false);
});
test('unreferenced or withdrawn-context snapshots never enter public data', () => {
  const s = clone();
  const id = 'ctx-secret';
  const core = {
    messages: [{ role: 'user' as const, content: 'SNAPSHOT_SECRET' }],
    path_refs: [],
    attachments: [],
  };
  s.contexts[id] = {
    schema_version: 1,
    id,
    capture_kind: 'submitter_transcript',
    ...core,
    sha256: sha256(canonical(core)),
  };
  s.publications['context:' + id] = publication('context', id);
  assert.equal(publicStore(s).contexts[id], undefined);
  s.answers['a-001-a'].context = {
    snapshot_id: id,
    capture_kind: 'submitter_transcript',
    visible_history_completeness: 'complete',
    matches_site_path: 'unknown',
  };
  assert.ok(publicStore(s).contexts[id]);
  s.publications['answer:a-001-a'].state = 'withdrawn';
  assert.equal(publicStore(s).contexts[id], undefined);
});
test('a snapshot referencing withdrawn history is withheld from descendant answer', () => {
  const s = clone(),
    id = 'ctx-descendant';
  const core = {
    messages: [{ role: 'assistant' as const, content: 'COPIED_SECRET' }],
    path_refs: [
      {
        entity_type: 'answer' as const,
        entity_id: 'a-001-a',
        body_sha256: s.answers['a-001-a'].body_sha256,
      },
    ],
    attachments: [],
  };
  s.contexts[id] = {
    schema_version: 1,
    id,
    capture_kind: 'submitter_transcript',
    ...core,
    sha256: sha256(canonical(core)),
  };
  s.publications['context:' + id] = publication('context', id);
  s.answers['a-follow-1'].context = {
    snapshot_id: id,
    capture_kind: 'submitter_transcript',
    visible_history_completeness: 'complete',
    matches_site_path: 'unknown',
  };
  s.publications['answer:a-001-a'].state = 'withdrawn';
  const p = publicStore(s);
  assert.equal(p.answers['a-follow-1'].context.snapshot_id, null);
  assert.ok(!JSON.stringify(p).includes('COPIED_SECRET'));
});
test('claims of captured or complete context require an actual snapshot', () => {
  const s = clone();
  s.answers['a-001-a'].context = {
    snapshot_id: null,
    capture_kind: 'submitter_transcript',
    visible_history_completeness: 'complete',
    matches_site_path: 'yes',
  };
  assert.throws(() => validateStore(s), /快照/);
});
test('candidate and rejected relations stay out of public data; withdrawn endpoint hides confirmed edge', () => {
  const s = clone();
  s.relations['rel-1'].decision = 'proposed';
  assert.throws(() => validateStore(s), /未确认/);
  assert.equal(publicStore(s).relations['rel-1'], undefined);
  s.relations['rel-1'].decision = 'confirmed';
  s.publications['revision:q-001.r1'].state = 'withdrawn';
  assert.equal(publicStore(s).relations['rel-1'], undefined);
});
test('relation replacement works after withdrawing prior edge and rejects forged excerpts', () => {
  const s = clone();
  s.publications['relation:rel-1'].state = 'withdrawn';
  s.relations['rel-replacement'] = {
    ...s.relations['rel-1'],
    id: 'rel-replacement',
    rationale: '更精确的关联理由',
  };
  s.publications['relation:rel-replacement'] = publication('relation', 'rel-replacement');
  validateStore(s, seed());
  s.relations['rel-replacement'].source_excerpt = 'DOES_NOT_EXIST';
  assert.throws(() => validateStore(s), /片段不存在/);
});
test('date precision does not fabricate time and invalid dates fail gracefully', () => {
  const gen = seed().answers['a-001-a'].generation;
  assert.equal(
    generationSchema.safeParse({ ...gen, generated_at: '2026-02-30', time_precision: 'day' })
      .success,
    false,
  );
  assert.equal(
    generationSchema.safeParse({ ...gen, generated_at: '2026-99-01', time_precision: 'day' })
      .success,
    false,
  );
  assert.equal(
    generationSchema.safeParse({ ...gen, generated_at: '2026-09-06', time_precision: 'day' })
      .success,
    true,
  );
  assert.equal(
    generationSchema.safeParse({ ...gen, generated_at: '2026-09-06', time_precision: 'unknown' })
      .success,
    false,
  );
});
test('markdown cannot run scripts, handlers, remote images, MDX or dangerous links', () => {
  const out = markdown(
    '## 安全标题\n<script>alert(1)</script><img src="https://tracker.invalid/pixel" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>\n\n{process.env.SECRET}\n\n```js\nconst n = 1;\n```',
  );
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('<img'));
  assert.ok(!out.includes('javascript:'));
  assert.ok(!out.includes('onerror'));
  assert.ok(out.includes('process.env.SECRET'));
  assert.ok(out.includes('<code'));
});
test('content paths cannot escape root or follow symlinks', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-path-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  assert.throws(() => safePath(tmp, '../secret'), /越界/);
  fs.symlinkSync('/tmp', path.join(tmp, 'link'));
  assert.throws(() => safePath(tmp, 'link/secret'), /符号链接/);
});
test('twenty levels preserve a unique path', () => {
  const s = emptyStore();
  for (let i = 0; i < 21; i++) {
    const q = `q${i}`,
      r = `r${i}`,
      a = `a${i}`;
    s.questions[q] = {
      ...seed().questions['q-001'],
      id: q,
      parent_answer_id: i ? `a${i - 1}` : null,
      current_revision_id: r,
    };
    s.revisions[r] = {
      ...seed().revisions['q-001.r1'],
      id: r,
      question_id: q,
      body_sha256: sha256(q),
    };
    s.answers[a] = {
      ...seed().answers['a-001-a'],
      id: a,
      question_revision_id: r,
      body_sha256: sha256(a),
    };
    s.bodies[r] = q;
    s.bodies[a] = a;
    for (const [kind, id] of [
      ['question', q],
      ['revision', r],
      ['answer', a],
    ] as const)
      s.publications[`${kind}:${id}`] = publication(kind, id);
  }
  validateStore(s);
  const p = questionPath(s, 'q20');
  assert.equal(p.length, 41);
  assert.equal(p[0].id, 'r0');
  assert.equal(p.at(-1)?.id, 'r20');
});
