import path from 'node:path';
import { loadStore, sha256 } from './content';
import {
  createDraft,
  issueSubmission,
  parseSubmissionForm,
  reviewDraft,
  submissionSchema,
} from './submissions';

export const repository = 'BillShiyaoZhang/QandA';
import { issueForms, publicConsent, type IssueKind } from './issue-forms';
export { issueForms, legacyIssueForms, publicConsent, type IssueKind } from './issue-forms';
export type IntakeIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  updated_at: string;
  state: string;
  user: { login: string; type?: string };
  labels: { name: string }[];
  pull_request?: unknown;
};
export type IntakeResult = {
  number: number;
  status: 'ignored' | 'paused' | 'collected' | 'already-collected' | 'amended' | 'needs-info';
  bodyHash: string;
  entityIds?: string[];
  message?: string;
};

export function issueKind(title: string, body = ''): IssueKind | undefined {
  const prefixed = (Object.keys(issueForms) as IssueKind[]).find((kind) =>
    title.startsWith(`[${issueForms[kind].title}]`),
  );
  if (prefixed) return prefixed;
  // GitHub lets submitters replace the Issue title. Its form is still recognizable.
  return (Object.keys(issueForms) as IssueKind[]).find((kind) => {
    try {
      parseSubmissionForm(body, kind);
      return true;
    } catch {
      return false;
    }
  });
}

export function automaticSubmission(body: string, kind: IssueKind) {
  const fields = parseSubmissionForm(body, kind);
  if (
    fields['公开提交确认'].replace(/^- \[[xX]\] /, '') !== publicConsent ||
    !/^- \[[xX]\] /.test(fields['公开提交确认'])
  )
    throw new Error('请勾选并保留完整的「公开提交确认」。');
  if (
    '工具使用' in fields &&
    !['', 'None', '未知', '未使用', '使用过'].includes(fields['工具使用'])
  )
    throw new Error('「工具使用」请选择未知、未使用或使用过。');
  if (kind === 'relation' && !['主题相关', '观点支持', '观点冲突'].includes(fields['关联类型']))
    throw new Error('请选择表单提供的关联类型。');
  const input = issueSubmission(body, kind, fields) as Record<string, unknown>;
  for (const key of ['model_name', 'generated_on', 'source_url'] as const) {
    // A missing selection is not evidence that no tool was used.
    if (typeof input[key] === 'string' && /^(未知|unknown|none)$/i.test(input[key]))
      input[key] = null;
  }
  const sub = submissionSchema.parse(input);
  return sub;
}

/** One successful automatic intake per Issue. Published snapshots are immutable. */
export function collectIssue(
  contentRoot: string,
  draftsRoot: string,
  issue: IntakeIssue,
): IntakeResult {
  const body = issue.body || '';
  const result = { number: issue.number, bodyHash: sha256(body) };
  if (issue.pull_request || issue.user.type === 'Bot') return { ...result, status: 'ignored' };
  if (
    !Number.isSafeInteger(issue.number) ||
    issue.number < 1 ||
    issue.html_url !== `https://github.com/${repository}/issues/${issue.number}`
  )
    throw new Error('Issue 必须来自配置的仓库。');
  if (issue.labels.some((label) => label.name === 'intake:paused'))
    return { ...result, status: 'paused' };
  const store = loadStore(contentRoot);
  const receipts = Object.values(store.imports).filter(
    (receipt) => receipt.source_url === issue.html_url,
  );
  if (receipts.length) {
    const same = receipts.find((receipt) => receipt.source_body_sha256 === result.bodyHash);
    return {
      ...result,
      status: same ? 'already-collected' : 'amended',
      entityIds: (same || receipts[0]).entity_ids,
    };
  }
  const kind = issueKind(issue.title, body);
  if (!kind || issue.state !== 'open') return { ...result, status: 'ignored' };
  let draft;
  try {
    const sub = automaticSubmission(body, kind);
    draft = createDraft(
      contentRoot,
      draftsRoot,
      {
        url: issue.html_url,
        updated_at: issue.updated_at,
        author: issue.user.login,
        body,
      },
      sub,
      { refresh: true },
    );
  } catch (error) {
    // Filesystem/transaction failures are operational failures, not bad submissions.
    if (error instanceof Error && 'code' in error) throw error;
    return {
      ...result,
      status: 'needs-info',
      message: error instanceof Error ? error.message : '投稿未通过格式检查。',
    };
  }
  reviewDraft(
    contentRoot,
    path.join(draftsRoot, `${draft.key}.json`),
    'github-actions[bot]',
    'publish',
    { intakeMethod: 'github-actions' },
  );
  const receipt = loadStore(contentRoot).imports[`import-${draft.key}`];
  return { ...result, status: 'collected', entityIds: receipt.entity_ids };
}
