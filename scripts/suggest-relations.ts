import fs from 'node:fs';
import path from 'node:path';
import { loadStore, validateStore } from '../src/lib/content';
import { suggestRelations, candidateRelation } from '../src/lib/relations';
try {
  const args = process.argv.slice(2),
    get = (k: string) => args[args.indexOf(k) + 1];
  const s = loadStore();
  validateStore(s);
  const candidates = suggestRelations(s, {
    onlyIds: args.includes('--node') ? [get('--node')] : undefined,
    minScore: args.includes('--min-score') ? Number(get('--min-score')) : 0.15,
  });
  const out = path.resolve(args.includes('--out') ? get('--out') : '.local/relation-candidates');
  fs.mkdirSync(out, { recursive: true });
  for (const c of candidates) {
    const relation = candidateRelation(c);
    const p = path.join(out, relation.id + '.json');
    if (!fs.existsSync(p))
      fs.writeFileSync(
        p,
        JSON.stringify({ ...relation, matching_terms: c.matching_terms }, null, 2) + '\n',
      );
  }
  console.log(`${candidates.length} 条主题相关候选已保存到 ${out}；尚未确认，不会自动发布。`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
