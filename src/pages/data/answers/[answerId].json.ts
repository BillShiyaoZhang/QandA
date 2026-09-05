import { getContent, markdown, url, answerName, dateLabel, contextLabel } from '../../../lib/view';
import { visibleRef } from '../../../lib/graph';
export function getStaticPaths() {
  return Object.keys(getContent().answers).map((answerId) => ({ params: { answerId } }));
}
export function GET({ params }: { params: Record<string, string> }) {
  const s = getContent(),
    a = s.answers[params.answerId],
    r = s.revisions[a.question_revision_id],
    q = s.questions[r.question_id];
  return Response.json({
    answer: a,
    question: { id: q.id, title: q.title },
    revision: { id: r.id, text: s.bodies[r.id] || '[已撤回]' },
    html: markdown(s.bodies[a.id] || ''),
    name: answerName(a),
    date: dateLabel(a),
    context_label: contextLabel(a),
    url: url(`answers/${a.id}/`),
    withdrawn: !visibleRef(s, { entity_type: 'answer', entity_id: a.id }),
    snapshot: a.context.snapshot_id ? s.contexts[a.context.snapshot_id] || null : null,
    siblings: Object.values(s.answers)
      .filter(
        (x) =>
          s.revisions[x.question_revision_id].question_id === q.id &&
          visibleRef(s, { entity_type: 'answer', entity_id: x.id }),
      )
      .map((x) => ({
        id: x.id,
        name: answerName(x),
        revision: x.question_revision_id,
        date: dateLabel(x),
      })),
  });
}
