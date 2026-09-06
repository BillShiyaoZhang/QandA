import path from 'node:path';
import { canonical, loadStore, sha256 } from './content';
import {
  createDraft,
  issueSubmission,
  parseIssueBody,
  reviewDraft,
  submissionSchema,
} from './submissions';

export const repository = 'BillShiyaoZhang/QandA';
export const publicConsent =
  '我理解投稿会在 GitHub 公开，并允许项目保留署名、展示和必要格式整理；我有权公开这些内容，且未包含密钥或敏感信息。';
const metadata = [
  '模型显示名称',
  '生成日期',
  '生成规则（选填）',
  '工具使用',
  '生成上下文说明',
  '原始分享链接',
];
export const issueForms = {
  question: {
    title: '提个新问题',
    fields: ['问题标题', '问题正文', '主题标签', '已有答案（选填）', ...metadata, '公开提交确认'],
  },
  answer: {
    title: '提交已有答案',
    fields: ['问题修订 ID', '答案正文', ...metadata, '公开提交确认'],
  },
  'follow-up': {
    title: '追问这份回答',
    fields: [
      '父答案 ID',
      '问题标题',
      '问题正文',
      '主题标签',
      '已有答案（选填）',
      ...metadata,
      '公开提交确认',
    ],
  },
  relation: {
    title: '建议内容关联',
    fields: [
      '来源节点 ID',
      '目标节点 ID',
      '关联类型',
      '关联理由',
      '来源原文片段',
      '目标原文片段',
      '公开提交确认',
    ],
  },
} as const;
export type IssueKind = keyof typeof issueForms;
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
  try {
    const labels = Object.keys(parseIssueBody(body));
    return (Object.keys(issueForms) as IssueKind[]).find(
      (kind) => canonical(labels) === canonical(issueForms[kind].fields),
    );
  } catch {
    return undefined;
  }
}

export function automaticSubmission(body: string, kind: IssueKind) {
  const fields = parseIssueBody(body);
  if (canonical(Object.keys(fields)) !== canonical(issueForms[kind].fields))
    throw new Error(
      '表单字段缺失、顺序改变或正文包含保留字段标题。请保留原表单标题；正文中的同名 ### 标题请放进代码围栏，并闭合所有围栏。',
    );
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
  const input = issueSubmission(body, kind) as Record<string, unknown>;
  for (const key of ['model_name', 'generated_on', 'source_url'] as const) {
    // A missing selection is not evidence that no tool was used.
    if (typeof input[key] === 'string' && /^(未知|unknown|none)$/i.test(input[key]))
      input[key] = null;
  }
  const sub = submissionSchema.parse(input);
  if ((kind === 'question' || kind === 'follow-up') && !sub.title?.trim())
    throw new Error('请填写问题标题。');
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
