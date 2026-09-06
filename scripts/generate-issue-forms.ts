import fs from 'node:fs';
import YAML from 'yaml';
import { publicConsent } from '../src/lib/issue-intake';
const text = (id: string, label: string, required = false, description?: string) => ({
  type: 'textarea',
  id,
  attributes: { label, ...(description ? { description } : {}) },
  validations: { required },
});
const input = (id: string, label: string, required = false, description?: string) => ({
  type: 'input',
  id,
  attributes: { label, ...(description ? { description } : {}) },
  validations: { required },
});
const metadata = [
  input('model_name', '模型显示名称', false, '不知道时留空；请按界面原样填写。'),
  input('generated_on', '生成日期', false, '只在知道时填写 YYYY-MM-DD；不要求精确时间。'),
  text(
    'generation_protocol',
    '生成规则（选填）',
    false,
    '如果曾统一约定系统指令、生成条件或操作步骤，可粘贴原文；不知道时留空。',
  ),
  {
    type: 'dropdown',
    id: 'tools',
    attributes: { label: '工具使用', options: ['未知', '未使用', '使用过'] },
  },
  text(
    'context_note',
    '生成上下文说明',
    false,
    '可说明原始对话、记忆或联网情况。未提供的实际输入保持未知。',
  ),
  input('source_url', '原始分享链接', false, '只提交有权公开的 http(s) 链接。'),
];
const consent = {
  type: 'checkboxes',
  id: 'public_consent',
  attributes: {
    label: '公开提交确认',
    options: [
      {
        label: publicConsent,
        required: true,
      },
    ],
  },
};
const intro = {
  type: 'markdown',
  attributes: {
    value:
      '投稿在 GitHub 公开，通过格式和引用检查后自动收录到网站，无需逐条人工审批。平台归集原文与来源，不核实观点；未知信息可以留空。请保留表单标题，正文中同名的 ### 标题请放入闭合的代码围栏。',
  },
};
const forms = [
  {
    file: 'new-question',
    name: '提个新问题',
    description: '保存一个值得继续探索的问题，也可以附带已有答案。',
    body: [
      input('title', '问题标题', true),
      text('body', '问题正文', true),
      input('tags', '主题标签', false, '用逗号分隔。'),
      text('answer_body', '已有答案（选填）'),
      ...metadata,
    ],
  },
  {
    file: 'submit-answer',
    name: '提交已有答案',
    description: '向一个明确的问题版本提交已经生成的回答。',
    body: [
      input(
        'question_revision_id',
        '问题修订 ID',
        true,
        '从网站问题版本页面点击投稿可自动填入；请勿改为“最新版”。',
      ),
      text('body', '答案正文', true, '请保留原文。不同措辞的实际提问，请在上下文说明中写出。'),
      ...metadata,
    ],
  },
  {
    file: 'follow-up',
    name: '追问这份回答',
    description: '针对具体答案继续提问，创建一个新分支。',
    body: [
      input('parent_answer_id', '父答案 ID', true),
      input('title', '问题标题', true),
      text('body', '问题正文', true),
      input('tags', '主题标签'),
      text('answer_body', '已有答案（选填）'),
      ...metadata,
    ],
  },
  {
    file: 'suggest-relation',
    name: '建议内容关联',
    description: '提出跨问题或跨分支的连接，并说明理由。',
    body: [
      input('source_id', '来源节点 ID', true, '使用答案 ID 或问题修订 ID。'),
      input('target_id', '目标节点 ID', true),
      {
        type: 'dropdown',
        id: 'relation_type',
        attributes: { label: '关联类型', options: ['主题相关', '观点支持', '观点冲突'] },
        validations: { required: true },
      },
      text(
        'rationale',
        '关联理由',
        true,
        '支持/冲突请说明具体论点与适用条件。相似度本身不证明逻辑关系。',
      ),
      text('source_excerpt', '来源原文片段', false, '观点支持/冲突必需，须与原文一致。'),
      text('target_excerpt', '目标原文片段', false, '观点支持/冲突必需，须与原文一致。'),
    ],
  },
];
fs.mkdirSync('.github/ISSUE_TEMPLATE', { recursive: true });
for (const f of forms)
  fs.writeFileSync(
    `.github/ISSUE_TEMPLATE/${f.file}.yml`,
    YAML.stringify({
      name: f.name,
      description: f.description,
      title: `[${f.name}] `,
      body: [intro, ...f.body, consent],
    }),
  );
fs.writeFileSync(
  '.github/ISSUE_TEMPLATE/config.yml',
  YAML.stringify({ blank_issues_enabled: true }),
);
