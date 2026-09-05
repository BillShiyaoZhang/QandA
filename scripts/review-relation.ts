import fs from 'node:fs';
import path from 'node:path';
import { loadStore, publication } from '../src/lib/content';
import { visibleRef } from '../src/lib/graph';
import { relationSchema } from '../src/lib/schema';
import { applyReviewedFiles } from '../src/lib/maintenance';
const args = process.argv.slice(2),
  get = (k: string) => args[args.indexOf(k) + 1];
try {
  if (
    !args.includes('--candidate') ||
    !args.includes('--reviewer') ||
    (!args.includes('--confirm') && !args.includes('--reject'))
  )
    throw new Error(
      '用法: npm run relation:review -- --candidate FILE --reviewer NAME --confirm|--reject --reason TEXT',
    );
  const raw = JSON.parse(fs.readFileSync(get('--candidate'), 'utf8'));
  delete raw.matching_terms;
  const r = relationSchema.parse(raw),
    root = path.resolve(process.env.CONTENT_DIR || 'content'),
    s = loadStore(root);
  if (s.relations[r.id])
    throw new Error('该候选已作决定；需要重新判断时，新建关联投稿，保留旧决定');
  if (!visibleRef(s, r.source_ref) || !visibleRef(s, r.target_ref))
    throw new Error('关联端点已撤回或不可公开');
  if (args.includes('--confirm') && !args.includes('--reason'))
    throw new Error('确认关系需要 --reason 说明实际关联依据');
  r.decision = args.includes('--confirm') ? 'confirmed' : 'rejected';
  r.decided_by = get('--reviewer');
  r.decided_at = new Date().toISOString();
  if (args.includes('--reason')) r.rationale = get('--reason');
  const files: Record<string, string> = {
    [`relations/${r.id}.json`]: JSON.stringify(r, null, 2) + '\n',
  };
  if (r.decision === 'confirmed')
    files[`publications/relation/${r.id}.json`] =
      JSON.stringify(publication('relation', r.id, r.decided_by), null, 2) + '\n';
  applyReviewedFiles(root, files, s);
  console.log(`${r.decision}: ${r.id}，请通过内容 PR 保存这次决定。`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
