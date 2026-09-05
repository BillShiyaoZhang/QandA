import { canonical, sha256 } from './content';
import { visibleRef, rootId } from './graph';
import type { Store, Ref, Relation } from './schema';
export const METHOD_VERSION = 'lexical-tfidf-v1';
export function tokenize(input: string) {
  const text = input.normalize('NFKC').toLowerCase();
  const words: string[] = text.match(/[a-z0-9]+/g) || [];
  for (const run of text.match(/[\p{Script=Han}]+/gu) || []) {
    if (run.length === 1) words.push(run);
    else for (let i = 0; i < run.length - 1; i++) words.push(run.slice(i, i + 2));
  }
  const stop = new Set([
    '一个',
    '可以',
    '问题',
    '答案',
    '什么',
    '我们',
    '如果',
    '这种',
    '这些',
    '需要',
    '可能',
    '以及',
    '进行',
    '不同',
    '如何',
  ]);
  return words.filter((w) => !stop.has(w) && w.length < 40);
}
export function suggestRelations(
  s: Store,
  {
    limit = 5,
    minScore = 0.15,
    onlyIds,
  }: { limit?: number; minScore?: number; onlyIds?: string[] } = {},
) {
  const docs = [
    ...Object.values(s.revisions).map((r) => ({
      ref: { entity_type: 'revision', entity_id: r.id, body_sha256: r.body_sha256 } as Ref,
      qid: r.question_id,
    })),
    ...Object.values(s.answers).map((a) => ({
      ref: { entity_type: 'answer', entity_id: a.id, body_sha256: a.body_sha256 } as Ref,
      qid: s.revisions[a.question_revision_id].question_id,
    })),
  ]
    .filter((d) => visibleRef(s, d.ref))
    .map((d) => ({
      ...d,
      tokens: tokenize(s.bodies[d.ref.entity_id] + ' ' + s.questions[d.qid].tags.join(' ')),
      root: rootId(s, d.qid),
    }));
  const df = new Map<string, number>(),
    inverted = new Map<string, Set<number>>();
  docs.forEach((d, i) => {
    for (const term of new Set(d.tokens)) {
      df.set(term, (df.get(term) || 0) + 1);
      if (!inverted.has(term)) inverted.set(term, new Set());
      inverted.get(term)!.add(i);
    }
  });
  const vectors = docs.map((d) => {
    const counts = new Map<string, number>();
    for (const t of d.tokens) counts.set(t, (counts.get(t) || 0) + 1);
    const vec = new Map(
      [...counts].map(([t, n]) => [
        t,
        (1 + Math.log(n)) * (Math.log((1 + docs.length) / (1 + df.get(t)!)) + 1),
      ]),
    );
    const length = Math.sqrt([...vec.values()].reduce((a, b) => a + b * b, 0));
    for (const [t, n] of vec) vec.set(t, n / length);
    return vec;
  });
  const ignored = new Set(
    Object.values(s.relations)
      .filter((r) => r.type === 'related_topic' && r.decision !== 'proposed')
      .map((r) => canonical([r.source_ref.entity_id, r.target_ref.entity_id].sort())),
  );
  const seen = new Set<string>(),
    results: {
      source: Ref;
      target: Ref;
      score: number;
      matching_terms: string[];
      method_version: string;
    }[] = [];
  docs.forEach((d, i) => {
    if (onlyIds && !onlyIds.includes(d.ref.entity_id)) return;
    const candidates = new Set<number>();
    for (const term of vectors[i].keys())
      for (const j of inverted.get(term) || [])
        if (j !== i && docs[j].qid !== d.qid) candidates.add(j);
    const ranked = [...candidates]
      .map((j) => {
        let score = 0;
        const terms: string[] = [];
        for (const [term, w] of vectors[i]) {
          const v = vectors[j].get(term);
          if (v) {
            score += w * v;
            terms.push(term);
          }
        }
        return { j, score, terms };
      })
      .filter(
        (x) =>
          x.score >= minScore &&
          !ignored.has(canonical([d.ref.entity_id, docs[x.j].ref.entity_id].sort())),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    for (const { j, score, terms } of ranked) {
      const pair = canonical([d.ref.entity_id, docs[j].ref.entity_id].sort());
      if (seen.has(pair) || ignored.has(pair)) continue;
      seen.add(pair);
      results.push({
        source: d.ref,
        target: docs[j].ref,
        score: Math.min(1, score),
        matching_terms: terms.slice(0, 12),
        method_version: METHOD_VERSION,
      });
    }
  });
  return results;
}
export function candidateRelation(
  candidate: ReturnType<typeof suggestRelations>[number],
): Relation {
  const [source, target] = [candidate.source, candidate.target].sort((a, b) =>
    a.entity_id.localeCompare(b.entity_id),
  );
  const key = sha256(canonical([source, target])).slice(0, 24);
  return {
    schema_version: 1,
    id: `rel-candidate-${key}`,
    source_ref: source,
    target_ref: target,
    type: 'related_topic',
    rationale: `候选线索：共享词项 ${candidate.matching_terms.join('、')}。需要人工确认关联理由。`,
    source_excerpt: '',
    target_excerpt: '',
    origin: 'lexical',
    proposed_by: 'script:' + METHOD_VERSION,
    created_at: new Date().toISOString(),
    method_version: METHOD_VERSION,
    candidate_score: candidate.score,
    decision: 'proposed',
    decided_by: null,
    decided_at: null,
  };
}
