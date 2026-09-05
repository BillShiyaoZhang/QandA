import {
  unknownGeneration,
  type Store,
  type Question,
  type Ref,
  type Answer,
  type Revision,
} from './schema';
import { published, status, entity } from './content';
export type PathNode = {
  kind: 'revision' | 'answer';
  id: string;
  question_id: string;
  withdrawn: boolean;
};
export function questionPath(s: Store, questionId: string, revisionId?: string): PathNode[] {
  const q = s.questions[questionId];
  if (!q) throw new Error(`问题不存在: ${questionId}`);
  if (revisionId && s.revisions[revisionId]?.question_id !== questionId)
    throw new Error('修订不属于该问题');
  const reversed: PathNode[] = [];
  const seen = new Set<string>();
  let current: Question | undefined = q;
  let rid = revisionId || q.current_revision_id;
  while (current) {
    if (seen.has(current.id)) throw new Error('主路径成环');
    seen.add(current.id);
    if (rid)
      reversed.push({
        kind: 'revision',
        id: rid,
        question_id: current.id,
        withdrawn: !published(s, 'question', current.id) || !published(s, 'revision', rid),
      });
    if (!current.parent_answer_id) break;
    const a: Answer = s.answers[current.parent_answer_id];
    if (!a) throw new Error('父答案不存在');
    const r: Revision = s.revisions[a.question_revision_id];
    reversed.push({
      kind: 'answer',
      id: a.id,
      question_id: r.question_id,
      withdrawn:
        !published(s, 'answer', a.id) ||
        !published(s, 'revision', r.id) ||
        !published(s, 'question', r.question_id),
    });
    current = s.questions[r.question_id];
    rid = r.id;
  }
  return reversed.reverse();
}
export function rootId(s: Store, qid: string) {
  return questionPath(s, qid)[0]?.question_id || qid;
}
export function isArchived(s: Store, qid: string) {
  return questionPath(s, qid).some((n) => s.questions[n.question_id].state === 'archived');
}
export function answerQuestion(s: Store, aid: string) {
  return s.revisions[s.answers[aid].question_revision_id].question_id;
}
export function visibleRef(s: Store, ref: Pick<Ref, 'entity_type' | 'entity_id'>): boolean {
  if (!published(s, ref.entity_type, ref.entity_id)) return false;
  if (ref.entity_type === 'revision')
    return published(s, 'question', s.revisions[ref.entity_id].question_id);
  const a = s.answers[ref.entity_id];
  return visibleRef(s, { entity_type: 'revision', entity_id: a.question_revision_id });
}
export function publicStore(s: Store): Store {
  const out: Store = {
    imports: {},
    questions: {},
    revisions: {},
    answers: {},
    contexts: {},
    annotations: {},
    relations: {},
    publications: {},
    bodies: {},
  };
  for (const [id, q] of Object.entries(s.questions))
    if (status(s, 'question', id))
      out.questions[id] = published(s, 'question', id)
        ? { ...q }
        : { ...q, title: '问题已撤回', tags: [], created_by: '', copied_from_question_id: null };
  for (const [id, r] of Object.entries(s.revisions))
    if (status(s, 'revision', id)) {
      const visible = visibleRef(s, { entity_type: 'revision', entity_id: id });
      out.revisions[id] = visible
        ? { ...r }
        : { ...r, body_path: '', change_note: '已撤回', created_by: '' };
      if (visible) out.bodies[id] = s.bodies[id];
    }
  for (const [id, a] of Object.entries(s.answers))
    if (status(s, 'answer', id)) {
      out.answers[id] = structuredClone(a);
      if (visibleRef(s, { entity_type: 'answer', entity_id: id })) out.bodies[id] = s.bodies[id];
      else {
        out.answers[id].body_path = '';
        out.answers[id].submitted_by = '';
        out.answers[id].provenance = {
          kind: 'community_paste',
          source_url: null,
          identity_evidence: 'unknown',
        };
        out.answers[id].generation = unknownGeneration();
        out.answers[id].context = {
          snapshot_id: null,
          capture_kind: 'unknown',
          visible_history_completeness: 'unknown',
          matches_site_path: 'unknown',
        };
      }
    }
  const referencedContexts = new Set(
    Object.values(s.answers)
      .filter((a) => visibleRef(s, { entity_type: 'answer', entity_id: a.id }))
      .map((a) => a.context.snapshot_id)
      .filter(Boolean),
  );
  for (const [id, c] of Object.entries(s.contexts))
    if (
      referencedContexts.has(id) &&
      published(s, 'context', id) &&
      c.path_refs.every((r) => visibleRef(s, r))
    )
      out.contexts[id] = c;
  for (const a of Object.values(out.answers))
    if (a.context.snapshot_id && !out.contexts[a.context.snapshot_id])
      a.context = {
        snapshot_id: null,
        capture_kind: 'unknown',
        visible_history_completeness: 'unknown',
        matches_site_path: 'unknown',
      };
  for (const [id, n] of Object.entries(s.annotations)) {
    const ok =
      n.target_type === 'question'
        ? published(s, 'question', n.target_id)
        : visibleRef(s, { entity_type: n.target_type, entity_id: n.target_id });
    if (published(s, 'annotation', id) && ok) {
      out.annotations[id] = n;
      out.bodies[id] = s.bodies[id];
    }
  }
  for (const [id, r] of Object.entries(s.relations))
    if (
      published(s, 'relation', id) &&
      r.decision === 'confirmed' &&
      visibleRef(s, r.source_ref) &&
      visibleRef(s, r.target_ref)
    )
      out.relations[id] = r;
  for (const [key, p] of Object.entries(s.publications))
    if (entity(out, p.entity_type, p.entity_id))
      out.publications[key] =
        p.state === 'withdrawn'
          ? {
              ...p,
              reviewed_by: '',
              source_issue_url: null,
              source_updated_at: null,
              source_body_sha256: null,
              withdrawal_reason: '已撤回',
            }
          : p;
  return out;
}
export function copyPath(s: Store, qid: string, rid?: string, answerId?: string) {
  const nodes = questionPath(s, qid, rid);
  if (
    answerId &&
    s.answers[answerId]?.question_revision_id !== (rid || s.questions[qid]?.current_revision_id)
  )
    throw new Error('答案不属于所选问题修订');
  if (answerId)
    nodes.push({
      kind: 'answer',
      id: answerId,
      question_id: qid,
      withdrawn: !visibleRef(s, { entity_type: 'answer', entity_id: answerId }),
    });
  const missing = !published(s, 'question', qid) || nodes.some((n) => n.withdrawn);
  const text = nodes
    .map(
      (n) =>
        `## ${n.kind === 'revision' ? '提问' : '回答'} [${n.id}]\n\n${n.withdrawn ? '[此节点已撤回，上下文不完整]' : s.bodies[n.id] || '[正文未提供]'}`,
    )
    .join('\n\n');
  return {
    complete: !missing,
    text: (missing ? '注意：路径含撤回内容，不能视为完整上下文。\n\n' : '') + text,
    nodes,
  };
}
