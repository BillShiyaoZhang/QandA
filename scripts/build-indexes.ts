import fs from 'node:fs';
import path from 'node:path';
import { loadStore, validateStore } from '../src/lib/content';
import { publicStore, rootId } from '../src/lib/graph';
const s = loadStore();
validateStore(s);
const p = publicStore(s);
const out = {
  answersByRevision: {} as Record<string, string[]>,
  childrenByAnswer: {} as Record<string, string[]>,
  relationsByNode: {} as Record<string, string[]>,
  roots: {} as Record<string, string>,
};
for (const a of Object.values(p.answers))
  (out.answersByRevision[a.question_revision_id] ??= []).push(a.id);
for (const q of Object.values(p.questions)) {
  out.roots[q.id] = rootId(p, q.id);
  if (q.parent_answer_id) (out.childrenByAnswer[q.parent_answer_id] ??= []).push(q.id);
}
for (const r of Object.values(p.relations))
  for (const ref of [r.source_ref, r.target_ref])
    (out.relationsByNode[ref.entity_id] ??= []).push(r.id);
const dest = path.resolve(process.argv[2] || '.local/indexes.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`公开关系索引已生成：${dest}`);
