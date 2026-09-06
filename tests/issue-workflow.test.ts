import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { issueForms, publicConsent, repository } from '../src/lib/issue-intake';
import { canonical, loadStore } from '../src/lib/content';

test('the runner paginates, keeps collection separate from feedback, and updates one bot comment idempotently', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-workflow-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'content');
  fs.mkdirSync(root);
  const values: Record<string, string> = {
    问题标题: '真实流程的临时测试',
    问题正文: '测试文本',
    公开提交确认: `- [x] ${publicConsent}`,
  };
  const body = issueForms.question.fields
    .map((label) => `### ${label}\n\n${values[label] || '_No response_'}`)
    .join('\n\n');
  const base = {
    state: 'open',
    user: { login: 'contributor', type: 'User' },
    labels: [],
    updated_at: '2026-09-06T00:00:00Z',
  };
  const issues = Array.from({ length: 102 }, (_, i) => ({
    ...base,
    number: i + 1,
    title: '普通反馈',
    body: '普通反馈',
    html_url: `https://github.com/${repository}/issues/${i + 1}`,
  }));
  issues.push({
    ...base,
    number: 103,
    title: '[提个新问题]',
    body,
    html_url: `https://github.com/${repository}/issues/103`,
  });
  const statePath = path.join(temp, 'api.json');
  const save = (state: any) => fs.writeFileSync(statePath, JSON.stringify(state));
  const read = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  save({ issues, labels: [], comments: [], calls: [] });
  const mockPath = path.join(temp, 'mock-api.mjs');
  fs.writeFileSync(
    mockPath,
    `
import fs from 'node:fs';
globalThis.fetch = async (url, options = {}) => {
  const state = JSON.parse(fs.readFileSync(process.env.QANDA_MOCK_STATE, 'utf8'));
  const parsed = new URL(url);
  if (parsed.origin !== 'https://api.github.com') throw new Error('Unexpected endpoint');
  const endpoint = parsed.pathname.replace('/repos/${repository}/', '');
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  state.calls.push({ endpoint, method, body, page: parsed.searchParams.get('page') });
  const parts = endpoint.split('/');
  const issue = state.issues.find(i => i.number === Number(parts[1]));
  const paged = rows => rows.slice((Number(parsed.searchParams.get('page') || 1) - 1) * 100, Number(parsed.searchParams.get('page') || 1) * 100);
  let result;
  if (method === 'GET' && endpoint === 'issues') result = paged(state.issues.filter(i => i.state === parsed.searchParams.get('state')));
  else if (method === 'GET' && endpoint === 'labels') result = paged(state.labels);
  else if (method === 'POST' && endpoint === 'labels') { state.labels.push(body); result = body; }
  else if (method === 'GET' && parts.length === 2 && Boolean(issue)) result = issue;
  else if (method === 'PATCH' && parts.length === 2 && Boolean(issue)) {
    if (body.state !== 'closed' || body.state_reason !== 'completed') throw new Error('Unexpected closure');
    Object.assign(issue, body); result = issue;
  }
  else if (method === 'GET' && parts.length === 3 && parts[2] === 'comments' && Boolean(issue)) result = paged(state.comments);
  else if (method === 'POST' && parts.length === 3 && parts[2] === 'labels' && Boolean(issue)) { issue.labels.push(...body.labels.map(name => ({name}))); result = issue.labels; }
  else if (method === 'POST' && parts.length === 3 && parts[2] === 'comments' && Boolean(issue)) {
    result = {id: state.comments.length + 1, body: body.body, user: {login: 'github-actions[bot]'}};
    state.comments.push(result);
  } else if (method === 'PATCH' && parts.length === 3 && parts[1] === 'comments') {
    if (state.failComment) throw new Error('Simulated comment failure');
    result = state.comments.find(c => c.id === Number(endpoint.split('/')[2])); result.body = body.body;
  } else if (method === 'DELETE' && parts.length === 4 && parts[2] === 'labels' && Boolean(issue)) {
    issue.labels = issue.labels.filter(l => l.name !== decodeURIComponent(endpoint.split('/').at(-1)));
    result = {};
  } else throw new Error('Unmocked GitHub request: ' + method + ' ' + endpoint);
  fs.writeFileSync(process.env.QANDA_MOCK_STATE, JSON.stringify(state));
  return new Response(JSON.stringify(result), {status: 200, headers: {'Content-Type': 'application/json'}});
};
`,
  );
  const script = path.resolve('scripts/collect-issues.ts');
  const run = (mode: 'collect' | 'feedback' | 'close-published' = 'collect') =>
    execFileSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href,
        '--import',
        pathToFileURL(mockPath).href,
        script,
        ...(mode === 'collect' ? [] : [`--${mode}`]),
      ],
      {
        cwd: temp,
        env: {
          ...process.env,
          CONTENT_DIR: root,
          DRAFTS_DIR: path.join(temp, 'drafts'),
          GH_TOKEN: 'fake-test-token',
          GITHUB_REPOSITORY: repository,
          GITHUB_EVENT_PATH: '',
          GITHUB_STEP_SUMMARY: '',
          QANDA_MOCK_STATE: statePath,
        },
        encoding: 'utf8',
      },
    );
  run();
  assert.equal(Object.keys(loadStore(root).questions).length, 1);
  assert.ok(read().calls.some((call: any) => call.endpoint === 'issues' && call.page === '2'));
  assert.ok(read().calls.every((call: any) => call.method === 'GET'));
  const saved = canonical(loadStore(root));
  run('feedback');
  assert.equal(read().comments.length, 1);
  assert.match(read().comments[0].body, /已自动收录/);
  assert.match(read().comments[0].body, /通常需要几分钟/);
  assert.equal(read().issues.at(-1).state, 'open');
  let state = read();
  state.calls = [];
  state.issues.at(-1).updated_at = '2026-09-07T00:00:00Z';
  save(state);
  run();
  run('feedback');
  assert.equal(canonical(loadStore(root)), saved);
  assert.ok(read().calls.every((call: any) => call.method === 'GET'));
  // A feedback outage must leave the Issue open so the next deployment can retry.
  state = read();
  state.failComment = true;
  save(state);
  assert.throws(() => run('close-published'));
  assert.equal(read().issues.at(-1).state, 'open');
  state = read();
  state.failComment = false;
  save(state);
  run('close-published');
  assert.equal(read().issues.at(-1).state, 'closed');
  assert.equal(read().issues.at(-1).state_reason, 'completed');
  assert.equal(read().comments.length, 1);
  assert.match(read().comments[0].body, /成功发布到网站/);
  state = read();
  state.calls = [];
  save(state);
  // Closed issues are not revisited, and a saved report must not downgrade the reply.
  run('close-published');
  run('feedback');
  assert.ok(read().calls.every((call: any) => call.method === 'GET'));
  assert.match(read().comments[0].body, /成功发布到网站/);
  state = read();
  state.issues.at(-1).state = 'open';
  state.issues.at(-1).labels.push({ name: 'intake:paused' });
  save(state);
  run('close-published');
  assert.equal(read().issues.at(-1).state, 'open');
  state = read();
  state.issues.at(-1).labels = state.issues
    .at(-1)
    .labels.filter((label: any) => label.name !== 'intake:paused');
  state.issues.at(-1).body = body.replace('测试文本', '编辑后的文本');
  save(state);
  run('close-published');
  assert.equal(read().issues.at(-1).state, 'open');
  run();
  run('feedback');
  assert.equal(canonical(loadStore(root)), saved);
  assert.equal(read().comments.length, 1);
  assert.match(read().comments[0].body, /不会覆盖正文/);
  assert.ok(
    read()
      .issues.at(-1)
      .labels.some((label: any) => label.name === 'intake:amended'),
  );
});
