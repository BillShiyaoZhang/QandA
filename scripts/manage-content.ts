import path from 'node:path';
import { loadStore, published } from '../src/lib/content';
import { applyReviewedFiles } from '../src/lib/maintenance';
const args = process.argv.slice(2),
  get = (key: string) => args[args.indexOf(key) + 1];
try {
  const root = path.resolve(process.env.CONTENT_DIR || 'content'),
    s = loadStore(root),
    id = get('--id'),
    reviewer = get('--reviewer');
  if (!args.includes('--id') || !args.includes('--reviewer'))
    throw new Error('需要 --id 和 --reviewer。操作: --archive / --reopen / --withdraw TYPE');
  const files: Record<string, string> = {};
  if (args.includes('--archive') || args.includes('--reopen')) {
    const q = s.questions[id];
    if (!q) throw new Error('问题不存在');
    files[`questions/${id}/question.json`] =
      JSON.stringify({ ...q, state: args.includes('--archive') ? 'archived' : 'active' }, null, 2) +
      '\n';
  } else if (args.includes('--withdraw')) {
    const kind = get('--withdraw'),
      p = s.publications[`${kind}:${id}`];
    if (!p) throw new Error('没有该实体的发布记录');
    if (kind === 'revision') {
      const r = s.revisions[id],
        q = s.questions[r.question_id];
      if (q.current_revision_id === id && published(s, 'question', q.id)) {
        const replacement = args.includes('--replacement') ? get('--replacement') : null;
        if (
          !replacement ||
          s.revisions[replacement]?.question_id !== q.id ||
          !published(s, 'revision', replacement) ||
          replacement === id
        )
          throw new Error('撤回当前修订需要 --replacement 指定本题有效修订，或先撤回问题');
        files[`questions/${q.id}/question.json`] =
          JSON.stringify({ ...q, current_revision_id: replacement }, null, 2) + '\n';
      }
    }
    files[`publications/${kind}/${id}.json`] =
      JSON.stringify(
        {
          ...p,
          state: 'withdrawn',
          reviewed_by: reviewer,
          reviewed_at: new Date().toISOString(),
          withdrawal_reason: args.includes('--reason') ? get('--reason') : '维护者撤回',
        },
        null,
        2,
      ) + '\n';
  } else throw new Error('请选择 --archive、--reopen 或 --withdraw TYPE');
  applyReviewedFiles(root, files, s);
  console.log(`已更新 ${id}。请审阅差异并提交内容 PR；网站不会在本地操作后立即变化。`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
