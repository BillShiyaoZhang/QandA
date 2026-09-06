import type { Store } from './schema';
import { answerQuestion, isArchived, visibleRef } from './graph';
import { answerName } from './view';

export type ContributionTarget = {
  id: string;
  kind: 'revision' | 'answer';
  title: string;
  label: string;
  excerpt: string;
  path: string;
  archived: boolean;
};

/** Keep public history available for relations, including archived branches. */
export function contributionTargets(s: Store): ContributionTarget[] {
  const targets: ContributionTarget[] = [];
  for (const q of Object.values(s.questions)) {
    const revisions = Object.values(s.revisions)
      .filter((r) => r.question_id === q.id)
      .sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
      );
    for (const [index, r] of revisions.entries()) {
      if (!visibleRef(s, { entity_type: 'revision', entity_id: r.id })) continue;
      targets.push({
        id: r.id,
        kind: 'revision',
        title: q.title,
        archived: isArchived(s, q.id),
        label: `${q.title} · 第 ${index + 1} 版${q.current_revision_id === r.id ? '（当前）' : ''}`,
        excerpt: s.bodies[r.id].slice(0, 160),
        path: `questions/${q.id}/revisions/${r.id}/`,
      });
    }
  }
  for (const a of Object.values(s.answers)) {
    if (!visibleRef(s, { entity_type: 'answer', entity_id: a.id })) continue;
    const qid = answerQuestion(s, a.id);
    const title = s.questions[qid].title;
    targets.push({
      id: a.id,
      kind: 'answer',
      title,
      archived: isArchived(s, qid),
      label: `${title} · ${answerName(a)}：${s.bodies[a.id].replace(/\s+/g, ' ').slice(0, 55)}`,
      excerpt: s.bodies[a.id].slice(0, 160),
      path: `answers/${a.id}/`,
    });
  }
  return targets;
}
