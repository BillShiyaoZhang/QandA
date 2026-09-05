import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createDraft, issueSubmission, type Submission } from '../src/lib/submissions';
const args = process.argv.slice(2);
const arg = (name: string) => args[args.indexOf(name) + 1];
try {
  let source, input;
  if (args.includes('--issue')) {
    const raw = arg('--issue');
    const m = /^https:\/\/github.com\/BillShiyaoZhang\/QandA\/issues\/(\d+)$/.exec(raw);
    if (!m) throw new Error('Issue 必须属于 BillShiyaoZhang/QandA');
    const result = JSON.parse(
      execFileSync('gh', ['api', `repos/BillShiyaoZhang/QandA/issues/${m[1]}`], {
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
      }),
    );
    source = {
      url: result.html_url,
      updated_at: result.updated_at,
      author: result.user.login,
      body: result.body || '',
    };
    const kind = arg('--kind') as Submission['kind'];
    if (!args.includes('--kind'))
      throw new Error('--issue 需要 --kind question|answer|follow-up|relation');
    input = issueSubmission(source.body, kind);
  } else if (args.includes('--file')) {
    const data = JSON.parse(fs.readFileSync(arg('--file'), 'utf8'));
    source = data.source;
    input = data.submission;
  } else
    throw new Error('用法: npm run import -- --issue URL --kind answer 或 --file submission.json');
  const root = path.resolve(process.env.CONTENT_DIR || 'content'),
    drafts = path.resolve(process.env.DRAFTS_DIR || '.local/submissions');
  const draft = createDraft(root, drafts, source, input, { refresh: args.includes('--refresh') });
  console.log(
    JSON.stringify(
      {
        status: draft.status,
        key: draft.key,
        summary: draft.summary,
        draft: path.join(drafts, draft.key + '.json'),
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
