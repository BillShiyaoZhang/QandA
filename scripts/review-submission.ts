import path from 'node:path';
import { reviewDraft, recoverTransaction } from '../src/lib/submissions';
const args = process.argv.slice(2),
  arg = (name: string) => args[args.indexOf(name) + 1];
try {
  if (args.includes('--recover')) {
    console.log(recoverTransaction(path.resolve(process.env.CONTENT_DIR || 'content')));
    process.exit(0);
  }
  if (
    !args.includes('--draft') ||
    !args.includes('--reviewer') ||
    !(args.includes('--publish') || args.includes('--reject'))
  )
    throw new Error('用法: npm run review -- --draft FILE --reviewer NAME --publish|--reject');
  const d = reviewDraft(
    path.resolve(process.env.CONTENT_DIR || 'content'),
    path.resolve(arg('--draft')),
    arg('--reviewer'),
    args.includes('--publish') ? 'publish' : 'reject',
  );
  console.log(`${d.status}: ${d.summary}\n审核后请审阅 git diff，并以内容 PR 发布。`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
