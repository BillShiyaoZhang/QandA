import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import {
  automaticSubmission,
  collectIssue,
  issueForms,
  publicConsent,
  repository,
  type IntakeIssue,
  type IssueKind,
} from '../src/lib/issue-intake';
import { canonical, loadStore, validateStore } from '../src/lib/content';
import { publicStore } from '../src/lib/graph';

function fixture(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-intake-'));
  const root = path.join(dir, 'content');
  fs.cpSync(process.env.CONTENT_DIR!, root, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { root, drafts: path.join(dir, 'drafts') };
}
function body(kind: IssueKind, values: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    问题标题: '一个社区问题',
    问题正文: '为什么？\n\n### 普通标题\n\n保留 Markdown。',
    答案正文: '社区回答',
    '已有答案（选填）': '附带回答',
    '问题修订 ID': 'q-001.r1',
    '父答案 ID': 'a-001-a',
    '来源节点 ID': 'a-001-a',
    '目标节点 ID': 'a-001-b',
    关联类型: '主题相关',
    关联理由: '讨论同一个问题。',
    公开提交确认: `- [x] ${publicConsent}`,
    ...values,
  };
  return issueForms[kind].fields
    .map((label) => `### ${label}\n\n${fields[label] || '_No response_'}`)
    .join('\n\n');
}
function issue(
  kind: IssueKind = 'question',
  values: Record<string, string> = {},
  number = 123,
): IntakeIssue {
  return {
    number,
    title: `[${issueForms[kind].title}]`,
    body: body(kind, values),
    html_url: `https://github.com/${repository}/issues/${number}`,
    updated_at: '2026-09-06T00:00:00Z',
    state: 'open',
    user: { login: 'contributor', type: 'User' },
    labels: [],
  };
}

test('all generated GitHub forms agree with the automatic parser', () => {
  const templates = {
    question: 'new-question',
    answer: 'submit-answer',
    'follow-up': 'follow-up',
    relation: 'suggest-relation',
  };
  for (const kind of Object.keys(issueForms) as IssueKind[]) {
    const form = YAML.parse(
      fs.readFileSync(`.github/ISSUE_TEMPLATE/${templates[kind]}.yml`, 'utf8'),
    );
    assert.deepEqual(
      form.body.filter((f: any) => f.type !== 'markdown').map((f: any) => f.attributes.label),
      issueForms[kind].fields,
    );
    assert.equal(form.body.at(-1).attributes.options[0].label, publicConsent);
    assert.equal(automaticSubmission(body(kind), kind).kind, kind);
  }
});

test('each of four contribution types is collected and publicly exported without human approval', (t) => {
  for (const [index, kind] of (Object.keys(issueForms) as IssueKind[]).entries()) {
    const f = fixture(t),
      before = loadStore(f.root);
    const result = collectIssue(f.root, f.drafts, issue(kind, {}, 100 + index));
    assert.equal(result.status, 'collected');
    const store = loadStore(f.root),
      visible = publicStore(store);
    validateStore(store, before);
    const receipt = Object.values(store.imports).at(-1)!;
    assert.equal(receipt.intake_method, 'github-actions');
    assert.equal(receipt.reviewer, 'github-actions[bot]');
    assert.ok(
      result.entityIds!.some(
        (id) => visible.questions[id] || visible.answers[id] || visible.relations[id],
      ),
    );
    if (kind === 'question' || kind === 'follow-up') {
      assert.equal(Object.keys(store.questions).length, Object.keys(before.questions).length + 1);
      assert.equal(Object.keys(store.answers).length, Object.keys(before.answers).length + 1);
    }
    if (kind === 'relation') {
      const relation = visible.relations[result.entityIds![0]];
      assert.equal(relation.decision, 'submitted');
      assert.equal(relation.decided_by, null);
      assert.equal(relation.decided_at, null);
      store.publications[`answer:${relation.source_ref.entity_id}`].state = 'withdrawn';
      assert.equal(publicStore(store).relations[relation.id], undefined);
    }
  }
});

test('retry, metadata-only update, lost drafts, and edited successful issues do not duplicate content', (t) => {
  const f = fixture(t),
    input = issue();
  assert.equal(collectIssue(f.root, f.drafts, input).status, 'collected');
  const saved = canonical(loadStore(f.root));
  fs.rmSync(f.drafts, { recursive: true });
  assert.equal(
    collectIssue(f.root, f.drafts, { ...input, updated_at: '2026-09-07T00:00:00Z' }).status,
    'already-collected',
  );
  assert.equal(
    collectIssue(f.root, f.drafts, {
      ...input,
      body: body('question', { 问题正文: '后来修改的正文' }),
    }).status,
    'amended',
  );
  assert.equal(canonical(loadStore(f.root)), saved);
  assert.equal(collectIssue(f.root, f.drafts, issue('question', {}, 124)).status, 'collected');
  assert.equal(Object.keys(loadStore(f.root).imports).length, 2);
});

test('a bad submission is atomic and can be fixed by its author', (t) => {
  const f = fixture(t),
    before = canonical(loadStore(f.root));
  const bad = issue('follow-up', { 生成日期: '2026-02-30' });
  assert.equal(collectIssue(f.root, f.drafts, bad).status, 'needs-info');
  assert.equal(canonical(loadStore(f.root)), before);
  assert.equal(collectIssue(f.root, f.drafts, issue('follow-up')).status, 'collected');
});

test('ordinary issues, PRs, bots, closed uncollected issues, and paused submissions are not ingested', (t) => {
  const f = fixture(t),
    before = canonical(loadStore(f.root));
  for (const change of [
    { title: '修复网站问题', body: '普通反馈，没有投稿表单。' },
    { pull_request: {} },
    { user: { login: 'robot', type: 'Bot' } },
    { state: 'closed' },
  ])
    assert.equal(collectIssue(f.root, f.drafts, { ...issue(), ...change }).status, 'ignored');
  assert.equal(
    collectIssue(f.root, f.drafts, { ...issue(), labels: [{ name: 'intake:paused' }] }).status,
    'paused',
  );
  assert.equal(canonical(loadStore(f.root)), before);
  assert.throws(() =>
    collectIssue(f.root, f.drafts, {
      ...issue(),
      html_url: 'https://github.com/another/repo/issues/123',
    }),
  );
});

test('format, consent, URL, enumeration, and target failures leave no partial content', (t) => {
  const cases: [IssueKind, Record<string, string>][] = [
    ['question', { 公开提交确认: `- [ ] ${publicConsent}` }],
    ['question', { 公开提交确认: '- [x] something else' }],
    ['question', { 工具使用: 'random choice' }],
    ['question', { 原始分享链接: 'javascript:alert(1)' }],
    ['question', { 问题正文: '正文\n### 问题修订 ID\nq-001.r1' }],
    ['question', { 问题正文: '正文\n```\n没有关闭的围栏' }],
    ['answer', { '问题修订 ID': 'missing-revision' }],
    ['follow-up', { '父答案 ID': 'missing-answer' }],
    ['relation', { 关联类型: '自动认定正确' }],
    ['relation', { '目标节点 ID': 'a-001-a' }],
    [
      'relation',
      { 关联类型: '观点支持', 来源原文片段: '并不存在的原文', 目标原文片段: '也不存在' },
    ],
  ];
  for (const [kind, values] of cases) {
    const f = fixture(t),
      before = canonical(loadStore(f.root));
    assert.equal(
      collectIssue(f.root, f.drafts, issue(kind, values)).status,
      'needs-info',
      JSON.stringify(values),
    );
    assert.equal(canonical(loadStore(f.root)), before);
  }
});

test('unknown fields stay unknown and fenced form headings remain verbatim', () => {
  const text = '原文\n```markdown\n### 问题标题\n正文中的标题\n```';
  const sub = automaticSubmission(
    body('question', {
      问题正文: text,
      工具使用: 'None',
      模型显示名称: '未知',
      生成日期: 'unknown',
      原始分享链接: '未知',
    }),
    'question',
  );
  assert.equal(sub.body, text);
  assert.equal(sub.tools, 'unknown');
  assert.equal(sub.model_name, null);
  assert.equal(sub.generated_on, null);
  assert.equal(sub.source_url, null);
});

test('a question may be collected without an answer', (t) => {
  const f = fixture(t),
    before = Object.keys(loadStore(f.root).answers).length;
  assert.equal(
    collectIssue(f.root, f.drafts, issue('question', { '已有答案（选填）': '' })).status,
    'collected',
  );
  assert.equal(Object.keys(loadStore(f.root).answers).length, before);
});

test('a submitter can replace the top-level issue title without losing the submission', (t) => {
  const f = fixture(t);
  assert.equal(
    collectIssue(f.root, f.drafts, { ...issue(), title: '自拟的标题' }).status,
    'collected',
  );
});

test('archived and withdrawn targets reject new submissions', (t) => {
  for (const withdrawn of [false, true]) {
    const f = fixture(t);
    const file = path.join(
      f.root,
      withdrawn ? 'publications/answer/a-001-a.json' : 'questions/q-001/question.json',
    );
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.state = withdrawn ? 'withdrawn' : 'archived';
    fs.writeFileSync(file, JSON.stringify(record));
    const before = canonical(loadStore(f.root));
    assert.equal(collectIssue(f.root, f.drafts, issue('follow-up')).status, 'needs-info');
    assert.equal(canonical(loadStore(f.root)), before);
  }
});
