import { getContent, nodeDetail, url, refUrl } from '../../../lib/view';
import { copyPath } from '../../../lib/graph';
export function getStaticPaths() {
  const s = getContent();
  return [...Object.keys(s.questions), ...Object.keys(s.revisions), ...Object.keys(s.answers)].map(
    (nodeId) => ({ params: { nodeId } }),
  );
}
export function GET({ params }: { params: Record<string, string> }) {
  const s = getContent(),
    d = nodeDetail(s, params.nodeId);
  if (!d) return new Response('{}', { status: 404 });
  const copy = copyPath(s, d.question.id, d.revision?.id, d.answer?.id);
  return Response.json({
    ...d,
    url: d.answer
      ? url(`answers/${d.id}/`)
      : d.revision
        ? refUrl(s, 'revision', d.revision.id)
        : url(`questions/${d.question.id}/`),
    copy,
  });
}
