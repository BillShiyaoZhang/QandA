import { getContent, treeNodes } from '../../../lib/view';
export function getStaticPaths() {
  return Object.values(getContent().questions)
    .filter((q) => !q.parent_answer_id)
    .map((q) => ({ params: { rootId: q.id } }));
}
export function GET({ params }: { params: Record<string, string> }) {
  const s = getContent();
  return Response.json({ root: params.rootId, nodes: treeNodes(s, params.rootId) });
}
