import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  loadStore,
  validateStore,
  sha256,
  canonical,
  publication,
  safePath,
  published,
  status,
} from './content';
import { unknownGeneration, type Store, type Answer, type Publication } from './schema';
import { isArchived, answerQuestion, visibleRef } from './graph';

const optional = z.string().nullable().optional();
export const submissionSchema = z
  .object({
    kind: z.enum(['question', 'answer', 'follow-up', 'relation', 'revision', 'annotation']),
    title: optional,
    body: optional,
    answer_body: optional,
    question_revision_id: optional,
    parent_answer_id: optional,
    question_id: optional,
    tags: z.array(z.string()).default([]),
    model_name: optional,
    generated_on: optional,
    tools: z.enum(['none', 'used', 'unknown']).default('unknown'),
    context_note: optional,
    source_url: z.url().nullable().optional(),
    context_messages: z
      .array(
        z
          .object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string() })
          .strict(),
      )
      .optional(),
    context_path_ids: z.array(z.string()).optional(),
    context_completeness: z.enum(['complete', 'partial', 'unknown']).default('unknown'),
    source_id: optional,
    target_id: optional,
    relation_type: z.enum(['related_topic', 'supports', 'conflicts_with']).default('related_topic'),
    rationale: optional,
    source_excerpt: z.string().default(''),
    target_excerpt: z.string().default(''),
    annotation_kind: z.enum(['note', 'correction', 'comparison', 'fact_check']).default('note'),
    evidence_urls: z.array(z.url()).default([]),
    public_consent: z.literal(true),
  })
  .strict();
export type Submission = z.infer<typeof submissionSchema>;
export type Source = { url: string; updated_at: string; author: string; body: string };
export type Draft = {
  version: 1;
  key: string;
  source: Source;
  submission: Submission;
  created_at: string;
  files: Record<string, string>;
  summary: string;
  status: 'pending' | 'rejected' | 'published';
  base_files: Record<string, string>;
  reviewer?: string;
  reviewed_at?: string;
};
function ident(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
function serial(value: unknown) {
  return JSON.stringify(value, null, 2) + '\n';
}
function ensureTarget(s: Store, revisionId: string) {
  const r = s.revisions[revisionId];
  if (!r || !visibleRef(s, { entity_type: 'revision', entity_id: revisionId }))
    throw new Error('目标问题版本不存在或不可投稿');
  if (isArchived(s, r.question_id)) throw new Error('目标分支已归档');
  return r;
}
export function prepareFiles(
  s: Store,
  input: Submission,
  source: Source,
): { files: Record<string, string>; summary: string } {
  const sub = submissionSchema.parse(input),
    files: Record<string, string> = {},
    now = new Date().toISOString(),
    author = `github:${source.author}`;
  let rid = sub.question_revision_id || '',
    qid = sub.question_id || '';
  const add = (file: string, value: unknown) => {
    files[file] = typeof value === 'string' ? value : serial(value);
  };
  const publish = (kind: Publication['entity_type'], id: string) =>
    add(`publications/${kind}/${id}.json`, {
      ...publication(kind, id, 'pending-review'),
      source_issue_url: source.url,
      source_updated_at: source.updated_at,
      source_body_sha256: sha256(source.body),
    });
  const newRevision = (id: string, q: string, body: string, note: string) => {
    const bodyPath = `questions/${q}/revisions/${id}.md`;
    add(bodyPath, body);
    add(`questions/${q}/revisions/${id}.json`, {
      schema_version: 1,
      id,
      question_id: q,
      body_path: bodyPath,
      body_sha256: sha256(body),
      created_at: now,
      created_by: author,
      change_note: note,
    });
    publish('revision', id);
  };
  if (sub.kind === 'question' || sub.kind === 'follow-up') {
    if (!sub.body?.trim()) throw new Error('请提供问题正文');
    let parent: string | null = null;
    if (sub.kind === 'follow-up') {
      parent = sub.parent_answer_id || null;
      if (
        !parent ||
        !s.answers[parent] ||
        !visibleRef(s, { entity_type: 'answer', entity_id: parent })
      )
        throw new Error('父答案不存在或不可追问');
      if (isArchived(s, answerQuestion(s, parent))) throw new Error('父分支已归档');
    }
    qid = ident('q');
    rid = ident('r');
    add(`questions/${qid}/question.json`, {
      schema_version: 1,
      id: qid,
      parent_answer_id: parent,
      current_revision_id: rid,
      title: sub.title || sub.body.slice(0, 90),
      tags: sub.tags,
      created_at: now,
      created_by: author,
      state: 'active',
      copied_from_question_id: null,
      is_example: false,
    });
    newRevision(rid, qid, sub.body, '初始提问');
    publish('question', qid);
  } else if (sub.kind === 'answer') {
    ensureTarget(s, rid);
    qid = s.revisions[rid].question_id;
  } else if (sub.kind === 'revision') {
    const q = s.questions[qid];
    if (!q || !published(s, 'question', qid) || isArchived(s, qid))
      throw new Error('修订目标不存在或已归档');
    if (!sub.body?.trim()) throw new Error('请提供新修订正文');
    rid = ident('r');
    newRevision(rid, qid, sub.body, sub.rationale || '提交者修订提问');
    add(`questions/${qid}/question.json`, { ...q, current_revision_id: rid });
  }
  const answerBody = sub.kind === 'answer' ? sub.body : sub.answer_body;
  if (sub.kind === 'answer' && !answerBody?.trim()) throw new Error('请提供答案正文');
  if (answerBody?.trim() && ['question', 'follow-up', 'answer'].includes(sub.kind)) {
    const id = ident('a'),
      bodyPath = `answers/${id}/body.md`;
    let snapshot: string | null = null;
    if (sub.context_messages?.length) {
      snapshot = ident('ctx');
      const refs = (sub.context_path_ids || []).map((id) => {
        const e = s.revisions[id] || s.answers[id];
        if (!e) throw new Error(`上下文引用不存在: ${id}`);
        return {
          entity_type: s.revisions[id] ? 'revision' : 'answer',
          entity_id: id,
          body_sha256: e.body_sha256,
        };
      });
      const core = { messages: sub.context_messages, path_refs: refs, attachments: [] };
      add(`contexts/${snapshot}.json`, {
        schema_version: 1,
        id: snapshot,
        capture_kind: 'submitter_transcript',
        ...core,
        sha256: sha256(canonical(core)),
      });
      publish('context', snapshot);
    }
    const a: Answer = {
      schema_version: 1,
      id,
      question_revision_id: rid,
      body_path: bodyPath,
      body_sha256: sha256(answerBody),
      submitted_at: now,
      submitted_by: author,
      provenance: {
        kind: 'community_paste',
        source_url: sub.source_url || null,
        identity_evidence: sub.model_name ? 'submitter_reported' : 'unknown',
      },
      generation: {
        ...unknownGeneration(),
        display_name: sub.model_name || null,
        generated_at: sub.generated_on || null,
        time_precision: sub.generated_on ? 'day' : 'unknown',
        tools: sub.tools,
      },
      context: {
        snapshot_id: snapshot,
        capture_kind: snapshot ? 'submitter_transcript' : 'unknown',
        visible_history_completeness: snapshot ? sub.context_completeness : 'unknown',
        matches_site_path: 'unknown',
      },
      run_id: null,
      is_example: false,
    };
    add(bodyPath, answerBody);
    add(`answers/${id}/meta.json`, a);
    publish('answer', id);
    if (sub.context_note?.trim()) {
      const nid = ident('note'),
        bp = `annotations/${nid}.md`;
      add(bp, `提交者对生成上下文的说明：\n\n${sub.context_note}`);
      add(`annotations/${nid}.json`, {
        schema_version: 1,
        id: nid,
        target_type: 'answer',
        target_id: id,
        kind: 'note',
        body_path: bp,
        body_sha256: sha256(files[bp]),
        author,
        created_at: now,
        evidence_urls: [],
        scope: '来源说明，未验证实际请求',
      });
      publish('annotation', nid);
    }
  }
  if (sub.kind === 'relation') {
    const ref = (id: string) => {
      const e = s.revisions[id] || s.answers[id];
      if (!e) throw new Error(`关联端点不存在: ${id}`);
      const type = s.revisions[id] ? ('revision' as const) : ('answer' as const);
      if (!visibleRef(s, { entity_type: type, entity_id: id })) throw new Error('关联端点不可公开');
      return { entity_type: type, entity_id: id, body_sha256: e.body_sha256 };
    };
    if (!sub.source_id || !sub.target_id || !sub.rationale)
      throw new Error('关联需要两个端点及理由');
    const id = ident('rel');
    add(`relations/${id}.json`, {
      schema_version: 1,
      id,
      source_ref: ref(sub.source_id),
      target_ref: ref(sub.target_id),
      type: sub.relation_type,
      rationale: sub.rationale,
      source_excerpt: sub.source_excerpt,
      target_excerpt: sub.target_excerpt,
      origin: 'manual',
      proposed_by: author,
      created_at: now,
      method_version: null,
      candidate_score: null,
      decision: 'proposed',
      decided_by: null,
      decided_at: null,
    });
  }
  if (sub.kind === 'annotation') {
    const id = sub.target_id || '',
      kind = s.questions[id]
        ? 'question'
        : s.revisions[id]
          ? 'revision'
          : s.answers[id]
            ? 'answer'
            : null;
    if (!kind || !status(s, kind, id) || !sub.body) throw new Error('注释需要有效目标和正文');
    const n = ident('note'),
      bp = `annotations/${n}.md`;
    add(bp, sub.body);
    add(`annotations/${n}.json`, {
      schema_version: 1,
      id: n,
      target_type: kind,
      target_id: id,
      kind: sub.annotation_kind,
      body_path: bp,
      body_sha256: sha256(sub.body),
      author,
      created_at: now,
      evidence_urls: sub.evidence_urls,
      scope: sub.rationale || '',
    });
    publish('annotation', n);
  }
  return {
    files,
    summary: `${sub.kind}: ${sub.title || sub.body?.slice(0, 80) || sub.rationale || ''}`,
  };
}
function stage(root: string, files: Record<string, string>) {
  const target = fs.mkdtempSync(path.join(path.dirname(root), '.qanda-stage-'));
  fs.cpSync(root, target, { recursive: true });
  for (const [relative, data] of Object.entries(files)) {
    const p = safePath(target, relative);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  }
  return target;
}
export function createDraft(
  contentRoot: string,
  draftsRoot: string,
  source: Source,
  input: unknown,
  options: { refresh?: boolean } = {},
): Draft {
  if (
    !/^https:\/\/github.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(source.url) ||
    !Number.isFinite(Date.parse(source.updated_at))
  )
    throw new Error('来源必须包含有效 Issue URL 和更新时间');
  const sub = submissionSchema.parse(input);
  const key = sha256(
    canonical({ url: source.url, updated_at: source.updated_at, body: source.body }),
  );
  const file = path.join(draftsRoot, key + '.json');
  fs.mkdirSync(draftsRoot, { recursive: true });
  const s = loadStore(contentRoot);
  const receipt = s.imports[`import-${key}`];
  if (receipt) {
    if (receipt.submission_sha256 !== sha256(canonical(sub)))
      throw new Error('同一已收录来源快照有不同解释；请用新的来源修订');
    const done: Draft = {
      version: 1,
      key,
      source,
      submission: sub,
      created_at: receipt.reviewed_at,
      files: {},
      base_files: {},
      summary: '该来源快照已经收录',
      status: 'published',
      reviewer: receipt.reviewer,
      reviewed_at: receipt.reviewed_at,
    };
    fs.writeFileSync(file, serial(done));
    return done;
  }
  if (fs.existsSync(file) && !options.refresh) {
    const old = JSON.parse(fs.readFileSync(file, 'utf8')) as Draft;
    if (canonical(old.submission) !== canonical(sub))
      throw new Error('同一来源快照已有不同导入解释；请提供新的来源修订');
    return old;
  }
  const prepared = prepareFiles(s, sub, source);
  const staging = stage(contentRoot, prepared.files);
  try {
    validateStore(loadStore(staging), s);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  const draft: Draft = {
    version: 1,
    key,
    source,
    submission: sub,
    created_at: new Date().toISOString(),
    ...prepared,
    base_files: Object.fromEntries(
      Object.keys(prepared.files)
        .filter((f) => fs.existsSync(safePath(contentRoot, f)))
        .map((f) => [f, sha256(fs.readFileSync(safePath(contentRoot, f), 'utf8'))]),
    ),
    status: 'pending',
  };
  fs.writeFileSync(file, serial(draft), { flag: options.refresh ? 'w' : 'wx' });
  return draft;
}
export function recoverTransaction(contentRoot: string) {
  const lock = path.join(path.dirname(contentRoot), '.qanda-content.lock'),
    journal = contentRoot + '.transaction.json',
    backup = contentRoot + '.transaction-backup';
  if (fs.existsSync(lock)) {
    const raw = fs.readFileSync(lock, 'utf8');
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('锁文件无有效进程信息；请人工检查');
    try {
      process.kill(pid, 0);
      throw new Error('审核进程仍在运行，不能恢复');
    } catch (e: any) {
      if (e.code !== 'ESRCH') throw e;
    }
  }
  if (fs.existsSync(journal)) {
    const tx = JSON.parse(fs.readFileSync(journal, 'utf8'));
    const staging = path.resolve(tx.staging);
    if (
      path.dirname(staging) !== path.dirname(contentRoot) ||
      !path.basename(staging).startsWith('.qanda-stage-')
    )
      throw new Error('事务暂存路径无效');
    if (!fs.existsSync(contentRoot) && fs.existsSync(backup)) fs.renameSync(backup, contentRoot);
    else if (fs.existsSync(contentRoot) && fs.existsSync(backup)) {
      const current = loadStore(contentRoot);
      if (
        !(tx.expectedHash
          ? sha256(canonical(current)) === tx.expectedHash
          : current.imports[`import-${tx.key}`])
      )
        throw new Error('当前内容与备份存在歧义，需要人工恢复');
      fs.rmSync(backup, { recursive: true });
    }
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
    fs.unlinkSync(journal);
  } else if (fs.existsSync(backup)) throw new Error('无事务记录的备份需要人工检查');
  if (fs.existsSync(lock)) fs.unlinkSync(lock);
  return '事务恢复检查完成';
}
export function reviewDraft(
  contentRoot: string,
  draftFile: string,
  reviewer: string,
  decision: 'publish' | 'reject',
) {
  if (!reviewer.trim()) throw new Error('请明确记录审核人');
  const lock = path.join(path.dirname(contentRoot), '.qanda-content.lock'),
    journal = contentRoot + '.transaction.json',
    backup = contentRoot + '.transaction-backup';
  let fd: number;
  try {
    fd = fs.openSync(lock, 'wx');
    fs.writeFileSync(fd, String(process.pid));
  } catch {
    throw new Error('另一个审核事务或待恢复事务存在；稍后重试，崩溃后使用 --recover');
  }
  try {
    const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8')) as Draft;
    const s = loadStore(contentRoot),
      receipt = s.imports[`import-${draft.key}`];
    if (receipt) {
      draft.status = 'published';
      draft.reviewer = receipt.reviewer;
      draft.reviewed_at = receipt.reviewed_at;
      try {
        fs.writeFileSync(draftFile, serial(draft));
      } catch {}
      return draft;
    }
    if (draft.status === 'published')
      throw new Error('本地状态与内容收据不一致，请检查是否回退了内容库');
    if (draft.status === 'rejected' && decision === 'publish')
      throw new Error('已驳回投稿须通过 --refresh 重新导入并审阅');
    const now = new Date().toISOString();
    if (decision === 'reject') {
      draft.status = 'rejected';
      draft.reviewer = reviewer;
      draft.reviewed_at = now;
      fs.writeFileSync(draftFile, serial(draft));
      return draft;
    }
    for (const [name, expected] of Object.entries(draft.base_files)) {
      const current = safePath(contentRoot, name);
      if (!fs.existsSync(current) || sha256(fs.readFileSync(current, 'utf8')) !== expected)
        throw new Error('目标内容自导入后已变化；使用 --refresh 重新导入并审阅');
    }
    const sub = draft.submission;
    if (sub.kind === 'revision') {
      const q = s.questions[sub.question_id!];
      if (!q || !published(s, 'question', q.id) || isArchived(s, q.id))
        throw new Error('修订目标已归档或撤回');
    }
    if (sub.kind === 'answer') ensureTarget(s, sub.question_revision_id!);
    if (
      sub.kind === 'follow-up' &&
      (!sub.parent_answer_id ||
        !visibleRef(s, { entity_type: 'answer', entity_id: sub.parent_answer_id }) ||
        isArchived(s, answerQuestion(s, sub.parent_answer_id)))
    )
      throw new Error('原父答案当前不可接收追问');
    const files = { ...draft.files };
    for (const [name, data] of Object.entries(files)) {
      if (name.startsWith('publications/'))
        files[name] = serial({ ...JSON.parse(data), reviewed_by: reviewer, reviewed_at: now });
      else if (name.startsWith('relations/')) {
        const r = JSON.parse(data);
        if (!visibleRef(s, r.source_ref) || !visibleRef(s, r.target_ref))
          throw new Error('关联端点已不可公开');
        r.decision = 'confirmed';
        r.decided_by = reviewer;
        r.decided_at = now;
        files[name] = serial(r);
        files[`publications/relation/${r.id}.json`] = serial({
          ...publication('relation', r.id, reviewer),
          source_issue_url: draft.source.url,
          source_updated_at: draft.source.updated_at,
          source_body_sha256: sha256(draft.source.body),
        });
      }
    }
    const entityIds = Object.entries(files)
      .filter(([name]) => name.endsWith('.json') && !name.startsWith('publications/'))
      .map(([, data]) => JSON.parse(data).id);
    files[`imports/import-${draft.key}.json`] = serial({
      schema_version: 1,
      id: `import-${draft.key}`,
      key: draft.key,
      source_url: draft.source.url,
      source_updated_at: draft.source.updated_at,
      source_body_sha256: sha256(draft.source.body),
      submission_sha256: sha256(canonical(draft.submission)),
      reviewer,
      reviewed_at: now,
      entity_ids: entityIds,
    });
    const staging = stage(contentRoot, files);
    try {
      validateStore(loadStore(staging), s);
      if (fs.existsSync(backup) || fs.existsSync(journal))
        throw new Error('发现未完成的事务；请先恢复');
      fs.writeFileSync(journal, serial({ key: draft.key, staging }));
      fs.renameSync(contentRoot, backup);
      try {
        fs.renameSync(staging, contentRoot);
      } catch (e) {
        fs.renameSync(backup, contentRoot);
        throw e;
      }
      fs.rmSync(backup, { recursive: true, force: true });
      fs.unlinkSync(journal);
    } finally {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    }
    draft.status = 'published';
    draft.reviewer = reviewer;
    draft.reviewed_at = now;
    // The committed receipt is authoritative; the local draft is a rebuildable cache.
    try {
      fs.writeFileSync(draftFile, serial(draft));
    } catch {}
    return draft;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
const issueLabels = [
  '问题标题',
  '问题正文',
  '主题标签',
  '已有答案（选填）',
  '问题修订 ID',
  '父答案 ID',
  '答案正文',
  '模型显示名称',
  '生成日期',
  '工具使用',
  '生成上下文说明',
  '原始分享链接',
  '来源节点 ID',
  '目标节点 ID',
  '关联类型',
  '关联理由',
  '来源原文片段',
  '目标原文片段',
  '公开提交确认',
];
export function parseIssueBody(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let current: string | null = null,
    lines: string[] = [],
    fence: string | null = null;
  const flush = () => {
    if (current) {
      const v = lines.join('\n').trim();
      fields[current] = v === '_No response_' ? '' : v;
    }
    lines = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      lines.push(line);
      continue;
    }
    const match = !fence ? /^###\s+(.+?)\s*$/.exec(line) : null;
    if (match && issueLabels.includes(match[1])) {
      flush();
      current = match[1];
      if (Object.hasOwn(fields, current))
        throw new Error(`重复或有歧义的表单字段: ${current}，请审阅原始投稿`);
    } else lines.push(line);
  }
  flush();
  return fields;
}
export function issueSubmission(body: string, kind: Submission['kind']): unknown {
  const f = parseIssueBody(body);
  return {
    kind,
    title: f['问题标题'] || null,
    body: f[kind === 'answer' ? '答案正文' : '问题正文'] || null,
    answer_body: kind === 'answer' ? null : f['已有答案（选填）'] || null,
    question_revision_id: f['问题修订 ID'] || null,
    parent_answer_id: f['父答案 ID'] || null,
    tags: (f['主题标签'] || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
    model_name: f['模型显示名称'] || null,
    generated_on: f['生成日期'] || null,
    tools:
      ({ 未使用: 'none', 使用过: 'used' } as Record<string, string>)[f['工具使用']] || 'unknown',
    context_note: f['生成上下文说明'] || null,
    source_url: f['原始分享链接'] || null,
    source_id: f['来源节点 ID'] || null,
    target_id: f['目标节点 ID'] || null,
    relation_type:
      ({ 观点支持: 'supports', 观点冲突: 'conflicts_with' } as Record<string, string>)[
        f['关联类型']
      ] || 'related_topic',
    rationale: f['关联理由'] || null,
    source_excerpt: f['来源原文片段'] || '',
    target_excerpt: f['目标原文片段'] || '',
    public_consent: /\[x\]/i.test(f['公开提交确认'] || ''),
  };
}
