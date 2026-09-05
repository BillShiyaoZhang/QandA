import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  emptyStore,
  questionSchema,
  revisionSchema,
  answerSchema,
  contextSchema,
  annotationSchema,
  relationSchema,
  publicationSchema,
  importReceiptSchema,
  type Store,
  type Publication,
} from './schema';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
      .join(',') +
    '}'
  );
}
export const publicationKey = (kind: string, id: string) => `${kind}:${id}`;
export function entity(store: Store, kind: string, id: string): any {
  const table = (
    {
      question: 'questions',
      revision: 'revisions',
      answer: 'answers',
      context: 'contexts',
      annotation: 'annotations',
      relation: 'relations',
    } as const
  )[kind as 'question'];
  return table ? store[table][id] : undefined;
}
export const status = (store: Store, kind: string, id: string) =>
  store.publications[publicationKey(kind, id)]?.state;
export const published = (store: Store, kind: string, id: string) =>
  status(store, kind, id) === 'published';
export function safePath(root: string, relative: string) {
  const full = path.resolve(root, relative);
  if (
    path.isAbsolute(relative) ||
    full === path.resolve(root) ||
    !full.startsWith(path.resolve(root) + path.sep)
  )
    throw new Error(`路径越界: ${relative}`);
  let cursor = full;
  while (cursor !== path.resolve(root)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink())
      throw new Error(`不允许符号链接: ${relative}`);
    cursor = path.dirname(cursor);
  }
  return full;
}
export function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(root, d.name);
    if (d.isSymbolicLink()) throw new Error(`不允许符号链接: ${p}`);
    return d.isDirectory() ? walk(p) : [p];
  });
}
export function loadStore(root = path.resolve(process.env.CONTENT_DIR || 'content')): Store {
  const store = emptyStore();
  for (const file of walk(root)
    .filter((p) => p.endsWith('.json'))
    .sort()) {
    const rel = path.relative(root, file).replaceAll(path.sep, '/');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    let kind: keyof Store;
    let schema;
    if (rel.startsWith('publications/')) {
      const p = publicationSchema.parse(value);
      if (rel !== `publications/${p.entity_type}/${p.entity_id}.json`)
        throw new Error(`发布记录路径与实体不一致: ${rel}`);
      const k = publicationKey(p.entity_type, p.entity_id);
      if (store.publications[k]) throw new Error(`重复发布记录: ${k}`);
      store.publications[k] = p;
      continue;
    }
    if (/^questions\/[^/]+\/question.json$/.test(rel)) {
      kind = 'questions';
      schema = questionSchema;
    } else if (/^questions\/[^/]+\/revisions\/[^/]+.json$/.test(rel)) {
      kind = 'revisions';
      schema = revisionSchema;
    } else if (/^answers\/[^/]+\/meta.json$/.test(rel)) {
      kind = 'answers';
      schema = answerSchema;
    } else if (/^contexts\/[^/]+.json$/.test(rel)) {
      kind = 'contexts';
      schema = contextSchema;
    } else if (/^annotations\/[^/]+.json$/.test(rel)) {
      kind = 'annotations';
      schema = annotationSchema;
    } else if (/^relations\/[^/]+.json$/.test(rel)) {
      kind = 'relations';
      schema = relationSchema;
    } else if (/^imports\/[^/]+.json$/.test(rel)) {
      kind = 'imports';
      schema = importReceiptSchema;
    } else throw new Error(`未知内容文件: ${rel}`);
    const record: any = schema.parse(value);
    const expected =
      kind === 'questions'
        ? `questions/${record.id}/question.json`
        : kind === 'revisions'
          ? `questions/${record.question_id}/revisions/${record.id}.json`
          : kind === 'answers'
            ? `answers/${record.id}/meta.json`
            : `${kind}/${record.id}.json`;
    if (rel !== expected) throw new Error(`记录路径与实体不一致: ${rel}`);
    if ((store[kind] as any)[record.id]) throw new Error(`重复 ID: ${record.id}`);
    (store[kind] as any)[record.id] = record;
    if (record.body_path) {
      const full = safePath(root, record.body_path);
      store.bodies[record.id] = fs.readFileSync(full, 'utf8');
    }
  }
  return store;
}
export function baselineFromGit(ref: string): Store {
  if (!/^[a-zA-Z0-9._\/-]+$/.test(ref)) throw new Error('无效 Git 基准');
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', 'content'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  const temp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'qanda-base-'));
  try {
    for (const f of files) {
      const target = safePath(temp, f.replace(/^content\//, ''));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, execFileSync('git', ['show', `${ref}:${f}`]));
    }
    return loadStore(temp);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
export function validateStore(s: Store, baseline?: Store): void {
  const errors: string[] = [];
  const check = (v: unknown, msg: string) => {
    if (!v) errors.push(msg);
  };
  const ids = new Set<string>();
  for (const [kind, table] of Object.entries(s)) {
    if (kind === 'publications' || kind === 'bodies') continue;
    for (const [id, v] of Object.entries(table)) {
      check(!ids.has(id), `全局重复 ID: ${id}`);
      ids.add(id);
      if ('body_sha256' in v) {
        check(Boolean(s.bodies[id]?.trim()), `正文不能为空: ${id}`);
        check(sha256(s.bodies[id] || '') === v.body_sha256, `正文哈希不一致: ${id}`);
      }
    }
  }
  for (const receipt of Object.values(s.imports))
    for (const id of receipt.entity_ids)
      check(ids.has(id), `导入收据引用不存在: ${receipt.id} → ${id}`);
  for (const p of Object.values(s.publications))
    check(entity(s, p.entity_type, p.entity_id), `发布实体不存在: ${p.entity_type}:${p.entity_id}`);
  for (const q of Object.values(s.questions)) {
    if (q.parent_answer_id)
      check(s.answers[q.parent_answer_id], `父答案不存在: ${q.id} → ${q.parent_answer_id}`);
    if (q.copied_from_question_id)
      check(s.questions[q.copied_from_question_id], `复制来源不存在: ${q.id}`);
    if (published(s, 'question', q.id))
      check(
        q.current_revision_id &&
          s.revisions[q.current_revision_id]?.question_id === q.id &&
          published(s, 'revision', q.current_revision_id),
        `当前修订不可公开或不属于本题: ${q.id}`,
      );
    const visited = new Set<string>();
    let node = q;
    while (node) {
      if (visited.has(node.id)) {
        errors.push(`追问主链成环: ${q.id} → ${node.id}`);
        break;
      }
      visited.add(node.id);
      if (!node.parent_answer_id) break;
      const a = s.answers[node.parent_answer_id];
      const r = a && s.revisions[a.question_revision_id];
      if (!r) break;
      if (status(s, 'question', q.id))
        check(
          status(s, 'answer', a.id) &&
            status(s, 'revision', r.id) &&
            status(s, 'question', r.question_id),
          `公开祖先缺失: ${q.id} → ${a.id}`,
        );
      node = s.questions[r.question_id];
    }
  }
  for (const r of Object.values(s.revisions)) {
    check(s.questions[r.question_id], `修订所属问题不存在: ${r.id}`);
    if (status(s, 'revision', r.id))
      check(status(s, 'question', r.question_id), `修订缺少公开问题: ${r.id}`);
  }
  for (const a of Object.values(s.answers)) {
    check(s.revisions[a.question_revision_id], `答案所答修订不存在: ${a.id}`);
    if (status(s, 'answer', a.id))
      check(status(s, 'revision', a.question_revision_id), `答案缺少公开修订: ${a.id}`);
    if (a.context.snapshot_id) check(s.contexts[a.context.snapshot_id], `上下文不存在: ${a.id}`);
    if (a.context.capture_kind !== 'unknown')
      check(
        a.context.snapshot_id &&
          s.contexts[a.context.snapshot_id]?.capture_kind === a.context.capture_kind,
        `声明的上下文缺少对应快照: ${a.id}`,
      );
    if (a.context.capture_kind === 'unknown')
      check(
        a.context.snapshot_id === null &&
          a.context.visible_history_completeness === 'unknown' &&
          a.context.matches_site_path === 'unknown',
        `未知上下文不得补造: ${a.id}`,
      );
    if (a.provenance.kind === 'development_example')
      check(a.is_example, `开发样例必须明确标识: ${a.id}`);
  }
  const checkRef = (ref: any, label: string) => {
    const e = entity(s, ref.entity_type, ref.entity_id);
    check(e, `引用不存在: ${label} → ${ref.entity_id}`);
    if (e) check(e.body_sha256 === ref.body_sha256, `引用哈希不一致: ${label} → ${ref.entity_id}`);
  };
  for (const c of Object.values(s.contexts)) {
    c.path_refs.forEach((r) => checkRef(r, c.id));
    check(
      sha256(
        canonical({ messages: c.messages, path_refs: c.path_refs, attachments: c.attachments }),
      ) === c.sha256,
      `上下文哈希不一致: ${c.id}`,
    );
  }
  for (const n of Object.values(s.annotations))
    check(entity(s, n.target_type, n.target_id), `注释目标不存在: ${n.id}`);
  const keys = new Set<string>();
  for (const r of Object.values(s.relations)) {
    checkRef(r.source_ref, r.id);
    checkRef(r.target_ref, r.id);
    check(r.source_ref.entity_id !== r.target_ref.entity_id, `不允许自关联: ${r.id}`);
    if (r.type !== 'related_topic') {
      check(
        r.source_ref.entity_type === 'answer' && r.target_ref.entity_type === 'answer',
        `观点关系必须关联答案: ${r.id}`,
      );
      check(r.source_excerpt.trim() && r.target_excerpt.trim(), `观点关系需要双方片段: ${r.id}`);
    }
    for (const [ref, excerpt] of [
      [r.source_ref, r.source_excerpt],
      [r.target_ref, r.target_excerpt],
    ] as const)
      if (excerpt)
        check(
          s.bodies[ref.entity_id]?.includes(excerpt),
          `关联片段不存在: ${r.id} → ${ref.entity_id}`,
        );
    if (r.decision === 'confirmed') check(r.decided_by && r.decided_at, `关系缺少确认者: ${r.id}`);
    if (published(s, 'relation', r.id)) {
      check(r.decision === 'confirmed', `未确认关系不能发布: ${r.id}`);
      for (const ref of [r.source_ref, r.target_ref])
        check(status(s, ref.entity_type, ref.entity_id), `关联端点尚未发布: ${r.id}`);
    }
    const parts = [
      `${r.source_ref.entity_id}:${r.source_excerpt}`,
      `${r.target_ref.entity_id}:${r.target_excerpt}`,
    ];
    if (r.type !== 'supports') parts.sort();
    const key = canonical([r.type, parts]);
    if (status(s, 'relation', r.id) !== 'withdrawn' && r.decision !== 'rejected') {
      check(!keys.has(key), `重复关联: ${r.id}`);
      keys.add(key);
    }
  }
  if (baseline)
    for (const [id, receipt] of Object.entries(baseline.imports))
      check(canonical(receipt) === canonical(s.imports[id]), `已完成导入收据被覆盖: ${id}`);
  if (baseline)
    for (const p of Object.values(baseline.publications)) {
      const old = entity(baseline, p.entity_type, p.entity_id),
        now = entity(s, p.entity_type, p.entity_id);
      check(now, `已发布实体被删除: ${p.entity_id}`);
      check(status(s, p.entity_type, p.entity_id), `已发布资格记录被删除: ${p.entity_id}`);
      if (!old || !now) continue;
      if (p.entity_type === 'question')
        check(
          old.parent_answer_id === now.parent_answer_id,
          `已发布问题改接父节点: ${p.entity_id}`,
        );
      else if (['answer', 'revision', 'annotation'].includes(p.entity_type)) {
        check(canonical(old) === canonical(now), `已发布记录被覆盖: ${p.entity_id}`);
        check(
          baseline.bodies[p.entity_id] === s.bodies[p.entity_id],
          `已发布正文被改写: ${p.entity_id}`,
        );
      } else if (['context', 'relation'].includes(p.entity_type))
        check(canonical(old) === canonical(now), `已发布记录被覆盖: ${p.entity_id}`);
    }
  if (errors.length) throw new Error(errors.join('\n'));
}
export function publication(
  kind: Publication['entity_type'],
  id: string,
  reviewer = 'seed:maintainer',
): Publication {
  return {
    schema_version: 1,
    entity_type: kind,
    entity_id: id,
    state: 'published',
    reviewed_by: reviewer,
    reviewed_at: new Date().toISOString(),
    source_issue_url: null,
    source_updated_at: null,
    source_body_sha256: null,
    withdrawal_reason: '',
  };
}
