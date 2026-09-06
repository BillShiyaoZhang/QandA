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
// Keep exact legacy layouts so pending submissions remain collectable after a form update.
export const legacyIssueForms = {
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
export const issueForms = {
  question: {
    title: '提个新问题',
    fields: ['问题正文', '已有答案（选填）', '来源补充（选填）', '公开提交确认'],
  },
  answer: {
    title: '提交已有答案',
    fields: ['回答位置', '答案正文', '来源补充（选填）', '公开提交确认'],
  },
  'follow-up': {
    title: '追问这份回答',
    fields: ['追问位置', '问题正文', '已有答案（选填）', '来源补充（选填）', '公开提交确认'],
  },
  relation: {
    title: '建议内容关联',
    fields: [
      '来源内容',
      '另一段内容',
      '关联类型',
      '关联理由',
      '来源原文片段',
      '目标原文片段',
      '公开提交确认',
    ],
  },
} as const;
export type IssueKind = keyof typeof issueForms;
