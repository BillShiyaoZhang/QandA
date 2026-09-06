import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { execFileSync } from 'node:child_process';
import { loadStore, validateStore, published } from './content';
import { publicStore, rootId, isArchived, questionPath, visibleRef } from './graph';
import type { Answer, Store } from './schema';
export const base = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
export const url = (p: string) => `${base}/${p.replace(/^\//, '')}`;
export const repository = 'BillShiyaoZhang/QandA';
export const github = `https://github.com/${repository}`;
export function issueLink(template: string, values: Record<string, string> = {}) {
  const u = new URL(github + '/issues/new');
  u.searchParams.set('template', template + '.yml');
  for (const [key, value] of Object.entries(values)) u.searchParams.set(key, value);
  return u.toString();
}
export function markdown(body: string) {
  return sanitizeHtml(marked.parse(body, { async: false, gfm: true, breaks: false }) as string, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'blockquote',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'pre',
      'code',
      'a',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    allowedAttributes: { a: ['href', 'title', 'rel'], code: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
    disallowedTagsMode: 'discard',
  });
}
let cached: Store | undefined;
export function getContent() {
  if (cached && !import.meta.env?.DEV) return cached;
  const s = loadStore();
  validateStore(s);
  cached = publicStore(s);
  return cached;
}
export const answerName = (a: Answer) =>
  a.is_example
    ? '开发样例'
    : a.generation.display_name ||
      a.generation.returned_model ||
      a.generation.requested_model ||
      '模型未知';
export const dateLabel = (a: Answer) =>
  a.generation.generated_at
    ? a.generation.time_precision === 'day'
      ? a.generation.generated_at
      : new Date(a.generation.generated_at).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false,
        })
    : '生成时间未知';
export const contextLabel = (a: Answer) =>
  a.context.visible_history_completeness === 'complete'
    ? '提交者提供完整可见历史'
    : a.context.visible_history_completeness === 'partial'
      ? '只提供部分上下文'
      : '生成上下文未知';
export function questionTitle(s: Store, id: string) {
  return s.questions[id]?.title || '内容不可用';
}
export function refTitle(s: Store, kind: string, id: string) {
  if (kind === 'answer') {
    const a = s.answers[id];
    const q = s.revisions[a.question_revision_id].question_id;
    return `${questionTitle(s, q)} · ${answerName(a)}`;
  }
  return s.bodies[id] || '问题已撤回';
}
export function refUrl(s: Store, kind: string, id: string) {
  return kind === 'answer'
    ? url(`answers/${id}/`)
    : url(`questions/${s.revisions[id].question_id}/revisions/${id}/`);
}
export function treeNodes(s: Store, root: string) {
  const qs = Object.values(s.questions).filter((q) => rootId(s, q.id) === root);
  const nodes: any[] = [];
  for (const q of qs) {
    nodes.push({
      id: q.id,
      kind: 'question',
      label: q.title,
      parent: q.parent_answer_id,
      url: url(`questions/${q.id}/`),
      recordUrl: q.current_revision_id
        ? url(`questions/${q.id}/revisions/${q.current_revision_id}/`)
        : undefined,
      withdrawn: !published(s, 'question', q.id),
    });
    const revisions = Object.values(s.revisions)
      .filter((r) => r.question_id === q.id)
      .sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
      );
    for (const [index, r] of revisions.entries()) {
      nodes.push({
        id: r.id,
        kind: 'revision',
        label: `第 ${index + 1} 版${r.id === q.current_revision_id ? ' · 当前' : ''}`,
        current: r.id === q.current_revision_id,
        parent: q.id,
        url: refUrl(s, 'revision', r.id),
        withdrawn: !visibleRef(s, { entity_type: 'revision', entity_id: r.id }),
      });
      for (const a of Object.values(s.answers).filter((a) => a.question_revision_id === r.id))
        nodes.push({
          id: a.id,
          kind: 'answer',
          label: answerName(a),
          summary: (s.bodies[a.id] || '')
            .replace(/[#*`>\n]/g, ' ')
            .trim()
            .slice(0, 90),
          date: dateLabel(a),
          parent: r.id,
          url: url(`answers/${a.id}/`),
          withdrawn: !visibleRef(s, { entity_type: 'answer', entity_id: a.id }),
        });
    }
  }
  return nodes;
}
export function nodeDetail(s: Store, id: string) {
  const a = s.answers[id];
  const r = s.revisions[id] || (a ? s.revisions[a.question_revision_id] : undefined);
  const q = s.questions[id] || (r ? s.questions[r.question_id] : undefined);
  if (!q) return null;
  const rid = r?.id || q.current_revision_id;
  return {
    id,
    question: q,
    revision: rid ? s.revisions[rid] : null,
    answer: a || null,
    body: id === q.id ? (rid ? s.bodies[rid] || '' : '') : s.bodies[id] || '',
    html: markdown(id === q.id ? (rid ? s.bodies[rid] || '' : '') : s.bodies[id] || ''),
    root: rootId(s, q.id),
    archived: isArchived(s, q.id),
    path: questionPath(s, q.id, rid || undefined),
    answers: Object.values(s.answers)
      .filter((a) => a.question_revision_id === rid)
      .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))
      .map((a) => ({
        id: a.id,
        name: answerName(a),
        date: dateLabel(a),
        context: contextLabel(a),
        generated_at: a.generation.generated_at,
        time_precision: a.generation.time_precision,
        submitted_at: a.submitted_at,
        withdrawn: !visibleRef(s, { entity_type: 'answer', entity_id: a.id }),
        summary: (s.bodies[a.id] || '')
          .replace(/[#*`>\n]/g, ' ')
          .trim()
          .slice(0, 140),
        followups: Object.values(s.questions).filter((q) => q.parent_answer_id === a.id).length,
      })),
    revisions: Object.values(s.revisions)
      .filter((v) => v.question_id === q.id)
      .sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
      )
      .map((v, index) => ({
        id: v.id,
        label: `第 ${index + 1} 版`,
        current: v.id === q.current_revision_id,
        withdrawn: !visibleRef(s, { entity_type: 'revision', entity_id: v.id }),
      })),
    comparisonAnswers: Object.values(s.answers)
      .filter(
        (item) =>
          s.revisions[item.question_revision_id].question_id === q.id &&
          visibleRef(s, { entity_type: 'answer', entity_id: item.id }),
      )
      .map((item) => ({ id: item.id, revision: item.question_revision_id })),
    notes: Object.values(s.annotations)
      .filter((n) => (a ? n.target_id === a.id : n.target_id === q.id || n.target_id === rid))
      .map((n) => ({ ...n, html: markdown(s.bodies[n.id] || '') })),
    relations: Object.values(s.relations)
      .filter((edge) =>
        [edge.source_ref.entity_id, edge.target_ref.entity_id].includes(a?.id || rid || ''),
      )
      .map((edge) => {
        const other =
          edge.source_ref.entity_id === (a?.id || rid) ? edge.target_ref : edge.source_ref;
        return {
          id: edge.id,
          type: edge.type,
          rationale: edge.rationale,
          title: refTitle(s, other.entity_type, other.entity_id),
          url: refUrl(s, other.entity_type, other.entity_id),
        };
      }),
    followups: a ? Object.values(s.questions).filter((q) => q.parent_answer_id === a.id) : [],
    withdrawn: a
      ? !visibleRef(s, { entity_type: 'answer', entity_id: a.id })
      : !published(s, 'question', q.id) || (rid ? !published(s, 'revision', rid) : true),
  };
}
let cachedRevision: string | undefined;
export function buildRevision() {
  if (cachedRevision) return cachedRevision;
  try {
    return (cachedRevision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim());
  } catch {
    return 'local';
  }
}
