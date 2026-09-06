import fs from 'node:fs';
import path from 'node:path';
import {
  collectIssue,
  repository,
  type IntakeIssue,
  type IntakeResult,
} from '../src/lib/issue-intake';
import { loadStore, sha256 } from '../src/lib/content';

const root = path.resolve(process.env.CONTENT_DIR || 'content');
const drafts = path.resolve(process.env.DRAFTS_DIR || '.local/submissions');
const reportPath = path.resolve('.local/intake-results.json');
const marker = '<!-- qanda-automatic-intake:v1 -->';
const statusLabels = ['intake:collected', 'intake:needs-info', 'intake:amended'];
const token = process.env.GH_TOKEN;
if (!token) throw new Error('GH_TOKEN is required.');
if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== repository)
  throw new Error('Unexpected repository.');

async function api(endpoint: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}

async function paginate(endpoint: string) {
  const rows: any[] = [];
  for (let page = 1; ; page++) {
    const batch = await api(
      `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
}

function links(ids: string[]) {
  const store = loadStore(root);
  const base = 'https://billshiyaozhang.github.io/QandA';
  return ids
    .flatMap((id) => {
      if (store.questions[id]) return [`[问题](${base}/questions/${id}/)`];
      if (store.answers[id]) return [`[答案](${base}/answers/${id}/)`];
      if (store.relations[id]) {
        const ref = store.relations[id].source_ref;
        const url =
          ref.entity_type === 'answer'
            ? `${base}/answers/${ref.entity_id}/`
            : `${base}/questions/${store.revisions[ref.entity_id].question_id}/revisions/${ref.entity_id}/`;
        return [`[关联所在页面](${url})`];
      }
      return [];
    })
    .join(' · ');
}

function feedbackBody(result: IntakeResult) {
  const history = links(result.entityIds || []);
  if (result.status === 'needs-info') {
    // Render diagnostics as inert text, including any punctuation from invalid input.
    const message = (result.message || '')
      .slice(0, 2500)
      .replace(/[&<>@]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '@': '&#64;' })[c]!);
    return `${marker}\n暂未收录：请修改本 Issue 的表单，保存后会自动重试，无需等待维护者。\n\n<pre>${message}</pre>\n\n检查范围是格式、公开提交确认和引用位置，不判断观点是否正确。`;
  }
  if (result.status === 'amended')
    return `${marker}\n这条投稿已收录。网站保留首次收录的原始快照，本次编辑不会覆盖正文或产生重复记录。\n\n${history}\n\n补充答案或追问请使用新的投稿表单；更正、撤回请说明目标链接，留待事后处理。`;
  return `${marker}\n已自动收录，内容会随下一次成功发布进入网站，通常需要几分钟。\n\n${history}\n\n[查看网站发布进度](https://github.com/${repository}/actions/workflows/deploy.yml) · [查看自动归集运行](https://github.com/${repository}/actions/workflows/intake.yml)\n\n平台保存提交者提供的原文与来源，不代表事实核验。再次编辑本 Issue 不会覆盖已收录快照；补充答案或追问请提交新表单。`;
}

async function feedback(results: IntakeResult[]) {
  const actionable = results.filter((r) => !['ignored', 'paused'].includes(r.status));
  if (!actionable.length) return;
  const labels = await paginate('labels');
  for (const name of statusLabels) {
    if (!labels.some((label) => label.name === name))
      await api('labels', 'POST', {
        name,
        color: name === 'intake:collected' ? '0e8a16' : 'fbca04',
        description: 'QandA 自动归集状态；无需维护者逐条审批',
      });
  }
  for (const result of actionable) {
    const issue: IntakeIssue = await api(`issues/${result.number}`);
    // An edit or pause after collection belongs to the next run.
    if (
      sha256(issue.body || '') !== result.bodyHash ||
      issue.labels.some((l) => l.name === 'intake:paused')
    )
      continue;
    const desired =
      result.status === 'needs-info'
        ? 'intake:needs-info'
        : result.status === 'amended'
          ? 'intake:amended'
          : 'intake:collected';
    if (!issue.labels.some((l) => l.name === desired))
      await api(`issues/${result.number}/labels`, 'POST', { labels: [desired] });
    for (const label of issue.labels) {
      if (statusLabels.includes(label.name) && label.name !== desired)
        await api(`issues/${result.number}/labels/${encodeURIComponent(label.name)}`, 'DELETE');
    }
    const comments = await paginate(`issues/${result.number}/comments`);
    const existing = comments.find(
      (comment) =>
        comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(marker),
    );
    const body = feedbackBody(result);
    if (existing) {
      if (existing.body !== body) await api(`issues/comments/${existing.id}`, 'PATCH', { body });
    } else await api(`issues/${result.number}/comments`, 'POST', { body });
  }
}

if (process.argv.includes('--feedback')) {
  await feedback(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
} else {
  const issues: IntakeIssue[] = await paginate('issues?state=open&sort=created&direction=asc');
  // Include a closed, edited Issue too; closing an Issue does not withdraw its content.
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (Number.isSafeInteger(event.issue?.number)) {
      const current = await api(`issues/${event.issue.number}`);
      const index = issues.findIndex((issue) => issue.number === current.number);
      if (index < 0) issues.push(current);
      else issues[index] = current;
    }
  }
  const results = issues.map((issue) => collectIssue(root, drafts, issue));
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2) + '\n');
  const summary =
    results
      .filter((r) => r.status !== 'ignored')
      .map((r) => `- #${r.number}: ${r.status}`)
      .join('\n') || 'No submissions to collect.';
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 自动归集\n\n${summary}\n`);
  console.log(summary);
}
