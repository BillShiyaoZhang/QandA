import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/);
const timestamp = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const base = { schema_version: z.literal(1), id };
const nullableText = z.string().nullable();
const safeUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//.test(v), '仅支持 http(s) 链接');
export const refSchema = z
  .object({ entity_type: z.enum(['revision', 'answer']), entity_id: id, body_sha256: hash })
  .strict();
export const questionSchema = z
  .object({
    ...base,
    parent_answer_id: id.nullable(),
    current_revision_id: id.nullable(),
    title: z.string().min(1).max(200),
    tags: z.array(z.string().min(1).max(40)).max(10),
    created_at: timestamp,
    created_by: z.string().min(1),
    state: z.enum(['active', 'archived']),
    copied_from_question_id: id.nullable().default(null),
    is_example: z.boolean().default(false),
  })
  .strict();
export const revisionSchema = z
  .object({
    ...base,
    question_id: id,
    body_path: z.string().min(1),
    body_sha256: hash,
    created_at: timestamp,
    created_by: z.string().min(1),
    change_note: z.string(),
  })
  .strict();
export const generationSchema = z
  .object({
    provider: nullableText,
    channel: nullableText,
    display_name: nullableText,
    requested_model: nullableText,
    returned_model: nullableText,
    declared_version: nullableText,
    protocol: nullableText.default(null),
    generated_at: z.string().nullable(),
    time_precision: z.enum(['second', 'day', 'unknown']),
    parameters: z.record(z.string(), z.unknown()).nullable(),
    tools: z.enum(['none', 'used', 'unknown']),
    finish_state: z.enum(['complete', 'truncated', 'refusal', 'unknown']),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.time_precision === 'unknown' && v.generated_at !== null)
      c.addIssue({ code: 'custom', message: '未知生成时间必须为 null' });
    if (
      v.time_precision === 'day' &&
      (!v.generated_at ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v.generated_at) ||
        !Number.isFinite(Date.parse(v.generated_at)) ||
        new Date(v.generated_at).toISOString().slice(0, 10) !== v.generated_at)
    )
      c.addIssue({ code: 'custom', message: '无效生成日期' });
    if (
      v.time_precision === 'second' &&
      (!v.generated_at || !timestamp.safeParse(v.generated_at).success)
    )
      c.addIssue({ code: 'custom', message: '生成时间需要带时区' });
  });
export const answerSchema = z
  .object({
    ...base,
    question_revision_id: id,
    body_path: z.string(),
    body_sha256: hash,
    submitted_at: timestamp,
    submitted_by: z.string().min(1),
    provenance: z
      .object({
        kind: z.enum(['community_paste', 'community_export', 'development_example']),
        source_url: safeUrl.nullable(),
        identity_evidence: z.enum(['submitter_reported', 'unknown']),
      })
      .strict(),
    generation: generationSchema,
    context: z
      .object({
        snapshot_id: id.nullable(),
        capture_kind: z.enum(['submitter_transcript', 'unknown']),
        visible_history_completeness: z.enum(['complete', 'partial', 'unknown']),
        matches_site_path: z.enum(['yes', 'no', 'unknown']),
      })
      .strict(),
    run_id: z.null(),
    is_example: z.boolean().default(false),
  })
  .strict();
export const contextSchema = z
  .object({
    ...base,
    capture_kind: z.literal('submitter_transcript'),
    messages: z.array(
      z
        .object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string() })
        .strict(),
    ),
    path_refs: z.array(refSchema),
    attachments: z.array(z.object({ name: z.string(), sha256: hash }).strict()),
    sha256: hash,
  })
  .strict();
export const annotationSchema = z
  .object({
    ...base,
    target_type: z.enum(['question', 'revision', 'answer']),
    target_id: id,
    kind: z.enum(['note', 'correction', 'comparison', 'fact_check']),
    body_path: z.string(),
    body_sha256: hash,
    author: z.string(),
    created_at: timestamp,
    evidence_urls: z.array(safeUrl),
    scope: z.string().default(''),
  })
  .strict();
export const relationSchema = z
  .object({
    ...base,
    source_ref: refSchema,
    target_ref: refSchema,
    type: z.enum(['related_topic', 'supports', 'conflicts_with']),
    rationale: z.string().refine((v) => Boolean(v.trim()), '关联理由不能为空白'),
    source_excerpt: z.string(),
    target_excerpt: z.string(),
    origin: z.enum(['manual', 'lexical']),
    proposed_by: z.string(),
    created_at: timestamp,
    method_version: nullableText,
    candidate_score: z.number().min(0).max(1).nullable(),
    decision: z.enum(['proposed', 'submitted', 'confirmed', 'rejected']),
    decided_by: nullableText,
    decided_at: timestamp.nullable(),
  })
  .strict();
export const publicationSchema = z
  .object({
    schema_version: z.literal(1),
    entity_type: z.enum(['question', 'revision', 'answer', 'annotation', 'relation', 'context']),
    entity_id: id,
    state: z.enum(['published', 'withdrawn']),
    reviewed_by: z.string().min(1),
    reviewed_at: timestamp,
    intake_method: z.enum(['manual', 'github-actions']).optional(),
    source_issue_url: safeUrl.nullable(),
    source_updated_at: timestamp.nullable(),
    source_body_sha256: hash.nullable(),
    withdrawal_reason: z.string().default(''),
  })
  .strict();
export type Question = z.infer<typeof questionSchema>;
export type Revision = z.infer<typeof revisionSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type Relation = z.infer<typeof relationSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type Ref = z.infer<typeof refSchema>;
export const importReceiptSchema = z
  .object({
    schema_version: z.literal(1),
    id,
    key: z.string(),
    source_url: z.string(),
    source_updated_at: timestamp,
    source_body_sha256: hash,
    submission_sha256: hash,
    reviewer: z.string(),
    reviewed_at: timestamp,
    intake_method: z.enum(['manual', 'github-actions']).optional(),
    entity_ids: z.array(z.string()),
  })
  .strict();
export type ImportReceipt = z.infer<typeof importReceiptSchema>;
export type Store = {
  imports: Record<string, ImportReceipt>;
  questions: Record<string, Question>;
  revisions: Record<string, Revision>;
  answers: Record<string, Answer>;
  contexts: Record<string, Context>;
  annotations: Record<string, Annotation>;
  relations: Record<string, Relation>;
  publications: Record<string, Publication>;
  bodies: Record<string, string>;
};
export const emptyStore = (): Store => ({
  imports: {},
  questions: {},
  revisions: {},
  answers: {},
  contexts: {},
  annotations: {},
  relations: {},
  publications: {},
  bodies: {},
});
export const unknownGeneration = (): Answer['generation'] => ({
  provider: null,
  channel: null,
  display_name: null,
  requested_model: null,
  returned_model: null,
  declared_version: null,
  protocol: null,
  generated_at: null,
  time_precision: 'unknown',
  parameters: null,
  tools: 'unknown',
  finish_state: 'unknown',
});
